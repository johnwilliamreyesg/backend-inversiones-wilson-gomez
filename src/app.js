const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
require('./config/validation');
const { createApiRouter } = require('./routes');
const { notFoundHandler } = require('./middlewares/not-found-handler');
const { createErrorHandler } = require('./middlewares/error-handler');

const JSON_BODY_LIMIT = '100kb';

/**
 * Builds the Express app without starting it. Keeping "build" separate from
 * "listen" (server.js) lets tests create the app with fake dependencies.
 */
const createApp = ({ controllers, config }) => {
  const app = express();

  // Do not advertise the framework in response headers.
  app.disable('x-powered-by');
  // Hosting panels usually sit behind a proxy; needed for real client IPs (rate limiting).
  app.set('trust proxy', 1);

  // First, so every request is logged (even ones rejected by later middlewares).
  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
  app.use(helmet());
  app.use(cors({ origin: config.server.corsOrigins }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api', createApiRouter(controllers));

  // Order matters: these two must be the last middlewares.
  app.use(notFoundHandler);
  app.use(createErrorHandler({ isProduction: config.isProduction }));

  return app;
};

module.exports = { createApp };
