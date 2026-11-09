// How a loan status reads in a sentence ("el crédito está …"), for error messages.
const STATUS_IN_SENTENCE = {
  active: 'activo',
  defaulted: 'en mora',
  paid_off: 'pagado',
  cancelled: 'cancelado',
  written_off: 'en cartera castigada',
};

const loanStatusText = (status) => STATUS_IN_SENTENCE[status] ?? status;

module.exports = { loanStatusText };
