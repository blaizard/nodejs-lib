<template>
	<Element name="irgraph-plot" :value="series" :selected="selected" v-slot:default="slotProps" v-resize="handleResize">
		<svg :viewBox="svgViewBox" :style="svgStyle" v-resize="handleResize" v-hover-children="selected" @mousemove="handleMouseMove">
			<g class="irgraph-plot-labels-x">
				<template v-for="item, x in labelXMap">
					<text v-if="item.show"
							:x="x"
							:y="height - plotOffsetBottom + tickSize / 2"
							text-anchor="middle"
							alignment-baseline="hanging">
						{{ item.value }}
					</text>
					<line v-if="item.show" :x1="x" :x2="x" :y1="height - plotOffsetBottom - tickSize / 2" :y2="height - plotOffsetBottom + tickSize / 2"></line>
				</template>
			</g>
			<g class="irgraph-plot-labels-y">
				<template v-for="item, y in labelYMap">
					<text v-if="item.show"
							:x="plotOffsetLeft"
							:y="y"
							text-anchor="end"
							alignment-baseline="middle">
						{{ item.value }}
					</text>
					<line v-if="item.show" :x1="plotOffsetLeft - tickSize / 2" :x2="width - plotOffsetRight" :y1="y" :y2="y"></line>
				</template>
			</g>
			<!-- Print the points //-->
			<g class="irgraph-plot-items" v-hover-children="selected">
				<g v-for="item in series" class="irgraph-plot-item">
					<path :d="item.path" class="path" fill="transparent" />
					<line v-for="data in item.coords"
							:x1="data[0]"
							:y1="data[1]"
							:x2="data[0]"
							:y2="data[1]"
							class="circle" />
				</g>
			</g>
		</svg>
		{{ labelXResolution }}
	</Element>
</template>

<script>
	"use strict";

	import Element from "./element.vue"
	import HoverChildren from "./directive/hover-children.js"
	import Resize from "[lib]/vue/directives/resize.js"

	const DEBUG = true;

	export default {
		components: {
			Element
		},
		props: {
			value: {type: Array, required: false, default: () => ([])},
			text: {type: String | Number, required: false, default: false},
			minY: {type: Number, required: false, default: null},
			maxY: {type: Number, required: false, default: null},
			minX: {type: Number, required: false, default: null},
			maxX: {type: Number, required: false, default: null}
		},
		directives: {
			"hover-children": HoverChildren,
			"resize": Resize
		},
		data: function() {
			return {
				selected: -1,
				width: 0,
				height: 0,
				valuesMinX: 0,
				valuesMinY: 0,
				valuesMaxX: 0,
				valuesMaxY: 0,
				plotOffsetTop: 10,
				plotOffsetRight: 10,
				plotOffsetLeft: 20,
				plotOffsetBottom: 20,
				tickSize: 5,
				tickXMinOffset: 100,
				tickYMinOffset: 100,
				maxPointsPerPlot: 20
			}
		},
		watch: {
			value: {
				immediate: true,
				handler(value) {

					if (DEBUG) console.time("plot render")

					this.valuesMinY = Number.MAX_SAFE_INTEGER;
					this.valuesMaxY = -Number.MAX_SAFE_INTEGER;

					const series = value || [];

					// Calculate the [valuesMinY; valuesMaxY]
					series.forEach((item) => {
						item.values.forEach((point) => {
							this.valuesMinY = Math.min(this.valuesMinY, point[1]);
							this.valuesMaxY = Math.max(this.valuesMaxY, point[1]);
						});
					});

					// Calculate the [valuesMinX; valuesMaxX]
					this.valuesMinX = Number.MAX_SAFE_INTEGER;
					this.valuesMaxX = -Number.MAX_SAFE_INTEGER;

					series.forEach((item) => {
						this.valuesMinX = Math.min(this.valuesMinX, item.values[0][0]);
						this.valuesMaxX = Math.max(this.valuesMaxX, item.values[item.values.length - 1][0]);
					});
				}
			}
		},
		computed: {
			/**
			 * SVG viewbox
			 */
			svgViewBox() {
				return "0 0 " + this.width + " " + this.height;
			},
			/**
			 * SVG style
			 */
			svgStyle() {
				return { width: this.width + "px", height: this.height + "px" }
			},
			/**
			 * Full width of the plot area (excluding offsets)
			 */
			plotWidth() {
				return this.width - this.plotOffsetLeft - this.plotOffsetRight;
			},
			/**
			 * Full height of the plot area (excluding offsets)
			 */
			plotHeight() {
				return this.height - this.plotOffsetBottom - this.plotOffsetTop;
			},
			/**
			 * Minimum Y value to be displayed on the plot
			 */
			plotMinY() {
				if (this.minY === null) {
					// Note here the plotMaxY and valuesMinY are on purpose
					return ((this.plotMaxY - this.valuesMinY) > this.valuesMinY) ? Math.min(0, this.valuesMinY) : this.valuesMinY;
				}
				return this.minY;
			},
			/**
			 * Maximum Y value to be displayed on the plot
			 */
			plotMaxY() {
				return (this.maxY === null) ? this.valuesMaxY : this.maxY;
			},
			/**
			 * Minimum X value to be displayed on the plot
			 */
			plotMinX() {
				return (this.minX === null) ? this.valuesMinX : this.minX;
			},
			/**
			 * Maximum X value to be displayed on the plot
			 */
			plotMaxX() {
				return (this.maxX === null) ? this.valuesMaxX : this.maxX;
			},
			/**
			 * The points to be processed
			 */
			series() {
				const series = (this.value || []).map((item) => {

					let serie = {
						caption: item.caption || "",
						color: item.color || "red",
						coords: [],
						path: ""
					};

					const valuesXRatio = 1. / (this.plotMaxX - this.plotMinX) * this.plotWidth;
					const valuesXOffset = this.plotOffsetLeft - this.plotMinX * valuesXRatio;

					const valuesYRatio = -1. / (this.plotMaxY - this.plotMinY) * this.plotHeight;
					const valuesYOffset = this.plotOffsetTop + this.plotHeight - this.plotMinY * valuesYRatio;

					// Prevent no-sense
					if (valuesXRatio == Infinity || valuesYRatio == Infinity) {
						return [];
					}

					// Display only a maximum number of entries to imprve performance
					const maxEntries = 100;
					const inc = Math.max(1, item.values.length / maxEntries);

					// Re-sample and calculate the series
					for (let i=0; i<item.values.length; i += inc) {
						const x = valuesXOffset + item.values[~~i][0] * valuesXRatio;
						const y = valuesYOffset + item.values[~~i][1] * valuesYRatio;
						serie.coords.push([x, y]);

						// Calculate the path
						if (i == 0)
						{
							serie.path = "M " + x + " " + y;
						}
						else
						{
							serie.path += " L " + x + " " + y;
							//item.path += " C " + x + " " + y + ", " + x + " " + y + ", " + x + " " + y;
						}
					}
					return serie;
				});
				if (DEBUG) console.timeEnd("plot render");
				return series;
			},
			// X Label
			labelX() {
				let maxNbTicks = Math.floor(this.plotWidth / this.tickXMinOffset);
				const tickValueOffset = (this.plotMaxX - this.plotMinX) / maxNbTicks;
				let list = [];
				let value = this.plotMinX;
				while (maxNbTicks >= 0) {
					list.push(value);
					value += tickValueOffset;
					--maxNbTicks;
				}
				return list;
			},
			labelXResolution() {
				const incrementX = (this.plotMaxX - this.plotMinX) / this.labelX.length;
				let decimal = 0;
				for (let i = 1; i >= 0.00001; i /= 10, ++decimal) {
					if (incrementX >= i * 5) {
						return decimal;
					}
				}
				return decimal;
			},
			labelXMap() {
				let map = {};
				const lastIndex = this.labelX.length - 1;
				this.labelX.forEach((n, index) => {
					map[this.plotOffsetLeft + this.plotWidth * index / lastIndex] = {
						value: n.toFixed(this.labelXResolution),
						show: (index > 0 && index < lastIndex)
					};
				});
				return map;
			},
			// Y Label
			labelY() {
				let maxNbTicks = Math.floor(this.plotHeight / this.tickYMinOffset);
				const tickValueOffset = (this.plotMaxY - this.plotMinY) / maxNbTicks;
				let list = [];
				let value = this.plotMinY;
				while (maxNbTicks >= 0) {
					list.push(value);
					value += tickValueOffset;
					--maxNbTicks;
				}
				return list;
			},
			labelYResolution() {
				const incrementY = (this.plotMaxY - this.plotMinY) / this.labelY.length;
				let decimal = 0;
				for (let i = 1; i >= 0.00001; i /= 10, ++decimal) {
					if (incrementY >= i * 5) {
						return decimal;
					}
				}
				return decimal;
			},
			labelYMap() {
				let map = {};
				const lastIndex = this.labelY.length - 1;
				this.labelY.reverse().forEach((n, index) => {
					map[this.plotOffsetTop + this.plotHeight * index / lastIndex] = {
						value: n.toFixed(this.labelYResolution),
						show: true
					};
				});
				return map;
			}
		},
		methods: {
			handleResize(width, height) {
				this.width = width;
				this.height = height;
			},
			handleMouseMove(e) {
				const coords = (e.touches && e.touches.length) ? {x: e.touches[0].pageX, y: e.touches[0].pageY} : {x: e.pageX, y: e.pageY};
				const xCoord = coords.x - this.plotOffsetLeft;
			}
		}
	}
</script>
