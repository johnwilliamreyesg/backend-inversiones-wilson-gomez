const { toCents, fromCents } = require('../../utils/money');
const { ValidationError } = require('../../errors/app-error');

/**
 * Decides where each peso of a payment goes. Pure calculation (no database),
 * so every rule can be unit-tested. Rules (pending confirmation from the client):
 *
 * 1. Oldest installment first; inside each installment, interest before principal.
 * 2. Fixed-term loans: the payment may cover future installments (paying ahead),
 *    but never more than the total still owed.
 * 3. Open-ended monthly loans: the payment covers installments already due
 *    (up to the payment date); whatever is left is a principal prepayment
 *    ("abono a capital") that lowers the balance. It cannot exceed the balance.
 */
class PaymentAllocator {
  /**
   * @param installments open installments ordered by number, with paid amounts
   * @returns { allocations: [{ installmentId, principalCents, interestCents }], extraPrincipalCents }
   */
  allocate({ amount, installments, isOpenEnded, paymentDate, principalBalance }) {
    let available = toCents(amount);
    const eligible = isOpenEnded
      ? installments.filter(({ dueDate }) => dueDate <= paymentDate)
      : installments;

    const allocations = [];
    for (const installment of eligible) {
      if (available === 0) break;
      const interestCents = Math.min(available, this.remainingInterest(installment));
      available -= interestCents;
      const principalCents = Math.min(available, this.remainingPrincipal(installment));
      available -= principalCents;
      if (interestCents + principalCents > 0) {
        allocations.push({ installmentId: installment.id, principalCents, interestCents });
      }
    }

    const scheduledPrincipal = allocations.reduce((total, { principalCents }) => total + principalCents, 0);
    const maxExtra = isOpenEnded ? toCents(principalBalance) - scheduledPrincipal : 0;
    if (available > maxExtra) {
      const owed = toCents(amount) - available + maxExtra;
      const message = `El pago supera lo que se debe. Máximo a recibir hoy: $ ${fromCents(owed).toLocaleString('es-CO')}.`;
      throw new ValidationError(message, [{ location: 'body', field: 'amount', message }]);
    }

    return { allocations, extraPrincipalCents: available };
  }

  remainingInterest(installment) {
    return toCents(installment.interestDue) - toCents(installment.interestPaid);
  }

  remainingPrincipal(installment) {
    return toCents(installment.principalDue) - toCents(installment.principalPaid);
  }
}

module.exports = { PaymentAllocator };
