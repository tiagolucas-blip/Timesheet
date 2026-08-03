sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/EventBus",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
  ],
  function (Controller, JSONModel, Filter, FilterOperator, EventBus, MessageToast, MessageBox) {
    "use strict";

    var WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    return Controller.extend("timesheet.app.controller.MyTimesheet", {
      onInit: function () {
        this.getView().setModel(
          new JSONModel({
            hasSelection: false,
            selectedHeaderId: null,
            selectedHeaderStatus: null,
            selectedHeaderWeekStart: null,
          }),
          "view"
        );
        this.getView().setModel(new JSONModel({ rows: [], dayTotals: [], grandTotal: "0.00" }), "grid");

        EventBus.getInstance().subscribe("app", "userChanged", this._onUserChanged, this);

        var oCurrentUser = this.getView().getModel("currentUser");
        if (oCurrentUser && oCurrentUser.getProperty("/ID")) {
          this._applyEmployeeFilter(oCurrentUser.getData());
        }
      },

      _onUserChanged: function (sChannel, sEvent, oData) {
        this._applyEmployeeFilter(oData.employee);
      },

      _applyEmployeeFilter: function (oEmployee) {
        this._oEmployee = oEmployee;
        this._aAllocations = null;
        var oTable = this.byId("headersTable");
        oTable.getBinding("items").filter([new Filter("employee_ID", FilterOperator.EQ, oEmployee.ID)]);
        oTable.removeSelections(true);
        this.getView()
          .getModel("view")
          .setData({ hasSelection: false, selectedHeaderId: null, selectedHeaderStatus: null, selectedHeaderWeekStart: null });
        this.getView().getModel("grid").setData({ rows: [], dayTotals: [], grandTotal: "0.00" });
      },

      isDraft: function (sStatus) {
        return sStatus === "Draft";
      },

      formatWeekTitle: function (sWeekStart) {
        return sWeekStart ? this.getView().getModel("i18n").getResourceBundle().getText("colWeek") + " " + sWeekStart : "";
      },

      formatDayHeader0: function (sWeekStart) { return this._dayHeaderLabel(sWeekStart, 0); },
      formatDayHeader1: function (sWeekStart) { return this._dayHeaderLabel(sWeekStart, 1); },
      formatDayHeader2: function (sWeekStart) { return this._dayHeaderLabel(sWeekStart, 2); },
      formatDayHeader3: function (sWeekStart) { return this._dayHeaderLabel(sWeekStart, 3); },
      formatDayHeader4: function (sWeekStart) { return this._dayHeaderLabel(sWeekStart, 4); },
      formatDayHeader5: function (sWeekStart) { return this._dayHeaderLabel(sWeekStart, 5); },
      formatDayHeader6: function (sWeekStart) { return this._dayHeaderLabel(sWeekStart, 6); },

      _dayHeaderLabel: function (sWeekStart, iOffset) {
        if (!sWeekStart) return WEEKDAY_LABELS[iOffset];
        var aDates = this._weekDates(sWeekStart);
        var d = new Date(aDates[iOffset] + "T00:00:00");
        var sDayMonth = ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2);
        return WEEKDAY_LABELS[iOffset] + " " + sDayMonth;
      },

      formatStatusState: function (sStatus) {
        switch (sStatus) {
          case "Approved":
          case "Transferred":
            return "Success";
          case "Rejected":
            return "Error";
          case "Submitted":
          case "PartiallyApproved":
            return "Warning";
          default:
            return "None";
        }
      },

      onHeaderSelect: function (oEvent) {
        var oHeader = oEvent.getParameter("listItem").getBindingContext().getObject();
        this.getView().getModel("view").setData({
          hasSelection: true,
          selectedHeaderId: oHeader.ID,
          selectedHeaderStatus: oHeader.status,
          selectedHeaderWeekStart: oHeader.weekStartDate,
        });
        this._loadGrid(oHeader);
      },

      _weekDates: function (sWeekStart) {
        var d = new Date(sWeekStart + "T00:00:00");
        var aDates = [];
        for (var i = 0; i < 7; i++) {
          var dd = new Date(d);
          dd.setDate(d.getDate() + i);
          aDates.push(dd.toISOString().slice(0, 10));
        }
        return aDates;
      },

      // Allocations (which cost centers/projects the employee may book to) rarely
      // change within a session, so they're fetched once and cached, unlike entries
      // which are reloaded per selected week.
      _loadAllocations: async function () {
        var aContexts = await this.getView()
          .getModel()
          .bindList("/TimeAllocations", undefined, undefined, [new Filter("employee_ID", FilterOperator.EQ, this._oEmployee.ID)], {
            $expand: "costCenter,project",
          })
          .requestContexts(0, 100);
        this._aAllocations = aContexts.map((c) => c.getObject());
      },

      _loadGrid: async function (oHeader) {
        if (!this._aAllocations) await this._loadAllocations();
        this._aWeekDates = this._weekDates(oHeader.weekStartDate);
        this._sSelectedHeaderId = oHeader.ID;
        this._aPendingRows = []; // rows the employee added via "+ Add Line" but hasn't booked hours to yet

        // Kept as an instance field rather than bound to any control: it is used
        // purely as a CRUD handle (create/setProperty/delete on its contexts), the
        // same way onNewWeek/_loadAllocations already use unattached list bindings.
        this._oEntriesBinding = this.getView()
          .getModel()
          .bindList("/TimesheetEntries", undefined, undefined, [new Filter("header_ID", FilterOperator.EQ, oHeader.ID)], {
            $expand: "costCenter,project",
          });
        this._aEntryContexts = await this._oEntriesBinding.requestContexts(0, 500);

        this._rebuildGridModel(oHeader.status === "Draft");
      },

      _allocationOptions: function () {
        // A leading blank option so a freshly added row's Select doesn't silently
        // fall back to auto-selecting the first real allocation (sap.m.Select's
        // default behavior when selectedKey matches nothing) without the employee
        // having actually chosen it.
        var aPlaceholder = [{ key: "", label: this.getView().getModel("i18n").getResourceBundle().getText("chooseAllocation") }];
        return aPlaceholder.concat(
          this._aAllocations
            .map((o) => {
              if (o.costCenter) return { key: "CC:" + o.costCenter.ID, label: o.costCenter.name + " (" + o.costCenter.costCenterId + ")" };
              if (o.project) return { key: "PRJ:" + o.project.ID, label: o.project.name + " (" + o.project.projectId + ")" };
              return null;
            })
            .filter(Boolean)
        );
      },

      // Builds one grid row's cells for a given cost-center-or-project target. Used
      // both for rows derived from existing entries and for pending (not-yet-booked)
      // rows the employee is still choosing a target for via the Select.
      _buildRowCells: function (oTarget, aWeekDates, aEntries, aDayTotals, bEditable) {
        var sCostCenterID = oTarget.costCenterID,
          sProjectID = oTarget.projectID;
        var bHasTarget = !!(sCostCenterID || sProjectID);

        var aCells = aWeekDates.map((sDate, i) => {
          var oEntry = bHasTarget
            ? aEntries.find((e) => e.date === sDate && (sCostCenterID ? e.costCenter_ID === sCostCenterID : e.project_ID === sProjectID))
            : null;
          var fHours = oEntry ? Number(oEntry.hours) : 0;
          aDayTotals[i] += fHours;
          return {
            date: sDate,
            hours: oEntry ? oEntry.hours : "",
            entryID: oEntry ? oEntry.ID : null,
            status: oEntry ? oEntry.status : null,
            rejectionReason: oEntry ? oEntry.rejectionReason : null,
          };
        });

        var fRowTotal = aCells.reduce((s, c) => s + (Number(c.hours) || 0), 0);
        return {
          tmpKey: oTarget.tmpKey || null,
          pending: !!oTarget.tmpKey,
          costCenterID: sCostCenterID,
          projectID: sProjectID,
          label: oTarget.label || "",
          selectedKey: sCostCenterID ? "CC:" + sCostCenterID : sProjectID ? "PRJ:" + sProjectID : "",
          cells: aCells,
          rowTotal: fRowTotal.toFixed(2),
          editable: bEditable && bHasTarget,
        };
      },

      _rebuildGridModel: function (bEditable) {
        var aWeekDates = this._aWeekDates;
        var aEntries = this._aEntryContexts.map((c) => c.getObject());
        var aDayTotals = [0, 0, 0, 0, 0, 0, 0];

        // One row per cost-center-or-project combo actually booked this week...
        var aUsedTargets = [];
        aEntries.forEach((e) => {
          var sKey = e.costCenter_ID ? "CC:" + e.costCenter_ID : "PRJ:" + e.project_ID;
          if (aUsedTargets.some((t) => t.selectedKey === sKey)) return;
          aUsedTargets.push({
            selectedKey: sKey,
            costCenterID: e.costCenter_ID || null,
            projectID: e.project_ID || null,
            label: e.costCenter ? e.costCenter.name : e.project ? e.project.name : "",
          });
        });
        var aRows = aUsedTargets.map((t) => this._buildRowCells(t, aWeekDates, aEntries, aDayTotals, bEditable));

        // ...plus rows the employee is still filling in (only while the week is editable).
        if (bEditable) {
          aRows = aRows.concat(this._aPendingRows.map((t) => this._buildRowCells(t, aWeekDates, aEntries, aDayTotals, bEditable)));
        } else {
          this._aPendingRows = [];
        }

        var fGrandTotal = aDayTotals.reduce((s, v) => s + v, 0);
        this.getView().getModel("grid").setData({
          rows: aRows,
          allocationOptions: this._allocationOptions(),
          dayTotals: aDayTotals.map((v) => v.toFixed(2)),
          grandTotal: fGrandTotal.toFixed(2),
        });
      },

      onAddRow: function () {
        this._aPendingRows.push({
          tmpKey: "tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2),
          costCenterID: null,
          projectID: null,
          label: "",
        });
        this._rebuildGridModel(true);
      },

      onRemoveRow: function (oEvent) {
        var oRow = oEvent.getSource().getBindingContext("grid").getObject();
        this._aPendingRows = this._aPendingRows.filter((t) => t.tmpKey !== oRow.tmpKey);
        this._rebuildGridModel(true);
      },

      onRowAllocationChange: function (oEvent) {
        var oRow = oEvent.getSource().getBindingContext("grid").getObject();
        var oPending = this._aPendingRows.find((t) => t.tmpKey === oRow.tmpKey);
        if (!oPending) return;

        var sKey = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : "";
        var oAlloc = this._aAllocations.find(
          (a) => (a.costCenter && "CC:" + a.costCenter.ID === sKey) || (a.project && "PRJ:" + a.project.ID === sKey)
        );
        oPending.costCenterID = oAlloc && oAlloc.costCenter ? oAlloc.costCenter.ID : null;
        oPending.projectID = oAlloc && oAlloc.project ? oAlloc.project.ID : null;
        oPending.label = oAlloc ? (oAlloc.costCenter ? oAlloc.costCenter.name : oAlloc.project.name) : "";
        this._rebuildGridModel(true);
      },

      onCellHoursChange: async function (oEvent) {
        var oInput = oEvent.getSource();
        var iDay = parseInt(oInput.data("day"), 10);
        var oRow = oInput.getBindingContext("grid").getObject();
        var oCell = oRow.cells[iDay];

        var sVal = (oEvent.getParameter("value") || "").trim().replace(",", ".");
        var fVal = sVal === "" ? 0 : parseFloat(sVal);
        if (isNaN(fVal) || fVal < 0) {
          MessageToast.show("Enter a valid number of hours");
          this._rebuildGridModel(true);
          return;
        }
        if (!oRow.costCenterID && !oRow.projectID) {
          MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("msgChooseAllocationFirst"));
          this._rebuildGridModel(true);
          return;
        }

        try {
          if (oCell.entryID) {
            var oContext = this._aEntryContexts.find((c) => c.getObject().ID === oCell.entryID);
            if (fVal === 0) await oContext.delete();
            else await oContext.setProperty("hours", fVal.toFixed(2));
          } else if (fVal > 0) {
            var mPayload = {
              header_ID: this._sSelectedHeaderId,
              employee_ID: this._oEmployee.ID,
              date: oCell.date,
              activityType: "Attendance",
              hours: fVal.toFixed(2),
            };
            if (oRow.costCenterID) mPayload.costCenter_ID = oRow.costCenterID;
            else mPayload.project_ID = oRow.projectID;
            await this._oEntriesBinding.create(mPayload).created();
            // The row now shows up naturally as a "used" row derived from entries.
            if (oRow.pending) this._aPendingRows = this._aPendingRows.filter((t) => t.tmpKey !== oRow.tmpKey);
          }
          this._aEntryContexts = await this._oEntriesBinding.requestContexts(0, 500);
          this._rebuildGridModel(true);
        } catch (oErr) {
          MessageBox.error(oErr.message || "Could not save entry");
          this._aEntryContexts = await this._oEntriesBinding.requestContexts(0, 500);
          this._rebuildGridModel(true);
        }
      },

      _mondayOf: function (oDate) {
        var d = new Date(oDate);
        var day = d.getDay();
        var diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
      },

      onNewWeek: function () {
        var oHeadersBinding = this.byId("headersTable").getBinding("items");
        oHeadersBinding
          .requestContexts(0, 200)
          .then((aContexts) => {
            var dMax = null;
            aContexts.forEach((c) => {
              var d = new Date(c.getObject().weekStartDate);
              if (!dMax || d > dMax) dMax = d;
            });
            var dNext = dMax ? new Date(dMax.setDate(dMax.getDate() + 7)) : this._mondayOf(new Date());
            var sDate = dNext.toISOString().slice(0, 10);
            var oContext = oHeadersBinding.create({
              employee_ID: this._oEmployee.ID,
              weekStartDate: sDate,
              status: "Draft",
              totalHours: "0.00",
            });
            return oContext.created().then(() => MessageToast.show("New week created: " + sDate));
          })
          .catch((oErr) => MessageBox.error(oErr.message || "Could not create week"));
      },

      onSubmitWeek: function (oEvent) {
        var oCtx = oEvent.getSource().getBindingContext();
        var oOperation = this.getView().getModel().bindContext("TimesheetService.submitWeek(...)", oCtx);
        oOperation
          .execute()
          .then(() => {
            MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("msgWeekSubmitted"));
            this._loadGrid({ ID: this._sSelectedHeaderId, weekStartDate: this._aWeekDates[0], status: "Submitted" });
          })
          .catch((oErr) => MessageBox.error(oErr.message || "Could not submit week"));
      },
    });
  }
);
