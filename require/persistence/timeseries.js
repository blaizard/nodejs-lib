"use strict";

const Path = require("path");
const Log = require("../log.js")("persistence", "timeseries");
const Exception = require("../exception.js")("persistence", "timeseries");
const Event = require("../event.js");
const FileSystem = require("../filesystem.js");
const Persistence = require("./disk.js");
const TimeSeries = require("../timeseries.js");

/**
 * Persist a timeseries data structure
 */
module.exports = class PersistenceTimeSeries {

	/**
	 * \param path Directory where to store the timeseries
	 */
	constructor(path, options) {
		this.options = Object.assign({
			unique: false,
			uniqueMerge: (a, /*b, timestamp*/) => a,
			/**
			 * The directory name where the actual data should be stored.
			 * This directory is relative to the file being opened.
			 */
			dataDir: "%s-data"
		}, options);

		this.event = new Event({
			ready: {proactive: true}
		});

		const filePath = Path.basename(path);
		const dirPath = Path.dirname(path)

		// Create the dataDir
		this.options.dataDir = Path.join(dirPath, this.options.dataDir.replace("%s", filePath));

		// Where all open data persistences are stored
		this.persistenceCache = {};
		this.persistenceIndex = null;
		this.timeSeriesIndex = new TimeSeries({
			unique: true,
			uniqueMerge: (a, b, timestamp) => {
				Exception.unreachable("Duplicate timestamps (" + timestamp + ") are in the index for entries: " + a + " and " + b);
			}
		});
		this.timeSeriesData = new TimeSeries({
			unique: this.options.unique,
			uniqueMerge: this.options.uniqueMerge
		});

		this.initialize(path);
	}

	getPersistenceOptions(timeSeries) {
		return {
			initial: {list:[]},
			operations: {
				insert: (data, timestamp, value) => {
					try {
						timeSeries.wrap(data.list);
						timeSeries.insert(timestamp, value);
					}
					finally {
						timeSeries.unwrap();
					}
				}
			}
		}
	}

	/**
	 * Initialize the persistence
	 */
	async initialize(path) {

		// Load the index
		this.persistenceIndex = new Persistence(path, this.getPersistenceOptions(this.timeSeriesIndex));
		this.event.trigger("ready");
	}

	/**
	 * Insert a new data point
	 */
	async insert(timestamp, data) {
		let persistence = await this.getPersistence(timestamp);
		await persistence.write("insert", timestamp, data);
	}

	async forEach(callback, timestamp) {
		let persistence = await this.getPersistence(timestamp);
		try {
			this.timeSeriesData.wrap((await persistence.get()).list);
			this.timeSeriesData.forEach(callback);
		}
		finally {
			this.timeSeriesData.unwrap();
		}
	}

	/**
	 * Return and create if necessary the persistence associated with this timestamp
	 */
	async getPersistence(timestamp) {
		const path = await this.getDataFile(timestamp);

		// Load the persistence if not alreay loaded
		if (!this.persistenceCache.hasOwnProperty(path)) {
			await FileSystem.mkdir(this.options.dataDir);
			const fullPath = Path.join(this.options.dataDir, path);
			this.persistenceCache[path] = new Persistence(fullPath, this.getPersistenceOptions(this.timeSeriesData));
			await this.persistenceCache[path].waitReady();
		}

		return this.persistenceCache[path];
	}

	/**
	 * Get the current data file path for this timestamp
	 */
	async getDataFile(timestamp) {
		try {
			this.timeSeriesIndex.wrap(await this.persistenceIndex.get());
			return "all.json";
		}
		finally {
			this.timeSeriesIndex.unwrap();
		}
	}

	/**
	 * This function waits until the persistence is ready
	 */
	async waitReady() {
		await this.persistenceIndex.waitReady();
		return this.event.waitUntil("ready");
	}
}
