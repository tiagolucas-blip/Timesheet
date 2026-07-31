sap.ui.define(["sap/ui/core/ComponentContainer"], function (ComponentContainer) {
  "use strict";
  new ComponentContainer({
    name: "timesheet.app",
    settings: { id: "timesheet.app" },
    async: true,
  }).placeAt("content");
});
