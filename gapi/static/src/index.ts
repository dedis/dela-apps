import { nodes } from './nodes'
import { Graph } from './graph'
import { Slider } from './slider'
import { datai, dataSent, dataRecv } from './message'
import { SENT, RECV, REPLAY } from './message'
import { Chart } from './chart'
import { getSortedIdx } from './utils'

export function sayHi() {
  //document.addEventListener('mousemove', function(e) {e.preventDefault()})

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

  constructor() {
    const inputData = document.getElementById('nodesData') as HTMLInputElement
    this.nodes = JSON.parse(inputData.value)
    this.data = []
    // close previous connections if any
    Viz.sources.forEach((e) => { e.close() })
    Viz.sources = []
    // delete old messages
    document.querySelectorAll('.message').forEach(e => e.remove());
  }

  start() {

    this.graph = new Graph(this.nodes.nodes)
    this.graph.listen()

    this.chart = new Chart(this.nodes.nodes)

    this.slider = new Slider("progress-viz")
    this.slider.listen()

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
    scrollListen()
    playListen()
    speedListen()
    sliderListen()
    liveListen()
    startLive()

    function messageListen() {

      self.graph.display()
      self.chart.display()

      clearTimeout(Viz.timeoutID)

      document.getElementById("stop-icon").innerText = "stop_circle"
      document.getElementById("stop-button").innerText = "Stop"
      nbMsg = 0
      self.data = []

      let idx = 0
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
            // const msgDiv = orderMsg(msg)

            if (liveOn === true)
              self.graph.showSend(msg, idx, SENT)

            const insertIdx = getSortedIdx(msg.timeSent, self.data, (d: datai) => d.timeSent)

            const chartMsg = self.chart.addSentMsg(msg, insertIdx)
            self.data.splice(insertIdx, 0, msg)

            idx++
            nbMsg++

            chartMsg.onclick = function (this: SVGElement) {
              self.chart.addPopup(this, msg, SENT)
              clearTimeout(Viz.timeoutID)
              pauseLive()
              // outlineMsg(this.id)
              self.slider.bar.style.width = parseInt(this.id) / nbMsg * 100 + "%"

              replayFromIdx = parseInt(this.id)
              document.getElementById("play-icon").innerText = "play_arrow"
            }

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
                self.chart.addRecvMsg(msg, i)
                if (liveOn === true)
                  self.graph.showSend(msg, i, RECV)
                break
              }
            }
          }
        }
      })
    }
    function orderMsg(msg: datai) {
      const msgDiv = buildMsgDiv(msg)
      if (self.data.length === 0) {
        self.data.push(msg)
        msgDiv.id = "0"
        messages.appendChild(msgDiv)
      }
      else {
        let insertIdx = self.data.length

        while (msg.timeSent < self.data[insertIdx - 1].timeSent)
          insertIdx--

        for (let i = insertIdx; i < self.data.length; i++) {
          const el = document.getElementById(i.toString())
          el.id = (parseInt(el.id) + 1).toString()
        }
        msgDiv.id = insertIdx.toString()
        document.getElementById((insertIdx - 1).toString()).after(msgDiv)
        self.data.splice(insertIdx, 0, msg)

        if (replayFromIdx >= insertIdx)
          replayFromIdx++
      }
      //TO DO: reorder node messages sent and not received
      return msgDiv
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

          self.graph.showSend(msg, replayIdx, REPLAY)
          self.slider.bar.style.width = per + "%"
          // outlineMsg(replayIdx.toString())

          if (autoScroll === false)
            setScrollPer(messages, per)

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

    function buildMsgDiv(msg: datai): HTMLElement {
      document.querySelectorAll(".new").forEach((e: HTMLElement) => e.classList.remove("new"))

      const div = document.createElement('div')
      div.className = "message new"

      const divIdToId = document.createElement('div')
      divIdToId.className = "idToId"
      const divFromId = document.createElement('div')
      divFromId.appendChild(document.createTextNode(msg.fromNode))
      const divToId = document.createElement('div')
      divToId.appendChild(document.createTextNode(msg.toNode))
      const divArrow = document.createElement('div')
      divArrow.appendChild(document.createTextNode(' ⟶ '))

      const divTime = document.createElement('div')
      divTime.appendChild(document.createTextNode(msg.timeSent.toString()))
      divTime.className = "time"

      divIdToId.appendChild(divFromId)
      divIdToId.appendChild(divArrow)
      divIdToId.appendChild(divToId)
      div.appendChild(divIdToId)
      div.appendChild(divTime)

      return div
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
          document.querySelectorAll('.message').forEach(e => e.remove());
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
        removeScrollBtn()
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
      self.slider.slider.addEventListener('mousedown', function (e: any) {
        pauseLive()
        document.getElementById("play-icon").innerText = "play_arrow"
        clearTimeout(Viz.timeoutID)
        update()
      })
      document.addEventListener('mousemove', function (e) {
        if (self.slider.mDown === true) {
          update()
        }
      })

      function update() {
        const per = self.slider.per
        let closestMsgId = Math.round(per * nbMsg / 100)

        if (closestMsgId >= nbMsg)
          closestMsgId = nbMsg - 1

        replayFromIdx = closestMsgId
        // self.slider.bar.style.width = closestMsgId / nbMsg * 100 + "%"
        setScrollPer(messages, (closestMsgId + 1) / nbMsg * 100)
        autoScroll = false

        const t0 = self.data[0].timeSent
        const t1 = self.data[self.data.length - 1].timeSent
        const elapsedTime = t1 - t0
        self.data.forEach((msg, idx) => {
          const t = per * elapsedTime / 100 + t0
          const timeSent = msg.timeSent
          const timeRecv = msg.timeRecv
          if (t >= timeSent && t < timeRecv) {
            self.graph.showMsg(msg, idx, (t - timeSent) / (timeRecv - timeSent))
            // document.getElementById(idx.toString()).classList.add("outlined")
          }
          else {
            self.graph.clearMsgNodes([idx])
            // document.getElementById(idx.toString()).classList.remove("outlined")
          }

        })
      }
    }

    function outlineMsg(idx: string) {
      document.querySelectorAll(".outlined").forEach((e: HTMLElement) => e.classList.remove("outlined"))
      document.getElementById(idx).classList.add("outlined")
    }

    function scrollListen() {
      const scrollButton = document.getElementById("scroll-button")
      scrollButton.style.top = messages.clientHeight - 50 + "px"

      messages.addEventListener("wheel", function () {
        autoScroll = false
        scrollButton.style.opacity = "1"
        scrollButton.style.visibility = "visible"
      })

      window.addEventListener("resize", function () {
        scrollButton.style.top = messages.clientHeight - 50 + "px"
      })

      scrollButton.addEventListener("click", function () {
        messages.scrollTop = messages.scrollHeight
        autoScroll = true
        removeScrollBtn()
      })
    }

    function removeScrollBtn() {
      const scrollButton = document.getElementById("scroll-button")
      scrollButton.style.opacity = "0"
      scrollButton.style.visibility = "hidden"
    }
  }
}

function setScrollPer(e: HTMLElement, per: number) {
  const msgHeight = document.getElementById("scroll-button").clientHeight
  e.scrollTop = per * (e.scrollHeight - msgHeight) / 100 - e.clientHeight / 2
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
