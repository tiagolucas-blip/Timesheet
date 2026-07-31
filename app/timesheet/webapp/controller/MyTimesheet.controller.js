sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/EventBus",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
  ],
  function (Controller, JSONModel, Filter, FilterOperator, EventBus, Fragment, MessageToast, MessageBox) {
    "use strict";

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
        var oTable = this.byId("headersTable");
        oTable.getBinding("items").filter([new Filter("employee_ID", FilterOperator.EQ, oEmployee.ID)]);
        oTable.removeSelections(true);
        this.getView()
          .getModel("view")
          .setData({ hasSelection: false, selectedHeaderId: null, selectedHeaderStatus: null, selectedHeaderWeekStart: null });
      },

      isDraft: function (sStatus) {
        return sStatus === "Draft";
      },

      formatCostCenterOrProject: function (sCostCenterName, sProjectName) {
        return sCostCenterName || sProjectName || "";
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
        this.byId("entriesTable")
          .getBinding("items")
          .filter([new Filter("header_ID", FilterOperator.EQ, oHeader.ID)]);
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
            this.byId("entriesTable").getBinding("items").refresh();
          })
          .catch((oErr) => MessageBox.error(oErr.message || "Could not submit week"));
      },

      onAddEntry: async function () {
        if (!this._oAddEntryDialog) {
          this._oAddEntryDialog = await Fragment.load({
            id: this.getView().getId(),
            name: "timesheet.app.view.fragment.AddEntryDialog",
            controller: this,
          });
          this.getView().addDependent(this._oAddEntryDialog);
        }

        var oViewModel = this.getView().getModel("view");
        this._sAddEntryHeaderId = oViewModel.getProperty("/selectedHeaderId");

        var aContexts = await this.getView()
          .getModel()
          .bindList("/TimeAllocations", undefined, undefined, [new Filter("employee_ID", FilterOperator.EQ, this._oEmployee.ID)], {
            $expand: "costCenter,project",
          })
          .requestContexts(0, 100);

        var aAllocations = aContexts
          .map((c) => c.getObject())
          .map((o) => {
            if (o.costCenter) return { key: "CC:" + o.costCenter.ID, label: o.costCenter.name + " (" + o.costCenter.costCenterId + ")" };
            if (o.project) return { key: "PRJ:" + o.project.ID, label: o.project.name + " (" + o.project.projectId + ")" };
            return null;
          })
          .filter(Boolean);

        this.getView().setModel(new JSONModel({ allocations: aAllocations }), "add");

        this.byId("entryDatePicker").setValue(oViewModel.getProperty("/selectedHeaderWeekStart") || "");
        this.byId("allocationSelect").setSelectedKey(aAllocations.length ? aAllocations[0].key : "");
        this.byId("activitySelect").setSelectedKey("Attendance");
        this.byId("hoursInput").setValue("8");
        this.byId("commentInput").setValue("");
        this._oAddEntryDialog.open();
      },

      onSaveEntry: function () {
        var sKey = this.byId("allocationSelect").getSelectedKey();
        var sDate = this.byId("entryDatePicker").getValue();
        var sActivity = this.byId("activitySelect").getSelectedKey();
        var fHours = parseFloat(this.byId("hoursInput").getValue());
        var sComment = this.byId("commentInput").getValue();

        if (!sKey || !sDate || !fHours) {
          MessageToast.show("Please fill in cost center/project, date and hours");
          return;
        }

        var mPayload = {
          header_ID: this._sAddEntryHeaderId,
          employee_ID: this._oEmployee.ID,
          date: sDate,
          activityType: sActivity,
          hours: fHours.toFixed(2),
          comment: sComment || null,
        };
        if (sKey.indexOf("CC:") === 0) mPayload.costCenter_ID = sKey.substring(3);
        else if (sKey.indexOf("PRJ:") === 0) mPayload.project_ID = sKey.substring(4);

        var oContext = this.byId("entriesTable").getBinding("items").create(mPayload);
        oContext
          .created()
          .then(() => this._oAddEntryDialog.close())
          .catch((oErr) => MessageBox.error(oErr.message || "Could not create entry"));
      },

      onCancelAddEntry: function () {
        this._oAddEntryDialog.close();
      },

      onDeleteEntry: function (oEvent) {
        var oCtx = oEvent.getSource().getBindingContext();
        MessageBox.confirm("Delete this entry?", {
          onClose: (sAction) => {
            if (sAction === MessageBox.Action.OK) {
              oCtx.delete().catch((oErr) => MessageBox.error(oErr.message || "Could not delete entry"));
            }
          },
        });
      },
    });
  }
);
