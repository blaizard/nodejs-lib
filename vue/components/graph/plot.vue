<template>
	<Element name="irgraph-plot" :value="valueList" :selected="selected" v-slot:default="slotProps" v-resize="handleResize">
		<svg :viewBox="viewBox" :style="svgStyle" v-resize="handleResize" v-hover-children="selected">
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
			<g class="irgraph-plot-items">
				<g v-for="item in valueList" class="irgraph-plot-item">
					<!--<circle v-for="y, index in item.value" :cx="plotOffsetLeft + valuesXMap[index]" :cy="plotOffsetTop + plotHeight - (y - minY) * valuesYRatio" r="5"/>//-->
					<line v-for="y, index in item.value"
							:x1="plotOffsetLeft + valuesXMap[index]"
							:y1="plotOffsetTop + plotHeight - (y - minY) * valuesYRatio"
							:x2="plotOffsetLeft + valuesXMap[index]"
							:y2="plotOffsetTop + plotHeight - (y - minY) * valuesYRatio"
							class="circle" />
				</g>
			</g>
			{{ valuesXMap }}
		</svg>
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
			value: {type: Array, required: false, default: () => []},
			text: {type: String | Number, required: false, default: false}
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
				minX: 0,
				minY: 0,
				maxX: 0,
				maxY: 0,
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
					this.minY = Number.MAX_SAFE_INTEGER;
					this.maxY = -Number.MAX_SAFE_INTEGER;
					this.nbPoints = 0;
					value.forEach((item) => {
						item.value.forEach((y) => {
							this.minY = Math.min(this.minY, y);
							this.maxY = Math.max(this.maxY, y);
						});
						this.nbPoints = Math.max(this.nbPoints, item.value.length);
					});

					if (this.nbValuesX) {
						this.minX = Number.MAX_SAFE_INTEGER;
						this.maxX = -Number.MAX_SAFE_INTEGER;
						for (let i = 0; i<this.nbValuesX; ++i) {
							this.minX = Math.min(this.minX, this.valuesX[i]);
							this.maxX = Math.max(this.maxX, this.valuesX[i]);
						}
						this.valueXDefaultIncrement = (this.maxX - this.minX) / this.nbValuesX;
						this.valueXDefaultStart = this.maxX + this.valueXDefaultIncrement;
					}
					else {
						this.minX = 0;
						this.maxX = -1;
						this.valueXDefaultIncrement = 1;
						this.valueXDefaultStart = 0;
					}
					this.maxX += this.valueXDefaultIncrement * (this.nbPoints - this.nbValuesX);
				}
			}
		},
		computed: {
			viewBox() {
				return "0 0 " + this.width + " " + this.height;
			},
			svgStyle() {
				return { width: this.width + "px", height: this.height + "px" }
			},
			plotWidth() {
				return this.width - this.plotOffsetLeft - this.plotOffsetRight;
			},
			plotHeight() {
				return this.height - this.plotOffsetBottom - this.plotOffsetTop;
			},
			valueList() {
				const value = (this.value instanceof Array) ? this.value : [];
				return value.map((item) => {
					let defaultItem = {
						caption: "",
						color: "red"
					};
					return Object.assign(defaultItem, item);
				});
			},
			// X Label
			labelX() {
				let maxNbTicks = Math.floor(this.plotWidth / this.tickXMinOffset);
				const tickValueOffset = (this.maxX - this.minX) / maxNbTicks;
				let list = [];
				let value = this.minX;
				while (maxNbTicks >= 0) {
					list.push(value);
					value += tickValueOffset;
					--maxNbTicks;
				}
				return list;
			},
			labelXMap() {
				let map = {};
				const lastIndex = this.labelX.length - 1;
				this.labelX.forEach((n, index) => {
					map[this.plotOffsetLeft + this.plotWidth * index / lastIndex] = {
						value: n,
						show: (index > 0 && index < lastIndex)
					};
				});
				return map;
			},
			valuesX() {
				return this.valueList.x || [];
			},
			nbValuesX() {
				return Math.min(this.nbPoints, this.valuesX.length);
			},
			valuesXMap() {
				let list = [];
				const ratio = 1. / (this.maxX - this.minX) * this.plotWidth;
				let index = 0;
				for (; index < this.nbValuesX; ++index) {
					list.push((this.valuesX[index] - this.minX) * ratio);
				}
				for (let x = this.valueXDefaultStart; index < this.nbPoints; ++index, x += this.valueXDefaultIncrement) {
					list.push((x - this.minX) * ratio);
				}
				return list;
			},
			// Y Label
			labelY() {
				let maxNbTicks = Math.floor(this.plotHeight / this.tickYMinOffset);
				const tickValueOffset = (this.maxY - this.minY) / maxNbTicks;
				let list = [];
				let value = this.minY;
				while (maxNbTicks >= 0) {
					list.push(value);
					value += tickValueOffset;
					--maxNbTicks;
				}
				return list;
			},
			labelYMap() {
				let map = {};
				const lastIndex = this.labelY.length - 1;
				this.labelY.reverse().forEach((n, index) => {
					map[this.plotOffsetTop + this.plotHeight * index / lastIndex] = {
						value: Math.round(n),
						show: true
					};
				});
				return map;
			},
			valuesYRatio() {
				return 1. / (this.maxY - this.minY) * this.plotHeight;
			}
		},
		methods: {
			handleResize(width, height) {
				this.width = width;
				this.height = height;
			}
		}
	}
</script>
