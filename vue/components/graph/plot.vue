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
							:x1="data.x"
							:y1="data.y"
							:x2="data.x"
							:y2="data.y"
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

	export default {
		components: {
			Element
		},
		props: {
			value: {type: Object, required: false, default: () => ({})},
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
				nbPoints: 0,
				valueXDefaultStart: 0,
				valueXDefaultIncrement: 1,
				maxPointsPerPlot: 20
			}
		},
		watch: {
			value: {
				immediate: true,
				handler(value) {
					this.nbPoints = 0;
					this.valuesMinY = Number.MAX_SAFE_INTEGER;
					this.valuesMaxY = -Number.MAX_SAFE_INTEGER;

					// Calculate the [valuesMinY; valuesMaxY] and nbPoints
					const series = value.series || [];
					series.forEach((item) => {
						item.values.forEach((y) => {
							this.valuesMinY = Math.min(this.valuesMinY, y);
							this.valuesMaxY = Math.max(this.valuesMaxY, y);
						});
						this.nbPoints = Math.max(this.nbPoints, item.values.length);
					});

					// Calculate the [valuesMinX; valuesMaxX]
					if (this.nbValuesX) {
						this.valuesMinX = Number.MAX_SAFE_INTEGER;
						this.valuesMaxX = -Number.MAX_SAFE_INTEGER;
						for (let i = 0; i<this.nbValuesX; ++i) {
							this.valuesMinX = Math.min(this.valuesMinX, this.valuesX[i]);
							this.valuesMaxX = Math.max(this.valuesMaxX, this.valuesX[i]);
						}
						this.valueXDefaultIncrement = (this.nbValuesX > 1) ? ((this.valuesMaxX - this.valuesMinX) / (this.nbValuesX - 1)) : 1;
						this.valueXDefaultStart = this.valuesMaxX + this.valueXDefaultIncrement;
					}
					else {
						this.valuesMinX = 0;
						this.valuesMaxX = -1;
						this.valueXDefaultIncrement = 1;
						this.valueXDefaultStart = 0;
					}
					this.valuesMaxX += this.valueXDefaultIncrement * (this.nbPoints - this.nbValuesX);
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
					return ((this.plotMaxY - this.valuesMinY) > this.valuesMinY) ? 0 : this.valuesMinY;
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
				return (this.value.series || []).map((item) => {

					let serie = {
						caption: item.caption || "",
						color: item.color || "red",
						coords: [],
						path: ""
					};

					// Re-sample and calculate the series
					for (let i=0; i<item.values.length; ++i) {
						const x = this.plotOffsetLeft + this.valuesXMap[i];
						const y = this.plotOffsetTop + this.plotHeight - (item.values[i] - this.plotMinY) * this.valuesYRatio;
						serie.coords.push({
							x: x,
							y: y
						});

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
			valuesX() {
				return this.value.x || [];
			},
			nbValuesX() {
				return Math.min(this.nbPoints, this.valuesX.length);
			},
			valuesXMap() {
				let list = [];
				const ratio = 1. / (this.plotMaxX - this.plotMinX) * this.plotWidth;
				let index = 0;
				for (; index < this.nbValuesX; ++index) {
					list.push((this.valuesX[index] - this.plotMinX) * ratio);
				}
				for (let x = this.valueXDefaultStart; index < this.nbPoints; ++index, x += this.valueXDefaultIncrement) {
					list.push((x - this.plotMinX) * ratio);
				}
				return list;
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
			},
			valuesYRatio() {
				return 1. / (this.plotMaxY - this.plotMinY) * this.plotHeight;
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
