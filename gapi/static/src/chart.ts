import * as d3 from 'd3'
import { NodesEntity } from "./nodes"
import { datai, SENT, RECV } from './message'
import { getSortedIdx, supportsPassive } from './utils'
import { timeDays, transition } from 'd3'

export { Chart }

/**
 * @param container Svg container (contains labels, timescale and chart)
 * @param svg Main svg chart
 * @param svgLabels Top sticky labels
 * @param svgScale Left sticky scale
 * @param pinWidth Width of color pins (squares below labels) should be same odd/even parity as vertical lines 
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
 * @param minSpaceX Minimum space between vertical lines in pixels
 * @param maxSpaceY Minimum space between messages in pixels
 * @param idxLut Look up table mapping [SENT, RECV] timestamps from messages idx to {times} idx
 * @param _transitionDuration TimeScale, circles, lines and popup transition duration
 * @param _autoScroll If true, chart automatically transitins to bottom
 * @param zoomShiftStart Memorizes the time value where shift zoom began
 * @param mousePosSvg tracks mouse position inside svg
 * @param mousePosContainer tracks mouse position inside svg container
 */
class Chart {

  readonly container: HTMLElement
  readonly svg: d3.Selection<SVGElement, {}, HTMLElement, any>
  readonly svgLabels: d3.Selection<SVGElement, {}, HTMLElement, any>
  readonly svgScale: d3.Selection<SVGElement, {}, HTMLElement, any>

  readonly nodes: NodesEntity[] | null

  readonly pinWidth: number
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


  times: Array<number>

  pixelPos: Array<number>

  xScale: d3.ScalePoint<string>

  spaceScaleY: d3.ScaleLinear<number, number>

  timeScale: d3.ScaleLinear<number, number>

  axis: d3.Selection<SVGElement, {}, HTMLElement, any>

  minSpaceX: number

  maxSpaceY: number

  idxLut: Array<Array<number>>
  // Ex: idxLut = [[0,3],[1,2]]    times = [100,103,107,111]
  // Message 0 sent at 100, recv at 111; Message 1 sent at 103, recv at 107

  _autoScroll: boolean
  _transitionDuration: number
  zoomShiftStart: number
  mousePosSvg: number
  mousePosContainer: number

  constructor(nodes: NodesEntity[] | null) {
    this.nodes = nodes
    this.nodes.forEach((d: any) => d.display = "block")

    this.container = document.getElementById("svg-chart-container")
    this.svg = d3.select("#svg-chart")
    this.svgLabels = d3.select("#svg-labels")
    this.svgScale = d3.select("#svg-scale")

    this.xScale = d3.scalePoint()
    this.spaceScaleY = d3.scaleLinear()
    this.timeScale = d3.scaleLinear()

    this.pinWidth = 11
    this.gapLabelPin = 3
    this.r = 5
    this.marginBottom = 50
    this.offset = 2 * this.r
    this.padding = 0.1

    this.scaleWidth = 80
    this.scaleAxisWidth = 1
    this.tickSpace = 100
    this.dateFormat = "%m/%d/%Y"
    this.timeFormat = "%H:%M:%S.%L"

    this.popupWidth = 210
    this.popupMaxHeight = 160

    this.minSpaceX = 200
    this.maxSpaceY = 100

    this.setTransitionDuration()

    this._autoScroll = true
  }

  public display() {
    const self: Chart = this
    this.svg.selectAll('*').remove()
    this.svgLabels.selectAll('*').remove()
    this.svgScale.selectAll('*').remove()
    d3.selectAll(".popup").remove()

    this.times = []
    this.pixelPos = []
    this.idxLut = []

    const width = Math.max(
      this.minSpaceX * (this.nodes.length + 2 * this.padding),
      this.container.clientWidth - this.scaleWidth
    )
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
      .attr("class", (d: NodesEntity) => "label " + d.id)
      .text((d: NodesEntity) => d.id)
      .attr("x", (d: NodesEntity) => this.xScale(d.id))

    const textHeight = (this.svgLabels.select("text").node() as SVGTextElement).getBBox().height
    this.svgLabels.attr("height", textHeight + this.pinWidth + this.gapLabelPin)
    d3.select("#padding").style("height", textHeight + this.pinWidth + this.gapLabelPin + "px")

    this.svgLabels
      .append("g")
      .attr("class", "color-pin")
      .attr("transform", `translate(${-Math.ceil(this.pinWidth / 2)}, ${textHeight + this.gapLabelPin})`)
      .selectAll("rect")
      .data(this.nodes)
      .enter()
      .append("rect")
      .attr("class", (d: NodesEntity) => "pin " + d.id)
      .attr("x", (d: NodesEntity) => this.xScale(d.id))
      .attr("fill", (d: NodesEntity) => d.color)
      .attr("width", this.pinWidth)
      .attr("height", this.pinWidth)
      .on("click", (d: NodesEntity) => {
        d3
          .selectAll(".popup-label")
          .filter("." + d.id)
          .style("display", "block")
      })

    addLabelPopup()

    this.svg
      .attr("height", this.container.clientHeight - this.svgLabels.node().clientHeight)
      .append('g')
      .attr('class', 'chart-vlines')
      .selectAll('line')
      .data(this.nodes)
      .enter()
      .append('line')
      .attr("class", (d: NodesEntity) => "vline " + d.id)
      .attr("x1", (d: NodesEntity) => this.xScale(d.id))
      .attr("x2", (d: NodesEntity) => this.xScale(d.id))
      .attr("y1", 0)
      .attr("y2", parseFloat(this.svg.attr("height")) - this.marginBottom)

    this.svg
      .append("g")
      .attr("class", "chart-messages")
      .attr("transform", `translate(0, ${this.offset})`)

    this.axis = this.svgScale
      .append("g")
      .attr("transform", `translate(${this.scaleWidth - this.scaleAxisWidth},0)`)

    this.lineCursor("add")

    function addLabelPopup() {
      d3.select("body").on("mouseup",
        () => d3.selectAll(".popup-label").style("display", "none"))

      const popup = d3
        .select(self.svgLabels.node().parentElement)
        .selectAll(".popup-label")
        .data(self.nodes)
        .enter()
        .append("div")
        .attr("class", (d: NodesEntity) => "popup-label " + d.id)
        .style("transform", (d: NodesEntity) => {
          if (self.nodes[self.nodes.length - 1].id === d.id)
            return `translate(calc(${self.scaleWidth - self.pinWidth}px - 100%), -50%)`
          return `translate(${self.scaleWidth + self.pinWidth}px, -50%)`
        })
        .style("left", (d: NodesEntity) => self.xScale(d.id) + "px")
        .style("top", textHeight + self.gapLabelPin + self.pinWidth / 2 + "px")
        .style("display", "none")
      popup
        .append("button")
        .attr("class", "viz-button hide-button")
        .text("HIDE")
        .style("background", (d: NodesEntity) => d.color)
        .on("click", function (this, d) {
          self.toggleHide(this, d.id)
        })
      popup
        .append("button")
        .attr("class", "viz-button focus-button")
        .text("FOCUS")
        .style("background", (d: NodesEntity) => d.color)
        .on("click", function (this, d) {
          self.toggleFocus(this, d.id)
        })
    }
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
        .insert("g", `[id = "${idx + 1}"]`)
        .attr("class", "chart-message " + host)
        .attr("id", idx)
        .attr("display", this.nodes.find(d => host === d.id).display)
    }
    const circle = this.svg
      .select(".chart-messages")
      .select(`[id = "${idx}"]`)
      .append("circle")
      .attr("class", host + " " + _class)
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

  public listen() {
    const self = this
    document.getElementById('height-slider').oninput = function (this: HTMLInputElement) {
      document.getElementById("height-slider-value").innerText = this.value
      self.maxSpaceY = parseFloat(this.value) * 100
      self.updatePos()
    }

    document.getElementById('width-slider').oninput = function (this: HTMLInputElement) {
      document.getElementById("width-slider-value").innerText = this.value
      self.minSpaceX = parseFloat(this.value) * 10
      self.updateXPos()
    }

    document.getElementById('scroll-button').onclick = () => {
      self.autoScroll = true
      self.scrollDown()
    }

    this.svg.node().parentElement.onmousemove = function (this: HTMLElement, e) {
      if (!e.shiftKey) {
        self.mousePosSvg = self.timeScale.invert(e.offsetY)
        self.mousePosContainer = e.clientY
      }
    }

    // this.container.onmousemove = function (e) {
    //   if (!e.shiftKey)
    //     self.mousePosContainer = e.offsetY
    // }

    document.onkeyup = function (e) {

      self.setTransitionDuration()
      self.container.style.overflow = "scroll"
    }
    document.onkeydown = function (e) {

      if (e.shiftKey) {
        self._transitionDuration = 0
        self.container.style.overflow = "hidden"
      }
    }

    this.container.addEventListener("wheel", function (e) {
      if (e.shiftKey) {
        this.scrollTop = self.timeScale(self.mousePosSvg)
          - self.mousePosContainer
          + this.getBoundingClientRect().top + parseFloat(self.svgLabels.attr("height"))

        self.maxSpaceY = Math.max(0, self.maxSpaceY - Math.sign(e.deltaY))
        self.updatePos()
      }
      else {
        // const matrix = window.getComputedStyle(self.svg.node().parentElement).transform
        // const matrixValues = matrix.match(/matrix.*\((.+)\)/)[1].split(', ')
        // const translateY = parseFloat(matrixValues[5])
        // self.svg.node().parentElement.style.transform = `translate(0px,${translateY - e.deltaY}px)`
        // d3.select(self.svg.node().parentElement).transform(`translate(0,${})`)
        self.autoScroll = false
      }

    })
    // d3.select(this.container).on("wheel", wheeled);

    // function wheeled() {
    //   console.log(d3.event.wheelDeltaY)
    //   const container = d3.select(self.svg.node().parentElement)
    //   const string = container.attr("transform")

    //   const translate = string.substring(string.indexOf("(") + 1, string.indexOf(")")).split(",");

    //   const dx = d3.event.wheelDeltaX + translate[0];
    //   const dy = d3.event.wheelDeltaY + translate[1];
    //   container.attr("transform", "translate(" + [dx, dy] + ")");
    // }


    document.getElementById('performance-button').onclick = function (this: HTMLButtonElement) {
      switch (this.innerText) {
        case "flash_on":
          this.innerText = "flash_off"
          this.style.color = "white"
          self.setTransitionDuration()
          break
        case "flash_off":
          this.innerText = "flash_on"
          this.style.color = "yellow"
          self._transitionDuration = 0
          break
      }
    }
  }

  private updatePos() {
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

    const margin = this.marginBottom + this.offset

    const vlineHeight = pixelDiff.reduce((d1, d2) => d1 + d2, 0) as number

    this.svg
      .transition().duration(this._transitionDuration)
      .attr("height", vlineHeight + margin)

    this.svg
      .select(".chart-vlines")
      .selectAll("line")
      .transition().duration(this._transitionDuration)
      .attr("y2", vlineHeight + this.offset)

    this.updateTimeScale("idle")
    this.updateMsgPos()
    this.updatePopupPos()
    this.scrollDown()
  }

  private updateMsgPos() {
    const self = this
    this.svg
      .selectAll(".chart-message")
      .data(this.idxLut)
      .each(function (this: SVGElement, d): any {
        const msg = d3.select(this)

        msg
          .select(".sent")
          .transition().duration(self._transitionDuration)
          .attr("cy", self.pixelPos[d[SENT]])

        if (!msg.select(".recv").empty()) {
          msg
            .select(".recv")
            .transition().duration(self._transitionDuration)
            .attr("cy", self.pixelPos[d[RECV]])

          if (msg.select("line").empty())
            msg
              .insert("line", "circle")
              .attr("x1", msg.select(".sent").attr("cx"))
              .attr("x2", msg.select(".recv").attr("cx"))
              .attr("y1", self.svg.attr("height"))
              .attr("y2", self.svg.attr("height"))
              .attr("class", "from" + getClassId(msg.select(".sent"))
                + " to" + getClassId(msg.select(".recv")))

          msg
            .select("line")
            .transition().duration(self._transitionDuration)
            // DO NOT USE msg.select(".recv").attr("cy")
            // -> Attribute cy is blocked by circle transition
            .attr("y1", self.pixelPos[d[SENT]])
            .attr("y2", self.pixelPos[d[RECV]])
        }
      })

    function getClassId(circle: d3.Selection<SVGElement, {}, HTMLElement, any>) {
      return self.nodes.find(d => circle.classed(d.id)).id
    }
  }

  // Time scale update
  public updateTimeScale(status: string, time: number = undefined) {

    if (this.times !== undefined && this.times.length !== 0) {
      this.timeScale
        .domain([this.times[this.times.length - 1], this.times[0]])
        .range([this.pixelPos[this.pixelPos.length - 1] + this.offset, this.pixelPos[0] + this.offset])
        .interpolate(d3.interpolateRound)
      if (status === "idle") {
        this.axis
          .transition().duration(this._transitionDuration)
          .call(d3
            .axisLeft(this.timeScale)
            .ticks((this.pixelPos[this.pixelPos.length - 1] - this.pixelPos[0]) / this.tickSpace) as any
            // .tickFormat(d3.timeFormat(this.timeFormat)) as any
          )
      }
      else if (status === "sliderMove") {
        this.svgScale
          .select('g')
          .call(d3
            .axisLeft(this.timeScale)
            .tickValues([time])
            // .tickFormat(d3.timeFormat(this.timeFormat))
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
        // .text(d3.timeFormat(this.dateFormat)(time))
      }
    }
  }

  private updatePopupPos() {
    // Update popup cy position if corresponding message node has moved
    const self = this
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
          .duration(self._transitionDuration)
          .style("top", top + "px")
      })
  }

  private updateXPos() {
    const self = this
    // const parent = d3.select("#svg-chart-container").node() as HTMLElement
    // const width = Math.max(
    //   this.minSpaceX * (this.nodes.length + 2 * this.padding),
    //   parent.clientWidth - this.scaleWidth
    // )
    const width = this.minSpaceX * (this.nodes.length + 2 * this.padding)
    this.svg.style("width", width)
    this.svgLabels.style("width", width)

    this.xScale
      .domain(this.nodes.map(d => d.id))
      .range([0, width])
      .padding(this.padding)
      .round(true)

    this.nodes.forEach((d: NodesEntity) => {
      const idElements = d3.select(this.container).selectAll(`.${d.id} `)
      const x = self.xScale(d.id)
      idElements.filter(".label").attr("x", x)
      idElements.filter(".pin").attr("x", x)
      idElements.filter(".vline").attr("x1", x).attr("x2", x)
      idElements.filter(".popup-label").style("left", x + "px")
      idElements.filter("circle").attr("cx", x)

      d3.select(this.container)
        .selectAll(".popup")
        .filter(`.to${d.id}`)
        .filter("." + "recv")
        .style("left", x + "px")
      d3.select(this.container)
        .selectAll(".popup")
        .filter("." + d.id).filter("." + "sent")
        .style("left", x + "px")

      this.svg.selectAll(".from" + d.id).attr("x1", x)
      this.svg.selectAll(".to" + d.id).attr("x2", x)
    })

    this.lineCursor("updateX")
  }

  private toggleHide(button: HTMLElement, id: string) {
    const node = this.nodes.find(d => d.id === id)
    node.display = node.display === "block" ? "none" : "block"
    button.innerText = node.display === "block" ? "HIDE" : "SHOW"
    this.svg
      .selectAll(".chart-message")
      .filter("." + node.id)
      .style("display", node.display)
    this.svgLabels
      .selectAll(".pin")
      .filter("." + node.id)
      .transition().duration(200)
      .style("fill-opacity", node.display === "block" ? 1 : 0.5)
    d3
      .selectAll(".popup")
      .filter("." + node.id)
      .style("display", node.display)
  }

  private toggleFocus(button: HTMLElement, id: string) {
    const node = this.nodes.find(d => d.id === id)
    switch (button.innerText) {
      case "FOCUS":
        this.nodes.forEach(d => { d.display = d.id === node.id ? "block" : "none" })
        d3.selectAll(".hide-button")
          .data(this.nodes)
          .text((d: NodesEntity) => d.id === id ? "HIDE" : "SHOW")
        d3.selectAll(".focus-button")
          .data(this.nodes)
          .text((d: NodesEntity) => d.id === id ? "UNFOCUS" : "FOCUS")
        this.svg.selectAll(".chart-message").style("display", "none")
        this.svg.selectAll(".chart-message").filter("." + node.id).style("display", "block")
        d3.selectAll(".popup").style("display", "none")
        d3.selectAll(".popup").filter("." + node.id).style("display", "block")
        this.svgLabels.selectAll(".pin").transition().duration(200).style("fill-opacity", 0.5)
        this.svgLabels.selectAll(".pin").filter("." + node.id).transition().duration(200).style("fill-opacity", 1)
        break

      case "UNFOCUS":
        this.nodes.forEach(d => d.display = "block")
        button.innerText = "FOCUS"
        this.svg.selectAll(".chart-message").style("display", "block")
        d3.selectAll(".popup").style("display", "block")
        d3.selectAll(".hide-button").text("HIDE")
        this.svgLabels.selectAll(".pin").transition().duration(200).style("fill-opacity", 1)
        break
    }
  }

  public toggleState(circle: SVGElement, msg: datai, status: number): boolean {
    const status_string = status === SENT ?
      "sent" : status === RECV ? "recv" : undefined

    if (d3.select(circle).classed("selected")) {
      d3.select(circle)
        .attr("fill", msg.color)
        .attr("stroke", "transparent")
        .classed("selected", false)

      d3.select("#popup" + circle.parentElement.id + status_string).remove()

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

    const popup = d3
      .select(this.svg.node().parentElement)
      .append("div")
      .style("transform", () => {
        // If circle is on the last vertical line, show message to its left (right otherwise)
        if (this.nodes[this.nodes.length - 1].id === host)
          return `translate(calc(${this.scaleWidth - 2 * this.r}px - 100%), ${this.offset}px)`
        return `translate(${this.scaleWidth + 2 * this.r}px, ${this.offset}px)`
      })
      .attr("class", `popup ${msg.fromNode} to${msg.toNode} ${status_string}`)
      .attr("id", "popup" + circle.parentElement.id + status_string)
      .style("width", this.popupWidth + "px")
      .style("max-height", this.popupMaxHeight + "px")
      .style("left", this.xScale(host) + "px")
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
      .attr("class", "popup-message")
      .text(str)

    const popupButtons = popup
      .insert("div", "div")
      .attr("class", "popup-buttons")
      .style("background", msg.color)

    const goToBtn = popupButtons
      .append("div")
      .attr("class", "icon-info go-to")

    goToBtn
      .append("span")
      .attr("class", "material-icons icon")
      .text("reply")

    goToBtn
      .append("span")
      .text("Go to")
      .style("font-style", "italic")

    popupButtons
      .append("div")
      .attr("class", "popup-close material-icons")
      .text("close")
      .on("click", function () {
        self.toggleState(circle, msg, status)
        d3.select(this.parentNode.parentNode as any).remove()
      })

    // Cannot use circle.getAttribute("cy") because the attribute is
    // blocked by the possible current translation transition of circles. 
    const cy = this.pixelPos[this.idxLut[parseInt(circle.parentElement.id)][status]]
    popup.style("top", this.getPopupTop(popup, cy) + "px")

    return goToBtn.node() as HTMLElement
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
        .select(`[id = "${idx}"]`)
        .classed("outlined", outlined)
  }

  public lineCursor(status: string, time: number = undefined) {
    if (status === "add") {
      const triStrokeWidth = 2
      const x1 = this.xScale(this.nodes[0].id) - this.r - triStrokeWidth
      const x2 = this.xScale(this.nodes[this.nodes.length - 1].id) + this.r + triStrokeWidth

      const g = this.svg
        .append("g")
        .attr("id", "line-cursor")
        .attr("visibility", "hidden")
      g
        .append("line")
        .attr("x1", x1)
        .attr("x2", x2)
      g
        .append("polygon")
        .attr("class", "triangle")
        .attr("points", `${x1 - 3}, -3 ${x1 - 3}, 3 ${x1}, 0`)
        .attr("stroke-width", triStrokeWidth)
      g
        .append("polygon")
        .attr("class", "triangle")
        .attr("points", `${x2 + 3}, -3 ${x2 + 3}, 3 ${x2}, 0`)
        .attr("stroke-width", triStrokeWidth)
    }

    else if (status === "updateY") {
      this.svg
        .select("#line-cursor")
        .attr("transform", `translate(0, ${this.timeScale(time)})`)
        .attr("visibility", "visible")
    }
    else if (status === "updateX") {
      const w1 = -3
      const w2 = 3
      const x1 = this.xScale(this.nodes[0].id) - this.r + w1
      const x2 = this.xScale(this.nodes[this.nodes.length - 1].id) + this.r + w2
      const cursor = this.svg.select("#line-cursor")
      cursor
        .select("line")
        .attr("x1", x1)
        .attr("x2", x2)
      cursor
        .selectAll("polygon")
        .data([[x1, w1], [x2, w2]])
        .attr("points", (d: Array<number>) => `${d[0] + d[1]}, -3 ${d[0] + d[1]}, 3 ${d[0]}, 0`)
    }
  }


  public setScroll(time: number) {
    const el = this.container
    el.scrollTop = this.timeScale(time) - (el.clientHeight - parseFloat(this.svgLabels.attr("height"))) / 2
  }

  public scrollDown() {

    if (this.autoScroll) {
      if (this.container.scrollHeight - this.container.scrollTop > 100 &&
        d3.active(this.container, "scroll") === null) {

        d3.select(this.container)
          .transition("scroll")
          .duration(this._transitionDuration)
          .tween("scrollTween", scrollTopTween(this.container.scrollHeight))
      }
    }

    function scrollTopTween(scrollTop: number) {
      return function () {
        let i = d3.interpolateNumber(this.scrollTop, scrollTop);
        return function (t: number) { this.scrollTop = i(t); };
      };
    }
    // if (set) {
    //   const container = this.svg.node().parentElement.parentElement
    //   container.scrollTop = container.scrollHeight
    //   d3.select("#scroll-button").classed("scroll-unset", false)
    // }
    // else {
    //   d3.select("#scroll-button").classed("scroll-unset", true)
    // }
  }

  public set autoScroll(val: boolean) {
    this._autoScroll = val
    if (!val)
      d3.select(this.container).interrupt("scroll")
    d3.select("#scroll-button").style("height", val ? "100%" : "18px")
  }

  public get autoScroll() {
    return this._autoScroll
  }

  private setTransitionDuration() {
    this._transitionDuration = 200
  }

  public parseTime(time: Date) {
    return d3.timeFormat(this.dateFormat + " " + this.timeFormat)(time)
  }

  public stop(node: NodesEntity) {

  }

  // public cursorTransition(time:Date) {
  //   const self = this
  //   d3.select("#line-cursor")
  //     .transition("replay")
  //     // .duration(this.times[this.times.length - 1] - this.times[0])
  //     .duration(50000)
  //     .ease(d3.easeLinear)
  //     .tween("cursorTween", cursorTween(this.timeScale(new Date(this.times[this.times.length - 1]))))
  //   // .attr("transform", `translate(0, ${})`)

  //   // this.times[this.times.length - 1] - this.times[0]

  //   function cursorTween(lastPos: number) {
  //     return function () {
  //       const bar = d3.select('.progress-bar')
  //       let i = d3.interpolateDate(time, new Date(self.times[self.times.length - 1]))
  //       let k = d3.interpolateNumber(parseFloat(bar.style("width")), 100)
  //       return function (t: number) {
  //         self.tickValue = i(t)
  //         self.updateTimeScale("replay")
  //         self.lineCursor("updateY")
  //         bar.style("width", k(t) + "%")
  //       }
  //     };
  //   }
  // }

  // public cursorTransition2() {
  //   d3.select("#line-cursor")
  //     .attr("transform", `translate(0, ${this.timeScale(new Date(this.times[0]))})`)
  //     .transition()
  //     .ease(d3.easeLinear)
  //     .tween("CursorTween", this.times[this.times.length - 1] - this.times[0])
  //     .attr("transform", `translate(0, ${this.timeScale(new Date(this.times[this.times.length - 1]))})`)
  // }
}


