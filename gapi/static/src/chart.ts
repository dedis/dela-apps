import * as d3 from 'd3'
import { NodesEntity } from "./nodes"
import { datai, SENT, RECV } from './message'
import { getSortedIdx, supportsPassive, cssTransformParsing } from './utils'
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
 * @param mouseTime tracks mouse position inside svg
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
  mouseTime: number
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
    this.padding = 0.2

    this.scaleWidth = 80
    this.scaleAxisWidth = 1
    this.tickSpace = 100
    this.dateFormat = "%m/%d/%Y"
    this.timeFormat = "%H:%M:%S.%L"

    this.popupWidth = 210
    this.popupMaxHeight = 160

    this.minSpaceX = 40
    this.maxSpaceY = 200

    this.setTransitionDuration()

    this._autoScroll = true
  }

  public display() {
    const self: Chart = this
    // Remove all previous chart element since last Load
    this.svg.selectAll('*').remove()
    this.svgLabels.selectAll('*').remove()
    this.svgScale.selectAll('*').remove()
    d3.selectAll(".popup").remove()
    d3.selectAll(".popup-label").remove()

    this.times = []
    this.pixelPos = []
    this.idxLut = []

    // Resize main elements to fit in window
    const width = Math.max(
      this.minSpaceX * (this.nodes.length + 2 * this.padding),
      this.container.clientWidth - this.scaleWidth
    )
    this.svg.attr("width", width)
    this.svgLabels.attr("width", width)
    this.svgScale.attr("width", this.scaleWidth)
    d3.select("#padding").style("width", this.scaleWidth + "px")

    this.xScale
      .domain(this.nodes.map(d => d.id))
      .range([0, width])
      .padding(this.padding)
      .round(true)

    // Adds text labels (IDs AA, AB, AC,...)
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

    // Get text size of label to place colored pin correctly
    const textHeight = (this.svgLabels.select("text").node() as SVGTextElement).getBBox().height
    this.svgLabels.attr("height", textHeight + this.pinWidth + this.gapLabelPin)
    d3.select("#padding").style("height", textHeight + this.pinWidth + this.gapLabelPin + "px")

    // Adds colored square pins underneath text labels
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
          .select(".popup-label." + d.id)
          .style("display", "block")
      })

    addLabelPopup()

    // Adds vertical lines to chart
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

    // Adds messages group and tranlsate so that first message is not cut off
    this.svg
      .append("g")
      .attr("class", "chart-messages")
      .attr("transform", `translate(0, ${this.offset})`)

    this.axis = this.svgScale
      .append("g")
      .attr("transform", `translate(${this.scaleWidth - this.scaleAxisWidth},0)`)

    this.lineCursor("add")

    /**
     * Show label popup with Hide and Focus buttons
     */
    function addLabelPopup() {
      // If user clicks anywhere else, remove all label popups
      d3.select("body").on("mouseup",
        () => d3.selectAll(".popup-label").style("display", "none"))

      // Adds label popups. If last node: show popup on the left of square pin
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
      // Add Hide button
      popup
        .append("button")
        .attr("class", "viz-button hide-button")
        .text("HIDE")
        .style("background", (d: NodesEntity) => d.color)
        .on("click", function (this, d) {
          self.toggleHide(this, d.id)
        })
      // Add focus button
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

  /**
   * Function called by Viz to add chart messages (circles and lines SVG)
   * @param msg message to add 
   * @param idx idx (or visualization id) of message
   * @param status if the message was sent or received
   * @returns the circle that was added to the chart so that Viz can add listeners on it
   */
  public addMsg(msg: datai, idx: number, status: number): SVGElement {
    const time = status === SENT ? msg.timeSent : status === RECV ? msg.timeRecv : undefined
    const host = status === SENT ? msg.fromNode : status === RECV ? msg.toNode : undefined
    const status_string = status === SENT ? "sent" : status === RECV ? "recv" : "unknown"
    const self = this

    if (status === SENT) {
      // Sort messages IDs (visualization ID)
      this.svg
        .selectAll(".chart-message")
        .each(function (this: SVGElement): void {
          const id = parseInt(this.id)
          if (id >= idx)
            this.id = (id + 1).toString()
        })
      // Reorder popup IDs if necessary
      d3
        .selectAll(".popup")
        .each(function (this: HTMLDivElement) {
          const id = parseInt(this.id.slice("popup".length, -1 * "sent".length))
          if (id >= idx) {
            this.id = "popup" + (id + 1) + status_string
          }
        })
      // Insert new message group in correct position
      // Message group contains send and receive circles and connecting line
      this.svg
        .select(".chart-messages")
        .insert("g", `[id = "${idx + 1}"]`)
        .attr("class", "chart-message")
        .attr("id", idx)
        .attr("display", displayMsg)
    }

    // Adds circle (sent or recv)
    const circle = this.svg
      .select(".chart-messages")
      .select(`[id = "${idx}"]`)
      .append("circle")
      .attr("class", host + " " + status_string)
      .attr("cx", this.xScale(host))
      .attr("cy", this.svg.attr("height"))
      .attr('r', this.r)
      .attr('fill', msg.color)
      .attr('stroke', "transparent")
      .attr("stroke-width", 10 + "px")

    // Insert the new timestamp in the sorted time array {times}
    const sortedIdx = getSortedIdx(time, this.times)
    this.times.splice(sortedIdx, 0, time)
    // Update the look up table that matches idx from {data} in Viz class, to idx from {times} in Chart class
    this.idxLut = this.idxLut.map(d => d.map(d => { if (d >= sortedIdx) return d + 1; else return d }))
    if (status === SENT)
      this.idxLut.splice(idx, 0, [sortedIdx, undefined])
    else if (status === RECV)
      this.idxLut[idx][RECV] = sortedIdx

    this.updatePos()

    return circle.node() as SVGElement

    function displayMsg() {
      const fromNodeHidden = d3.select(".popup-label." + msg.fromNode).classed("hidden")
      const toNodeHidden = d3.select(".popup-label." + msg.toNode).classed("hidden")
      const focusedNode = self.nodes.find(node => d3.select(".popup-label." + node.id).classed("focused"))

      if (focusedNode !== undefined)
        return focusedNode.id === msg.fromNode || focusedNode.id === msg.toNode ? "block" : "none"

      if (fromNodeHidden || toNodeHidden)
        return "none"

      return "block"
    }
  }

  public listen() {
    const self = this

    document.getElementById('clear-messages-button').onclick = function () {
      self.clearPopups()
    }
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
        self.mouseTime = self.timeScale.invert(e.offsetY)
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
        this.scrollTop = self.timeScale(self.mouseTime)
          - self.mousePosContainer
          + this.getBoundingClientRect().top + parseFloat(self.svgLabels.attr("height"))

        self.maxSpaceY = Math.max(0, self.maxSpaceY - 10 * Math.sign(e.deltaY))
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

  /**
   * Updates the position of every chart element such as the svg size,
   * the vertical lines size, the circles and lines positions, the popup positions,
   * the timescale, the cursor.
   */
  private updatePos() {
    const timeDiff = []
    // Find the new circles position {PixelPos} on the chart
    // First check if the maximum time between two messages has changed
    // If so, rescale linearly so that the maximum space between two messages is respected
    // TO DO: too computationaly expensive -> to be removed
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

    // Updates chart SVG size
    this.svg
      .transition().duration(this._transitionDuration)
      .attr("height", vlineHeight + margin)

    // Updates vertical lines size
    this.svg
      .select(".chart-vlines")
      .selectAll("line")
      .transition().duration(this._transitionDuration)
      .attr("y2", vlineHeight + this.offset)

    // Save time corresponding to cursor position before we change timescale
    // TO DO: this is not optimal, we should provide linecursor with time property from Viz class
    const translateCoords = cssTransformParsing("translate", this.svg.select("#line-cursor").attr("transform"))
    const cursorTime = this.timeScale.invert(translateCoords[1])

    this.updateTimeScale("idle")
    this.updateMsgPos()
    this.updatePopupPos()
    this.scrollDown()
    // Update linecursor with its new position
    this.lineCursor("updateY", cursorTime)
  }

  /**
   * Updates messages positions including circles and connecting lines
   */
  private updateMsgPos() {
    const self = this

    this.svg
      .selectAll(".chart-message")
      .data(this.idxLut)
      .each(function (this: SVGElement, d): any {
        const msg = d3.select(this)
        const idSent = getClassId(msg.select(".sent"))

        // Updates X and Y positions of sent circles
        msg
          .select(".sent")
          .transition().duration(self._transitionDuration)
          .attr("cy", self.pixelPos[d[SENT]])
          .attr("cx", self.xScale(idSent))

        // Add link/path between sent and recv circles if recv exists
        if (!msg.select(".recv").empty()) {
          const idRecv = getClassId(msg.select(".recv"))
          // Updates X and Y positions of recv circles
          msg
            .select(".recv")
            .transition().duration(self._transitionDuration)
            .attr("cy", self.pixelPos[d[RECV]])
            .attr("cx", self.xScale(idRecv))

          // If connecting line/path was not yet added: add it
          if (msg.select("line, path").empty()) {

            // If message sent to itself, link the sent and recv events with an arc (path)
            if (idSent === idRecv) {
              const x1 = msg.select(".sent").attr("cx")
              const x2 = x1
              const y1 = self.pixelPos[d[SENT]]
              const y2 = self.pixelPos[d[RECV]]
              const dxc = self.nodes[self.nodes.length - 1].id === idSent ? -0.2 * self.minSpaceX : 0.2 * self.minSpaceX
              const xc = parseFloat(x1) + dxc
              const yc = y1 + (y2 - y1) / 2
              msg
                .insert("path", "circle")
                .attr("d", `M${x1},${y1} Q${xc},${yc} ${x2},${y2}`)
              // .attr("class", "from" + idSent + " to" + idRecv)
            }
            // If hosts of sent and recv events are different, link both with a line
            else {
              msg
                .insert("line", "circle")
                .attr("x1", self.xScale(idSent))
                .attr("x2", self.xScale(idRecv))
                .attr("y1", self.svg.attr("height"))
                .attr("y2", self.svg.attr("height"))
              // .attr("class", "from" + idSent + " to" + idRecv)
            }
          }

          // Updates line and path positions
          if (!msg.select("line").empty())
            msg
              .select("line")
              .transition().duration(self._transitionDuration)
              // DO NOT USE msg.select(".recv").attr("cy")
              // -> Attribute cy is blocked by circle transition
              .attr("x1", self.xScale(idSent))
              .attr("x2", self.xScale(idRecv))
              .attr("y1", self.pixelPos[d[SENT]])
              .attr("y2", self.pixelPos[d[RECV]])
          if (!msg.select("path").empty()) {
            // const idSent = getClassId(msg.select(".sent"))
            const x1 = self.xScale(idSent)
            const x2 = x1
            const y1 = self.pixelPos[d[SENT]]
            const y2 = self.pixelPos[d[RECV]]
            const dxc = self.nodes[self.nodes.length - 1].id === idSent ? -0.2 * self.minSpaceX : 0.2 * self.minSpaceX
            const xc = x1 + dxc
            const yc = y1 + (y2 - y1) / 2
            msg
              .select("path")
              .transition().duration(self._transitionDuration)
              .attr("d", `M${x1},${y1} Q${xc},${yc} ${x2},${y2}`)
          }

        }
      })

    /**
     * Retrieves the node ID from SVG circle's class
     * Each circle has the node ID as class (the node ID corresponding to the node processing the event)
     * @param circle SVG circle
     * @returns the node ID
     */
    function getClassId(circle: d3.Selection<SVGElement, {}, HTMLElement, any>) {
      return self.nodes.find(d => circle.classed(d.id)).id
    }
  }

  /**
   * Timescale update
   * It has two states, one is "idle" that shows the entire timescale
   * and the other is "sliderMove" which shows only the time indicated by {time}
   * @param status different status when updating the timescale
   * @param time provided when status is "sliderMove"
   */
  public updateTimeScale(status: string, time: number = undefined) {

    if (this.times !== undefined && this.times.length !== 0) {
      // Timescale is interpolate round because it is not possible to set scroll 
      // with floating number. If not round, that implies that cursor is not well aligned with the scroll
      // when there is automatic scrolling when replaying or dragging the progress-bar for example
      // You can try to remove it and drag the progress bar, you will see the cursor shaking
      this.timeScale
        .domain([this.times[this.times.length - 1], this.times[0]])
        .range([this.pixelPos[this.pixelPos.length - 1] + this.offset, this.pixelPos[0] + this.offset])
        .interpolate(d3.interpolateRound)
      // When showing idle timescale, convert scale into milli-seconds because 
      // more precision is not supported when using Date libraries by d3/javascript
      if (status === "idle") {
        // Convert timestamps in milliseconds if micro or nano-seconds 
        // (13 is the number of digits in a millisecond unix timeStamp)
        const t0 = parseInt(this.times[0].toString().slice(0, 13))
        const tf = parseInt(this.times[this.times.length - 1].toString().slice(0, 13))
        this.axis
          .transition().duration(this._transitionDuration)
          .call(d3
            .axisLeft(this.timeScale.domain([tf, t0]))
            .ticks((this.pixelPos[this.pixelPos.length - 1] - this.pixelPos[0]) / this.tickSpace)
            .tickFormat(d3.timeFormat(this.timeFormat)) as any
          )
      }
      // When showing one time only timescale, use full precision time scale and treat manually
      else if (status === "sliderMove") {
        // Retrieve remainder under millisecond precision
        const t = parseInt(time.toString().slice(0, 13))
        const remainder = time.toString().slice(13)
        // Add the one tick using d3 axis
        this.svgScale
          .select('g')
          .call(d3
            .axisLeft(this.timeScale)
            .tickValues([time])
          )
        // Replace the unique tick with correct date format (until millisecond)
        this.svgScale
          .select("text")
          .text(d3.timeFormat(this.timeFormat)(new Date(t)))

        // Adds remaining precision underneath (micro/nano-second)
        this.svgScale.select(".clone").remove()
        this.svgScale
          .select("text")
          .clone()
          .attr("class", "clone")

        const text = this.svgScale
          .select(".clone")
        text
          .attr("dy", parseFloat(text.attr("dy")) + 1 + "em")
          .text(remainder)
      }
    }
  }

  /** 
   * Updates the position of popups if they are opened
   */
  private updatePopupPos() {
    // Update popup Y position if corresponding message node has moved
    const self = this
    d3
      .selectAll(".popup")
      .each(function (this: HTMLDivElement) {
        const popup = d3.select(this)
        // Retrieve the visualization ID from the popup HTML id
        const id = parseInt(this.id.slice("popup".length, -1 * "sent".length))
        const status = popup.classed("sent") ?
          SENT : popup.classed("recv") ? RECV : undefined
        const cy = self.pixelPos[self.idxLut[id][status]]
        // Update X position 
        // If popup is too low in the chart, show it above its corresponding circle
        const top = self.getPopupTop(popup, cy)
        popup
          .transition().duration(self._transitionDuration)
          .style("top", top + "px")
          .style("left", self.xScale(getClassId(popup)) + "px")
      })

    /**
     * Retrieves the node ID from popup's class
     * @param popup corresponding popup
     * @returns the node ID
     */
    function getClassId(popup: d3.Selection<HTMLDivElement, {}, HTMLElement, any>) {
      const host = popup.classed("sent") ? "from" : popup.classed("recv") ? "to" : undefined
      return self.nodes.find(d => popup.classed(host + d.id)).id
    }
  }

  /**
   * Updates X position of all elements except circles and lines (messages)
   * used when there is a horizontal zoom
   */
  private updateXPos() {
    const self = this
    // Updates zoom based on the new value of {minSpaceX}
    const width = this.minSpaceX * (this.nodes.length + 2 * this.padding)
    this.svg.attr("width", width)
    this.svgLabels.attr("width", width)

    this.xScale
      .domain(this.nodes.map(d => d.id))
      .range([0, width])
      .padding(this.padding)
      .round(true)

    // Updates positions of labels, pins, vertical lines and label popups
    this.nodes.forEach((d: NodesEntity) => {
      const idElements = d3.select(this.container).selectAll(`.${d.id} `)
      const x = self.xScale(d.id)
      idElements.filter(".label").attr("x", x)
      idElements.filter(".pin").attr("x", x)
      idElements.filter(".vline").attr("x1", x).attr("x2", x)
      idElements.filter(".popup-label").style("left", x + "px")
    })

    this.lineCursor("updateX")
    this.updateMsgPos()
    this.updatePopupPos()
  }

  /**
   * Toggles hide of nodes.
   * Hide all messages and popups originating from the node (color segregation)
   * @param button Hide button from corresponding label popup
   * @param id node ID
   */
  private toggleHide(button: HTMLElement, id: string) {
    // TO DO: remove display property from nodes (unnecessary)
    const node = this.nodes.find(d => d.id === id)
    node.display = node.display === "block" ? "none" : "block"
    button.innerText = node.display === "block" ? "HIDE" : "SHOW"
    d3.select(".popup-label." + id).classed("hidden", node.display === "block" ? false : true)
    // Hide messages
    this.svg
      .selectAll(`circle.${node.id}.sent`)
      .each(function (this: SVGCircleElement) {
        this.parentElement.setAttribute("display", node.display)
      })

    // Opacify corresponding colored pin
    this.svgLabels
      .selectAll(".pin")
      .filter("." + node.id)
      .transition().duration(200)
      .style("fill-opacity", node.display === "block" ? 1 : 0.3)
    // Hide popups
    d3
      .selectAll(".popup")
      .filter(".from" + node.id)
      .style("display", node.display)
  }

  /**
   * Toggles focus of nodes.
   * Keep all messages send or received by the node
   * Not equivalent to hide all except this node
   * Only one node can be focused at a time
   * @param button Focus button from corresponding label popup
   * @param id node ID
   */
  private toggleFocus(button: HTMLElement, id: string) {
    const node = this.nodes.find(d => d.id === id)
    switch (button.innerText) {
      case "FOCUS":
        // Updates all text value of buttons in label popups
        this.nodes.forEach(d => { d.display = d.id === node.id ? "block" : "none" })
        d3.selectAll(".hide-button")
          .data(this.nodes)
          .text((d: NodesEntity) => d.id === id ? "HIDE" : "SHOW")
        d3.selectAll(".focus-button")
          .data(this.nodes)
          .text((d: NodesEntity) => d.id === id ? "UNFOCUS" : "FOCUS")
        d3.selectAll(".popup-label")
          .data(this.nodes)
          .classed("focused", (d: NodesEntity) => d.id === id ? true : false)
          .classed("hidden", (d: NodesEntity) => d.id === id ? false : true)
        // Show focused messages and popups
        this.svg.selectAll(".chart-message").attr("display", "none")
        this.svg
          .selectAll(`circle.${node.id}`)
          .each(function (this: SVGCircleElement) {
            this.parentElement.setAttribute("display", node.display)
          })
        d3.selectAll(".popup").style("display", "none")
        d3.selectAll(`.popup`).filter(`.to${node.id},.from${node.id}`).style("display", "block")
        this.svgLabels.selectAll(".pin").transition().duration(200).style("fill-opacity", 0.3)
        this.svgLabels.selectAll(".pin").filter("." + node.id).transition().duration(200).style("fill-opacity", 1)
        break

      case "UNFOCUS":
        d3.selectAll(".popup-label")
          .classed("focused", false)
          .classed("hidden", false)
        this.nodes.forEach(d => d.display = "block")
        button.innerText = "FOCUS"
        this.svg.selectAll(".chart-message").attr("display", "block")
        d3.selectAll(".popup").style("display", "block")
        d3.selectAll(".hide-button").text("HIDE")
        this.svgLabels.selectAll(".pin").transition().duration(200).style("fill-opacity", 1)
        break
    }
  }

  /**
   * Toggles between selected and unselected circles
   * @param circle SVG circle to toggle
   * @param msg message corresponding to circle
   * @param status if it was sent or recv
   * @returns if the circle was selected or not
   */
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

  /**
   * Adds popup next to circle
   * @param circle SVG circle to add popup next to
   * @param msg message corresponding to circle
   * @param status if it was sent or recv
   * @returns the GoTo button handled by Viz
   */
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
    const t = this.parseTime(time, false)

    // Add and position popup. Show popup on left of message if on far right.
    // Show popup on top of message if on bottom
    // Give the same ID than corresponding circle ex: "popup4sent"
    // ID needs to be unique so "popup4" not possible
    const popup = d3
      .select(this.svg.node().parentElement)
      .append("div")
      .style("transform", () => {
        // If circle is on the last vertical line, show message to its left (right otherwise)
        if (this.nodes[this.nodes.length - 1].id === host)
          return `translate(calc(${this.scaleWidth - 2 * this.r}px - 100%), ${this.offset}px)`
        return `translate(${this.scaleWidth + 2 * this.r}px, ${this.offset}px)`
      })
      .attr("class", `popup from${msg.fromNode} to${msg.toNode} ${status_string}`)
      .attr("id", "popup" + circle.parentElement.id + status_string)
      .style("width", this.popupWidth + "px")
      .style("max-height", this.popupMaxHeight + "px")
      .style("left", this.xScale(host) + "px")
      .style("background", msg.color)
      .on("click", function () {
        d3.select(this).raise()
      })

    // Adds text to popup
    popup
      .append("div")
      .attr("class", "info")
      .style("background", msg.color)
      .selectAll("div")
      .data([["info", info], ["access_time_filled", t], ["account_circle", msg.id]])
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

    // Adds buttons to popup
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

  /**
   * Gets "top" CSS property of popup.
   * If circle is on the last on y axis, show message above node (underneath otherwise)
   * @param popup 
   * @param cy cirlce y position
   * @returns CSS "top" property 
   */
  private getPopupTop(popup: any, cy: number): number {
    // We need to get the popup height after it has automatically resized when text was added
    const svgHeight = parseFloat(this.svg.attr("height"))
    const popupHeight = (popup.node() as HTMLElement).clientHeight
    return svgHeight - (cy + this.offset) > popupHeight ? cy : cy - popupHeight
  }

  public openPopup(idx: number) {
    d3.select(`[id = "${idx}"]`).select(".sent").dispatch("click")
  }

  public clearPopups() {
    d3.selectAll(".selected").dispatch("click")
  }

  /**
   * Highlight chart message when replay or progress bar is dragged
   * @param outlined if it should be outlined or not
   * @param idx idx/visualization ID of message
   */
  public outlineMsg(outlined: boolean, idx: number = undefined) {
    // if no idx is provided change all messages outline
    if (idx === undefined)
      this.svg
        .selectAll(".chart-message")
        .classed("outlined", outlined)
    else
      this.svg
        .select(`[id = "${idx}"]`)
        .classed("outlined", outlined)
  }

  /**
   * Handles the horizontal time indicator of the chart
   * @param status adds, updates y position or updates size of cursor
   * @param time time at which the cursor should indicate time (not provided when cursor is added)
   */
  public lineCursor(status: string, time: number = undefined) {
    if (status === "add") {
      const triStrokeWidth = 2 // width of small triangles on the sides of cursor
      const x1 = this.xScale(this.nodes[0].id) - this.r - triStrokeWidth
      const x2 = this.xScale(this.nodes[this.nodes.length - 1].id) + this.r + triStrokeWidth

      const g = this.svg
        .append("g")
        .attr("id", "line-cursor")
        .attr("transform", `translate(0, 3)`)
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

  /**
   * Set chart's scroll bar position
   * @param time time at which to position scroll bar
   */
  public setScroll(time: number) {
    const el = this.container
    el.scrollTop = this.timeScale(time) - (el.clientHeight - parseFloat(this.svgLabels.attr("height"))) / 2
  }

  /**
   * When {autoscroll} is on, automaticall scrolls to bottom
   * Using transitions here decreases performance a lot
   */
  public scrollDown() {

    // if (this.autoScroll)
    //   this.container.scrollTop = this.container.scrollHeight

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
        let i = d3.interpolateNumber(this.scrollTop, scrollTop)
        return function (t: number) { this.scrollTop = i(t) }
      }
    }
  }

  /**
   * autoscroll setter
   */
  public set autoScroll(val: boolean) {
    this._autoScroll = val
    if (!val)
      d3.select(this.container).interrupt("scroll")
    d3.select("#scroll-button").style("height", val ? "100%" : "18px")
  }

  /**
   * autoscroll getter
   */
  public get autoScroll() {
    return this._autoScroll
  }

  /**
   * Transition duration setter
   */
  private setTransitionDuration() {
    this._transitionDuration = 100
  }

  /**
   * Converts Unix timestamp (milli, micro or nano) into readable date with {timeformat} and {dateformat}
   * @param time 
   * @param withDate if the date needs to be included or not
   * @returns the converted time
   */
  public parseTime(time: number, withDate: boolean) {
    if (time === undefined)
      return "Unknown"

    // 13 is the number of digits in UnixMilli timestamp
    const t = parseInt(time.toString().slice(0, 13))
    let remainder = time.toString().slice(13)
    const l = remainder.length
    if (l > 1) // if there is microsecond precision
      remainder = "." + remainder
    if (l > 3) // if there is nanosecond precision
      remainder = remainder.slice(0, 4) + "." + remainder.slice(4)

    if (withDate)
      return d3.timeFormat(this.dateFormat + " - " + this.timeFormat)(new Date(t)) + remainder
    else
      return d3.timeFormat(this.timeFormat)(new Date(t)) + remainder
  }

  /**
   * TO DO
   * @param node 
   * @param name 
   */
  public toggleAction(node: NodesEntity, name: string) {

  }
}


