"use strict";

const Log = require("../log.js")("persistence", "timeseries");
const Exception = require("../exception.js")("persistence", "timeseries");

/**
 * Implementation of a persistent time series
 */
module.exports = class PersistenceTimeSeries {
	constructor(options) {
		this.options = Object.assign({
			/**
			 * Only entries with distinct timestamp are allowed.
			 */
			unique: false,
			/**
			 * Used only if unique is set. It is called to resolve a conflict when 2 or more entries
			 * with the same timestamp are found, this function purpose is to merge these entries into one
			 * and return it.
			 */
			uniqueMerge: (a, /*b, timestamp*/) => a
		}, options);

		// Raw data
		this.data = [];
	}

	/**
	 * Return the estimated size in bytes of the structure
	 */
	get size() {
		return 0;
	}

	/**
	 * Return the number of elements in the structure
	 */
	get length() {
		return this.data.length;
	}

	/**
	 * Find a specific timestamp by binary search.
	 * If no exact match has been found, return the one after in time (timestamp higher).
	 * Note it can return an index out of bound if the latest timestamp is too low.
	 */
	find(timestamp) {
		let indexStart = 0;
		let indexEnd = this.data.length - 1;

		while (indexStart <= indexEnd) {
			const indexCurrent = Math.floor((indexStart + indexEnd) / 2);
			const timestampCurrent = this.data[indexCurrent][0];
			if (timestampCurrent == timestamp) {
				return indexCurrent;
			}
			else if (timestampCurrent < timestamp) {
				indexStart = indexCurrent + 1;
			}
			else {
				indexEnd = indexCurrent - 1;
			}
		}

		return indexStart;
	}

	/**
	 * Insert a new element to the series
	 */
	insert(timestamp, data) {
		const index = this.find(timestamp);
		// If the exact timestamp already exists
		if (this.options.unique && index < this.data.length && this.data[index][0] == timestamp) {
			const newData = this.options.uniqueMerge(this.data[index][1], data, timestamp);
			this.data[index][1] = newData;
		}
		else {
			this.data.splice(index, 0, [timestamp, data]);
		}
	}

	/**
	 * Loop through the data.
	 * 
	 * \param callback The function to be called for each entry.
	 * \param timestampStart The starting timestamp. If omitted, it will start at the begining
	 * \param timestampEnd The ending timestamp. If omitted, it will go until the end.
	 * \param inclusive Used only if the timestamps do not match anything. If set to true, previous
	 * and next timestamp will be included. Otherwise not.
	 */
	forEach(callback, timestampStart, timestampEnd, inclusive = false) {

		if (!this.data.length) {
			return;
		}

		// Set the data undefined
		if (typeof timestampStart === "undefined") {
			timestampStart = this.data[0][0];
		}
		if (typeof timestampEnd === "undefined") {
			timestampEnd = this.data[this.data.length - 1][0];
		}

		let index = this.find(timestampStart);
		if (this.data[index][0] != timestampStart && inclusive == true && index > 0) {
			--index;
		}
		let prevTimestamp = -Number.MAX_VALUE;
		for (; index < this.data.length; ++index) {
			if (timestampEnd < this.data[index][0]) {
				if (prevTimestamp != timestampStart && inclusive == true) {
					callback(this.data[index][0], this.data[index][1]);
				}
				return;
			}
			prevTimestamp = this.data[index][0];
			callback(prevTimestamp, this.data[index][1]);
		}
	}

	/**
	 * Ensure that the timeseries is well formed
	 */
	consistencyCheck() {
		let curTimestamp = -Number.MAX_VALUE;
		for (let index = 0; index < this.data.length; ++index) {
			if (!this.options.unique && curTimestamp > this.data[index][0]) {
				return false;
			}
			else if (this.options.unique && curTimestamp >= this.data[index][0]) {
				return false;
			}
			curTimestamp = this.data[index][0];
		}
		return true;
	}

	/**
	 * Fix consistency issues
	 */
	consistencyFix() {
		this.data.sort((a, b) => (a[0] - b[0]));

		// Merge data that share the same timestamp
		if (this.options.unique) {
			let indexToDeleteList = [];
			for (let index = 1; index < this.data.length; ++index) {
				// If same data is found, merge the data and store it in the current index
				if (this.data[index - 1][0] == this.data[index][0]) {
					this.data[index][1] = this.options.uniqueMerge(this.data[index][1], this.data[index - 1][1], this.data[index][0]);
					indexToDeleteList.push(index - 1);
				}
			}
			// Delete entries from the list
			indexToDeleteList.reverse().forEach((index) => {
				this.data.splice(index, 1);
			});
		}
	}
}
