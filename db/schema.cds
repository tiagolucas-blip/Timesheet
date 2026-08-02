namespace timesheet;

/**
 * String-typed key instead of the standard `cuid` (UUID) aspect: this mockup's
 * seed data uses human-readable IDs (EMP-001, CC-1000-IT, ...) so they read
 * clearly in CSVs, service calls and this file. A UUID key would type the
 * OData property as Edm.Guid, which the client formats as an unquoted filter
 * literal — breaking on non-GUID string values like these.
 */
aspect StringKey {
  key ID : String(36);
}

/**
 * Inlined equivalent of @sap/cds/common's `managed` aspect (createdAt/By,
 * modifiedAt/By) instead of importing it. The Vercel serverless bundle
 * compiles this model from a bare copy of db/ + srv/ written to /tmp at
 * cold start (see api/index.js) — no node_modules alongside it there, so
 * `using ... from '@sap/cds/common'` can't be resolved.
 */
aspect managed {
  createdAt  : Timestamp @cds.on.insert: $now;
  createdBy  : String(255) @cds.on.insert: $user;
  modifiedAt : Timestamp @cds.on.insert: $now @cds.on.update: $now;
  modifiedBy : String(255) @cds.on.insert: $user @cds.on.update: $user;
}

/**
 * Master data entities below mirror what is replicated from SAP S/4HANA
 * (Employee, Cost Center, Project master data). In this mockup they are
 * seeded from CSV files in db/data/ instead of a real S/4 connection;
 * the field names/lengths follow SAP conventions (PERNR, CO Cost Center,
 * WBS element) so a later swap to real S/4 OData services is a data-source
 * change, not a model change.
 */

entity Employees : StringKey {
  employeeId   : String(8)   @title: 'Employee ID (PERNR)'; // e.g. 00000007
  firstName    : String(80);
  lastName     : String(80);
  email        : String(120);
  homeCostCenter : Association to CostCenters;
  isManager    : Boolean default false;
  active       : Boolean default true;
  timesheets   : Association to many TimesheetHeaders on timesheets.employee = $self;
}

entity CostCenters : StringKey {
  costCenterId : String(10)  @title: 'Cost Center (SAP CO)'; // e.g. CC_MA_RE
  name         : String(120);
  companyCode  : String(4);
  responsibleManager : Association to Employees;
}

entity Projects : StringKey {
  projectId    : String(24)  @title: 'Project / WBS Element';
  name         : String(120);
  costCenter   : Association to CostCenters;
  responsibleManager : Association to Employees;
  validFrom    : Date;
  validTo      : Date;
  active       : Boolean default true;
}

/**
 * Which cost centers / projects an employee is allowed to book time against.
 * Mirrors an S/4 authorization/assignment check without modeling full CATS auth.
 */
entity TimeAllocations : StringKey {
  employee   : Association to Employees;
  costCenter : Association to CostCenters;
  project    : Association to Projects;
}

type WeekStatus : String enum {
  Draft;
  Submitted;
  PartiallyApproved;
  Approved;
  Rejected;
  Transferred;
}

type EntryStatus : String enum {
  Draft;
  Submitted;
  Approved;
  Rejected;
}

/**
 * One header per employee per ISO week. Header status is derived from its
 * entries (see srv logic) — it is persisted for fast list filtering in the
 * approval and transfer worklists rather than recomputed on every read.
 */
entity TimesheetHeaders : StringKey, managed {
  employee      : Association to Employees;
  weekStartDate : Date; // Monday of the ISO week
  status        : WeekStatus default 'Draft';
  submittedAt   : Timestamp;
  totalHours    : Decimal(6,2) default 0;
  entries       : Composition of many TimesheetEntries on entries.header = $self;
}

/**
 * A single day/cost-center-or-project booking line. Approval happens at
 * this granularity because a week can span cost centers or projects with
 * different responsible managers.
 */
entity TimesheetEntries : StringKey, managed {
  header       : Association to TimesheetHeaders;
  employee     : Association to Employees;
  date         : Date;
  costCenter   : Association to CostCenters;
  project      : Association to Projects;
  activityType : String(20) default 'Attendance'; // Attendance, Overtime, Travel...
  hours        : Decimal(4,2);
  comment      : String(255);
  status       : EntryStatus default 'Draft';
  approver     : Association to Employees;
  approvedAt   : Timestamp;
  rejectionReason : String(255);
  transferredAt   : Timestamp;
  catsTransfer    : Association to CatsTransferLogs;
}

/**
 * Mock record of a CATS (CAT2/CATSXT) transfer to SAP S/4. Stands in for a
 * real OData/IDoc call to S/4 — stores the outbound payload we *would* send
 * so the approval-to-posting flow is demonstrable end-to-end.
 */
entity CatsTransferLogs : StringKey {
  header       : Association to TimesheetHeaders;
  triggeredAt  : Timestamp;
  triggeredBy  : Association to Employees;
  status       : String(20); // Success, Error
  message      : String(255);
  payload      : LargeString; // mock CATS record(s) as JSON, as if sent to S/4
  entries      : Association to many TimesheetEntries on entries.catsTransfer = $self;
}
