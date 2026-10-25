const { rateLimit } = require('express-rate-limit');

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;

/**
 * Slows down password guessing: max 10 FAILED logins per IP every 15 minutes.
 * Successful logins do not count, so a user who mistypes once is not punished.
 * In-memory store: fine for a single server instance.
 */
const createLoginRateLimiter = () =>
  rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: MAX_FAILED_LOGINS,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.',
        },
      });
    },
  });

module.exports = { createLoginRateLimiter };
