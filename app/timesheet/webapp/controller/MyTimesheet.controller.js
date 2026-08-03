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

      _rebuildGridModel: function (bEditable) {
        var aWeekDates = this._aWeekDates;
        var aEntries = this._aEntryContexts.map((c) => c.getObject());
        var aDayTotals = [0, 0, 0, 0, 0, 0, 0];

        var aRows = this._aAllocations.map((oAlloc) => {
          var sCostCenterID = oAlloc.costCenter_ID || null;
          var sProjectID = oAlloc.project_ID || null;

          var aCells = aWeekDates.map((sDate, i) => {
            var oEntry = aEntries.find(
              (e) => e.date === sDate && (sCostCenterID ? e.costCenter_ID === sCostCenterID : e.project_ID === sProjectID)
            );
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
            costCenterID: sCostCenterID,
            costCenterLabel: oAlloc.costCenter ? oAlloc.costCenter.name : "",
            projectID: sProjectID,
            projectLabel: oAlloc.project ? oAlloc.project.name : "",
            cells: aCells,
            rowTotal: fRowTotal.toFixed(2),
            editable: bEditable,
          };
        });

        var fGrandTotal = aDayTotals.reduce((s, v) => s + v, 0);
        this.getView().getModel("grid").setData({
          rows: aRows,
          dayTotals: aDayTotals.map((v) => v.toFixed(2)),
          grandTotal: fGrandTotal.toFixed(2),
        });
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
          this._rebuildGridModel(oRow.editable);
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
          }
          this._aEntryContexts = await this._oEntriesBinding.requestContexts(0, 500);
          this._rebuildGridModel(oRow.editable);
        } catch (oErr) {
          MessageBox.error(oErr.message || "Could not save entry");
          this._aEntryContexts = await this._oEntriesBinding.requestContexts(0, 500);
          this._rebuildGridModel(oRow.editable);
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
