const { URL } = require('url');

module.exports = async () => {
  console.log('\n--- JEST GLOBAL SETUP: SAFETY CHECK ---');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('SAFETY VIOLATION: DATABASE_URL is not set.');
  }

  let parsed;
  try {
    parsed = new URL(dbUrl);
  } catch (e) {
    throw new Error('SAFETY VIOLATION: Invalid DATABASE_URL format.');
  }

  const host = parsed.hostname;
  const port = parsed.port;
  const dbName = parsed.pathname.replace(/^\//, '');

  console.log(`DATABASE HOST = ${host}`);
  console.log(`DATABASE PORT = ${port}`);
  console.log(`DATABASE NAME = ${dbName}`);
  console.log(`MINIO HOST = ${process.env.MINIO_ENDPOINT}`);
  console.log(`MINIO PORT = ${process.env.MINIO_PORT}`);

  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      `SAFETY VIOLATION: E2E database host must be localhost, found: ${host}`,
    );
  }
  if (port !== '5433') {
    throw new Error(
      `SAFETY VIOLATION: E2E database port must be 5433, found: ${port}`,
    );
  }
  if (dbName !== 'paklance_test') {
    throw new Error(
      `SAFETY VIOLATION: E2E database name must be paklance_test, found: ${dbName}`,
    );
  }

  // Guard against neon.tech just in case
  if (dbUrl.includes('neon.tech')) {
    throw new Error(
      'SAFETY VIOLATION: DATABASE_URL contains neon.tech! Aborting to protect production.',
    );
  }

  console.log('--- SAFETY CHECK PASSED ---\n');
};
