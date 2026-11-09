const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const sendFile = (res, { buffer, filename }, contentType) => {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
};

// HTTP only: calls the service and sends the file.
class ExportController {
  constructor({ exportService }) {
    this.exportService = exportService;
  }

  backup = async (req, res) => {
    sendFile(res, await this.exportService.backup({ generatedBy: req.user.fullName }), XLSX_TYPE);
  };

  collectionsPdf = async (req, res) => {
    sendFile(res, await this.exportService.collectionsPdf(req.validated.query), 'application/pdf');
  };
}

module.exports = { ExportController };
