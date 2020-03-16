"use strict";

// Dependencies
const Log = require("../../../../lib/require/log.js")("backend");
const Exception = require("../../../../lib/require/exception.js")("backend");
const Web = require("../../../../lib/require/web.js");
const Env = require("../env.js");

(async () => {

	// Set-up the web server
	let web = new Web(8001, {});

	// Adding routes
	web.addStaticRoute(Env.path.frontend, Env.root.frontend);

	// Start the web server
	web.start();

})();
