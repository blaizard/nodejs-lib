const Path = require("path");
const Webpack = require("../../../../lib/webpack.js");
const Env = require("../env.js");

let config = {
	entries: {
		index: Path.resolve(__dirname, "app.js")
	},
	output: Env.root.frontend,
	publicPath: "/",
	alias: {
		"[frontend]": Path.resolve(__dirname)
	},
	templates: {
		index: {
			entryId: "index"
		}
	}
};

module.exports = Webpack.generate(config);
