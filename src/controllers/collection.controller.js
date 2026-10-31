// HTTP only: takes validated input from req.validated, calls the service,
// and chooses the status code. No business rules live here.
class CollectionController {
  constructor({ collectionService }) {
    this.collectionService = collectionService;
  }

  listDue = async (req, res) => {
    const { items, meta } = await this.collectionService.listDue(req.validated.query);
    res.json({ data: items, meta });
  };
}

module.exports = { CollectionController };
