// import * as d3 from 'd3'
// import './stylesheets/styles.scss'
// import { graphi, NodesEntity } from './graph'
// import { SimulationNodeDatum } from 'd3'
import { graphi } from './graph'
import { GraphViz } from './graphviz'
import { Slider } from './slider'

// format of saved and manipulated data
interface datai {
  time: string
  fromId: string
  toId: string
  color: string
}

// format of received data
interface dataRcv {
  time: string
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

  document.getElementById('submitButton').addEventListener("click", function () {
    togglePanel()
    const v = new Viz()
    v.start()
  })

  // let messages = document.getElementById("messages")
  // let div = document.createElement('div')
  // let timeSpan = document.createElement('span')
  // let destSpan = document.createElement('span')
  // timeSpan.style.float = "left"
  // destSpan.style.float = "right"
  // timeSpan.appendChild(document.createTextNode("TIME"))
  // destSpan.appendChild(document.createTextNode("RECEIVER"))
  // div.appendChild(timeSpan)
  // div.appendChild(destSpan)

  // messages.appendChild(div)
}

class Viz {

  static sources: Array<EventSource> = []

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
    
    let showSend: boolean
    let userScroll: boolean
    let nbMsg: number
    let replayFromIdx: number = undefined
    let speed:number

    const messages = document.getElementById("messages")

    const add2Id = new Map<string, string>()
      self.graph.nodes.forEach((node) => {
        add2Id.set(node.addr, node.id)
        add2Id.set(`Orchestrator:${node.addr}`, node.id)
      })

    messageListen()
    stopListen()
    scrollListen()
    playListen()
    speedListen()
    
    function messageListen() {

      removeScrollBtn()

      document.getElementById("stop-icon").innerText = "stop"
      document.getElementById("stop-text").innerText = "Stop"
      document.getElementById("play-icon").innerText = "pause"
      document.getElementById("live-icon").style.color = "red"
      self.slider.bar.style.width = "100%"
      showSend = true
      userScroll = false
      nbMsg = 0
      speed = 1
      self.data = []
      // liveListen()
      

      self.graph.nodes.forEach((node) => {
        const trafficSrc = new EventSource(node.proxy)
        Viz.sources.push(trafficSrc)
        trafficSrc.onmessage = function (e) {
          const dRcv: dataRcv = JSON.parse(e.data)

          if (add2Id.get(dRcv.toAddr) !== undefined) {
            const msg: datai = {
              time: dRcv.time,
              fromId: node.id,
              toId: add2Id.get(dRcv.toAddr),
              color: node.color
            }
            self.data.push(msg)

            if (showSend === true)
              self.gviz.showSend(msg.fromId, msg.toId, node.color)

            const div = document.createElement('div')
            div.className = "message"
            div.id = nbMsg.toString()
            nbMsg++

            div.onclick = function(this:any) {
              showSend = false
              document.getElementById("play-icon").innerText = "play_arrow"
              self.slider.bar.style.width = parseInt(this.id) / nbMsg * 100 + "%"
              document.getElementById("live-icon").style.color = "#4a4a4a"
              document.getElementById("live-icon").style.opacity = "0.9"
              document.querySelectorAll(".message").forEach((e:HTMLElement) => e.style.borderStyle = "hidden")
              this.style.borderStyle = "solid"   
              
              replayFromIdx = parseInt(this.id)
            }
            
            const divIdToId = document.createElement('div')
            divIdToId.className = "idToId"
            const divFromId = document.createElement('div')
            divFromId.appendChild(document.createTextNode(msg.fromId))
            const divToId = document.createElement('div')
            divToId.appendChild(document.createTextNode(msg.toId))
            const divArrow = document.createElement('div')
            divArrow.appendChild(document.createTextNode(' ⟶ '))

            const divTime = document.createElement('div')
            divTime.appendChild(document.createTextNode(msg.time))
            divTime.className = "time"

            divIdToId.appendChild(divFromId)
            divIdToId.appendChild(divArrow)
            divIdToId.appendChild(divToId)
            div.appendChild(divIdToId)
            div.appendChild(divTime)
            messages.appendChild(div)
            //messages.insertBefore(div, document.getElementById("scroll-button"))

            if (userScroll === false)
              messages.scrollTop = messages.scrollHeight
          }
        }
      })
    }

    function playListen() {
      document.getElementById("play-icon").onclick = function(this:any) {
        if (this.innerText === "pause") {
          
          // liveListen()
          // if (showSend === true) {
          // TO DO
          // }
          // WORK WITH SHOWSENDDDDDDDD
          showSend = false
          replayFromIdx = nbMsg
          this.innerText = "play_arrow"
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
        let i:number = replayFromIdx
        
        setTimeout(function step(){
          let msg = self.data[i]
          console.log(msg)

          if (showSend === true) {
            return
          }

          if (document.getElementById("play-icon").innerText === "play_arrow"){
            replayFromIdx = i+1
            return
          }
          self.gviz.showSend(msg.fromId, msg.toId, msg.color)
          self.slider.bar.style.width = (i+1) / nbMsg * 100 + "%"
          i++

          if (i>= nbMsg){
            document.getElementById("play-icon").innerText = "replay"
            return
          }
          console.log(Date.parse(msg.time))
          setTimeout(step, 1000)
        }, 1000) 
      }
    }

    function liveListen(){
      document.getElementById("live-button").onclick = function(this:any){
        this.style.cursor = "pointer"
        showSend = true
        document.getElementById("live-icon").style.color = "red"
        self.slider.bar.style.width = "100%"
        document.getElementById("play-icon").innerText = "pause"
        document.getElementById("live-button").onclick = null
      }
      
    }

    function stopListen() {
      document.getElementById("stop-button").onclick = function(this:any) {
        const icon = document.getElementById("stop-icon")
        const txt = document.getElementById("stop-text")

        if (txt.innerText === "Restart") {
          document.querySelectorAll('.message').forEach(e => e.remove());
          messageListen()
        }
        else if (txt.innerText === "Stop") {
          Viz.sources.forEach((e) => { e.close() })
          Viz.sources = []
          txt.innerText = "Restart";
          icon.innerText = "restart_alt"
          document.getElementById("live-icon").style.color = "#4a4a4a"
          document.getElementById("live-icon").style.opacity = "0.9"
          //document.getElementById("live-button").onclick = null
        }
      }
    }

    function speedListen() {
      document.getElementById("speed-button").onclick = function(){
        console.log(speed)
      }
    }

    function scrollListen() {
      const scrollButton = document.getElementById("scroll-button")
      scrollButton.style.top = messages.clientHeight - 50 + "px"

      messages.addEventListener("wheel", function(){
        userScroll = true
        scrollButton.style.opacity = "1"
        scrollButton.style.visibility = "visible"
      })

      window.addEventListener("resize", function () {
        scrollButton.style.top = messages.clientHeight - 50 + "px"
      })

      scrollButton.addEventListener("click", function() {
        messages.scrollTop = messages.scrollHeight
        userScroll = false
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