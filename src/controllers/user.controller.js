// HTTP only: takes validated input from req.validated, calls the service,
// and chooses the status code. No business rules live here.
class UserController {
  constructor({ userService }) {
    this.userService = userService;
  }

  list = async (req, res) => {
    const { items, meta } = await this.userService.list(req.validated.query);
    res.json({ data: items, meta });
  };

  getById = async (req, res) => {
    const user = await this.userService.getById(req.validated.params.id);
    res.json({ data: user });
  };

  create = async (req, res) => {
    const user = await this.userService.create(req.validated.body);
    res.status(201).json({ data: user });
  };

  update = async (req, res) => {
    const user = await this.userService.update(req.validated.params.id, req.validated.body, {
      actorId: req.user.id,
    });
    res.json({ data: user });
  };

  resetPassword = async (req, res) => {
    await this.userService.resetPassword(req.validated.params.id, req.validated.body, {
      actorId: req.user.id,
    });
    res.status(204).end();
  };
}

module.exports = { UserController };
