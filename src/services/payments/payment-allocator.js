const { toCents, fromCents } = require('../../utils/money');
const { ValidationError } = require('../../errors/app-error');
const { PAYMENT_TYPES, isUntouchedFuture } = require('./payment-types');

const amountError = (message) => new ValidationError(message, [{ location: 'body', field: 'amount', message }]);
const pesos = (cents) => `$ ${fromCents(cents).toLocaleString('es-CO')}`;

/**
 * Decides where each peso of a payment goes. Pure calculation (no database),
 * so every rule can be unit-tested. Rules depend on the payment type
 * (see payment-types.js):
 *
 * installment (default)
 *   1. Oldest installment first; inside each installment, interest before principal.
 *   2. Fixed-term loans: the payment may cover future installments (paying ahead),
 *      but never more than the total still owed.
 *   3. Open-ended monthly loans: the payment covers installments already due
 *      (up to the payment date); whatever is left is a principal prepayment
 *      ("abono a capital") that lowers the balance. It cannot exceed the balance.
 *
 * interest_only
 *   Only interest, oldest first, of the installments already due plus the
 *   current one (the next not yet due). Their principal stays pending.
 *
 * principal ("abono a capital")
 *   First the interest already due, then the principal already due; the rest
 *   lowers the balance (extraPrincipalCents). In fixed-term loans that rest
 *   comes off the installments still to come (InstallmentRescheduler), so it
 *   cannot exceed the principal of the untouched future installments.
 */
class PaymentAllocator {
  /**
   * @param installments open installments ordered by number, with paid amounts
   * @returns { allocations: [{ installmentId, principalCents, interestCents }], extraPrincipalCents }
   */
  allocate({ amount, installments, isOpenEnded, paymentDate, principalBalance, paymentType = PAYMENT_TYPES.INSTALLMENT }) {
    if (paymentType === PAYMENT_TYPES.INTEREST_ONLY) return this.allocateInterestOnly({ amount, installments, paymentDate });
    if (paymentType === PAYMENT_TYPES.PRINCIPAL) {
      return this.allocatePrincipal({ amount, installments, isOpenEnded, paymentDate, principalBalance });
    }
    return this.allocateInstallments({ amount, installments, isOpenEnded, paymentDate, principalBalance });
  }

  allocateInstallments({ amount, installments, isOpenEnded, paymentDate, principalBalance }) {
    const eligible = isOpenEnded ? installments.filter(({ dueDate }) => dueDate <= paymentDate) : installments;
    const ledger = new AllocationLedger(toCents(amount));
    for (const installment of eligible) {
      ledger.payInterest(installment, this.remainingInterest(installment));
      ledger.payPrincipal(installment, this.remainingPrincipal(installment));
    }

    const maxExtra = isOpenEnded ? toCents(principalBalance) - ledger.principalCents() : 0;
    if (ledger.available > maxExtra) {
      const owed = toCents(amount) - ledger.available + maxExtra;
      throw amountError(`El pago supera lo que se debe. Máximo a recibir hoy: ${pesos(owed)}.`);
    }
    return ledger.result(ledger.available);
  }

  allocateInterestOnly({ amount, installments, paymentDate }) {
    const due = installments.filter(({ dueDate }) => dueDate <= paymentDate);
    const current = installments.find(({ dueDate }) => dueDate > paymentDate);
    const eligible = current ? [...due, current] : due;

    const ledger = new AllocationLedger(toCents(amount));
    for (const installment of eligible) ledger.payInterest(installment, this.remainingInterest(installment));

    if (ledger.available > 0) {
      const interest = toCents(amount) - ledger.available;
      throw amountError(
        interest === 0
          ? 'No hay intereses pendientes para abonar.'
          : `El abono supera los intereses pendientes. Máximo a recibir como intereses: ${pesos(interest)}.`,
      );
    }
    return ledger.result(0);
  }

  allocatePrincipal({ amount, installments, isOpenEnded, paymentDate, principalBalance }) {
    const due = installments.filter(({ dueDate }) => dueDate <= paymentDate);
    const ledger = new AllocationLedger(toCents(amount));
    for (const installment of due) ledger.payInterest(installment, this.remainingInterest(installment));
    for (const installment of due) ledger.payPrincipal(installment, this.remainingPrincipal(installment));

    const maxExtra = isOpenEnded
      ? toCents(principalBalance) - ledger.principalCents()
      : installments
          .filter((installment) => isUntouchedFuture(installment, paymentDate))
          .reduce((total, installment) => total + this.remainingPrincipal(installment), 0);
    if (ledger.available > maxExtra) {
      const owed = toCents(amount) - ledger.available + maxExtra;
      throw amountError(`El abono supera el capital que se puede abonar. Máximo a recibir hoy: ${pesos(owed)}.`);
    }
    return ledger.result(ledger.available);
  }

  remainingInterest(installment) {
    return toCents(installment.interestDue) - toCents(installment.interestPaid);
  }

  remainingPrincipal(installment) {
    return toCents(installment.principalDue) - toCents(installment.principalPaid);
  }
}

/**
 * Money still available from a payment and what went to each installment.
 * One allocation per installment even when interest and principal are paid
 * in different passes (payment_allocations is unique per payment+installment).
 */
class AllocationLedger {
  constructor(availableCents) {
    this.available = availableCents;
    this.byInstallment = new Map();
  }

  payInterest(installment, owedCents) {
    this.take(installment, 'interestCents', owedCents);
  }

  payPrincipal(installment, owedCents) {
    this.take(installment, 'principalCents', owedCents);
  }

  take(installment, part, owedCents) {
    const cents = Math.min(this.available, owedCents);
    if (cents <= 0) return;
    this.available -= cents;
    if (!this.byInstallment.has(installment.id)) {
      this.byInstallment.set(installment.id, { installmentId: installment.id, principalCents: 0, interestCents: 0 });
    }
    this.byInstallment.get(installment.id)[part] += cents;
  }

  principalCents() {
    return [...this.byInstallment.values()].reduce((total, { principalCents }) => total + principalCents, 0);
  }

  result(extraPrincipalCents) {
    return { allocations: [...this.byInstallment.values()], extraPrincipalCents };
  }
}

module.exports = { PaymentAllocator };
