// HTTP only: takes validated input from req.validated, calls the service,
// and chooses the status code. No business rules live here.
class RoleController {
  constructor({ roleService }) {
    this.roleService = roleService;
  }

  list = async (req, res) => {
    res.json({ data: await this.roleService.list() });
  };

  listPermissions = async (req, res) => {
    res.json({ data: await this.roleService.listPermissions() });
  };

  getById = async (req, res) => {
    res.json({ data: await this.roleService.getById(req.validated.params.id) });
  };

  create = async (req, res) => {
    const role = await this.roleService.create(req.validated.body);
    res.status(201).json({ data: role });
  };

  update = async (req, res) => {
    const role = await this.roleService.update(req.validated.params.id, req.validated.body);
    res.json({ data: role });
  };

  delete = async (req, res) => {
    await this.roleService.delete(req.validated.params.id);
    res.status(204).end();
  };
}

module.exports = { RoleController };
