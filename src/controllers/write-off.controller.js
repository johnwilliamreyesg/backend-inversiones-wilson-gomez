// HTTP only: takes validated input from req.validated, calls the service,
// and chooses the status code. No business rules live here.
class WriteOffController {
  constructor({ writeOffService }) {
    this.writeOffService = writeOffService;
  }

  list = async (req, res) => {
    const { items, meta } = await this.writeOffService.list();
    res.json({ data: items, meta });
  };

  writeOffClient = async (req, res) => {
    const result = await this.writeOffService.writeOffClient(req.validated.params.id, req.validated.body, { userId: req.user.id });
    res.json({ data: result });
  };

  renegotiate = async (req, res) => {
    const loan = await this.writeOffService.renegotiate(req.validated.params.id, req.validated.body, { userId: req.user.id });
    res.json({ data: loan });
  };
}

module.exports = { WriteOffController };
