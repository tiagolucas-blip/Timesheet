// Shared between api/index.js (serverless request handler) and
// scripts/deploy-vercel-db.js (build-time schema/seed deploy) — both need
// the same DATABASE_URL -> cds credentials translation, since @cap-js/postgres
// expects individual {host,port,user,password,database} fields, not a single
// connection string.
const { URL } = require('url');

function credentialsFromConnectionString(connectionString) {
  const u = new URL(connectionString);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    ssl: { rejectUnauthorized: false },
  };
}

// Must run before the first `cds.connect.to('db')` / cds-server bootstrap.
function configureDbCredentials(cds) {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (connectionString) {
    cds.env.requires.db.credentials = credentialsFromConnectionString(connectionString);
  }
}

module.exports = { credentialsFromConnectionString, configureDbCredentials };
