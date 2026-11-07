// HTTP only: takes validated input from req.validated, calls the service,
// and chooses the status code. No business rules live here.
class LoanController {
  constructor({ loanService, dueDateService }) {
    this.loanService = loanService;
    this.dueDateService = dueDateService;
  }

  preview = async (req, res) => {
    res.json({ data: await this.loanService.preview(req.validated.body) });
  };

  list = async (req, res) => {
    const { items, meta } = await this.loanService.list(req.validated.query);
    res.json({ data: items, meta });
  };

  getById = async (req, res) => {
    res.json({ data: await this.loanService.getById(req.validated.params.id) });
  };

  listByClient = async (req, res) => {
    res.json({ data: await this.loanService.listByClient(req.validated.params.clientId) });
  };

  create = async (req, res) => {
    // req.user is set by the authenticate middleware.
    const loan = await this.loanService.create(req.validated.body, { userId: req.user.id });
    res.status(201).json({ data: loan });
  };

  rescheduleInstallment = async (req, res) => {
    const { id, installmentId } = req.validated.params;
    const loan = await this.dueDateService.reschedule(id, installmentId, req.validated.body, { userId: req.user.id });
    res.json({ data: loan });
  };

  cancel = async (req, res) => {
    res.json({ data: await this.loanService.cancel(req.validated.params.id) });
  };
}

module.exports = { LoanController };
