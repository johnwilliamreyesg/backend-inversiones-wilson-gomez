const env = require('./config/env');
const { createContainer } = require('./container');
const { createApp } = require('./app');

const SHUTDOWN_TIMEOUT_MS = 10000;

const container = createContainer();
const app = createApp({ controllers: container.controllers, config: env });

const server = app.listen(env.server.port, () => {
  console.log(`API listening on http://localhost:${env.server.port}/api (${env.nodeEnv})`);
});

// Graceful shutdown: stop accepting requests, let in-flight ones finish
// (e.g. a payment being saved), then close the database pool.
const shutdown = (signal) => {
  console.log(`${signal} received, shutting down...`);

  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(async () => {
    await container.db.destroy();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
