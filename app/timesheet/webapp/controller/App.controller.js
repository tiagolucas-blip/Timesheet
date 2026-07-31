sap.ui.define(
  ["sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel", "sap/ui/core/EventBus"],
  function (Controller, JSONModel, EventBus) {
    "use strict";

    return Controller.extend("timesheet.app.controller.App", {
      onInit: function () {
        var oCurrentUserModel = new JSONModel({
          ID: null,
          employeeId: null,
          firstName: "",
          lastName: "",
          isManager: false,
        });
        this.getView().setModel(oCurrentUserModel, "currentUser");

        var oODataModel = this.getView().getModel();
        var that = this;
        oODataModel
          .bindList("/Employees", undefined, undefined, undefined, { $$groupId: "$auto" })
          .requestContexts(0, 100)
          .then(function (aContexts) {
            if (!aContexts.length) return;
            var oPreferred = aContexts.find(function (c) {
              return c.getObject().isManager;
            });
            var oEmployee = (oPreferred || aContexts[0]).getObject();
            that.byId("userSelect").setSelectedKey(oEmployee.ID);
            that._setActingUser(oEmployee);
          });
      },

      formatEmployeeOption: function (sFirstName, sLastName, vIsManager) {
        // isManager arrives pre-formatted as localized "Yes"/"No" text (composite
        // bindings format each part for display rather than passing the raw value).
        var bIsManager = vIsManager === true || vIsManager === "Yes";
        return sFirstName + " " + sLastName + (bIsManager ? " (Manager)" : "");
      },

      onUserChange: function (oEvent) {
        var oCtx = oEvent.getParameter("selectedItem").getBindingContext();
        this._setActingUser(oCtx.getObject());
      },

      _setActingUser: function (oEmployee) {
        var oODataModel = this.getView().getModel();
        oODataModel.changeHttpHeaders({ "X-Employee-Id": oEmployee.ID });
        this.getView().getModel("currentUser").setData(oEmployee);
        oODataModel.refresh();
        EventBus.getInstance().publish("app", "userChanged", { employee: oEmployee });
      },
    });
  }
);
