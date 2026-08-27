const { URL } = require('url');
const { execSync } = require('child_process');

console.log('--- SAFETY CHECK FOR DATABASE COMMAND ---');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(dbUrl);
} catch (e) {
  console.error('ERROR: Invalid DATABASE_URL format.');
  process.exit(1);
}

const host = parsed.hostname;
const port = parsed.port;
const dbName = parsed.pathname.replace(/^\//, '');

console.log(`Target Host: ${host}`);
console.log(`Target Port: ${port}`);
console.log(`Target DB:   ${dbName}`);

if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error('SAFETY VIOLATION: Host must be localhost or 127.0.0.1');
  process.exit(1);
}
if (port !== '5433') {
  console.error('SAFETY VIOLATION: Port must be 5433');
  process.exit(1);
}
if (dbName !== 'paklance_test') {
  console.error('SAFETY VIOLATION: Database name must be paklance_test');
  process.exit(1);
}

console.log('SAFETY CHECK PASSED.');

const args = process.argv.slice(2);
if (args.length > 0) {
  const command = args.join(' ');
  console.log(`Executing: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', env: process.env });
  } catch (err) {
    process.exit(err.status || 1);
  }
}
