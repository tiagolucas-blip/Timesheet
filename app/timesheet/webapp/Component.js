sap.ui.define(
  ["sap/ui/core/UIComponent", "sap/ui/Device", "timesheet/app/model/models"],
  function (UIComponent, Device, models) {
    "use strict";

    return UIComponent.extend("timesheet.app.Component", {
      metadata: {
        manifest: "json",
      },

      init: function () {
        UIComponent.prototype.init.apply(this, arguments);
        this.setModel(models.createDeviceModel(), "device");
      },
    });
  }
);
