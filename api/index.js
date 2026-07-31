// Vercel serverless entry point.
//
// Bootstraps CAP manually instead of using @sap/cds/server, for two reasons:
//   1. @sap/cds/server always calls app.listen(port) — pointless (and once
//      caused an EADDRINUSE) for a function that's invoked directly as
//      (req, res), never through its own listener.
//   2. Both cds.load('*') (the model) and express.static (the UI5 app)
//      scan directories at runtime, which Vercel's file tracer can't see
//      (it only follows static require()/import calls) — no matter how
//      vercel.json's includeFiles is configured, those files are missing
//      once deployed.
//
// The fix for #2: everything needed is pre-bundled at build time (see
// scripts/build-bundle.js) into _gen/*.json, which this file require()s
// directly — a plain require() of a JSON file is something the tracer is
// guaranteed to bundle correctly. The UI5 app files are served straight
// from that in-memory manifest. The CDS model is handled more carefully:
// _gen/model-sources.json holds the raw .cds SOURCE TEXT, not a
// pre-compiled model object — an earlier attempt to require() a
// pre-compiled CSN JSON directly loaded fine for plain CRUD, but silently
// hung on every error response (something the error-formatting path
// depends on doesn't survive a JSON.stringify/parse round-trip). Writing
// the source text to /tmp and letting cds.load() compile it normally
// avoids that risk entirely — it's the exact same code path as local dev.
//
// UI5 framework resources (/resources, /test-resources) are NOT served
// from here — vercel.json rewrites those straight to the public SAPUI5 CDN.
process.env.CDS_ENV = process.env.CDS_ENV || 'vercel';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cds = require('@sap/cds');
const { configureDbCredentials } = require('../lib/db-credentials');
const modelSources = require('../_gen/model-sources.json');
const webappFiles = require('../_gen/webapp-files.json');
const TimesheetServiceImpl = require('../srv/timesheet-service.js');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.properties': 'text/plain; charset=utf-8',
};

function serveWebappManifest(req, res, next) {
  let p = req.path.replace(/^\/+/, '');
  if (p === '') p = 'index.html';
  const content = webappFiles[p];
  if (content == null) return next();
  res.type(CONTENT_TYPES[path.extname(p)] || 'text/plain; charset=utf-8');
  res.send(content);
}

function writeModelSourcesToTmp() {
  const tmpRoot = path.join('/tmp', 'cds-model');
  const modelFiles = [];
  for (const [relPath, content] of Object.entries(modelSources)) {
    const dest = path.join(tmpRoot, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
    modelFiles.push(dest);
  }
  return modelFiles;
}

let appPromise;
function bootstrap() {
  if (!appPromise) {
    appPromise = (async () => {
      configureDbCredentials(cds);

      const app = (cds.app = express());
      cds.emit('bootstrap', app);
      app.use('/timesheet/webapp', serveWebappManifest);

      const modelFiles = writeModelSourcesToTmp();
      const csn = await cds.load(modelFiles);
      cds.edmxs = cds.compile.to.edmx.files(csn);
      cds.model = cds.compile.for.nodejs(csn);
      if (cds.requires.db) cds.db = await cds.connect.to('db');

      // .with(...) passes the impl class directly, bypassing the convention-based
      // lookup for a sibling srv/timesheet-service.js file (filesystem-dependent).
      await cds.serve('all', {}).with(TimesheetServiceImpl).in(app);
      await cds.emit('served', cds.services);
      return app;
    })();
  }
  return appPromise;
}

module.exports = async (req, res) => {
  const app = await bootstrap();
  app(req, res);
};
