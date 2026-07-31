// Pre-bundles everything the Vercel serverless function needs into JSON
// manifests under _gen/, which api/index.js require()s directly. This
// sidesteps Vercel's automatic file tracer entirely: CAP discovers its .cds
// model and serves static UI5 files by scanning directories at runtime,
// which the tracer can't see (it only follows static require()/import
// calls) — no matter how includeFiles is configured. A literal
// require('../_gen/x.json') is something the tracer is guaranteed to
// bundle correctly.
//
// The model itself is bundled as raw .cds SOURCE TEXT (not a pre-compiled
// CSN object) — the compiled CSN doesn't survive a JSON.stringify/parse
// round-trip cleanly (some structure the error-response path relies on
// gets lost, even though basic CRUD keeps working). At cold start,
// api/index.js writes these sources to /tmp and calls the normal
// cds.load(), so compilation happens exactly like it does locally.
const cds = require('@sap/cds');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, '_gen');
fs.mkdirSync(outDir, { recursive: true });

function buildModelSources() {
  // Our own model files only — excludes @sap/cds's built-in outbox.cds
  // (also matched by cds.resolve('*')): we don't use CAP's messaging/queue
  // feature, and node_modules/@sap/cds is a real npm dependency Vercel
  // bundles on its own, so there's nothing gained by round-tripping it
  // through this manifest too.
  const files = ['db/schema.cds', 'srv/timesheet-service.cds'];
  const manifest = {};
  for (const f of files) {
    manifest[f] = fs.readFileSync(path.join(root, f), 'utf-8');
  }
  fs.writeFileSync(path.join(outDir, 'model-sources.json'), JSON.stringify(manifest));
  console.log(`Wrote _gen/model-sources.json (${Object.keys(manifest).length} files)`);
}

function buildWebappManifest() {
  const webappDir = path.join(root, 'app', 'timesheet', 'webapp');
  const manifest = {};
  function walk(dir, base) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else manifest[rel] = fs.readFileSync(full, 'utf-8');
    }
  }
  walk(webappDir, '');
  fs.writeFileSync(path.join(outDir, 'webapp-files.json'), JSON.stringify(manifest));
  console.log(`Wrote _gen/webapp-files.json (${Object.keys(manifest).length} files)`);
}

buildModelSources();
buildWebappManifest();
