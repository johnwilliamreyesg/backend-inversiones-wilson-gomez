// HTTP only: takes validated input from req.validated, calls the service,
// and chooses the status code. No business rules live here.
class PaymentController {
  constructor({ paymentService }) {
    this.paymentService = paymentService;
  }

  register = async (req, res) => {
    // req.user is set by the authenticate middleware.
    const payment = await this.paymentService.register(req.validated.params.loanId, req.validated.body, {
      userId: req.user.id,
    });
    res.status(201).json({ data: payment });
  };

  listByLoan = async (req, res) => {
    res.json({ data: await this.paymentService.listByLoan(req.validated.params.loanId) });
  };

  list = async (req, res) => {
    const { items, meta } = await this.paymentService.list(req.validated.query);
    res.json({ data: items, meta });
  };

  getById = async (req, res) => {
    res.json({ data: await this.paymentService.getById(req.validated.params.id) });
  };

  void = async (req, res) => {
    const payment = await this.paymentService.void(req.validated.params.id, req.validated.body, {
      userId: req.user.id,
    });
    res.json({ data: payment });
  };
}

module.exports = { PaymentController };
