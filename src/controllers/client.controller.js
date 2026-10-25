// HTTP only: takes validated input from req.validated, calls the service,
// and chooses the status code. No business rules live here.
class ClientController {
  constructor({ clientService }) {
    this.clientService = clientService;
  }

  list = async (req, res) => {
    const { items, meta } = await this.clientService.list(req.validated.query);
    res.json({ data: items, meta });
  };

  getById = async (req, res) => {
    const client = await this.clientService.getById(req.validated.params.id);
    res.json({ data: client });
  };

  create = async (req, res) => {
    // req.user is set by the authenticate middleware.
    const client = await this.clientService.create(req.validated.body, { userId: req.user.id });
    res.status(201).json({ data: client });
  };

  update = async (req, res) => {
    const client = await this.clientService.update(req.validated.params.id, req.validated.body);
    res.json({ data: client });
  };

  delete = async (req, res) => {
    await this.clientService.delete(req.validated.params.id);
    res.status(204).end();
  };
}

module.exports = { ClientController };
