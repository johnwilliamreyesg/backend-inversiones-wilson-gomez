class ClientPhotoController {
  constructor({ clientPhotoService }) {
    this.clientPhotoService = clientPhotoService;
  }

  list = async (req, res) => {
    const photos = await this.clientPhotoService.list(req.validated.params.clientId);
    res.json({ data: photos });
  };

  // PUT = "put this photo in this slot" (creates or replaces).
  upload = async (req, res) => {
    const { clientId, position } = req.validated.params;
    const photo = await this.clientPhotoService.upload(clientId, position, req.file);
    res.json({ data: photo });
  };

  delete = async (req, res) => {
    const { clientId, position } = req.validated.params;
    await this.clientPhotoService.delete(clientId, position);
    res.status(204).end();
  };
}

module.exports = { ClientPhotoController };
