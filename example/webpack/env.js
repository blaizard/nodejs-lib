"use strict";

const Path = require("path");
const env = {
	"root": {
		"frontend": ".dist"
	},
	"path": {
		"frontend": "/"
	}
};

// Update the global environment object with absolute path
for (const key in env.root) {
	env.root[key] = Path.resolve(__dirname, env.root[key]);
}

module.exports = env;
