// HTTP only: takes validated input from req.validated, calls the service,
// and chooses the status code. No business rules live here.
class InterestRateController {
  constructor({ interestRateService }) {
    this.interestRateService = interestRateService;
  }

  list = async (req, res) => {
    res.json({ data: await this.interestRateService.list(req.validated.query) });
  };

  create = async (req, res) => {
    const interestRate = await this.interestRateService.create(req.validated.body);
    res.status(201).json({ data: interestRate });
  };

  update = async (req, res) => {
    const interestRate = await this.interestRateService.update(req.validated.params.id, req.validated.body);
    res.json({ data: interestRate });
  };
}

module.exports = { InterestRateController };
