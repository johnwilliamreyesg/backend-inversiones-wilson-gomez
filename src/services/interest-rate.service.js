const { NotFoundError, ConflictError, ValidationError } = require('../errors/app-error');

const formatRate = (rate) => `${rate.toLocaleString('es-CO')} %`;

/**
 * Catalog of monthly interest rates offered when a monthly loan is created.
 * Rates are never deleted, only deactivated: loans keep their own copy of the
 * rate, so the catalog can change freely without touching existing loans.
 */
class InterestRateService {
  constructor({ interestRateRepository }) {
    this.interestRateRepository = interestRateRepository;
  }

  list({ includeInactive }) {
    return this.interestRateRepository.findAll({ includeInactive });
  }

  async create(data) {
    await this.ensureRateIsAvailable(data.rate);
    return this.interestRateRepository.create(data);
  }

  async update(id, data) {
    const existing = await this.interestRateRepository.findById(id);
    if (!existing) throw new NotFoundError('La tasa no existe.');
    if (data.rate !== undefined) await this.ensureRateIsAvailable(data.rate, { excludeId: id });
    return this.interestRateRepository.update(id, data);
  }

  /**
   * Used by LoanService: a new monthly loan must use an active rate of the
   * catalog. A bad rate is invalid input (400 on that field).
   */
  async ensureOffered(rate) {
    const interestRate = await this.interestRateRepository.findByRate(rate);
    if (interestRate?.isActive) return;

    const offered = (await this.interestRateRepository.findAll()).map(({ rate: value }) => formatRate(value));
    const message = offered.length
      ? `La tasa ${formatRate(rate)} no está disponible. Tasas permitidas: ${offered.join(', ')}.`
      : 'No hay tasas de interés activas. Pida al administrador que active al menos una.';
    throw new ValidationError(message, [{ location: 'body', field: 'monthlyInterestRate', message }]);
  }

  async ensureRateIsAvailable(rate, { excludeId } = {}) {
    const existing = await this.interestRateRepository.findByRate(rate, { excludeId });
    if (existing) {
      throw new ConflictError(`Ya existe la tasa ${formatRate(existing.rate)}.`, {
        field: 'rate',
        interestRateId: existing.id,
      });
    }
  }
}

module.exports = { InterestRateService };
