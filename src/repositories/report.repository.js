// Read-only aggregate queries for the reports. Each report is ONE SQL query
// grouped in the database; Node never loads individual rows to add them up.
//
// Rules shared by every report:
// - voided payments never count (voided_at IS NULL);
// - cancelled loans never count (they were registration mistakes);
// - deleted expenses never count.
class ReportRepository {
  constructor({ db }) {
    this.db = db;
  }

  /** One row per calendar day in [from, to], including days with no movement. */
  async daily({ from, to }) {
    const { rows } = await this.db.raw(
      `WITH days AS (
         SELECT day::date FROM generate_series(:from::date, :to::date, interval '1 day') AS day
       ),
       collected AS (
         SELECT payment_date AS day, SUM(interest_amount) AS interest, SUM(principal_amount) AS principal,
                COUNT(*)::int AS payments
           FROM payments
          WHERE voided_at IS NULL AND payment_date BETWEEN :from AND :to
          GROUP BY payment_date
       ),
       disbursed AS (
         SELECT start_date AS day, SUM(principal_amount) AS amount, COUNT(*)::int AS loans
           FROM loans
          WHERE status <> 'cancelled' AND start_date BETWEEN :from AND :to
          GROUP BY start_date
       ),
       spent AS (
         SELECT expense_date AS day, SUM(amount) AS amount
           FROM expenses
          WHERE deleted_at IS NULL AND expense_date BETWEEN :from AND :to
          GROUP BY expense_date
       )
       SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
              COALESCE(collected.interest, 0) AS interest_collected,
              COALESCE(collected.principal, 0) AS principal_collected,
              COALESCE(collected.payments, 0) AS payments_count,
              COALESCE(disbursed.amount, 0) AS disbursed,
              COALESCE(disbursed.loans, 0) AS loans_created,
              COALESCE(spent.amount, 0) AS expenses
         FROM days
         LEFT JOIN collected ON collected.day = days.day
         LEFT JOIN disbursed ON disbursed.day = days.day
         LEFT JOIN spent ON spent.day = days.day
        ORDER BY days.day`,
      { from, to },
    );
    return rows;
  }

  /**
   * One row per month of `year` with the same figures as `daily`, plus the
   * collection effectiveness: of the installments that fell due in the month,
   * how much was collected by the end of that same month.
   */
  async monthly({ year }) {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const { rows } = await this.db.raw(
      `WITH months AS (
         SELECT to_char(month, 'YYYY-MM') AS month
           FROM generate_series(:from::date, :to::date, interval '1 month') AS month
       ),
       collected AS (
         SELECT to_char(payment_date, 'YYYY-MM') AS month, SUM(interest_amount) AS interest,
                SUM(principal_amount) AS principal, COUNT(*)::int AS payments
           FROM payments
          WHERE voided_at IS NULL AND payment_date BETWEEN :from AND :to
          GROUP BY 1
       ),
       disbursed AS (
         SELECT to_char(start_date, 'YYYY-MM') AS month, SUM(principal_amount) AS amount, COUNT(*)::int AS loans
           FROM loans
          WHERE status <> 'cancelled' AND start_date BETWEEN :from AND :to
          GROUP BY 1
       ),
       spent AS (
         SELECT to_char(expense_date, 'YYYY-MM') AS month, SUM(amount) AS amount
           FROM expenses
          WHERE deleted_at IS NULL AND expense_date BETWEEN :from AND :to
          GROUP BY 1
       ),
       due AS (
         SELECT to_char(i.due_date, 'YYYY-MM') AS month, SUM(i.amount_due) AS amount, COUNT(*)::int AS installments
           FROM loan_installments i
           JOIN loans l ON l.id = i.loan_id
          WHERE i.status <> 'cancelled' AND l.status <> 'cancelled' AND i.due_date BETWEEN :from AND :to
          GROUP BY 1
       ),
       collected_on_due AS (
         SELECT to_char(i.due_date, 'YYYY-MM') AS month, SUM(a.principal_amount + a.interest_amount) AS amount
           FROM payment_allocations a
           JOIN payments p ON p.id = a.payment_id
           JOIN loan_installments i ON i.id = a.installment_id
          WHERE p.voided_at IS NULL
            AND i.due_date BETWEEN :from AND :to
            AND p.payment_date <= (date_trunc('month', i.due_date) + interval '1 month - 1 day')::date
          GROUP BY 1
       )
       SELECT months.month,
              COALESCE(collected.interest, 0) AS interest_collected,
              COALESCE(collected.principal, 0) AS principal_collected,
              COALESCE(collected.payments, 0) AS payments_count,
              COALESCE(disbursed.amount, 0) AS disbursed,
              COALESCE(disbursed.loans, 0) AS loans_created,
              COALESCE(spent.amount, 0) AS expenses,
              COALESCE(due.installments, 0) AS installments_due,
              COALESCE(due.amount, 0) AS amount_due,
              COALESCE(collected_on_due.amount, 0) AS amount_collected_on_due
         FROM months
         LEFT JOIN collected ON collected.month = months.month
         LEFT JOIN disbursed ON disbursed.month = months.month
         LEFT JOIN spent ON spent.month = months.month
         LEFT JOIN due ON due.month = months.month
         LEFT JOIN collected_on_due ON collected_on_due.month = months.month
        ORDER BY months.month`,
      { from, to },
    );
    return rows;
  }

  /** Current state of the portfolio (for the home screen). */
  async portfolio({ date }) {
    const { rows } = await this.db.raw(
      `SELECT
         (SELECT COUNT(*)::int FROM loans WHERE status IN ('active', 'defaulted')) AS open_loans,
         (SELECT COALESCE(SUM(principal_balance), 0) FROM loans WHERE status IN ('active', 'defaulted')) AS principal_outstanding,
         (SELECT COUNT(DISTINCT i.loan_id)::int
            FROM loan_installments i JOIN loans l ON l.id = i.loan_id
           WHERE l.status IN ('active', 'defaulted') AND i.status IN ('pending', 'partially_paid')
             AND i.due_date < :date) AS overdue_loans,
         (SELECT COALESCE(SUM(i.amount_due - i.principal_paid - i.interest_paid), 0)
            FROM loan_installments i JOIN loans l ON l.id = i.loan_id
           WHERE l.status IN ('active', 'defaulted') AND i.status IN ('pending', 'partially_paid')
             AND i.due_date < :date) AS overdue_amount,
         (SELECT COUNT(*)::int FROM clients WHERE deleted_at IS NULL) AS clients`,
      { date },
    );
    return rows[0];
  }
}

module.exports = { ReportRepository };
