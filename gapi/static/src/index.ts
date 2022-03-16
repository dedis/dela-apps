import * as d3 from 'd3'
import { nodes } from './nodes'
import { Graph } from './graph'
import { Slider } from './slider'
import { datai, dataSent, dataRecv } from './message'
import { SENT, RECV, REPLAY } from './message'
import { Chart } from './chart'
import { Resizer } from './resizer'
import { getSortedIdx, supportsPassive } from './utils'
import { drag, text } from 'd3'

export function sayHi() {
  document.getElementById('settings-button').addEventListener('click', function () {
    togglePanel()
  })

  document.getElementById('close-button').addEventListener('click', function () {
    togglePanel()
  })

  searchBarListen()

  document.getElementById('submit-button').addEventListener("click", function () {
    togglePanel()
    const v = new Viz()
    v.start()
  })
}

/** All different IDs 
 * node.id: ID that is entered in the settings of the visualization for each node (AA, AB, ...)
 * message.id: Message ID included in the data received by Polypus, used to match sending and receiving events
 * HTML id or idx visualization ID: ID given by the visualization to identify messages 0,1,2,3,4,5,...
 */

/**
 * Viz class manages the overall visualization and other sub-classes like Chart and Graph
 * @param nodes Array of nodes given by user with properties: id, proxy, addr, ... (see nodes.ts)
 * @param data Array of messages received by nodes with properties: message, fromNode, toNode, ... (see message.ts)
 * @param recvBuffer Buffer of messages that were received and that have no corresponding sent event (so we save until we find one)
 * @param graph Main subclass for the graph
 * @param chart Main subclass for the chart
 * @param slider Main subclass for the progress bar in the playback controls
 * @param resizer Main subclass for the vertical bar between the chart and the graph used for resizing
 * @param time Current time of the visualization. Set by the replay, the progress bar or by the live mode
 * @param speed Playback speed of the visualization (replay speed)
 */

class Viz {

  static sources: Array<EventSource> = []

  static replay: d3.Transition<HTMLElement, unknown, null, undefined>

  nodes: nodes

  data: Array<datai>

  recvBuffer: Array<dataRecv>

  graph: Graph

  chart: Chart

  slider: Slider

  resizer: Resizer

  time: number

  speed: number

  constructor() {
    const inputData = document.getElementById('nodesData') as HTMLInputElement
    this.nodes = JSON.parse(inputData.value)
    this.data = []
    this.recvBuffer = []
    // Close previous connections if any
    Viz.sources.forEach((e) => { e.close() })
    Viz.sources = []
    // Remove previous error messages if any
    this.updateError()
  }

  start() {

    this.graph = new Graph(this.nodes.nodes)
    this.graph.listen()

    this.chart = new Chart(this.nodes.nodes)
    this.chart.listen()

    this.slider = new Slider("progress-viz")
    this.slider.listen()

    this.resizer = new Resizer("resizer")
    this.resizer.listen()

    this.listen()

    this.speed = 1

    document.getElementById("viz").style.visibility = "visible"
  }

  listen() {
    const self = this

    let liveOn: boolean = false

    const add2Id = new Map<string, string>()
    self.nodes.nodes.forEach((node) => {
      add2Id.set(node.addr, node.id)
    })

    messageListen()
    stopListen()
    playListen()
    speedListen()
    sliderListen()
    liveListen()
    startLive(true)
    actionsListen()
    downloadListen()
    self.searchListen()

    self.graph.display()
    self.chart.display()

    // Restart all nodes if they were stopped
    self.nodes.nodes.forEach((node) => {
      fetch(node.proxy + "/start")
        .then(response => { if (!response.ok) console.error("Server error: start node fail") })
    })

    function messageListen() {

      self.stopReplay()

      document.getElementById("stop-button").innerText = "cancel"
      document.getElementById("stop-button").title = "Stop receiving messages"

      self.nodes.nodes.forEach((node) => {
        // Retrieves messages that were sent
        const sendSrc = new EventSource(node.proxy + "/sent")
        Viz.sources.push(sendSrc)
        sendSrc.onerror = () => self.printError(sendSrc)
        sendSrc.onopen = () => self.updateError(sendSrc)
        sendSrc.onmessage = function (e) {
          const dSent: dataSent = JSON.parse(e.data)
          console.log(dSent)
          if (add2Id.get(dSent.toAddr) !== undefined) {
            const msg: datai = {
              message: dSent.message,
              // message: "HI",
              fromNode: node.id,
              toNode: add2Id.get(dSent.toAddr),
              timeSent: parseInt(dSent.timeSent),
              timeRecv: undefined,
              id: dSent.id,
              color: node.color
            }
            // Find the array index of the message based on its time sent when sorted
            const insertIdx = getSortedIdx(msg.timeSent, self.data, (d: datai) => d.timeSent)

            if (liveOn === true) {
              const graphCircle = self.graph.showMsgTransition(msg, insertIdx, SENT)
              self.graphCircleListen(graphCircle, msg.timeSent)
            }

            const chartCircle = self.chart.addMsg(msg, insertIdx, SENT)

            self.data.splice(insertIdx, 0, msg)

            chartCircleListen(chartCircle, msg, SENT)

            refreshTimer()

            // Check if sent event already has a corresponding recv event
            for (let i = 0; i < self.recvBuffer.length; i++) {
              const recv = self.recvBuffer[i]
              const fromNode = add2Id.get(recv.fromAddr)
              // Corresponding receiving and sending events should have the same id, source node (and target node)
              if (msg.id === recv.id && msg.fromNode === fromNode && msg.timeRecv === undefined) {
                console.log("found received event before sent")
                msg.timeRecv = parseInt(recv.timeRecv)
                const chartCircle = self.chart.addMsg(msg, insertIdx, RECV)
                chartCircleListen(chartCircle, msg, RECV)
                if (liveOn === true)
                  self.graph.showMsgTransition(msg, insertIdx, RECV)
                refreshTimer()
                break
              }
            }
          }
        }

        // Retrieves messages that were received
        const recvSrc = new EventSource(node.proxy + "/recv")
        Viz.sources.push(recvSrc)
        recvSrc.onerror = () => self.printError(recvSrc)
        recvSrc.onopen = () => self.updateError(recvSrc)
        recvSrc.onmessage = function (e) {
          const dRecv: dataRecv = JSON.parse(e.data)
          console.log(dRecv)
          const fromNode = add2Id.get(dRecv.fromAddr)
          // Find the sending event corresponding to this receiving one
          if (fromNode !== undefined) {
            for (let i = self.data.length - 1; i >= 0; i--) {
              const msg = self.data[i]
              // Corresponding receiving and sending events should have the same id, source node (and target node)
              if (msg.id === dRecv.id && msg.fromNode === fromNode && msg.timeRecv === undefined) {
                msg.timeRecv = parseInt(dRecv.timeRecv)
                const chartCircle = self.chart.addMsg(msg, i, RECV)
                chartCircleListen(chartCircle, msg, RECV)
                if (liveOn === true)
                  self.graph.showMsgTransition(msg, i, RECV)
                refreshTimer()
                return
              }
            }
            // If recv event doesnt have a corresponding sent event -> save into buffer
            self.recvBuffer.push(dRecv)
          }
        }
      })
    }

    // Event listeners on chart circles and popups 
    function chartCircleListen(circle: SVGElement, msg: datai, status: number) {
      circle.onclick = function (this: SVGElement) {
        // Clicking on circle can both open and close the popup
        const selected = self.chart.toggleState(circle, msg, status)
        // If popup was opened: add event listener on popup go-to button
        if (!selected) {
          const goToBtn = self.chart.addPopup(circle, msg, status)
          goToBtn.onclick = function (this: HTMLElement) {
            self.stopReplay()
            self.time = status === SENT ? msg.timeSent : msg.timeRecv
            self.slider.setWidth(
              (self.time - self.chart.times[0]) /
              (self.chart.times[self.chart.times.length - 1] - self.chart.times[0])
            )
            self.updateViz()
            pauseLive()
            document.getElementById("play-button").innerText = "play_arrow"
          }
        }
      }
    }



    // Event listener of play button
    function playListen() {
      document.getElementById("play-button").onclick = function (this: any) {
        if (this.innerText === "pause") {
          self.stopReplay()
          this.innerText = "play_arrow"

          if (liveOn === true) {
            pauseLive()
          }
        }
        else if (this.innerText === "play_arrow") {
          this.innerText = "pause"
          self.replay()
        }
        else if (this.innerText === "replay") {
          self.time = self.chart.times[0]
          self.slider.setWidth(0)
          this.innerText = "pause"
          self.replay()
        }
      }
    }

    function liveListen() {
      document.getElementById("live-button").onclick = function (this: any) {
        startLive()
      }
    }

    // Stop button closes all connections (stop the visualization from communicating with nodes)
    function stopListen() {
      document.getElementById("stop-button").onclick = function (this: any) {
        const button = document.getElementById("stop-button")
        console.log(self.chart.times)
        console.log(self.data)
        // Restart visualization with previous node settings (clear graph and chart)
        if (button.innerText === "sync") {
          startLive(true)
          messageListen()
        }
        // Close connections
        else if (button.innerText === "cancel") {
          Viz.sources.forEach((e) => { e.close() })
          Viz.sources = []
          button.innerText = "sync";
          button.title = "Start receiving messages"
          pauseLive(true)
        }
      }
    }

    // Start live mode 
    // If live is on: cursor is "default"
    // If live is not on and visualization NOT stopped: cursor is "pointer"
    // If visualization is stopped: cursor is "not-allowed"
    function startLive(restart = false) {
      const liveButtonStyle = document.getElementById("live-button").style

      if (restart === true)
        liveButtonStyle.cursor = "default"

      // If live is not on and visualization not stopped -> start live
      if (liveOn === false && liveButtonStyle.cursor !== "not-allowed") {
        const liveIconStyle = document.getElementById("live-icon").style

        self.graph.clearMsgNodes()
        self.stopReplay()
        liveOn = true
        liveIconStyle.color = "red"
        liveIconStyle.opacity = "1"
        liveIconStyle.cursor = "default"
        self.chart.autoScroll = true
        self.chart.scrollDown()
        self.slider.setWidth(1)
        document.getElementById("play-button").innerText = "pause";
        liveButtonStyle.cursor = "default"
      }
    }

    // Pause live if stop is false, stop the live if stop is true
    function pauseLive(stop = false) {
      const liveButtonStyle = document.getElementById("live-button").style

      if (stop === true)
        liveButtonStyle.cursor = "not-allowed"

      if (liveOn === true) {
        const liveIconStyle = document.getElementById("live-icon").style

        liveOn = false
        self.chart.autoScroll = false
        liveIconStyle.color = "#4a4a4a"
        liveIconStyle.opacity = "0.9"
        if (stop !== true)
          liveButtonStyle.cursor = "pointer"
      }
    }

    // Listens to playback speed slider which goes from 10^-(offset) to 10^(offset)
    // with discontinuous increments as follow:
    // 0.1,0.2,0.3,...,0.9,1,2,3,...,9,10,20,30,...,90,100,200,300,...
    function speedListen() {
      const offset = 6
      document.getElementById('speed-slider').oninput = function (this: HTMLInputElement) {
        let value = parseFloat(this.value)
        const r = value % 10
        const tens = Math.floor(value / 10)
        const decimals = Math.max(0, offset - tens)
        value = (r === 0 ? 1 : r) * Math.pow(10, tens - offset)
        document.getElementById("speed-slider-value").innerText = value.toFixed(decimals) + "x"
        self.speed = value
        self.updateReplay()
      }
    }

    // Event on progress bar drag
    function sliderListen() {
      self.slider.slider.addEventListener('mousedown', function () {
        self.chart.autoScroll = false
        pauseLive()
        document.getElementById("play-button").innerText = "play_arrow"
        self.stopReplay()
        update()
      })
      document.addEventListener('mousemove', function (e) {
        if (self.slider.mDown) {
          update()
        }
      })
      document.addEventListener('mouseup', function (e) {
        if (e.button == 0 && self.slider.mDown) {
          self.chart.updateTimeScale("idle")
          self.slider.mDown = false
        }
      })

      // Set current time of visualization according to the position of the progress bar
      function update() {
        self.time = self.slider.per
          * (self.chart.times[self.chart.times.length - 1] - self.chart.times[0])
          + self.chart.times[0]

        self.updateViz()
      }
    }

    // self.chart.container.addEventListener("wheel", function (e) {
    //   if (e.ctrlKey) {

    //   }
    //   // this.stopReplay()
    //   self.chart.autoScroll = false
    // }, supportsPassive ? { passive: true } : false)

    // Manage interactions with user's distributed system (in this case we can only start/stop a node)
    function actionsListen() {

      document.querySelectorAll(".action").forEach((el: HTMLButtonElement) => {
        el.onclick = function (this: HTMLButtonElement) {
          const nodeId = document.getElementById("settings-node-id").innerText
          const node = self.nodes.nodes.find(d => d.id === nodeId)

          if (node !== undefined) {
            switch (this.innerText) {
              case "block":
                fetch(node.proxy + "/stop")
                  .then(response => { if (!response.ok) console.error("Server error: stop node fail") })
                this.innerText = "play_circle"
                self.chart.toggleAction(node, "block")
                self.graph.toggleAction(node, "block")
                // TO DO: stop property not necessary for now
                node.stop = true
                break
              case "play_circle":
                fetch(node.proxy + "/start")
                  .then(response => { if (!response.ok) console.error("Server error: start node fail") })
                this.innerText = "block"
                self.chart.toggleAction(node, "block")
                self.graph.toggleAction(node, "block")
                node.stop = false
                break
              // Deafault way to manage actions (not operational yet)
              default:
                self.chart.toggleAction(node, "star")
                self.graph.toggleAction(node, "star")
                break
            }
          }
        }
      })
    }

    /**
     * Download data with csv format.
     * Replaces comma with semi-column in message content TO DO: escape commas instead of replace.
     */
    function downloadListen() {
      document.getElementById("download-button").onclick = function () {
        const data = self.data.map((d: datai) => {
          let message = JSON.stringify(d.message, null, null).replace(/,/g, ';')

          return {
            "Message": message,
            "Source node": d.fromNode,
            "Target node": d.toNode,
            "Time sent": self.chart.parseTime(d.timeSent, true),
            "Time received": self.chart.parseTime(d.timeRecv, true),
            "ID": d.id,
            "Color": d3.color(d.color).formatHex().slice(1)
          }
        })
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += Object.keys(data[0]) + "\r\n"
        data.forEach(d => {
          let row = Object.values(d).join(",");
          csvContent += row + "\r\n";
        })

        let encodedUri = encodeURI(csvContent)
        let link = document.createElement("a");
        link.setAttribute("href", encodedUri)
        link.setAttribute("download", "my_data.csv")
        link.click()
      }
    }

    /**
     * Updates the value of the time indicator on the right of progress bar
     * with the timestamp of the last event received
     */
    function refreshTimer() {
      document.getElementById("last-time").innerText =
        self.chart.parseTime(self.chart.times[self.chart.times.length - 1], false)
    }
  }

  /**
   * Main function that updates the chart, the graph, the timescale, the timestamp on bottom left,...
   * Used when the progress bar is dragged and as the callback function of the replay.
   * Also used when GoTo button is clicked on Popups
   */
  updateViz() {
    const t = Math.round(this.time)

    this.slider.currentTime.innerText = this.chart.parseTime(t, true)
    this.chart.updateTimeScale("sliderMove", t)
    this.chart.lineCursor("updateY", t)
    this.chart.setScroll(t)

    this.data.forEach((msg, idx) => {
      const timeSent = msg.timeSent
      const timeRecv = msg.timeRecv

      if ((timeSent < timeRecv && t >= timeSent && t <= timeRecv) ||
        (timeSent > timeRecv && t <= timeSent && t >= timeRecv)) {
        const circle = this.graph.showMsg(msg, idx, (t - timeSent) / (timeRecv - timeSent))
        if (circle !== undefined) this.graphCircleListen(circle, timeSent)
        this.chart.outlineMsg(true, idx)
      }
      else if (t === timeRecv && t === timeSent) {
        const circle = this.graph.showMsg(msg, idx, 0.5)
        if (circle !== undefined) this.graphCircleListen(circle, timeSent)
        this.chart.outlineMsg(true, idx)
      }

      else {
        this.graph.clearMsgNodes([idx])
        this.chart.outlineMsg(false, idx)
      }
    })
  }

  /** 
   * Main function that handles the animation of the replay.
   * Starts the replay from the last value of {time}
   * and continues until last event or interruption
   */
  replay() {
    const self = this
    this.chart.autoScroll = false
    d3.select("#viz")
      .transition("replay")
      .duration((self.chart.times[self.chart.times.length - 1] - self.time) / this.speed)
      .ease(d3.easeLinear)
      .tween("replayTween", replayTween)
      .on("end", () => document.getElementById("play-button").innerText = "replay")


    // Callback function
    function replayTween() {
      let i = d3.interpolateNumber(self.time, self.chart.times[self.chart.times.length - 1])
      return function (t: number) {
        self.time = i(t)
        self.slider.setWidth(
          (self.time - self.chart.times[0]) /
          (self.chart.times[self.chart.times.length - 1] - self.chart.times[0])
        )
        self.updateViz()
      }
    }
  }

  /**
   * Updates the replay when a parameter is changed like its playback speed
   */
  updateReplay() {
    if (d3.active(document.getElementById("viz"), "replay") !== null) {
      this.stopReplay()
      this.replay()
    }
  }

  /**
   * Interrupts the replay (user presses pause, drags the bar, etc...)
   */
  stopReplay() {
    d3.select("#viz").interrupt("replay")
  }

  /**
   * Listening event on messages (circles) from the graph. 
   * Onclick it will open correpsonding popup on the chart.
   * @param circle SVG to add listener to
   * @param t Time at which the corresponding message was sent (not received)
   */
  graphCircleListen(circle: SVGElement, t: number) {
    const self = this
    circle.onclick = function (this: SVGElement) {
      self.chart.updateTimeScale("sliderMove", t)
      self.chart.lineCursor("updateY", t)
      self.chart.setScroll(t)
      self.chart.openPopup(parseInt(circle.id.slice(1)))
    }
  }

  /**
   * Show URLs that the visualization fails to connect to in the settings pannel
   * @param ev EventSource used for corresponding URL
   */
  printError(ev: EventSource) {
    // Build error message
    if (!document.getElementById(ev.url)) {
      const el = document.createElement("div")
      el.id = ev.url
      el.classList.add("error-message")
      el.innerText = ev.url
      document.getElementById("error-messages-container").appendChild(el)
    }

    document.getElementById("error-icon").style.visibility = "visible"
    document.getElementById("error-container-header").style.visibility = "visible"

    // Error icon transition
    lowOpacity()
    function lowOpacity() {
      d3.select("#error-icon")
        .transition()
        .delay(2000)
        .duration(300)
        .style('opacity', 0.7)
        .on('end', highOpacity);
    }
    function highOpacity() {
      d3.select("#error-icon")
        .transition()
        .duration(300)
        .style('opacity', 1)
        .on('end', lowOpacity);
    }
  }

  /**
   * Remove URLs that the visualization finally connected 
   * or that are not in the list of node proxies anymore
   * @param ev EventSource used for corresponding URL
   */
  updateError(ev: EventSource = null) {
    const self = this

    // If no EventSource is given, reinitialize the error messages
    if (ev === null) {
      document.querySelectorAll(".error-message").forEach(el => el.remove())
      d3.select("#error-icon").interrupt()
      document.getElementById("error-icon").style.visibility = "hidden"
      document.getElementById("error-container-header").style.visibility = "hidden"

    }
    else {
      document.querySelectorAll(".error-message").forEach(el => {
        // Remove error URL if connection is now opened
        if (el.id === ev.url)
          el.remove()

        // Remove error URL if not in list of node proxies anymore
        if (!self.nodes.nodes.some(node => (el.id.slice(0, node.proxy.length) === node.proxy)))
          el.remove()
      })

      // Update style if there are no more URL errors
      if (document.querySelectorAll(".error-message").length === 0) {
        d3.select("#error-icon").interrupt()
        document.getElementById("error-icon").style.visibility = "hidden"
        document.getElementById("error-container-header").style.visibility = "hidden"
      }
    }
  }

  /**
   * Listener function for the search bar.
   * Trigger such by pressing Enter or the search icon.
   * Opens every popup that contains entered expression.
   */
  searchListen() {
    const searchBar = document.getElementById("search-bar") as HTMLInputElement

    searchBar.addEventListener("keydown", function (ev: KeyboardEvent) {
      if (ev.key === "Enter")
        search(this.value)
    })

    document.getElementById("search-icon").addEventListener("click", () => search(searchBar.value))

    const self = this
    function search(value: string) {
      // case-insensitive regExp
      const regExp = new RegExp(value, "i")
      self.chart.clearPopups()
      self.data.forEach((d, idx) => {
        // Test if popup contains regExp
        if (regExp.test(JSON.stringify(d.message, null, null)))
          self.chart.openPopup(idx)
      })
    }
  }
}

/**
 * closePanel hides or shows the settings panel and update the button
 * accordingly.
 */
function togglePanel() {
  document.getElementById('settings-button').classList.toggle('active')
  const content = document.getElementById('settings-panel')
  if (content.style.maxHeight) {
    content.style.maxHeight = null
  } else {
    content.style.maxHeight = content.scrollHeight + 'px'
  }
}

/**
 * Additional standard listeners on search bar that are operationnal before loading data
 * Allows users to enter expression in the search bar and use the delete button
 */
function searchBarListen() {
  const searchBar = document.getElementById("search-bar") as HTMLInputElement

  document.getElementById("search-delete").addEventListener("click", () => {
    searchBar.value = ""
    searchBar.parentElement.classList.add("empty")
  })

  // When search bar is empty: hide delete button and icon separator
  searchBar.addEventListener("input", function () {
    if (this.value === "") {
      this.parentElement.classList.add("empty")
    }
    else
      this.parentElement.classList.remove("empty")
  })
}
