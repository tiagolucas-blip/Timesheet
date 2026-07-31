const cds = require('@sap/cds');

const DEFAULT_EMPLOYEE_ID = 'EMP-001';
const ACTIVITY_TO_AWART = { Attendance: '1000', Overtime: '1001', Travel: '1002' };

// No real auth in this mockup — the "logged in" employee is whatever the UI's
// role/user switcher sends as X-Employee-Id, defaulting to the first seed user.
function currentEmployeeId(req) {
  return req.http?.req?.headers?.['x-employee-id'] || DEFAULT_EMPLOYEE_ID;
}

function keyOf(param) {
  return typeof param === 'object' && param !== null ? param.ID : param;
}

module.exports = class TimesheetService extends cds.ApplicationService {
  async init() {
    const { Employees, TimesheetHeaders, TimesheetEntries, CatsTransferLogs } = this.entities;

    const recomputeHeaderStatus = async (headerID) => {
      const entries = await SELECT.from(TimesheetEntries).where({ header_ID: headerID });
      if (!entries.length) return;
      const statuses = new Set(entries.map((e) => e.status));
      let status;
      if (statuses.size === 1) status = entries[0].status; // all Draft / all Submitted / all Approved / all Rejected
      else status = 'PartiallyApproved';
      await UPDATE(TimesheetHeaders).set({ status }).where({ ID: headerID });
    };

    // --- validation on employee-entered lines -----------------------------
    this.before(['CREATE', 'UPDATE'], TimesheetEntries, (req) => {
      const { costCenter_ID, project_ID } = req.data;
      if (costCenter_ID && project_ID) {
        req.reject(400, 'Book time to either a cost center or a project, not both.');
      }
    });

    this.before(['UPDATE', 'DELETE'], TimesheetEntries, async (req) => {
      const entryID = keyOf(req.params[0]);
      const entry = await SELECT.one.from(TimesheetEntries).where({ ID: entryID });
      if (entry && entry.status !== 'Draft') {
        req.reject(400, `Entry is ${entry.status} and is now managed via workflow actions, not direct edits.`);
      }
    });

    // --- whoAmI -------------------------------------------------------------
    this.on('whoAmI', async (req) => {
      const id = currentEmployeeId(req);
      return SELECT.one.from(Employees).where({ ID: id });
    });

    // --- employee: submit a week for approval --------------------------------
    this.on('submitWeek', TimesheetHeaders, async (req) => {
      const headerID = keyOf(req.params[0]);
      const header = await SELECT.one.from(TimesheetHeaders).where({ ID: headerID });
      if (!header) return req.error(404, `Timesheet header ${headerID} not found`);
      if (header.status !== 'Draft') {
        return req.error(400, `Only Draft weeks can be submitted (current status: ${header.status})`);
      }
      const entries = await SELECT.from(TimesheetEntries).where({ header_ID: headerID });
      if (!entries.length) return req.error(400, 'Cannot submit a week with no entries');

      const totalHours = entries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
      await UPDATE(TimesheetEntries).set({ status: 'Submitted' }).where({ header_ID: headerID, status: 'Draft' });
      await UPDATE(TimesheetHeaders)
        .set({ status: 'Submitted', submittedAt: new Date().toISOString(), totalHours })
        .where({ ID: headerID });

      return SELECT.one.from(TimesheetHeaders).where({ ID: headerID });
    });

    // --- manager: approve / reject a single booking line --------------------
    this.on('approve', TimesheetEntries, async (req) => {
      const entryID = keyOf(req.params[0]);
      const entry = await SELECT.one.from(TimesheetEntries).where({ ID: entryID });
      if (!entry) return req.error(404, 'Entry not found');
      if (entry.status !== 'Submitted') {
        return req.error(400, `Only Submitted entries can be approved (current status: ${entry.status})`);
      }
      await UPDATE(TimesheetEntries)
        .set({ status: 'Approved', approver_ID: currentEmployeeId(req), approvedAt: new Date().toISOString(), rejectionReason: null })
        .where({ ID: entryID });
      await recomputeHeaderStatus(entry.header_ID);
      return SELECT.one.from(TimesheetEntries).where({ ID: entryID });
    });

    this.on('reject', TimesheetEntries, async (req) => {
      const entryID = keyOf(req.params[0]);
      const { reason } = req.data;
      if (!reason || !reason.trim()) return req.error(400, 'A rejection reason is required');
      const entry = await SELECT.one.from(TimesheetEntries).where({ ID: entryID });
      if (!entry) return req.error(404, 'Entry not found');
      if (entry.status !== 'Submitted') {
        return req.error(400, `Only Submitted entries can be rejected (current status: ${entry.status})`);
      }
      await UPDATE(TimesheetEntries)
        .set({ status: 'Rejected', approver_ID: currentEmployeeId(req), approvedAt: new Date().toISOString(), rejectionReason: reason })
        .where({ ID: entryID });
      await recomputeHeaderStatus(entry.header_ID);
      return SELECT.one.from(TimesheetEntries).where({ ID: entryID });
    });

    // --- transfer a fully-approved week to SAP S/4 CATS (mocked) ------------
    this.on('transferToCats', async (req) => {
      const { header: headerID } = req.data;
      const header = await SELECT.one.from(TimesheetHeaders).where({ ID: headerID });
      if (!header) return req.error(404, 'Timesheet header not found');
      if (header.status !== 'Approved') {
        return req.error(400, `Only fully Approved weeks can be transferred to CATS (current status: ${header.status})`);
      }

      const entries = await SELECT.from(TimesheetEntries)
        .where({ header_ID: headerID })
        .columns('ID', 'date', 'hours', 'activityType', 'costCenter.costCenterId as costCenterCode', 'project.projectId as projectCode');
      const employee = await SELECT.one.from(Employees).where({ ID: header.employee_ID }).columns('employeeId');

      const payload = entries.map((e) => ({
        pernr: employee.employeeId,
        costCenter: e.costCenterCode || null,
        project: e.projectCode || null,
        date: e.date,
        hours: e.hours,
        awart: ACTIVITY_TO_AWART[e.activityType] || '1000',
      }));

      const now = new Date().toISOString();
      const logID = cds.utils.uuid();
      await INSERT.into(CatsTransferLogs).entries({
        ID: logID,
        header_ID: headerID,
        triggeredAt: now,
        triggeredBy_ID: currentEmployeeId(req),
        status: 'Success',
        message: `Transferred ${entries.length} record(s) to CATS (CAT2)`,
        payload: JSON.stringify(payload, null, 2),
      });
      await UPDATE(TimesheetEntries).set({ transferredAt: now, catsTransfer_ID: logID }).where({ header_ID: headerID });
      await UPDATE(TimesheetHeaders).set({ status: 'Transferred' }).where({ ID: headerID });

      return SELECT.one.from(CatsTransferLogs).where({ ID: logID });
    });

    return super.init();
  }
};
