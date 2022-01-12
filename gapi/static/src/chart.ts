import * as d3 from 'd3'
import { NodesEntity } from "./nodes"
import { datai } from './message'
import { SENT, RECV, REPLAY } from './message'
import { BaseType, line, transition } from 'd3'
import { getSortedIdx } from './utils'

export { Chart }

/**
 * @param w Width of color pins (squares below labels) should be same odd/even parity as vertical lines 
 * @param gapLabelPin Gap between text labels and color pins
 * @param r Message node radius
 * @param marginBottom Margin from bottom of vertical lines to bottom of SVG
 * @param offset Offset messages nodes from beginning of vertical lines for lisibility
 * @param padding Adds space between svg borders and vertical lines
 * @param times Sent and received timestamps that should be sorted
 * @param xScale Point scale mapping node id to its x position 
 * @param spaceScaleY Linear scale mapping time differences between timestamps to pixel between 0 and {maxSpaceY}
 * @param minSpaceX Minimum space between vertical lines in pixels
 * @param maxSpaceY Minimum space between messages in pixels
 * @param idxLut Look up table mapping [SENT, RECV] timestamps from messages idx to {times} idx
 */
class Chart {

  readonly svg: d3.Selection<SVGElement, {}, HTMLElement, any>
  readonly svgLabels: d3.Selection<SVGElement, {}, HTMLElement, any>
  readonly nodes: NodesEntity[] | null

  readonly w: number
  readonly gapLabelPin: number
  readonly r: number
  readonly marginBottom: number
  readonly offset: number
  readonly padding: number

  times: Array<number>

  xScale: d3.ScalePoint<string>

  spaceScaleY: d3.ScaleLinear<number, number>

  minSpaceX: number

  maxSpaceY: number

  idxLut: Array<Array<number>>
  // Ex: idxLut = [[0,3],[1,2]]    times = [100,103,107,111]
  // Message 1 sent at 100, recv at 111; Message 2 sent at 103, recv at 107

  constructor(nodes: NodesEntity[] | null) {
    this.nodes = nodes
    this.svg = d3.select("#svg-chart")
    this.svgLabels = d3.select("#svg-labels")

    this.w = 11
    this.gapLabelPin = 3
    this.r = 5
    this.marginBottom = 30
    this.offset = 2 * this.r
    this.padding = 0.2

    this.minSpaceX = 200
    this.maxSpaceY = 100
  }

  display() {

    this.svg.selectAll('*').remove()
    this.svgLabels.selectAll('*').remove()

    this.times = []
    this.idxLut = []

    const minWidth = this.nodes.length * this.minSpaceX + 2 * this.minSpaceX * this.padding
    this.svg.attr("height", (this.svg.node().parentNode as HTMLElement).clientHeight)
    this.svg.style("min-width", minWidth)
    this.svgLabels.style("min-width", minWidth)


    this.xScale = d3.scalePoint()
      .domain(this.nodes.map(d => d.id))
      .range([0, this.svg.node().clientWidth])
      .padding(this.padding)
      .round(true)

    this.svgLabels
      .append("g")
      .attr("class", "labels")
      .selectAll("text")
      .data(this.nodes)
      .enter()
      .append("text")
      .text((d: NodesEntity) => d.id)
      .attr("x", (d: NodesEntity) => this.xScale(d.id))

    const textHeight = (this.svgLabels.select("text").node() as SVGTextElement).getBBox().height
    this.svgLabels.attr("height", textHeight + this.w + this.gapLabelPin)

    this.svgLabels
      .append("g")
      .attr("class", "color-pin")
      .attr("transform", `translate(${-Math.ceil(this.w / 2)}, ${textHeight + this.gapLabelPin})`)
      .selectAll("rect")
      .data(this.nodes)
      .enter()
      .append("rect")
      .attr("x", (d: NodesEntity) => this.xScale(d.id))
      .attr("fill", (d: NodesEntity) => d.color)
      .attr("width", this.w)
      .attr("height", this.w)

    this.svg
      .append('g')
      .attr('class', 'v-lines')
      .selectAll('line')
      .data(this.nodes)
      .enter()
      .append('line')
      .attr('id', (d: NodesEntity) => "line" + d.id)
      .attr("x1", (d: NodesEntity) => this.xScale(d.id))
      .attr("x2", (d: NodesEntity) => this.xScale(d.id))
      .attr("y1", 0)
      .attr("y2", this.svg.attr("height"))

    this.svg
      .append("g")
      .attr("class", "messages")
      .attr("transform", `translate(0, ${this.offset})`)
  }

  addSentMsg(msg: datai, idx: number): SVGElement {

    const self = this

    const l = this.times.length

    for (let i = l - 1; i >= idx; i--) {
      this.svg
        .select(".messages")
        .select(`[id="${i}"]`)
        .attr("id", i + 1)
    }

    const g = this.svg
      .select(".messages")
      .insert("g", `[id="${idx + 1}"]`)
      .attr("class", "message")
      .attr("id", idx)

    const circle = g
      .append("circle")
      .attr("class", "sent")
      .attr("cx", this.xScale(msg.fromNode))
      .attr('r', this.r)
      .style('fill', msg.color)
      .on("mouseover", function (d, i) {
        d3.select(this)
          .transition()
          .duration(300)
          .attr('r', self.r + 2)
      })
      .on('mouseout', function (d, i) {
        d3.select(this)
          .transition()
          .duration(300)
          .attr('r', self.r)
      })

    const sortedIdx = getSortedIdx(msg.timeSent, this.times)

    this.times.splice(sortedIdx, 0, msg.timeSent)

    this.idxLut = this.idxLut.map(d => d.map(d => { if (d >= sortedIdx) return d + 1; else return d }))

    this.idxLut.splice(idx, 0, [sortedIdx, undefined])

    this.updatePos()

    return circle.node()
  }

  addRecvMsg(msg: datai, idx: number) {
    const self = this

    this.svg
      .select(".messages")
      .select(`[id="${idx}"]`)
      .append("circle")
      .attr("class", "recv")
      .attr("cx", this.xScale(msg.toNode))
      .attr('r', this.r)
      .style('fill', msg.color)
      .on("mouseover", function () {
        d3.select(this)
          .transition()
          .duration(300)
          .attr('r', self.r + 2)
      })
      .on('mouseout', function () {
        d3.select(this)
          .transition()
          .duration(300)
          .attr('r', self.r)
      })

    const sortedIdx = getSortedIdx(msg.timeRecv, this.times)

    this.times.splice(sortedIdx, 0, msg.timeRecv)

    this.idxLut = this.idxLut.map(d => d.map(d => { if (d >= sortedIdx) return d + 1; else return d }))

    this.idxLut[idx][RECV] = sortedIdx

    this.updatePos()
  }

  updatePos() {
    const timeDiff = []
    for (let i = 1; i < this.times.length; i++) {
      const diff = this.times[i] - this.times[i - 1]
      if (diff < 0)
        console.log("Error sorting data - negative diff")
      timeDiff.push(diff)
    }

    const maxDiff = Math.max(...timeDiff)
    this.spaceScaleY = d3
      .scaleLinear()
      .domain([0, maxDiff == 0 ? 1 : maxDiff])
      .range([0, this.maxSpaceY])

    const pixelDiff = timeDiff.map(d => this.spaceScaleY(d))

    const pixelPos = pixelDiff.map(((s: number) => (a: number) => s += a)(0))
    pixelPos.unshift(0)

    this.svg
      .selectAll(".message")
      .data(this.idxLut)
      .select(function (this: any, d, i): any {
        const message = d3.select(this)
        message.select(".sent").attr("cy", pixelPos[d[SENT]])

        if (!message.select(".recv").empty()) {
          message.select(".recv").attr("cy", pixelPos[d[RECV]])

          if (message.select("line").empty())
            message.insert("line", "circle")
          // .attr("stroke", msg.color)
          message
            .select("line")
            .attr("x1", message.select(".sent").attr("cx"))
            .attr("y1", message.select(".sent").attr("cy"))
            .attr("x2", message.select(".recv").attr("cx"))
            .attr("y2", message.select(".recv").attr("cy"))
        }
      })


    const margin = this.marginBottom + this.offset
    const vlineHeight = Math.max(
      pixelDiff.reduce((d1, d2) => d1 + d2, 0) as number,
      (this.svg.node().parentNode as HTMLElement).clientHeight - margin
    )

    this.svg.attr("height", vlineHeight + margin)

    this.svg
      .select(".v-lines")
      .selectAll("line")
      .attr("y2", vlineHeight + this.offset)

  }

  addPopup(el: SVGElement, msg: datai, status: number) {

    d3.selectAll(".popup").remove()

    const circle = d3.select(el)
    const bounds = this.svg.node().getBoundingClientRect()
    const left = parseFloat(circle.attr("cx"))
    const top = parseFloat(circle.attr("cy")) + this.offset

    console.log(circle.attr("cy"))
    const popup = d3
      .select("#svg-chart-container")
      .append("div")
      .attr("class", "popup")
      .style("left", left + "px")
      .style("top", top + "px")
      .style("background", msg.color)
      .text(msg.message)
  }
}


