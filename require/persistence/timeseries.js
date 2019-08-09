"use strict";

const Path = require("path");
const Log = require("../log.js")("persistence", "timeseries");
const Exception = require("../exception.js")("persistence", "timeseries");
const Event = require("../event.js");
const FileSystem = require("../filesystem.js");
const Persistence = require("./disk.js");
const TimeSeries = require("../timeseries.js");

const VERSION = 1;

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
			dataDir: "%s-data",
			/**
			 * Default periodic savepoint task
			 */
			savepointTask: {
				intervalMs: 5000 * 60 // 5min by default
			}
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

	/**
	 * Initialize the persistence
	 */
	async initialize(path) {

		// Load the index
		this.persistenceIndex = new Persistence(path, this.getPersistenceOptions(/*readonly*/false, this.timeSeriesIndex));
		await this.persistenceIndex.waitReady();
		// Quick check to see if the index need to be rebuilt
		if ((await this.persistenceIndex.get()).version != VERSION || true) {
			await this.rebuildIndex();
			Log.info("Successfully rebuilt index of timeseries " + path);
		}
		this.event.trigger("ready");
	}

	/**
	 * Insert a new data point
	 */
	async insert(timestamp, data) {
		let persistence = await this.getPersistenceByTimestamp(timestamp);
		await persistence.write("insert", timestamp, data);
	}

	/**
	 * Loop through the data.
	 * 
	 * \param callback The function to be called for each entry.
	 * \param timestampStart The starting timestamp. If omitted, it will start at the begining
	 * \param timestampEnd The ending timestamp. If omitted, it will go until the end.
	 * \param inclusive Used only if the timestamps do not match anything. If set to true, previous
	 * and next timestamp will be included. Otherwise not.
	 * 
	 * \todo support for each over files
	 */
	async forEach(callback, timestampStart, timestampEnd, inclusive) {

		let timestamp = (typeof timestampStart === "undefined") ? -Number.MAX_VALUE : timestampStart;
		let persistence = await this.getPersistenceByTimestamp(timestamp);
		await this.timeSeriesData.wrap((await persistence.get()).list, (timeseries) => {
			timeseries.forEach(callback, timestamp, timestampEnd, inclusive);
		});
	}

	/**
	 * Get a known timestamp value.
	 * 
	 * \param index A positive value will return the timestamp stating from the begning
	 * with an offset eequal to the index. A negative value, will return the timestamp
	 * from the end.
	 * For example, 0 will return the oldest timestamp while -1 will return the newest.
	 * 
	 * \return The timestamp or null if out of bound.
	 */
	async getTimestamp(index) {
		let persistence = await this.getPersistenceByIndex(index);
		return await this.timeSeriesData.wrap((await persistence.get()).list, (timeseries) => {
			return timeseries.getTimestamp(index);
		});
	}

	/**
	 * This function waits until the persistence is ready
	 */
	async waitReady() {
		await this.persistenceIndex.waitReady();
		return this.event.waitUntil("ready");
	}

	// ---- private methods ---------------------------------------------------

	/**
	 * Rebuild the index in case of corruption, or migration.
	 */
	async rebuildIndex() {
		Log.info("Re-building index, this might take a while...");
		// List all data files
		const dataFileList = (await FileSystem.exists(this.options.dataDir)) ? await FileSystem.readdir(this.options.dataDir) : [];

		// Get the metadata out of them
		let timeseriesData = [];
		await this.timeSeriesIndex.wrap(timeseriesData, async (timeSeriesIndex) => {

			for (const i in dataFileList) {
				const fullPath = Path.join(this.options.dataDir, dataFileList[i]);
				if (!(await FileSystem.stat(fullPath)).isFile()) {
					continue;
				}

				let persistence = null;
				try {
					// Open the persistence
					persistence = await new Persistence(fullPath, this.getPersistenceOptions(/*readonly*/true));
					await persistence.waitReady();
					// Read some metadata
					let timestampBegin = Number.MAX_VALUE;
					let timestampLength = 0;
					await this.timeSeriesData.wrap((await persistence.get()).list, (timeSeriesData) => {

						Exception.assert(timeSeriesData.consistencyCheck(), "Data file '" + fullPath + "' is not consistent");

						timestampBegin = timeSeriesData.getTimestamp(0);
						timestampLength = timeSeriesData.length;

						// Inset the data
						timeSeriesIndex.insert(timestampBegin, {
							path: dataFileList[i],
							length: timestampLength
						});
					});
				}
				catch (e) {
					Log.error("Ignoring data file '" + fullPath + "' seems to be corrupted: " + e);
				}
				finally {
					// Close the persistence
					await persistence.close();
				}
			}
		});

		// Write some statistics
		Log.info("Identified " + timeseriesData.length + " file(s)");

		// Build index full content
		const indexContent = {
			version: VERSION,
			list: timeseriesData
		};
		// Reset the index persistence with this content
		await this.persistenceIndex.reset(indexContent);
		await this.persistenceIndex.waitReady();
	}

	getPersistenceOptions(readonly, timeSeries) {

		let options = {
			initial: {list:[]}
		};

		if (readonly) {
			return options;
		}
		return Object.assign(options, {
			operations: {
				insert: async (data, timestamp, value) => {
					await timeSeries.wrap(data.list, (t) => {
						t.insert(timestamp, value);
					});
				}
			},
			savepointTask: this.options.savepointTask
		});
	}

	/**
	 * Return and create if necessary the persistence associated with this timestamp
	 */
	async getPersistenceByTimestamp(timestamp) {
		const metadata = await this.getMetadata(timestamp);

		// Load the persistence if not alreay loaded
		if (!this.persistenceCache.hasOwnProperty(metadata.path)) {
			Log.info("Loading time series from " + metadata.path);

			await FileSystem.mkdir(this.options.dataDir);
			const fullPath = Path.join(this.options.dataDir, metadata.path);
			let persistence = new Persistence(fullPath, this.getPersistenceOptions(/*readonly*/false, this.timeSeriesData));
			await persistence.waitReady();

			this.persistenceCache[metadata.path] = persistence;
		}

		Exception.assert(this.persistenceCache.hasOwnProperty(metadata.path), "Persistence " + metadata.path + " does not exists");
		Exception.assert(this.persistenceCache[metadata.path] instanceof Persistence, "Persistence " + metadata.path + " is not of Persistence type");
		Exception.assert(this.persistenceCache[metadata.path].isReady(), "Persistence " + metadata.path + " is not ready");

		return this.persistenceCache[metadata.path];
	}

	/**
	 * \brief Get the persistence from a specific index
	 * 
	 * \todo fix!
	 */
	async getPersistenceByIndex(index) {
		return await this.getPersistenceByTimestamp(0);
	}

	/**
	 * Create a new entry in the index file and return its metadata
	 */
	async createIndexEntry(timestamp) {
		const metadata = {
			length: 0,
			path: timestamp + ".json"
		};
		await this.persistenceIndex.write("insert", timestamp, metadata);
		return metadata;
	}

	/**
	 * Get the current data file path for this timestamp
	 */
	async getMetadata(timestamp) {
		return await this.timeSeriesIndex.wrap((await this.persistenceIndex.get()).list, async (timeSeriesIndex) => {
			// Look for the entry
			const index = timeSeriesIndex.find(timestamp) - 1;
			// No entries, then create one or get the exisiting one
			const metadata = (index == -1) ? await this.createIndexEntry(timestamp) : timeSeriesIndex.data[index];
			return Object.assign(metadata, {
				timestamp: timestamp
			});
		});
	}
}
