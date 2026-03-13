const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

function normalizedConnectionString(input) {
  if (!input) return input;
  try {
    const parsed = new URL(input);
    const sslmode = (parsed.searchParams.get('sslmode') || '').toLowerCase();
    if (sslmode === 'prefer' || sslmode === 'require' || sslmode === 'verify-ca') {
      parsed.searchParams.set('sslmode', 'verify-full');
      return parsed.toString();
    }
    return input;
  } catch (_) {
    return input;
  }
}

const connectionString = normalizedConnectionString(process.env.DATABASE_URL);

function getSslConfig(input) {
  const forceSsl = String(process.env.DB_SSL || '').toLowerCase();
  if (forceSsl === 'true' || forceSsl === '1' || forceSsl === 'yes') {
    return { rejectUnauthorized: false };
  }
  if (forceSsl === 'false' || forceSsl === '0' || forceSsl === 'no') {
    return false;
  }

  try {
    const parsed = new URL(input || '');
    if (parsed.hostname.endsWith('render.com')) {
      return { rejectUnauthorized: false };
    }
  } catch (_) {
    // Ignore malformed connection strings; fall back to no SSL.
  }

  return false;
}

const pool = new Pool({
  connectionString,
  ssl: getSslConfig(connectionString)
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
