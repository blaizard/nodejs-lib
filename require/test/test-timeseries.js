"use strict";

const Exception = require('../exception.js')("test", "timeseries");
const TimeSeries = require('../persistence/timeseries.js');

describe("TimeSeries", () => {

	describe("Insert", () => {
		let timeseries = new TimeSeries();
		for (let i=0; i<10000; ++i) {
			const timestamp = Math.floor(Math.random() * Math.floor(1000));
			timeseries.insert(timestamp, 0);
		}
		Exception.assert(timeseries.consistencyCheck(), timeseries.data);
	});

	describe("Find", () => {
		let timeseries = new TimeSeries();
		for (let i=0; i<10; ++i) {
			timeseries.insert(i, 0);
		}
		Exception.assertEqual(timeseries.find(0), 0, timeseries.data);
		Exception.assertEqual(timeseries.find(9), 9, timeseries.data);
		Exception.assertEqual(timeseries.find(-1), 0, timeseries.data);
		Exception.assertEqual(timeseries.find(10), 10, timeseries.data);
		Exception.assertEqual(timeseries.find(1.5), 2, timeseries.data);
		Exception.assertEqual(timeseries.find(2.5), 3, timeseries.data);
		Exception.assertEqual(timeseries.find(3.5), 4, timeseries.data);
	});

	describe("forEach", () => {
		let timeseries = new TimeSeries();

		// Empty
		{
			let data = [];
			timeseries.forEach((timestamp) => data.push(timestamp));
			Exception.assertEqual(data, []);
		}

		// Fill with data
		for (let i=0; i<10; ++i) {
			timeseries.insert(i, 0);
		}

		// All
		{
			let data = [];
			timeseries.forEach((timestamp) => data.push(timestamp));
			Exception.assertEqual(data, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		}

		// From
		{
			let data = [];
			timeseries.forEach((timestamp) => data.push(timestamp), 3);
			Exception.assertEqual(data, [3, 4, 5, 6, 7, 8, 9]);
		}

		// From non existing inclusive
		{
			let data = [];
			timeseries.forEach((timestamp) => data.push(timestamp), 3.5, undefined, /*inclusive*/true);
			Exception.assertEqual(data, [3, 4, 5, 6, 7, 8, 9]);
		}

		// From non existing exclusive
		{
			let data = [];
			timeseries.forEach((timestamp) => data.push(timestamp), 3.5, undefined, /*inclusive*/false);
			Exception.assertEqual(data, [4, 5, 6, 7, 8, 9]);
		}

		// Until
		{
			let data = [];
			timeseries.forEach((timestamp) => data.push(timestamp), undefined, 3);
			Exception.assertEqual(data, [0, 1, 2, 3]);
		}

		// Until non existing inclusive
		{
			let data = [];
			timeseries.forEach((timestamp) => data.push(timestamp), undefined, 3.5, /*inclusive*/true);
			Exception.assertEqual(data, [0, 1, 2, 3, 4]);
		}

		// Until non existing exclusive
		{
			let data = [];
			timeseries.forEach((timestamp) => data.push(timestamp), undefined, 3.5, /*inclusive*/false);
			Exception.assertEqual(data, [0, 1, 2, 3]);
		}
	});

	describe("Consistency", () => {
		let timeseries = new TimeSeries();
		for (let i=0; i<10; ++i) {
			timeseries.insert(i, 0);
		}
		Exception.assert(timeseries.consistencyCheck(), timeseries.data);

		// Manually mess up with the consistency
		timeseries.data.push([-1, 0]);
		Exception.assert(!timeseries.consistencyCheck(), timeseries.data);

		// Fix consistency issue
		timeseries.consistencyFix();
		Exception.assert(timeseries.consistencyCheck(), timeseries.data);
	});
});