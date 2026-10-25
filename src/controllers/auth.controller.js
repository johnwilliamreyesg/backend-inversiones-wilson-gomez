class AuthController {
  constructor({ authService }) {
    this.authService = authService;
  }

  login = async (req, res) => {
    const { token, user } = await this.authService.login(req.validated.body);
    res.json({ data: { token, user } });
  };

  // `req.user` was already loaded by the authenticate middleware.
  me = async (req, res) => {
    res.json({ data: req.user });
  };

  changePassword = async (req, res) => {
    const { token } = await this.authService.changePassword(req.user.id, req.validated.body);
    res.json({ data: { token } });
  };
}

module.exports = { AuthController };
