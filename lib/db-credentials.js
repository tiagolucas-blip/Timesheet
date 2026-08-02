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

// Normally registered by CAP's own plugin auto-discovery, which merges the
// "cds" section of every node_modules package.json (@cap-js/postgres's
// declares this) — another runtime directory scan, same story as the model
// and static files. Registering it explicitly here avoids depending on
// that scan succeeding inside the deployed function too.
const POSTGRES_KIND_CONFIG = {
  impl: '@cap-js/postgres',
  kind: 'postgres',
  dialect: 'postgres',
  pool: { min: 0, max: 10, testOnBorrow: true, acquireTimeoutMillis: 1000, destroyTimeoutMillis: 1000 },
  schema_evolution: 'auto',
};

// Must run before the first `cds.connect.to('db')` / cds-server bootstrap.
function configureDbCredentials(cds) {
  cds.env.requires.kinds.postgres ??= POSTGRES_KIND_CONFIG;

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (connectionString) {
    cds.env.requires.db.credentials = credentialsFromConnectionString(connectionString);
  }
}

module.exports = { credentialsFromConnectionString, configureDbCredentials };
