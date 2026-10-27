require('dotenv').config();

// Single source of truth for environment variables.
// The rest of the app reads config from here, never from process.env directly.
const REQUIRED_VARIABLES = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

const missing = REQUIRED_VARIABLES.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  server: {
    port: Number(process.env.PORT) || 3000,
    // Comma-separated list of allowed frontend origins.
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
  },
  auth: {
    // Validated by TokenProvider when the server starts (not here, so the
    // Knex CLI can run migrations without it).
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },
  storage: {
    // 'local' (disk, for development) or 'r2' (Cloudflare R2, for production).
    driver: process.env.STORAGE_DRIVER || 'local',
    signedUrlTtlSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS) || 3600,
    local: {
      directory: process.env.LOCAL_STORAGE_DIR || './storage',
      // Public base URL of this API, used to build links to local files.
      publicBaseUrl: process.env.PUBLIC_API_URL || `http://localhost:${Number(process.env.PORT) || 3000}`,
    },
    r2: {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
    },
  },
  admin: {
    fullName: process.env.ADMIN_FULL_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
};
