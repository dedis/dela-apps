// import * as d3 from 'd3'
// import './stylesheets/styles.scss'
// import { graphi, NodesEntity } from './graph'
// import { SimulationNodeDatum } from 'd3'
import { graphi } from './graph'
import { GraphViz } from './graphviz'
import { Slider } from './slider'

interface datai {
  time: string
  dest: string
}

export function sayHi() {
  //document.addEventListener('mousemove', function(e) {e.preventDefault()})

  document.getElementById('settings-btn').addEventListener('click', function () {
    togglePanel()
  })

  document.getElementById('close-settings').addEventListener('click', function () {
    togglePanel()
  })

  document.getElementById('submitButton').addEventListener("click", function () {
    togglePanel()
    const v = new Viz()
    v.start()
  })

  let messages = document.getElementById("messages")
  let div = document.createElement('div')
  let timeSpan = document.createElement('span')
  let destSpan = document.createElement('span')
  timeSpan.style.float = "left"
  destSpan.style.float = "right"
  timeSpan.appendChild(document.createTextNode("TIME"))
  destSpan.appendChild(document.createTextNode("RECEIVER"))
  div.appendChild(timeSpan)
  div.appendChild(destSpan)

  messages.appendChild(div)
}

class Viz {

  static sources: Array<EventSource> = []

  graph: graphi
  data: Map<string, datai>

  constructor() {
    const inputData = document.getElementById('nodesData') as HTMLInputElement
    this.graph = JSON.parse(inputData.value)
    // close previous connections if any
    Viz.sources.forEach((e) => { e.close() })
  }

  start() {

    const gviz = new GraphViz(this.graph)
    gviz.display()
    gviz.listen()

    const slider = new Slider("progress-viz")
    slider.listen()

    const add2Id = new Map<string, string>()
    this.graph.nodes.forEach((node) => {
      add2Id.set(node.addr, node.id)
      add2Id.set(`Orchestrator:${node.addr}`, node.id)
    })

    let messages = document.getElementById("messages")

    this.graph.nodes.forEach((node) => {
      const trafficSrc = new EventSource(node.proxy)
      Viz.sources.push(trafficSrc)
      trafficSrc.onmessage = function (e) {
        const d: datai = JSON.parse(e.data)
        if (add2Id.get(d.dest) !== undefined) {
          

          gviz.showSend(node.id, add2Id.get(d.dest), node.color)

          let div = document.createElement('div')
          let timeSpan = document.createElement('span')
          let destSpan = document.createElement('span')
          timeSpan.classList.add("time")
          destSpan.classList.add("dest")
          timeSpan.appendChild(document.createTextNode(d.time))
          destSpan.appendChild(document.createTextNode(d.dest))
          div.appendChild(timeSpan)
          div.appendChild(destSpan)

          messages.appendChild(div)
          messages.scrollTop = messages.scrollHeight

          // let height = messages.clientHeight;
          // let scrollHeight = messages.scrollHeight - height;
          // let scrollTop = messages.scrollTop;
          // let percent = Math.floor(scrollTop / scrollHeight * 100);
          // slider.bar.style.width = percent + '%'
        }
      }
    })

    document.getElementById("svg-container").style.visibility = "visible"
  }
}

/**
 * closePanel hides or shows the settings panel and update the button
 * accordingly.
 */
function togglePanel() {
  document.getElementById('settings-btn').classList.toggle('active')
  const content = document.getElementById('settings-panel')
  if (content.style.maxHeight) {
    content.style.maxHeight = null
  } else {
    content.style.maxHeight = content.scrollHeight + 'px'
  }
}