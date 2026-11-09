// Every table of the business, for the Excel backup. Read-only; each method
// returns plain rows already joined with the names people recognise.
class BackupRepository {
  constructor({ db }) {
    this.db = db;
  }

  clients() {
    return this.db('clients as client')
      .leftJoin('users as writer', 'writer.id', 'client.writtenOffBy')
      .select(
        'client.id',
        'client.fullName',
        'client.nationalId',
        'client.phoneCountryCode',
        'client.phoneNumber',
        'client.address',
        'client.notes',
        'client.writtenOffAt',
        'writer.fullName as writtenOffByName',
        'client.writeOffReason',
        'client.createdAt',
        'client.deletedAt',
      )
      .orderBy('client.id');
  }

  loans() {
    return this.db('loans as loan')
      .join('clients as client', 'client.id', 'loan.clientId')
      .leftJoin('clients as coDebtor', 'coDebtor.id', 'loan.coDebtorId')
      .select(
        'loan.id',
        'client.fullName as clientName',
        'client.nationalId as clientNationalId',
        'coDebtor.fullName as coDebtorName',
        'loan.frequency',
        'loan.status',
        'loan.principalAmount',
        'loan.monthlyInterestRate',
        'loan.installmentAmount',
        'loan.numberOfInstallments',
        'loan.paymentDay',
        'loan.secondPaymentDay',
        'loan.startDate',
        'loan.principalBalance',
        'loan.writtenOffAt',
        'loan.renegotiatedAt',
        'loan.notes',
        'loan.createdAt',
      )
      .orderBy('loan.id');
  }

  installments() {
    return this.db('loan_installments')
      .select(
        'loanId',
        'installmentNumber',
        'dueDate',
        'principalDue',
        'interestDue',
        'amountDue',
        'principalPaid',
        'interestPaid',
        'status',
        'paidAt',
      )
      .orderBy([{ column: 'loanId' }, { column: 'installmentNumber' }]);
  }

  payments() {
    return this.db('payments as payment')
      .join('loans as loan', 'loan.id', 'payment.loanId')
      .join('clients as client', 'client.id', 'loan.clientId')
      .leftJoin('users as receiver', 'receiver.id', 'payment.receivedBy')
      .select(
        'payment.id',
        'payment.loanId',
        'client.fullName as clientName',
        'payment.paymentDate',
        'payment.amount',
        'payment.principalAmount',
        'payment.interestAmount',
        'payment.paymentMethod',
        'payment.paymentType',
        'receiver.fullName as receivedByName',
        'payment.voidedAt',
        'payment.voidReason',
        'payment.notes',
      )
      .orderBy('payment.id');
  }

  expenses() {
    return this.db('expenses as expense')
      .join('expense_categories as category', 'category.id', 'expense.categoryId')
      .leftJoin('users as creator', 'creator.id', 'expense.createdBy')
      .select(
        'expense.id',
        'expense.expenseDate',
        'category.name as categoryName',
        'expense.amount',
        'expense.description',
        'creator.fullName as createdByName',
        'expense.deletedAt',
      )
      .orderBy('expense.id');
  }

  renegotiations() {
    return this.db('loan_renegotiations as renegotiation')
      .join('loans as loan', 'loan.id', 'renegotiation.loanId')
      .join('clients as client', 'client.id', 'loan.clientId')
      .leftJoin('users as creator', 'creator.id', 'renegotiation.createdBy')
      .select(
        'renegotiation.loanId',
        'client.fullName as clientName',
        'renegotiation.createdAt',
        'renegotiation.previousBalance',
        'renegotiation.agreedAmount',
        'renegotiation.forgivenPrincipal',
        'renegotiation.frequency',
        'renegotiation.numberOfInstallments',
        'renegotiation.firstDueDate',
        'creator.fullName as createdByName',
        'renegotiation.notes',
      )
      .orderBy('renegotiation.id');
  }
}

module.exports = { BackupRepository };
