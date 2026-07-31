# Timesheet

A mockup SAP Fiori/UI5 timesheet application: employees register hours against
cost centers or projects, managers approve, and approved weeks are transferred
to SAP S/4 CATS. Master data (employees, cost centers, projects) mirrors what
would be replicated from S/4 — mocked locally here, no real SAP connection.

## Project layout

File or Folder | Purpose
---------|----------
`db/schema.cds` | Domain model: master data + timesheet/approval/CATS-transfer entities
`db/data/` | Mock master and transactional data (CSV)
`srv/` | OData service + workflow logic (submit / approve / reject / transfer to CATS)
`app/timesheet/` | Freestyle SAPUI5 app (My Timesheet, Approvals, SAP Transfer)
`server.js` | Local dev only: serves the OpenUI5 framework from `dist-ui5/` instead of a public CDN
`mta.yaml`, `app/router/`, `xs-security.json` | SAP BTP Cloud Foundry deployment (HANA + XSUAA)
`api/index.js`, `vercel.json` | Vercel deployment (Postgres + serverless function)

## Getting started

```
npm install
npm run build:ui5   # builds the OpenUI5 framework (incl. compiled theme CSS) into dist-ui5/
npm start           # or: cds watch
```

Then open `http://localhost:4004/timesheet/webapp/index.html`.

`npm run build:ui5` only needs to be re-run if you change the UI5 framework
version/libraries in `app/timesheet/ui5.yaml` — it does not need to be run
again after editing the app's own views/controllers, since those are served
directly from `app/timesheet/webapp/` by `cds watch`.

There is no real authentication in this mockup — use the "Acting as" selector
in the top-right corner to switch between employees/managers.

## Deploying to Vercel

Vercel runs stateless serverless functions with no persistent local disk, so
this deployment target swaps SQLite for a real Postgres database and wraps
the CAP app as a single serverless function (`api/index.js`) instead of a
long-running server. The UI5 framework is loaded from the public SAPUI5 CDN
via a `vercel.json` rewrite rather than bundled into the function.

1. In the Vercel project → **Storage**, add a Postgres integration (Neon,
   Supabase, or Vercel Postgres all work) and confirm it sets a
   `DATABASE_URL` (or `POSTGRES_URL`) environment variable, available at
   **both build and runtime**.
2. Deploy (push to `main`, or `vercel --prod`). The build command
   (`npm run deploy:vercel-db`, see `vercel.json`) runs `cds deploy` against
   that database, creating the schema and (re-)seeding the mock data on
   every deploy.
3. Visit the deployment URL — it redirects to
   `/timesheet/webapp/index.html`.

This path was verified locally end-to-end (schema deploy, full submit →
approve/reject → CATS-transfer workflow, and a simulated serverless
invocation with no listening server) against a real local Postgres instance
before ever touching Vercel — see commit history for details. Deploying
here is still a mockup: like the BTP path, there's no real S/4 connection
and auth stays on the `X-Employee-Id` header, now under CAP's `mocked`
auth strategy for the `vercel` profile (see `package.json`'s `cds.requires`).

## Learn more

Learn more about CAP at <https://cap.cloud.sap>.
