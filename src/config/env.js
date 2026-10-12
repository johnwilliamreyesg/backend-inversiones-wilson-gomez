require('dotenv').config();

// Single source of truth for environment variables.
// The rest of the app reads config from here, never from process.env directly.
const REQUIRED_VARIABLES = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

const missing = REQUIRED_VARIABLES.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
  },
  admin: {
    fullName: process.env.ADMIN_FULL_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
};
