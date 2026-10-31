// HTTP only: takes validated input from req.validated, calls the service,
// and chooses the status code. No business rules live here.
class ExpenseController {
  constructor({ expenseService }) {
    this.expenseService = expenseService;
  }

  list = async (req, res) => {
    const { items, meta } = await this.expenseService.list(req.validated.query);
    res.json({ data: items, meta });
  };

  getById = async (req, res) => {
    const expense = await this.expenseService.getById(req.validated.params.id);
    res.json({ data: expense });
  };

  create = async (req, res) => {
    // req.user is set by the authenticate middleware.
    const expense = await this.expenseService.create(req.validated.body, { userId: req.user.id });
    res.status(201).json({ data: expense });
  };

  update = async (req, res) => {
    const expense = await this.expenseService.update(req.validated.params.id, req.validated.body);
    res.json({ data: expense });
  };

  delete = async (req, res) => {
    await this.expenseService.delete(req.validated.params.id);
    res.status(204).end();
  };
}

module.exports = { ExpenseController };
