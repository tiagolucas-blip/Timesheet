// Deploys schema + seed data to the Postgres database configured via
// DATABASE_URL/POSTGRES_URL, under the "vercel" cds profile. Run at build
// time (see vercel.json) — mirrors what `cds deploy` does internally
// (@sap/cds/bin/deploy.js), but with our connection-string credentials
// wired in first, which the plain CLI has no way to do.
process.env.CDS_ENV = process.env.CDS_ENV || 'vercel';

const cds = require('@sap/cds');
const { configureDbCredentials } = require('../lib/db-credentials');

;(async () => {
  configureDbCredentials(cds);

  if (!cds.env.requires.db.credentials) {
    console.error('No DATABASE_URL/POSTGRES_URL set — cannot deploy the database schema.');
    process.exit(1);
  }

  cds.db = await cds.connect.to(cds.requires.db);
  await cds.deploy('*').to(cds.db);
  console.log('Database schema + seed data deployed successfully.');
  await cds.db.disconnect?.();
  process.exit(0);
})().catch((err) => {
  console.error('Database deploy failed:', err);
  process.exit(1);
});
