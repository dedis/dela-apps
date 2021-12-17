// import * as d3 from 'd3'
// import './stylesheets/styles.scss'
// import { graphi, NodesEntity } from './graph'
// import { SimulationNodeDatum } from 'd3'
import { graphi } from './graph'
import { GraphViz } from './graphviz'
import { Slider } from './slider'

// format of saved and manipulated data
interface datai {
  msgID: string
  timeSent: string
  fromId: string
  toId: string
  color: string
}

// format of received data
interface dataRcv {
  timeSent: string
  toAddr: string
}

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

  graph: graphi

  data: Array<datai>

  gviz: GraphViz

  slider: Slider

  constructor() {
    const inputData = document.getElementById('nodesData') as HTMLInputElement
    this.graph = JSON.parse(inputData.value)
    this.data = []
    // close previous connections if any
    Viz.sources.forEach((e) => { e.close() })
    Viz.sources = []
    // delete old messages
    document.querySelectorAll('.message').forEach(e => e.remove());
  }

  start() {

    this.gviz = new GraphViz(this.graph)
    this.gviz.display()
    this.gviz.listen()

    this.slider = new Slider("progress-viz")
    this.slider.listen()

    this.listen()

    document.getElementById("viz").style.visibility = "visible"
  }

  listen() {
    const self = this
    
    let liveOn        :boolean = false
    let autoScroll    :boolean
    let nbMsg         :number
    let replayFromIdx :number
    let replayIdx     :number
    let speed         :number = 1

    const messages = document.getElementById("messages")

    const add2Id = new Map<string, string>()
      self.graph.nodes.forEach((node) => {
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

      clearTimeout(Viz.timeoutID)
      
      document.getElementById("stop-icon").innerText = "stop_circle"
      document.getElementById("stop-button").innerText = "Stop"
      nbMsg = 0
      self.data = []

      self.graph.nodes.forEach((node) => {
        const trafficSrc = new EventSource(node.proxy)

        Viz.sources.push(trafficSrc)
        trafficSrc.onmessage = function (e) {
          const dRcv: dataRcv = JSON.parse(e.data)

          if (add2Id.get(dRcv.toAddr) !== undefined) {
            const msg: datai = {
              msgID: e.lastEventId,
              timeSent: dRcv.timeSent,
              fromId: node.id,
              toId: add2Id.get(dRcv.toAddr),
              color: node.color
            }
            self.data.push(msg)

            if (liveOn === true)
              self.gviz.showSend(msg.fromId, msg.toId, node.color)

            const div = document.createElement('div')
            builddMsg(div, msg)
            nbMsg++

            div.onclick = function(this: HTMLElement) {
              clearTimeout(Viz.timeoutID)
              pauseLive()
              outlineMsg(this.id)
              self.slider.bar.style.width = parseInt(this.id) / nbMsg * 100 + "%"
  
              replayFromIdx = parseInt(this.id)
              document.getElementById("play-icon").innerText = "play_arrow"
            }

            if (autoScroll === true)
              messages.scrollTop = messages.scrollHeight
          }
        }
      })
    }

    function playListen() {
      document.getElementById("play-icon").onclick = function(this:any) {
        if (this.innerText === "pause") {
          clearTimeout(Viz.timeoutID)
          this.innerText = "play_arrow"
          
          if (liveOn === true) {
            replayFromIdx = nbMsg - 1
            pauseLive()
            outlineMsg(replayFromIdx.toString())
          }
          else {
            replayFromIdx = replayIdx
          }
        }
        else if(this.innerText === "play_arrow"){
          this.innerText = "pause"
          replay()
        }
        else if(this.innerText === "replay"){
          replayFromIdx = 0
          self.slider.bar.style.width = "0%"
          this.innerText = "pause"
          replay()
        }
      }
    }

    function replay() {

      if (replayFromIdx !== undefined) {
        replayIdx = replayFromIdx
        autoScroll = false
        setTimeout(function step(){
          let msg = self.data[replayIdx]
          const per = (replayIdx+1) / nbMsg * 100

          self.gviz.showSend(msg.fromId, msg.toId, msg.color)
          self.slider.bar.style.width = per + "%"
          outlineMsg(replayIdx.toString())
          if (autoScroll === false)
            setScrollPer(messages, per)
          replayIdx++

          if (replayIdx>= nbMsg){
            document.getElementById("play-icon").innerText = "replay"
            return
          }
          // let date = new Date(parseInt(msg.time))
          // console.log(date)
          Viz.timeoutID = setTimeout(step, 1000/speed)
        }, 10) 
      }
    }

    function builddMsg(div: HTMLElement, msg: datai){
      document.querySelectorAll(".message").forEach((e:HTMLElement) => e.classList.remove("new"))
      div.className = "message new"
      div.id = nbMsg.toString()

      const divIdToId = document.createElement('div')
      divIdToId.className = "idToId"
      const divFromId = document.createElement('div')
      divFromId.appendChild(document.createTextNode(msg.fromId))
      const divToId = document.createElement('div')
      divToId.appendChild(document.createTextNode(msg.toId))
      const divArrow = document.createElement('div')
      divArrow.appendChild(document.createTextNode(' ⟶ '))

      const divTime = document.createElement('div')
      divTime.appendChild(document.createTextNode(msg.msgID))
      divTime.className = "time"

      divIdToId.appendChild(divFromId)
      divIdToId.appendChild(divArrow)
      divIdToId.appendChild(divToId)
      div.appendChild(divIdToId)
      div.appendChild(divTime)
      messages.appendChild(div)      
    }

    function liveListen(){
      document.getElementById("live-button").onclick = function(this:any){
        startLive()
      }
    }

    function stopListen() {
      document.getElementById("stop-button").onclick = function(this:any) {
        const icon = document.getElementById("stop-icon")
        const txt = document.getElementById("stop-button")

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

    function startLive(restart=false) {
      const liveButtonStyle = document.getElementById("live-button").style
      
      if (restart === true)
        liveButtonStyle.cursor = "default"

      if (liveOn === false && liveButtonStyle.cursor !== "not-allowed") {
        const liveIconStyle = document.getElementById("live-icon").style

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

    function pauseLive(stop=false) {
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
      document.querySelectorAll(".speed-button").forEach((e:HTMLElement) => {
        e.onclick = function(){
          document.querySelectorAll(".speed-button").forEach((e:HTMLElement) => {
            if (e.innerHTML.slice(-1) === "x") {
              e.innerHTML = e.innerHTML.slice(0,-1)
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
        let closestMsgId = Math.round(self.slider.per * nbMsg / 100)
        
        if (closestMsgId >= nbMsg)
          closestMsgId = nbMsg - 1

        replayFromIdx = closestMsgId
        self.slider.bar.style.width = closestMsgId / nbMsg * 100  + "%"
        outlineMsg(closestMsgId.toString())
        setScrollPer(messages, (closestMsgId + 1) / nbMsg * 100 )
      }
    }

    function outlineMsg(replayIdx: string) {
      document.querySelectorAll(".message").forEach((e:HTMLElement) => e.classList.remove("selected"))
      document.getElementById(replayIdx).classList.add("selected")
    }

    function scrollListen() {
      const scrollButton = document.getElementById("scroll-button")
      scrollButton.style.top = messages.clientHeight - 50 + "px"

      messages.addEventListener("wheel", function(){
        autoScroll = false
        scrollButton.style.opacity = "1"
        scrollButton.style.visibility = "visible"
      })

      window.addEventListener("resize", function () {
        scrollButton.style.top = messages.clientHeight - 50 + "px"
      })

      scrollButton.addEventListener("click", function() {
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

function getScrollPer(e: HTMLElement){
    const b = document.body
    const st = 'scrollTop'
    const sh = 'scrollHeight'

    return (e[st]||b[st]) / ((e[sh]||b[sh]) - e.clientHeight) * 100;
}

function setScrollPer(e: HTMLElement, per: number){
  const msgHeight = document.getElementById("scroll-button").clientHeight
  e.scrollTop = per * (e.scrollHeight - msgHeight) / 100 - e.clientHeight / 2
  console.log()
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