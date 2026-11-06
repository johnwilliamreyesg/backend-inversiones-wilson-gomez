// What the client wants to pay. Chosen when the payment is registered.
const PAYMENT_TYPES = {
  // Oldest installment first; inside each one, interest before principal.
  INSTALLMENT: 'installment',
  // Only interest: of the installments already due plus the current one.
  // The principal of those installments stays pending (overdue).
  INTEREST_ONLY: 'interest_only',
  // Principal prepayment ("abono a capital"): first the overdue interest and
  // the overdue principal, then the rest lowers the balance.
  PRINCIPAL: 'principal',
};

// After a principal prepayment on a fixed-term loan, the installments still
// to come are recalculated in one of these ways (chosen with the payment).
const RECALCULATIONS = {
  // Same number of installments, each one smaller.
  REDUCE_INSTALLMENT: 'reduce_installment',
  // Installments stay about the same; the last ones disappear.
  REDUCE_TERM: 'reduce_term',
};

/**
 * Open installments a principal prepayment may recalculate: not due yet on
 * the payment date and without any money received (an installment partly
 * paid ahead stays as it was agreed).
 */
const isUntouchedFuture = (installment, paymentDate) =>
  installment.dueDate > paymentDate &&
  installment.principalPaid === 0 &&
  installment.interestPaid === 0;

module.exports = { PAYMENT_TYPES, RECALCULATIONS, isUntouchedFuture };
