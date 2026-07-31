using timesheet as db from '../db/schema';

/**
 * Single OData service for the mockup. There is no real authentication yet
 * (see CLAUDE.md-style project convention: role switch is a UI concern, not
 * an auth boundary) — the "current user" is resolved per-request from an
 * X-Employee-Id header (see srv/timesheet-service.js), defaulting to the
 * first seeded employee. Swapping in real SAP S/4 master data later means
 * pointing Employees/CostCenters/Projects at remote OData services; the
 * transactional entities and actions below stay the same.
 */
service TimesheetService {

  @readonly entity Employees      as projection on db.Employees;
  @readonly entity CostCenters    as projection on db.CostCenters;
  @readonly entity Projects       as projection on db.Projects;
  @readonly entity TimeAllocations as projection on db.TimeAllocations;

  entity TimesheetHeaders as projection on db.TimesheetHeaders actions {
    // Employee action: moves all Draft entries under this header to Submitted.
    action submitWeek() returns TimesheetHeaders;
  };

  entity TimesheetEntries as projection on db.TimesheetEntries actions {
    // Manager action: approve a single booking line.
    action approve() returns TimesheetEntries;
    // Manager action: reject a single booking line with a reason.
    action reject(reason: String) returns TimesheetEntries;
  };

  @readonly entity CatsTransferLogs as projection on db.CatsTransferLogs;

  // Manager/Finance action: transfer all Approved entries of a fully-approved
  // week to SAP S/4 CATS (mocked — produces a CatsTransferLogs record with
  // the payload that would be sent to CAT2/CATSXT).
  action transferToCats(header: UUID) returns CatsTransferLogs;

  // Resolves the mock "logged in" employee from the X-Employee-Id header.
  function whoAmI() returns Employees;
}
