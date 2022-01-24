import { nodes } from './nodes'
import { Graph } from './graph'
import { Slider } from './slider'
import { datai, dataSent, dataRecv } from './message'
import { SENT, RECV, REPLAY } from './message'
import { Chart } from './chart'
import { Resizer } from './resizer'
import { getSortedIdx } from './utils'

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

  static timeoutID: NodeJS.Timeout

  nodes: nodes

  data: Array<datai>

  graph: Graph

  chart: Chart

  slider: Slider

  resizer: Resizer

  constructor() {
    const inputData = document.getElementById('nodesData') as HTMLInputElement
    this.nodes = JSON.parse(inputData.value)
    this.data = []
    // close previous connections if any
    Viz.sources.forEach((e) => { e.close() })
    Viz.sources = []
  }

  start() {

    this.graph = new Graph(this.nodes.nodes)
    this.graph.listen()

    this.chart = new Chart(this.nodes.nodes)

    this.slider = new Slider("progress-viz")
    this.slider.listen()

    this.resizer = new Resizer("resizer")
    this.resizer.listen()

    this.listen()

    document.getElementById("viz").style.visibility = "visible"
  }

  listen() {
    const self = this

    let liveOn: boolean = false
    let autoScroll: boolean
    let nbMsg: number
    let replayFromIdx: number
    let speed: number = 1

    const messages = document.getElementById("svg-chart")

    const add2Id = new Map<string, string>()
    self.nodes.nodes.forEach((node) => {
      add2Id.set(node.addr, node.id)
    })

    messageListen()
    stopListen()
    // scrollListen()
    playListen()
    speedListen()
    sliderListen()
    liveListen()
    startLive(true)

    function messageListen() {

      self.graph.display()
      self.chart.display()

      clearTimeout(Viz.timeoutID)

      document.getElementById("stop-icon").innerText = "stop_circle"
      document.getElementById("stop-button").innerText = "Stop"
      nbMsg = 0
      self.data = []

      self.nodes.nodes.forEach((node) => {

        const sendSrc = new EventSource(node.proxy + "/sent")
        Viz.sources.push(sendSrc)
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
            if (replayFromIdx >= insertIdx)
              replayFromIdx++

            nbMsg++

            circleListen(circle, msg, SENT)

            if (autoScroll === true)
              messages.scrollTop = messages.scrollHeight
          }
        }

        const recvSrc = new EventSource(node.proxy + "/recv")
        Viz.sources.push(recvSrc)
        recvSrc.onmessage = function (e) {
          const dRecv: dataRecv = JSON.parse(e.data)
          const fromNode = add2Id.get(dRecv.fromAddr)
          if (fromNode !== undefined) {
            for (let i = self.data.length - 1; i >= 0; i--) {
              const msg = self.data[i]
              if (msg.id === dRecv.id && msg.fromNode === fromNode) {
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
      function circleListen(circle: SVGElement, msg: datai, status: number) {
        circle.onclick = function (this: SVGElement) {
          const selected = self.chart.changeCircleState(circle, msg)
          if (!selected) {
            const goToGraphBtn = self.chart.addPopup(circle, msg, status)
            goToGraphBtn.onclick = function (this: HTMLElement) {
              clearTimeout(Viz.timeoutID)
              pauseLive()
              // outlineMsg(this.id)
              self.slider.bar.style.width = parseInt(circle.parentElement.id) / nbMsg * 100 + "%"

              replayFromIdx = parseInt(circle.parentElement.id)
              document.getElementById("play-icon").innerText = "play_arrow"
            }
          }
        }
      }
    }

    function playListen() {
      document.getElementById("play-icon").onclick = function (this: any) {
        if (this.innerText === "pause") {
          clearTimeout(Viz.timeoutID)
          this.innerText = "play_arrow"

          if (liveOn === true) {
            replayFromIdx = nbMsg - 1
            pauseLive()
            // outlineMsg(replayFromIdx.toString())
          }
        }
        else if (this.innerText === "play_arrow") {
          this.innerText = "pause"
          replay()
        }
        else if (this.innerText === "replay") {
          replayFromIdx = 0
          self.slider.bar.style.width = "0%"
          this.innerText = "pause"
          replay()
        }
      }
    }

    function replay() {

      if (replayFromIdx !== undefined) {
        self.graph.clearMsgNodes()
        let replayIdx = replayFromIdx
        autoScroll = false
        setTimeout(function step() {
          let msg = self.data[replayIdx]
          const per = (replayIdx + 1) / nbMsg * 100

          self.graph.showMsgTransition(msg, replayIdx, REPLAY)
          self.slider.bar.style.width = per + "%"
          // outlineMsg(replayIdx.toString())

          // if (autoScroll === false)
          //   setScrollPer(messages, per)

          replayFromIdx = replayIdx
          replayIdx++

          if (replayIdx >= nbMsg) {
            document.getElementById("play-icon").innerText = "replay"
            return
          }
          const nextMsg = self.data[replayIdx]
          const time = nextMsg.timeSent - msg.timeSent
          Viz.timeoutID = setTimeout(step, time / speed)
        }, 10)
      }
    }

    function liveListen() {
      document.getElementById("live-button").onclick = function (this: any) {
        startLive()
      }
    }

    function stopListen() {
      document.getElementById("stop-button").onclick = function (this: any) {
        const icon = document.getElementById("stop-icon")
        const txt = document.getElementById("stop-button")
        console.log(self.chart.times)
        console.log(self.data)
        if (txt.innerText === "Restart") {
          startLive(true)
          messageListen()
        }
        else if (txt.innerText === "Stop") {
          Viz.sources.forEach((e) => { e.close() })
          Viz.sources = []
          txt.innerText = "Restart";
          icon.innerText = "restart_alt"
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
        clearTimeout(Viz.timeoutID)
        // removeScrollBtn()
        liveOn = true
        liveIconStyle.color = "red"
        liveIconStyle.opacity = "1"
        liveIconStyle.cursor = "default"
        autoScroll = true
        messages.scrollTop = messages.scrollHeight
        self.slider.bar.style.width = "100%"
        document.getElementById("play-icon").innerText = "pause";
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
        autoScroll = false
        liveIconStyle.color = "#4a4a4a"
        liveIconStyle.opacity = "0.9"
        if (stop !== true)
          liveButtonStyle.cursor = "pointer"
      }
    }

    function speedListen() {
      document.querySelectorAll(".speed-button").forEach((e: HTMLElement) => {
        e.onclick = function () {
          document.querySelectorAll(".speed-button").forEach((e: HTMLElement) => {
            if (e.innerHTML.slice(-1) === "x") {
              e.innerHTML = e.innerHTML.slice(0, -1)
              e.style.fontWeight = "normal"
            }
          })
          e.innerHTML = e.innerHTML + "x"
          e.style.fontWeight = "bold"
          speed = parseFloat(e.innerHTML)
        }
      })
    }

    function sliderListen() {
      self.slider.slider.addEventListener('mousedown', function () {
        pauseLive()
        document.getElementById("play-icon").innerText = "play_arrow"
        clearTimeout(Viz.timeoutID)
        self.chart.lineCursor("add")
        update()
      })
      document.addEventListener('mousemove', function (e) {
        if (self.slider.mDown) {
          update()
        }
      })
      document.addEventListener('mouseup', function (e) {
        if (e.button == 0 && self.slider.mDown) {
          self.chart.outlineMsg(false)
          self.chart.tickValue = undefined
          self.chart.updateTimeScale()
          self.chart.lineCursor("remove")
          self.slider.mDown = false
        }
      })

      function update() {
        const per = self.slider.per / 100
        let closestMsgId = Math.round(per * nbMsg)

        if (closestMsgId >= nbMsg)
          closestMsgId = nbMsg - 1
        replayFromIdx = closestMsgId

        autoScroll = false


        const t0 = self.chart.times[0]
        const t1 = self.chart.times[self.chart.times.length - 1]
        const elapsedTime = t1 - t0
        const t = Math.round(per * elapsedTime + t0)
        self.chart.tickValue = new Date(t)
        self.chart.updateTimeScale()
        self.chart.lineCursor("update")
        self.chart.setScroll()

        self.data.forEach((msg, idx) => {
          const timeSent = msg.timeSent
          const timeRecv = msg.timeRecv

          if ((timeSent < timeRecv && t >= timeSent && t <= timeRecv) ||
            (timeSent > timeRecv && t <= timeSent && t >= timeRecv)) {
            self.graph.showMsg(msg, idx, (t - timeSent) / (timeRecv - timeSent))
            self.chart.outlineMsg(true, idx)
          }
          else if (t === timeRecv && t === timeSent) {
            self.graph.showMsg(msg, idx, 0.5)
            self.chart.outlineMsg(true, idx)
          }

          else {
            self.graph.clearMsgNodes([idx])
            self.chart.outlineMsg(false, idx)
          }

        })
      }
    }

    // function outlineMsg(idx: string) {
    //   document.querySelectorAll(".outlined").forEach((e: HTMLElement) => e.classList.remove("outlined"))
    //   document.getElementById(idx).classList.add("outlined")
    // }

    // function scrollListen() {
    //   const scrollButton = document.getElementById("scroll-button")
    //   scrollButton.style.top = messages.clientHeight - 50 + "px"

    //   messages.addEventListener("wheel", function () {
    //     autoScroll = false
    //     scrollButton.style.opacity = "1"
    //     scrollButton.style.visibility = "visible"
    //   })

    //   window.addEventListener("resize", function () {
    //     scrollButton.style.top = messages.clientHeight - 50 + "px"
    //   })

    //   scrollButton.addEventListener("click", function () {
    //     messages.scrollTop = messages.scrollHeight
    //     autoScroll = true
    //     removeScrollBtn()
    //   })
    // }

    // function removeScrollBtn() {
    //   const scrollButton = document.getElementById("scroll-button")
    //   scrollButton.style.opacity = "0"
    //   scrollButton.style.visibility = "hidden"
    // }
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
