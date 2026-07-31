sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/EventBus",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
  ],
  function (Controller, Filter, FilterOperator, EventBus, Fragment, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("timesheet.app.controller.Approvals", {
      onInit: function () {
        EventBus.getInstance().subscribe("app", "userChanged", this._onUserChanged, this);
        var oCurrentUser = this.getView().getModel("currentUser");
        if (oCurrentUser && oCurrentUser.getProperty("/ID")) {
          this._applyManagerFilter(oCurrentUser.getData());
        }
      },

      _onUserChanged: function (sChannel, sEvent, oData) {
        this._applyManagerFilter(oData.employee);
      },

      _applyManagerFilter: function (oEmployee) {
        this._oManager = oEmployee;
        var oFilter = new Filter({
          and: true,
          filters: [
            new Filter("status", FilterOperator.EQ, "Submitted"),
            new Filter({
              and: false,
              filters: [
                new Filter("costCenter/responsibleManager_ID", FilterOperator.EQ, oEmployee.ID),
                new Filter("project/responsibleManager_ID", FilterOperator.EQ, oEmployee.ID),
              ],
            }),
          ],
        });
        this.byId("approvalsTable").getBinding("items").filter([oFilter]);
      },

      formatFullName: function (sFirstName, sLastName) {
        return [sFirstName, sLastName].filter(Boolean).join(" ");
      },

      formatCostCenterOrProject: function (sCostCenterName, sProjectName) {
        return sCostCenterName || sProjectName || "";
      },

      _refresh: function () {
        this.getView().getModel().refresh(); // header status is also recomputed as a side effect
      },

      onApprove: function (oEvent) {
        var oCtx = oEvent.getSource().getBindingContext();
        var oOperation = this.getView().getModel().bindContext("TimesheetService.approve(...)", oCtx);
        oOperation
          .execute()
          .then(() => {
            MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("msgEntryApproved"));
            this._refresh();
          })
          .catch((oErr) => MessageBox.error(oErr.message || "Could not approve entry"));
      },

      onReject: async function (oEvent) {
        this._oRejectContext = oEvent.getSource().getBindingContext();
        if (!this._oRejectDialog) {
          this._oRejectDialog = await Fragment.load({
            id: this.getView().getId(),
            name: "timesheet.app.view.fragment.RejectDialog",
            controller: this,
          });
          this.getView().addDependent(this._oRejectDialog);
        }
        this.byId("rejectReasonInput").setValue("");
        this._oRejectDialog.open();
      },

      onConfirmReject: function () {
        var sReason = this.byId("rejectReasonInput").getValue();
        if (!sReason || !sReason.trim()) {
          MessageToast.show("Please provide a reason");
          return;
        }
        var oOperation = this.getView().getModel().bindContext("TimesheetService.rejectEntry(...)", this._oRejectContext);
        oOperation.setParameter("reason", sReason);
        oOperation
          .execute()
          .then(() => {
            this._oRejectDialog.close();
            MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("msgEntryRejected"));
            this._refresh();
          })
          .catch((oErr) => MessageBox.error(oErr.message || "Could not reject entry"));
      },

      onCancelReject: function () {
        this._oRejectDialog.close();
      },
    });
  }
);
