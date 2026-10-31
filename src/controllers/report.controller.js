// HTTP only: takes validated input from req.validated, calls the service,
// and chooses the status code. No business rules live here.
class ReportController {
  constructor({ reportService }) {
    this.reportService = reportService;
  }

  daily = async (req, res) => {
    res.json({ data: await this.reportService.daily(req.validated.query) });
  };

  monthly = async (req, res) => {
    res.json({ data: await this.reportService.monthly(req.validated.query) });
  };

  portfolio = async (req, res) => {
    res.json({ data: await this.reportService.portfolio() });
  };
}

module.exports = { ReportController };
