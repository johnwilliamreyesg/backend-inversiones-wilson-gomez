const { Router } = require('express');
const { authorize } = require('../middlewares/authorize');
const { BACKUP_PERMISSION } = require('../security/access-control');

// Mounted behind `authenticate` at /backup.
const createBackupRoutes = ({ exportController }) => {
  const router = Router();
  // The whole database (clients, loans, installments, payments, expenses, agreements) in one Excel file.
  router.get('/excel', authorize(BACKUP_PERMISSION), exportController.backup);
  return router;
};

module.exports = { createBackupRoutes };
