import * as d3 from 'd3'
import { nodes } from './nodes'
import { Graph } from './graph'
import { Slider } from './slider'
import { datai, dataSent, dataRecv } from './message'
import { SENT, RECV, REPLAY } from './message'
import { Chart } from './chart'
import { Resizer } from './resizer'
import { getSortedIdx, supportsPassive } from './utils'

export function sayHi() {
  document.getElementById('settings-button').addEventListener('click', function () {
    togglePanel()
  })

  document.getElementById('close-button').addEventListener('click', function () {
    togglePanel()
  })

  document.getElementById('submit-button').addEventListener("click", function () {
    togglePanel()
    const v = new Viz()
    v.start()
  })
}

class Viz {

  static sources: Array<EventSource> = []

  static replay: d3.Transition<HTMLElement, unknown, null, undefined>

  nodes: nodes

  data: Array<datai>

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
    // close previous connections if any
    Viz.sources.forEach((e) => { e.close() })
    Viz.sources = []
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

    function messageListen() {

      self.graph.display()
      self.chart.display()

      self.stopReplay()

      document.getElementById("stop-button").innerText = "cancel"
      document.getElementById("stop-button").title = "Stop receiving messages"

      self.data = []

      self.nodes.nodes.forEach((node) => {
        // fetch(node.proxy + "/start")
        //   .then(response => { if (!response.ok) console.error("Server error: start node fail") })

        const sendSrc = new EventSource(node.proxy + "/sent")
        Viz.sources.push(sendSrc)
        sendSrc.onerror = () => self.printError(sendSrc)
        sendSrc.onopen = () => self.updateError(sendSrc)
        sendSrc.onmessage = function (e) {
          const dSent: dataSent = JSON.parse(e.data)

          if (add2Id.get(dSent.toAddr) !== undefined) {
            const msg: datai = {
              message: dSent.message,
              fromNode: node.id,
              toNode: add2Id.get(dSent.toAddr),
              timeSent: parseInt(dSent.timeSent),
              timeRecv: undefined,
              id: dSent.id,
              color: node.color
            }
            const insertIdx = getSortedIdx(msg.timeSent, self.data, (d: datai) => d.timeSent)

            if (liveOn === true)
              self.graph.showMsgTransition(msg, insertIdx, SENT)

            const circle = self.chart.addMsg(msg, insertIdx, SENT)

            self.data.splice(insertIdx, 0, msg)

            circleListen(circle, msg, SENT)
          }
        }

        const recvSrc = new EventSource(node.proxy + "/recv")
        Viz.sources.push(recvSrc)
        recvSrc.onerror = () => self.printError(recvSrc)
        recvSrc.onopen = () => self.updateError(recvSrc)
        recvSrc.onmessage = function (e) {
          const dRecv: dataRecv = JSON.parse(e.data)
          const fromNode = add2Id.get(dRecv.fromAddr)
          if (fromNode !== undefined) {
            for (let i = self.data.length - 1; i >= 0; i--) {
              const msg = self.data[i]
              if (msg.id === dRecv.id && msg.fromNode === fromNode && msg.timeRecv === undefined) {
                msg.timeRecv = parseInt(dRecv.timeRecv)
                const circle = self.chart.addMsg(msg, i, RECV)
                circleListen(circle, msg, RECV)
                if (liveOn === true)
                  self.graph.showMsgTransition(msg, i, RECV)
                break
              }
            }
          }
        }
      })
    }

    function circleListen(circle: SVGElement, msg: datai, status: number) {
      circle.onclick = function (this: SVGElement) {
        const selected = self.chart.toggleState(circle, msg, status)
        if (!selected) {
          const goToBtn = self.chart.addPopup(circle, msg, status)
          goToBtn.onclick = function (this: HTMLElement) {
            self.stopReplay()
            self.time = status === SENT ? msg.timeSent : msg.timeRecv
            self.slider.setWidth(
              (self.time - self.chart.times[0]) /
              (self.chart.times[self.chart.times.length - 1] - self.chart.times[0])
            )
            self.updateGraph(self.time)
            pauseLive()
            document.getElementById("play-button").innerText = "play_arrow"
          }
        }
      }
    }

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

    function stopListen() {
      document.getElementById("stop-button").onclick = function (this: any) {
        const button = document.getElementById("stop-button")
        console.log(self.chart.times)
        console.log(self.data)
        if (button.innerText === "sync") {
          startLive(true)
          messageListen()
        }
        else if (button.innerText === "cancel") {
          Viz.sources.forEach((e) => { e.close() })
          Viz.sources = []
          button.innerText = "sync";
          button.title = "Start receiving messages"
          pauseLive(true)
        }
      }
    }

    function startLive(restart = false) {
      const liveButtonStyle = document.getElementById("live-button").style

      if (restart === true)
        liveButtonStyle.cursor = "default"

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

    function speedListen() {
      document.getElementById('speed-slider').oninput = function (this: HTMLInputElement) {
        let value = parseFloat(this.value)
        const r = value % 10
        const tens = Math.floor(value / 10)
        const offset = 6
        const decimals = Math.max(0, offset - tens)
        value = (r === 0 ? 1 : r) * Math.pow(10, tens - offset)
        document.getElementById("speed-slider-value").innerText = value.toFixed(decimals) + "x"
        self.speed = value
        self.updateReplay()
      }
    }

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
          // self.chart.outlineMsg(false)
          self.chart.updateTimeScale("idle")
          // self.chart.lineCursor("remove")
          self.slider.mDown = false
        }
      })

      function update() {
        self.time = self.slider.per
          * (self.chart.times[self.chart.times.length - 1] - self.chart.times[0])
          + self.chart.times[0]

        self.updateGraph(self.time)
      }
    }

    // self.chart.container.addEventListener("wheel", function (e) {
    //   if (e.ctrlKey) {

    //   }
    //   // this.stopReplay()
    //   self.chart.autoScroll = false
    // }, supportsPassive ? { passive: true } : false)

    function actionsListen() {

      document.getElementById("stop-node-button").onclick = function (this: HTMLButtonElement) {
        const nodeId = document.getElementById("settings-node-id").innerText
        const node = self.nodes.nodes.find(d => d.id === nodeId)
        if (node !== undefined) {
          switch (this.innerText) {
            case "block":
              fetch(node.proxy + "/stop")
                .then(response => { if (!response.ok) console.error("Server error: stop node fail") })
              this.innerText = "play_circle"
              self.chart.stop(node)
              break
            case "play_circle":
              fetch(node.proxy + "/start")
                .then(response => { if (!response.ok) console.error("Server error: start node fail") })
              this.innerText = "block"
              break
          }
        }
      }
    }

    function downloadListen() {

      document.getElementById("download-button").onclick = function () {
        const data = self.data.map((d: datai) => {
          let message = JSON.stringify(d.message, null, null).replace(/,/g, ';')//.replace(/,/g, '","').replace(/"/g, '"""').replace(/\n/g, '"\n"')
          //message = '"' + message + '"'

          return {
            "Message": message,
            "Source node": d.fromNode,
            "Target node": d.toNode,
            "Time sent": self.chart.parseTime(new Date(d.timeSent)),
            "Time received": self.chart.parseTime(new Date(d.timeRecv)),
            "ID": d.id,
            "Color": d3.color(d.color).formatHex()
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
  }

  updateGraph(t: number) {
    const timeDate = new Date(this.time)
    this.slider.timer.innerText = this.chart.parseTime(timeDate)
    this.chart.updateTimeScale("sliderMove", t)
    this.chart.lineCursor("updateY", t)
    this.chart.setScroll(t)

    this.data.forEach((msg, idx) => {
      const timeSent = msg.timeSent
      const timeRecv = msg.timeRecv

      if ((timeSent < timeRecv && t >= timeSent && t <= timeRecv) ||
        (timeSent > timeRecv && t <= timeSent && t >= timeRecv)) {
        this.graph.showMsg(msg, idx, (t - timeSent) / (timeRecv - timeSent))
        this.chart.outlineMsg(true, idx)
      }
      else if (t === timeRecv && t === timeSent) {
        this.graph.showMsg(msg, idx, 0.5)
        this.chart.outlineMsg(true, idx)
      }

      else {
        this.graph.clearMsgNodes([idx])
        this.chart.outlineMsg(false, idx)
      }
    })
  }

  replay() {
    const self = this
    this.chart.autoScroll = false
    d3.select("#viz")
      .transition("replay")
      .duration((self.chart.times[self.chart.times.length - 1] - self.time) / this.speed)
      .ease(d3.easeLinear)
      .tween("replayTween", replayTween)
      .on("end", () => document.getElementById("play-button").innerText = "replay")


    function replayTween() {
      let i = d3.interpolateNumber(self.time, self.chart.times[self.chart.times.length - 1])
      return function (t: number) {
        self.time = i(t)
        self.slider.setWidth(
          (self.time - self.chart.times[0]) /
          (self.chart.times[self.chart.times.length - 1] - self.chart.times[0])
        )
        self.updateGraph(self.time)
      }
    }

  }

  updateReplay() {
    if (d3.active(document.getElementById("viz"), "replay") !== null) {
      this.stopReplay()
      this.replay()
    }
  }

  stopReplay() {
    d3.select("#viz").interrupt("replay")
  }

  printError(ev: EventSource) {
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

  updateError(ev: EventSource = null) {
    const self = this

    if (ev === null) {
      document.querySelectorAll(".error-message").forEach(el => el.remove())
      d3.select("#error-icon").interrupt()
      document.getElementById("error-icon").style.visibility = "hidden"
      document.getElementById("error-container-header").style.visibility = "hidden"

    }
    else {
      // Update error URLs
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
