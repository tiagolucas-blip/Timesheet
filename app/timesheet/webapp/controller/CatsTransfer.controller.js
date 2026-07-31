sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
  ],
  function (Controller, JSONModel, Filter, FilterOperator, Fragment, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("timesheet.app.controller.CatsTransfer", {
      onInit: function () {
        var oTable = this.byId("approvedHeadersTable");
        var applyFilter = () => {
          var oBinding = oTable.getBinding("items");
          if (oBinding) oBinding.filter([new Filter("status", FilterOperator.EQ, "Approved")]);
        };
        applyFilter();
        oTable.attachModelContextChange(applyFilter);
      },

      formatFullName: function (sFirstName, sLastName) {
        return [sFirstName, sLastName].filter(Boolean).join(" ");
      },

      formatLogState: function (sStatus) {
        return sStatus === "Success" ? "Success" : "Error";
      },

      onTransfer: function (oEvent) {
        var oCtx = oEvent.getSource().getBindingContext();
        var sHeaderId = oCtx.getProperty("ID");
        var oOperation = this.getView().getModel().bindContext("/transferToCats(...)");
        oOperation.setParameter("header", sHeaderId);
        oOperation
          .execute()
          .then(async () => {
            var oLog = oOperation.getBoundContext().getObject();
            this.getView().getModel().refresh(); // entries also changed (transferredAt) as a side effect
            MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("msgTransferSuccess"));
            await this._openPayloadDialog(oLog.message, oLog.status, oLog.payload);
          })
          .catch((oErr) => MessageBox.error(oErr.message || "Could not transfer week to SAP"));
      },

      onViewPayload: async function (oEvent) {
        var oLog = oEvent.getSource().getBindingContext().getObject();
        await this._openPayloadDialog(oLog.message, oLog.status, oLog.payload);
      },

      _openPayloadDialog: async function (sMessage, sStatus, sPayload) {
        if (!this._oPayloadDialog) {
          this._oPayloadDialog = await Fragment.load({
            id: this.getView().getId(),
            name: "timesheet.app.view.fragment.PayloadDialog",
            controller: this,
          });
          this.getView().addDependent(this._oPayloadDialog);
        }
        this.getView().setModel(
          new JSONModel({
            message: sMessage,
            state: this.formatLogState(sStatus),
            payload: sPayload,
          }),
          "payload"
        );
        this._oPayloadDialog.open();
      },

      onClosePayload: function () {
        this._oPayloadDialog.close();
      },
    });
  }
);
