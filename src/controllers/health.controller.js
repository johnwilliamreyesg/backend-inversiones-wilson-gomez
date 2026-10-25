// HTTP layer: reads the request, calls the service, writes the response.
// Methods are arrow-function fields so they keep `this` when passed to the router.
class HealthController {
  constructor({ healthService }) {
    this.healthService = healthService;
  }

  getStatus = async (req, res) => {
    const health = await this.healthService.getStatus();
    res.status(health.status === 'ok' ? 200 : 503).json({ data: health });
  };
}

module.exports = { HealthController };
