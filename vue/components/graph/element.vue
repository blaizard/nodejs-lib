<template>
	<div :class="name + ' irgraph'">
		<div :class="name + '-content irgraph-content'">
			<slot v-bind:selected="selectedLegend"></slot>
		</div>
		<div :class="name + '-legend irgraph-legend'" ref="legend">
			<div class="irgraph-legend-items" v-auto-size v-hover-children="selectedLegend">
				<div v-for="item, index in value"
						:key="index"
						:class="getLegendItemClass(index)">
					<span class="irgraph-legend-item-color">&nbsp;</span> {{ item.caption }}
				</div>
			</div>
		</div>
	</div>
</template>

<script>
	"use strict";

	import AutoSize from "[lib]/vue/directives/auto-size.js"
	import HoverChildren from "./directive/hover-children.js"

	export default {
		props: {
			name: {type: String, required: true},
			value: {type: Array, required: true},
			selected: {type: Number, required: false, default: -1}
		},
		directives: {
			"auto-size": AutoSize,
			"hover-children": HoverChildren
		},
		data() {
			return {
				selectedLegend: -1
			};
		},
		computed: {
			indexSelected() {
				return (this.selected === -1) ? this.selectedLegend : this.selected;
			}
		},
		methods: {
			getLegendItemClass(index) {
				return {
					"irgraph-legend-item": true,
					"irgraph-selected": (this.indexSelected === index)
				}
			}
		}
	}
</script>
