import * as d3 from 'd3'
import { NodesEntity } from "./nodes"
import { datai, SENT, RECV } from './message'
import { getSortedIdx } from './utils'

export { Chart }

/**
 * @param svg Main svg containing chart
 * @param svgLabels Top sticky labels
 * @param svgScale Left sticky scale
 * @param svgPadd Top left corner svg used for padding
 * @param w Width of color pins (squares below labels) should be same odd/even parity as vertical lines 
 * @param gapLabelPin Gap between text labels and color pins
 * @param r Message node radius
 * @param marginBottom Margin from bottom of vertical lines to bottom of SVG
 * @param offset Offset messages nodes from beginning of vertical lines for lisibility
 * @param padding Adds space between svg borders and vertical lines
 * @param popupWidth Width of popup messages
 * @param popupMaxHeight Maximum height of popup messages
 * @param scaleWidth Width of left svg scale 
 * @param scaleAxisWidth Width of left svg scale axis
 * @param tickSpace Space between ticks
 * @param dateFormat Date format (for ticks and popup messages)
 * @param timeFormat Time format (for ticks and popup messages)
 * @param times Sent and received timestamps that should be sorted
 * @param pixelPos pixel positions of the chart nodes (corresponding to {times})
 * @param xScale Point scale mapping node id to its x position 
 * @param spaceScaleY Linear scale mapping time differences between timestamps to pixel between 0 and {maxSpaceY}
 * @param timeScale Scale used to position formatted timestamps on left axis
 * @param axis d3 left axis used to build {timeScale}
 * @param tickValue Tick values explicitly given to time scale (automatic if undefined)
 * @param minSpaceX Minimum space between vertical lines in pixels
 * @param maxSpaceY Minimum space between messages in pixels
 * @param idxLut Look up table mapping [SENT, RECV] timestamps from messages idx to {times} idx
 * @param transitionDuration TimeScale, circles, lines and popup transition duration
 */
class Chart {

  readonly svg: d3.Selection<SVGElement, {}, HTMLElement, any>
  readonly svgLabels: d3.Selection<SVGElement, {}, HTMLElement, any>
  readonly svgScale: d3.Selection<SVGElement, {}, HTMLElement, any>
  readonly svgPadd: d3.Selection<SVGElement, {}, HTMLElement, any>

  readonly nodes: NodesEntity[] | null

  readonly w: number
  readonly gapLabelPin: number
  readonly r: number
  readonly marginBottom: number
  readonly offset: number
  readonly padding: number

  readonly scaleWidth: number
  readonly scaleAxisWidth: number
  readonly tickSpace: number
  readonly dateFormat: string
  readonly timeFormat: string

  readonly popupWidth: number
  readonly popupMaxHeight: number

  readonly transitionDuration: number

  times: Array<number>

  pixelPos: Array<number>

  xScale: d3.ScalePoint<string>

  spaceScaleY: d3.ScaleLinear<number, number>

  timeScale: d3.ScaleTime<number, number>

  axis: d3.Selection<SVGElement, {}, HTMLElement, any>

  tickValue: Date

  minSpaceX: number

  maxSpaceY: number

  idxLut: Array<Array<number>>
  // Ex: idxLut = [[0,3],[1,2]]    times = [100,103,107,111]
  // Message 1 sent at 100, recv at 111; Message 2 sent at 103, recv at 107

  constructor(nodes: NodesEntity[] | null) {
    this.nodes = nodes
    this.svg = d3.select("#svg-chart")
    this.svgLabels = d3.select("#svg-labels")
    this.svgScale = d3.select("#svg-scale")

    this.xScale = d3.scalePoint()
    this.spaceScaleY = d3.scaleLinear()
    this.timeScale = d3.scaleTime()

    this.w = 11
    this.gapLabelPin = 3
    this.r = 5
    this.marginBottom = 30
    this.offset = 2 * this.r
    this.padding = 0.1

    this.scaleWidth = 80
    this.scaleAxisWidth = 1
    this.tickSpace = 100
    this.dateFormat = "%m/%d/%Y"
    this.timeFormat = "%H:%M:%S.%L"
    this.tickValue = undefined

    this.popupWidth = 210
    this.popupMaxHeight = 160

    this.minSpaceX = 300
    this.maxSpaceY = 100

    this.transitionDuration = 600
  }

  public display() {

    this.svg.selectAll('*').remove()
    this.svgLabels.selectAll('*').remove()
    this.svgScale.selectAll('*').remove()
    d3.selectAll(".popup").remove()

    this.times = []
    this.pixelPos = []
    this.idxLut = []
    // this.axis.exit()

    const parent = d3.select("#svg-chart-container").node() as HTMLElement
    const width = Math.max(
      this.minSpaceX * (this.nodes.length + 2 * this.padding),
      parent.clientWidth - this.scaleWidth
    )
    this.svg.attr("height", parent.clientHeight)
    this.svg.style("width", width)
    this.svgLabels.style("width", width)
    this.svgScale.attr("width", this.scaleWidth)
    d3.select("#padding").style("width", this.scaleWidth + "px")

    this.xScale
      .domain(this.nodes.map(d => d.id))
      .range([0, width])
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
    d3.select("#padding").style("height", textHeight + this.w + this.gapLabelPin + "px")

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
      .on("click", function () {
        // TO DO
      })

    this.svg
      .append('g')
      .attr('class', 'chart-vlines')
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
      .attr("class", "chart-messages")
      .attr("transform", `translate(0, ${this.offset})`)

    this.axis = this.svgScale
      .append("g")
      .attr("transform", `translate(${this.scaleWidth - this.scaleAxisWidth},0)`)
  }

  public addMsg(msg: datai, idx: number, status: number): SVGElement {
    const time = status === SENT ? msg.timeSent : status === RECV ? msg.timeRecv : undefined
    const host = status === SENT ? msg.fromNode : status === RECV ? msg.toNode : undefined
    const _class = status === SENT ? "sent" : status === RECV ? "recv" : "unknown"

    if (status === SENT) {
      // Sort messages' HTML ids
      this.svg
        .selectAll(".chart-message")
        .each(function (this: SVGElement): void {
          const id = parseInt(this.id)
          if (id >= idx)
            this.id = (id + 1).toString()
        })
      // Reorder popup ids if necessary
      d3
        .selectAll(".popup")
        .each(function (this: HTMLDivElement) {
          const id = parseInt(this.id.slice("popup".length))
          if (id >= idx)
            this.id = "popup" + (id + 1)
        })
      // Insert new message in correct position
      this.svg
        .select(".chart-messages")
        .insert("g", `[id="${idx + 1}"]`)
        .attr("class", "chart-message")
        .attr("id", idx)
    }
    const circle = this.svg
      .select(".chart-messages")
      .select(`[id="${idx}"]`)
      .append("circle")
      .attr("class", _class)
      .attr("cx", this.xScale(host))
      .attr("cy", this.svg.attr("height"))
      .attr('r', this.r)
      .attr('fill', msg.color)
      .attr('stroke', "transparent")
      .attr("stroke-width", 10 + "px")


    const sortedIdx = getSortedIdx(time, this.times)
    this.times.splice(sortedIdx, 0, time)
    this.idxLut = this.idxLut.map(d => d.map(d => { if (d >= sortedIdx) return d + 1; else return d }))

    if (status === SENT)
      this.idxLut.splice(idx, 0, [sortedIdx, undefined])
    else if (status === RECV)
      this.idxLut[idx][RECV] = sortedIdx

    this.updatePos()

    return circle.node() as SVGElement
  }

  private updatePos() {
    const self = this
    const timeDiff = []
    for (let i = 1; i < this.times.length; i++) {
      const diff = this.times[i] - this.times[i - 1]
      if (diff < 0)
        console.log("Error sorting data - negative diff")
      timeDiff.push(diff)
    }

    const maxDiff = Math.max(...timeDiff)
    this.spaceScaleY
      .domain([0, maxDiff == 0 ? 1 : maxDiff])
      .range([0, this.maxSpaceY])

    const pixelDiff = timeDiff.map(d => this.spaceScaleY(d))

    this.pixelPos = pixelDiff.map(((s: number) => (a: number) => s += a)(0))
    this.pixelPos.unshift(0)

    this.svg
      .selectAll(".chart-message")
      .data(this.idxLut)
      .each(function (this: SVGElement, d): any {
        const msg = d3.select(this)

        msg
          .select(".sent")
          .transition().duration(self.transitionDuration)
          .attr("cy", self.pixelPos[d[SENT]])

        if (!msg.select(".recv").empty()) {
          msg
            .select(".recv")
            .transition().duration(self.transitionDuration)
            .attr("cy", self.pixelPos[d[RECV]])

          if (msg.select("line").empty())
            msg
              .insert("line", "circle")
              .attr("x1", msg.select(".sent").attr("cx"))
              .attr("x2", msg.select(".recv").attr("cx"))
              .attr("y1", self.svg.attr("height"))
              .attr("y2", self.svg.attr("height"))

          msg
            .select("line")
            .transition().duration(self.transitionDuration)
            // DO NOT USE msg.select(".recv").attr("cy")
            // -> Attribute cy is blocked by circle transition
            .attr("y1", self.pixelPos[d[SENT]])
            .attr("y2", self.pixelPos[d[RECV]])
        }
      })

    const margin = this.marginBottom + this.offset
    const vlineHeight = Math.max(
      pixelDiff.reduce((d1, d2) => d1 + d2, 0) as number,
      (this.svg.node().parentNode as HTMLElement).clientHeight - margin
    )

    this.svg.attr("height", vlineHeight + margin)

    this.svg
      .select(".chart-vlines")
      .selectAll("line")
      .attr("y2", vlineHeight + this.offset)


    // Update popup cy position if corresponding message node has moved
    d3
      .selectAll(".popup")
      .each(function (this: HTMLDivElement) {
        const popup = d3.select(this)
        const id = parseInt(this.id.slice("popup".length))
        const status = popup.classed("sent") ?
          SENT : popup.classed("recv") ? RECV : undefined
        const cy = self.pixelPos[self.idxLut[id][status]]
        const top = self.getPopupTop(popup, cy)
        popup
          .transition()
          .duration(self.transitionDuration)
          .style("top", top + "px")
      })

    this.updateTimeScale()
  }

  // Time scale update. When tickValue is undefined, scaling is auto
  // Otherwise it displays one tick of value {tickValue}
  public updateTimeScale() {

    if (this.times !== undefined && this.times.length !== 0) {
      this.timeScale
        .domain([new Date(this.times[this.times.length - 1]), new Date(this.times[0])])
        .range([this.pixelPos[this.pixelPos.length - 1] + this.offset, this.pixelPos[0] + this.offset])
        .interpolate(d3.interpolateRound)

      const dist = this.pixelPos[this.pixelPos.length - 1] - this.pixelPos[0]
      if (this.tickValue === undefined)
        this.axis
          .transition().duration(this.transitionDuration)
          .call(d3
            .axisLeft(this.timeScale)
            .ticks(dist / this.tickSpace)
            .tickFormat(d3.timeFormat(this.timeFormat)) as any
          )
      else {
        this.svgScale
          .select('g')
          .call(d3
            .axisLeft(this.timeScale)
            .tickValues([this.tickValue])
            .tickFormat(d3.timeFormat(this.timeFormat))
          )

        this.svgScale.select(".clone").remove()
        this.svgScale
          .select("text")
          .clone()
          .attr("class", "clone")

        const text = this.svgScale
          .select(".clone")
        text
          .attr("dy", parseFloat(text.attr("dy")) + 1 + "em")
          .text(d3.timeFormat(this.dateFormat)(this.tickValue))
      }
      this.svgScale
        .select("g")
        .append("rect")
        .attr("width", 3)
    }
  }

  public changeCircleState(circle: SVGElement, msg: datai): boolean {
    if (d3.select(circle).classed("selected")) {
      d3.select(circle)
        .attr("fill", msg.color)
        .attr("stroke", "transparent")
        .classed("selected", false)

      d3.select("#popup" + circle.parentElement.id).remove()

      return true
    }
    else {
      d3.select(circle)
        .classed("selected", true)
        .attr("stroke", msg.color)
        .attr("fill", "white")

      return false
    }
  }

  public addPopup(circle: SVGElement, msg: datai, status: number): HTMLElement {
    const self = this

    const status_string = status === SENT ?
      "sent" : status === RECV ? "recv" : undefined
    const time = status === SENT ?
      msg.timeSent : status === RECV ? msg.timeRecv : undefined
    const host = status === SENT ?
      msg.fromNode : status === RECV ? msg.toNode : undefined
    const info = status === SENT ?
      "Sent to " + msg.toNode : status === RECV ? "Received from " + msg.fromNode : "Unknown"
    const t = d3.timeFormat(this.dateFormat + " " + this.timeFormat)(new Date(time))

    // Cannot use circle.getAttribute("cy") because the attribute is
    // blocked by the possible current translation transition of circles. 
    const cx = this.xScale(host) //parseFloat(circle.getAttribute("cx"))
    const cy = this.pixelPos[this.idxLut[parseInt(circle.parentElement.id)][status]]

    const svgWidth = parseFloat(this.svg.style("width"))
    // If circle is on the last vertical line, show message to its left (right otherwise)
    const left = svgWidth - cx > this.popupWidth ?
      cx + 2 * this.r : cx - this.popupWidth - 2 * this.r

    const popup = d3
      .select(this.svg.node().parentElement)
      .append("div")
      .style("transform", `translate(${this.scaleWidth}px, ${this.offset}px)`)
      .attr("class", "popup " + status_string)
      .attr("id", "popup" + circle.parentElement.id)
      .style("width", this.popupWidth + "px")
      .style("max-height", this.popupMaxHeight + "px")
      .style("left", left + "px")
      .style("background", msg.color)
      .on("click", function () {
        d3.select(this).raise()
      })

    popup
      .append("div")
      .attr("class", "info")
      .style("background", msg.color)
      .selectAll("div")
      .data([["info", info], ["access_time_filled", t], ["account_circle", host]])
      .enter()
      .append("div")
      .attr("class", "icon-info")
      .select(function (this, d): any {
        d3.select(this)
          .append("span")
          .attr("class", "material-icons icon")
          .text(d[0])
        d3.select(this)
          .append("span")
          .text(d[1])
      })

    const str = JSON.stringify(msg.message, null, 2)
    popup
      .insert('div', 'div')
      .text(str)

    const popupButtons = popup
      .insert("div", "div")
      .attr("class", "popup-buttons")
      .style("background", msg.color)

    const goToGraphBtn = popupButtons
      .append("div")
      .attr("class", "icon-info go-to-graph")

    goToGraphBtn
      .append("span")
      .attr("class", "material-icons icon")
      .text("reply")

    goToGraphBtn
      .append("span")
      .text("Go to graph")
      .style("font-style", "italic")

    popupButtons
      .append("div")
      .attr("class", "popup-close material-icons")
      .text("close")
      .on("click", function () {
        self.changeCircleState(circle, msg)
        d3.select(this.parentNode.parentNode as any).remove()
      })

    popup.style("top", this.getPopupTop(popup, cy) + "px")

    return goToGraphBtn.node() as HTMLElement
  }

  private getPopupTop(popup: any, cy: number) {
    // If circle is on the last on y axis, show message above node (underneath otherwise)
    // We get the popup height after it has automatically resized when text was added
    const svgHeight = parseFloat(this.svg.attr("height"))
    const popupHeight = (popup.node() as HTMLElement).clientHeight
    return svgHeight - (cy + this.offset) > popupHeight ? cy : cy - popupHeight
  }

  public outlineMsg(outlined: boolean, idx: number = undefined) {
    if (idx === undefined)
      this.svg
        .selectAll(".chart-message")
        .classed("outlined", outlined)
    else
      this.svg
        .select(`[id="${idx}"]`)
        .classed("outlined", outlined)
  }

  public lineCursor(status: string) {
    switch (status) {
      case "add":
        const triStrokeWidth = 2
        const x1 = this.xScale(this.nodes[0].id) - this.r - triStrokeWidth
        const x2 = this.xScale(this.nodes[this.nodes.length - 1].id) + this.r + triStrokeWidth

        const g = this.svg
          .append("g")
          .attr("id", "line-cursor")
        g
          .append("line")
          .attr("x1", x1)
          .attr("x2", x2)
        g
          .append("polygon")
          .attr("class", "triangle")
          .attr("points", `${x1 - 3},-3 ${x1 - 3},3 ${x1},0`)
          .attr("stroke-width", triStrokeWidth)
        g
          .append("polygon")
          .attr("class", "triangle")
          .attr("points", `${x2 + 3},-3 ${x2 + 3},3 ${x2},0`)
          .attr("stroke-width", triStrokeWidth)
        break

      case "update":
        this.svg
          .select("#line-cursor")
          .attr("transform", `translate(0, ${this.timeScale(this.tickValue)})`)
        break

      case "remove":
        this.svg
          .select("#line-cursor")
          .remove()
        break

      default:
        console.error("Unknown status")
    }
  }

  public setScroll() {
    const el = d3.select("#svg-chart-container").node() as HTMLElement
    el.scrollTop = this.timeScale(this.tickValue) - (el.clientHeight - parseFloat(this.svgLabels.attr("height"))) / 2
  }
}


