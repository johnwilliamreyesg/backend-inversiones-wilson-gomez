const env = require('../config/env');
const { roundCents } = require('../utils/money');

// Monthly loans with a term now have equal installments: interest is the
// monthly rate on the INITIAL principal, not on the balance. Loans created
// before keep their schedule if they already received money (what the client
// paid must not change); the ones without any payment, not even a voided one,
// are recalculated here. Principal parts do not change: they were already equal.

const UNIT_CENTS = env.loans.roundingUnit * 100;
const toCents = (amount) => Math.round(Number(amount) * 100);
const interestCents = (baseCents, rate) => roundCents((baseCents * Number(rate)) / 100, UNIT_CENTS);

const recalculate = async (knex, interestFor) => {
  const loans = await knex('loans as l')
    .where({ 'l.frequency': 'monthly', 'l.status': 'active' })
    .whereNotNull('l.number_of_installments')
    .whereNotExists(knex('payments as p').whereRaw('p.loan_id = l.id'))
    .select('l.id', 'l.principal_amount', 'l.monthly_interest_rate');

  for (const loan of loans) {
    const installments = await knex('loan_installments').where({ loan_id: loan.id }).orderBy('installment_number');
    let balanceCents = toCents(loan.principal_amount);
    for (const installment of installments) {
      const principal = toCents(installment.principal_due);
      const interest = interestFor({ loan, balanceCents });
      await knex('loan_installments')
        .where({ id: installment.id })
        .update({ interest_due: interest / 100, amount_due: (principal + interest) / 100 });
      balanceCents -= principal;
    }
  }
  return loans.length;
};

exports.up = (knex) =>
  recalculate(knex, ({ loan }) => interestCents(toCents(loan.principal_amount), loan.monthly_interest_rate));

// Back to interest on the balance before each installment (the previous rule).
exports.down = (knex) => recalculate(knex, ({ loan, balanceCents }) => interestCents(balanceCents, loan.monthly_interest_rate));
