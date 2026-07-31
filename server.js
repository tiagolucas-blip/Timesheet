const cds = require('@sap/cds');
const express = require('express');
const path = require('path');

/**
 * Serves the OpenUI5 framework locally from the @openui5/* npm packages
 * instead of bootstrapping from the public SAPUI5 CDN. This keeps the app
 * fully self-contained (works offline / behind restrictive egress policies)
 * and mirrors how a real BTP deployment would bundle or proxy UI5 resources
 * through the app router rather than reaching out to a public CDN.
 */
cds.on('bootstrap', (app) => {
  app.use('/resources', express.static(path.join(__dirname, 'dist-ui5', 'resources')));
});

module.exports = cds.server;
