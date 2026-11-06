const path = require('path');
const env = require('./config/env');
const { createContainer } = require('./container');
const { createApp } = require('./app');

const SHUTDOWN_TIMEOUT_MS = 10000;

const container = createContainer();
const app = createApp({
  controllers: container.controllers,
  middlewares: container.middlewares,
  config: env,
});

const server = app.listen(env.server.port, () => {
  console.log(`API listening on http://localhost:${env.server.port}/api (${env.nodeEnv})`);
  warnAboutPendingMigrations();
});

// New code with an old database fails with 500 on whatever touches a new
// table or column. Say it at start-up instead of letting it look like a bug.
async function warnAboutPendingMigrations() {
  try {
    const [, pending] = await container.db.migrate.list({ directory: path.join(__dirname, 'migrations') });
    if (pending.length > 0) {
      console.warn(
        `\n⚠️  The database has ${pending.length} pending migration(s). Run "npm run db:migrate" and restart:\n` +
          pending.map(({ file }) => `   - ${file}`).join('\n'),
      );
    }
  } catch (error) {
    console.warn(`Could not check pending migrations: ${error.message}`);
  }
}

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
