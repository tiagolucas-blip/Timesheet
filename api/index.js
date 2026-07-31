// Vercel serverless entry point. Wraps the CAP/Express app as a plain
// (req, res) handler instead of a listening HTTP server, and reuses the
// bootstrapped app across warm invocations of the same function instance.
//
// The UI5 framework itself (/resources, /test-resources) is NOT served from
// here — vercel.json rewrites those paths straight to the public SAPUI5 CDN,
// so we don't bundle the framework into the function. Our own app files
// (app/timesheet/webapp/**) ARE served from here via CAP's default static
// middleware, which is why vercel.json also marks them as included files.
process.env.CDS_ENV = process.env.CDS_ENV || 'vercel';

const cds = require('@sap/cds');
const { configureDbCredentials } = require('../lib/db-credentials');

let appPromise;
function bootstrap() {
  if (!appPromise) {
    configureDbCredentials(cds);
    // port: 0 avoids binding a well-known port — we never use the listener,
    // requests are dispatched directly via app(req, res) below.
    appPromise = require('@sap/cds/server')({ port: 0 }).then(() => cds.app);
  }
  return appPromise;
}

module.exports = async (req, res) => {
  const app = await bootstrap();
  app(req, res);
};
