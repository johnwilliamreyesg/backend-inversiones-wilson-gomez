const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { authorize } = require('../middlewares/authorize');
const {
  dailyReportQuerySchema,
  monthlyReportQuerySchema,
} = require('../validators/report.validators');

// Mounted behind `authenticate` (see routes/index.js). Every route needs reports.read.
// The daily collection list (report 1 of the quote) is /collections.
const createReportRoutes = ({ reportController }) => {
  const router = Router();
  router.use(authorize('reports.read'));

  router.get('/daily', validateRequest({ query: dailyReportQuerySchema }), reportController.daily);
  router.get('/monthly', validateRequest({ query: monthlyReportQuerySchema }), reportController.monthly);
  router.get('/portfolio', reportController.portfolio);

  return router;
};

module.exports = { createReportRoutes };
