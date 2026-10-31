// HTTP only: takes validated input from req.validated, calls the service,
// and chooses the status code. No business rules live here.
class ExpenseCategoryController {
  constructor({ expenseCategoryService }) {
    this.expenseCategoryService = expenseCategoryService;
  }

  list = async (req, res) => {
    const categories = await this.expenseCategoryService.list(req.validated.query);
    res.json({ data: categories });
  };

  create = async (req, res) => {
    const category = await this.expenseCategoryService.create(req.validated.body);
    res.status(201).json({ data: category });
  };

  update = async (req, res) => {
    const category = await this.expenseCategoryService.update(
      req.validated.params.id,
      req.validated.body,
    );
    res.json({ data: category });
  };
}

module.exports = { ExpenseCategoryController };
