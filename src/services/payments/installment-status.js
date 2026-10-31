const { toCents } = require('../../utils/money');

/**
 * Status of an installment from what has been paid of it. Used when a payment
 * is registered and when it is voided, so both always agree.
 */
const installmentStatusFor = ({ principalDue, interestDue, principalPaid, interestPaid }) => {
  const paid = toCents(principalPaid) + toCents(interestPaid);
  const due = toCents(principalDue) + toCents(interestDue);
  if (paid === 0) return 'pending';
  return paid >= due ? 'paid' : 'partially_paid';
};

module.exports = { installmentStatusFor };
