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
`server.js` | Serves the OpenUI5 framework locally from `dist-ui5/` instead of a public CDN

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

## Learn more

Learn more about CAP at <https://cap.cloud.sap>.
