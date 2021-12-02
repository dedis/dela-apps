export { GraphViz }
import * as d3 from 'd3'
import './stylesheets/styles.scss'
import { graphi, NodesEntity } from './graph'
import { SimulationNodeDatum } from 'd3'

/**
 * GraphViz implements the primitives to create and update the graph.
 */
class GraphViz {

  graph: graphi

  // the main svg element
  svg: d3.Selection<SVGElement, {}, HTMLElement, any>;
  svgBounds: DOMRect

  // we keep the created links to avoid duplicates. we use a map for efficiency.
  createdLinks: Map<string, Map<string, boolean>>;
  // contains the same as createdLinks but in a suitable form for d3
  links: Array<{ source: string; target: string }>;

  // the d3 simulation
  simulation: d3.Simulation<SimulationNodeDatum, undefined>
  // the simulation's links
  link: d3.Selection<SVGElement, {}, SVGGElement, unknown>

  // the alpha value for the simulation. Corresponds to the heat in common
  // simulation system.
  alpha: number = 0.1

  // radius of the nodes
  node_rad: number = 20

  constructor(graph: graphi) {
    this.graph = graph
    this.svg = d3.select('svg')
    this.svgBounds = document.getElementById('svg-graph').getBoundingClientRect()
  }

  display() {
    this.links = []
    this.createdLinks = new Map<string, Map<string, boolean>>()

    // set a random color for each node
    this.graph.nodes.forEach((n) => {
      n.color = getColor()
    })

    const self = this

    // reinitialize previous svg zooms
    this.svg.call(d3.zoom().on("zoom", zoom).transform, d3.zoomIdentity)

    this.svg.selectAll('*').remove()

    this.simulation = d3
      .forceSimulation()
      .force('link', d3.forceLink().strength(1).distance(100).id((d: any) => d.id))
      .force("charge", d3.forceManyBody().strength(-1000)/*.strength((d, i) => (i ? 0 : (-width * 2) / 3))*/)
      .force('center', d3.forceCenter(this.svgBounds.width / 2, this.svgBounds.height / 2))
    
    const gGraph = this.svg
      .append("g")
      .attr("class", "graph")

    this.svg.call(d3.zoom().on("zoom", zoom))

    d3.select("#resetButton")
      .on("click", function () {
        self.svg.call(d3.zoom().on("zoom", zoom).transform, d3.zoomIdentity)
      })
    

    this.link = gGraph
      .append('g')
      .attr('class', 'links')
      .attr('stroke-width', 1.5)
      .selectAll('line')

    const gNode = gGraph
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(this.graph.nodes)
      .enter()
      .append('g')
      .attr('id', (d: NodesEntity) => d.id)
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended))

    gNode.append('circle')
      .attr('r', this.node_rad)
      .attr("font-size", this.node_rad + "px")
      .attr('fill', (d: NodesEntity) => d.color)

    gNode.append('text')
      .text((d: NodesEntity) => d.id)
      .attr('class', 'label')

    gNode.append('title')
      .text((d: NodesEntity) => d.id)

    this.simulation
      .nodes(this.graph.nodes as undefined)
      .on('tick', ticked)

    function ticked() {
      self.link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      gNode.attr('transform', function (d: any) {
        return 'translate(' + d.x + ',' + d.y + ')'
      })
    }

    function zoom() {
      d3.select(this).select(".graph").attr("transform", d3.event.transform)
    }

    function dragstarted(d: SimulationNodeDatum) {
      if (!d3.event.active) self.simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
      d3.select(this).raise().select("circle")
        .attr("stroke", "black")
        .attr("stroke-width", 3)
    }

    function dragged(d: SimulationNodeDatum) {
      d.fx = d3.event.x
      d.fy = d3.event.y
    }

    function dragended(d: SimulationNodeDatum) {
      if (!d3.event.active) self.simulation.alphaTarget(0)
      d.fx = null;
      d.fy = null;
      d3.select(this).select("circle")
        .attr("stroke", "none")
    }
  }

  listen() {
    const self = this

    document.getElementById('charge-update').addEventListener('click', function () {
      const val = document.getElementById('charge-value') as HTMLFormElement
      self.updateCharge(val.value)
    })

    document.getElementById('link-update').addEventListener('click', function () {
      const val = document.getElementById('link-value') as HTMLFormElement
      self.updateLinkVal(val.value)
    })

    document.getElementById('radius-update').addEventListener('click', function () {
      const val = document.getElementById('node-radius') as HTMLFormElement
      self.updateNodeRadius(val.value)
    })

    window.onresize = function () { self.reportWindowSize() };
  }

  updateCharge(val: number) {
    if (typeof this.simulation !== 'undefined') {
      this.simulation.force('charge', d3.forceManyBody().strength(val))
      this.simulation.alpha(this.alpha).restart()
    }
  }

  updateLinkVal(val: number) {
    if (typeof this.simulation !== 'undefined') {
      this.simulation.force(
        'link',
        d3
          .forceLink()
          .distance(val)
          .id(function (d: any) {
            return d.id
          })
      )
      const force: any = this.simulation.force('link')
      force.links(this.links)

      this.link = this.link.data(this.links).join('line')

      this.simulation.alpha(this.alpha).restart()
    }
  }

  updateNodeRadius(val: number) {
    this.node_rad = val
    this.svg.selectAll("circle").attr('r', this.node_rad)
    this.svg.selectAll(".nodes").selectAll("text.label").attr("font-size", this.node_rad + "px")
  }

  reportWindowSize() {
    this.svgBounds = document.getElementById('svg-graph').getBoundingClientRect()
    if (typeof this.simulation !== 'undefined') {
      this.simulation.force('center', d3.forceCenter(this.svgBounds.width / 2, this.svgBounds.height / 2))
      this.simulation.restart()
    }
  }

  /**
   * showSend creates the link of not already present and displays a circle from
   * the source to the destination to picture a data transfer.
   * @param fromId id of the source node
   * @param toId id of the destination node
   * @param color color to use for the circle
   */
  showSend(fromId: string, toId: string, color: string) {
    const self = this
    if (!isConnected(fromId, toId) && !isConnected(toId, fromId)) {

      this.createdLinks.get(fromId).set(toId, true)
      this.links.push({ source: fromId, target: toId })

      const force: any = this.simulation.force('link')
      force.links(this.links)

      this.link = this.link.data(this.links).join('line')

      this.simulation.alpha(this.alpha).restart()
    }

    const nodeA: any = d3.select(`#${fromId}`).node()
    const nodeAMatrix = nodeA.transform.baseVal[0].matrix
    const nodeAx = nodeAMatrix.e
    const nodeAy = nodeAMatrix.f

    const nodeB: any = d3.select(`#${toId}`).node()
    const nodeBMatrix = nodeB.transform.baseVal[0].matrix
    const nodeBx = nodeBMatrix.e
    const nodeBy = nodeBMatrix.f
    this.svg
      .select(".graph")
      .append('circle')
      .attr('cx', nodeAx)
      .attr('cy', nodeAy)
      .style('fill', color)
      .style('stroke-width', 1) // set the stroke width
      .style('stroke', '#aaa')
      .attr('r', this.node_rad/2)
      .transition()
      .duration(400)
      .attr('cx', nodeBx)
      .attr('cy', nodeBy)
      // .style("fill","blue")
      .attr('r', this.node_rad/7)
      .attr("pointer-events", "none")
      .remove()

    function isConnected(fromId: string, toId: string): boolean {
      if (self.createdLinks.get(fromId) === undefined) {
        self.createdLinks.set(fromId, new Map<string, boolean>())
      }

      if (self.createdLinks.get(fromId).get(toId) === undefined) {
        return false
      }

      return true
    }
  }
}

/**
 * getColor return a random pastel color.
 */
function getColor() {
  return (
    'hsl(' +
    360 * Math.random() +
    ',' +
    (25 + 70 * Math.random()) +
    '%,' +
    (85 + 10 * Math.random()) +
    '%)'
  )
}



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////OLDER VERSION///////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



  // /**
//  * sayHi is the entry point.
//  */
// export function sayHi () {
//   document.getElementById('settings-btn').addEventListener('click', function () {
//     togglePanel()
//   })

//   document.getElementById('close-settings').addEventListener('click', function () {
//     togglePanel()
//   })

//   const v = new Visu()
//   v.listen()

//   document.getElementById('collision-update').addEventListener('click', function () {
//     const val = document.getElementById('collision-value') as HTMLFormElement
//     v.updateCollision(val.value)
//   })

//   document.getElementById('link-update').addEventListener('click', function () {
//     const val = document.getElementById('link-value') as HTMLFormElement
//     v.updateLinkVal(val.value)
//   })

//   window.onresize = function() {v.reportWindowSize()};
// }

// /**
//  * Visu implements the primitives to create and update the graph.
//  */
// class Visu {
//   // we keep all the sse connection in this array so we can close the
//   // connections when we reload the graph.
//   sources: Array<EventSource>;

//   // settings elements
//   // showBlocks: HTMLFormElement;
//   // showStore: HTMLFormElement;

//   // the main svg element
//   svg: d3.Selection<SVGElement, {}, HTMLElement, any>;
//   svgBounds: DOMRect

//   // we keep the created links to avoid duplicates. we use a map for efficiency.
//   createdLinks: Map<string, Map<string, boolean>>;
//   // contains the same as createdLinks but in a suitable form for d3
//   links: Array<{ source: string; target: string }>;

//   // the d3 simulation
//   simulation: d3.Simulation<SimulationNodeDatum, undefined>
//   // the simulation's links
//   link: d3.Selection<SVGElement, {}, SVGGElement, unknown>

//   // the alpha value for the simulation. Corresponds to the heat in common
//   // simulation system.
//   alpha = 0

//   constructor () {
//     this.sources = []
//     // this.showBlocks = document.getElementById('show-blocks') as HTMLFormElement
//     // this.showStore = document.getElementById('show-store') as HTMLFormElement
//     this.svgBounds = document.getElementById('svg-graph').getBoundingClientRect()

//     // this.showBlocks.addEventListener('click', function () {
//     //   checkShowBlocks(this.checked)
//     // })

//     // this.showStore.addEventListener('click', function () {
//     //   checkShowStore(this.checked)
//     // })
//   }

//   reportWindowSize (){
//     this.svgBounds = document.getElementById('svg-graph').getBoundingClientRect()
//     this.simulation.force('center', d3.forceCenter(this.svgBounds.width/2, this.svgBounds.height/2))
//   }

//   updateCollision (val: number) {
//     this.simulation.force('collision', d3.forceCollide().radius(val))
//     this.simulation.alpha(this.alpha).restart()
//   }

//   updateLinkVal (val: number) {
//     this.simulation.force(
//       'link',
//       d3
//         .forceLink()
//         .distance(val)
//         .id(function (d: any) {
//           return d.id
//         })
//     )

//     const force: any = this.simulation.force('link')
//     force.links(this.links)

//     this.link = this.link.data(this.links).join('line')

//     this.simulation.alpha(this.alpha).restart()
//   }

//   listen () {
//     const self = this
//     const form = document.getElementById('submitButton')
//     this.svg = d3.select('svg')

//     form.onclick = function () {
//       self.display()
//     }
//   }

//   display () {
//     // close previous connections if any
//     this.sources.forEach((e) => {
//       e.close()
//     })

//     this.sources = []
//     this.createdLinks = new Map<string, Map<string, boolean>>()
//     this.links = []

//     // get the data from the textarea
//     const inputData = document.getElementById('nodesData') as HTMLInputElement
//     const graph: graphi = JSON.parse(inputData.value)

//     // set a random color for each node
//     graph.nodes.forEach((n) => {
//       n.color = getColor()
//     })

//     const self = this

//     this.svg.selectAll('*').remove()

//     this.simulation = d3
//       .forceSimulation()
//       .force('link',d3.forceLink().strength(1).distance(75).id((d: any) => d.id))
//       .force("charge",d3.forceManyBody().strength(-1000)/*.strength((d, i) => (i ? 0 : (-width * 2) / 3))*/)  
//       .force('center', d3.forceCenter(this.svgBounds.width/2, this.svgBounds.height/2))

//     this.simulation.alphaTarget(0.05).restart()

//     const gGraph = this.svg
//     .append("g")
//     .attr("class","graph")

//     this.svg.call(d3.zoom().on("zoom", zoom))

//     d3.select("#resetButton")
//       .on("click", function(){
//         self.svg.call(d3.zoom().on("zoom", zoom).transform, d3.zoomIdentity)
//       })

//     this.link = gGraph
//     .append('g')
//     .attr('class', 'links')
//     .attr('stroke-width', 1.5)
//     .selectAll('line')

//     const gNode = gGraph
//       .append('g')
//       .attr('class', 'nodes')
//       .selectAll('g')
//       .data(graph.nodes)
//       .enter()
//       .append('g')
//       .attr('id', (d: NodesEntity) => d.id)
//       .call(d3.drag()
//               .on("start", dragstarted)
//               .on("drag", dragged)
//               .on("end", dragended))

//     gNode.append('circle')
//       .attr('r', 20)
//       .attr('fill', (d: NodesEntity) => d.color)

//     gNode.append('text')
//       .text((d: NodesEntity) => d.id)
//       .attr('class', 'label')

//     gNode.append('title')
//     .text((d: NodesEntity) => d.id)

//     // const fo = gNode.append('foreignObject')
//     // fo.attr('width', 300)
//     // fo.attr('height', 300)
//     // fo.attr('x', -150)
//     // fo.attr('y', 50)
//     // const div = fo.append('xhtml:div')
//     // div.attr('class', 'node-content')
//     // div.append('div').attr('class', 'store')
//     // div.append('div').attr('class', 'blocks')

//     // checkShowBlocks(self.showBlocks.checked)
//     // checkShowStore(self.showStore.checked)      

//     this.simulation
//       .nodes(graph.nodes as undefined)
//       .on('tick', ticked)

//     function ticked () {
//       self.link
//         .attr('x1', (d: any) => d.source.x)
//         .attr('y1', (d: any) => d.source.y)
//         .attr('x2', (d: any) => d.target.x)
//         .attr('y2', (d: any) => d.target.y)

//       gNode.attr('transform', function (d: any) {
//           return 'translate(' + d.x + ',' + d.y + ')'
//         })
//     }

//     function zoom(){
//       d3.select(this).select(".graph").attr("transform", d3.event.transform)
//     }

//     function dragstarted (d: SimulationNodeDatum) {
//       if (!d3.event.active) self.simulation.alphaTarget(0.3).restart()
//       d.fx = d.x
//       d.fy = d.y
//       d3.select(this).raise().select("circle")
//       .attr("stroke", "black")
//       .attr("stroke-width", 3)      
//     }

//     function dragged (d: SimulationNodeDatum) {
//       d.fx = d3.event.x
//       d.fy = d3.event.y
//     }

//     function dragended (d: SimulationNodeDatum) {
//       if (!d3.event.active) self.simulation.alphaTarget(0)
//       d.fx = null;
//       d.fy = null;
//       d3.select(this).select("circle")
//       .attr("stroke", "none")
//     }

//     const add2Id = new Map<string, string>()
//     graph.nodes.forEach((node) => {
//       add2Id.set(node.addr, node.id)
//       add2Id.set(`Orchestrator:${node.addr}`, node.id)
//     })

//     graph.nodes.forEach((node) => {
//       // const txSrc = new EventSource(node.proxy + '/transactions')
//       // this.sources.push(txSrc)
//       // txSrc.onmessage = function (e) {
//       //   const block = JSON.parse(e.data)
//       //   updateBlocks(node.id, block)
//       //   updateValue(node.id, node.proxy + '/store')
//       // }

//       const trafficSrc = new EventSource(node.proxy + '/sse')
//       //var trafficSrc = new EventSource(node.proxy);
//       this.sources.push(trafficSrc)
//       trafficSrc.onmessage = function (e) {
//         if (add2Id.get(e.data) !== undefined) {
//           self.showSend(node.id, add2Id.get(e.data), node.color)
//         }
//       }
//     })
//   }

//   isConnected (fromId: string, toId: string): boolean {
//     if (this.createdLinks.get(fromId) === undefined) {
//       this.createdLinks.set(fromId, new Map<string, boolean>())
//     }

//     if (this.createdLinks.get(fromId).get(toId) === undefined) {
//       return false
//     }

//     return true
//   }

//   /**
//    * showSend creates the link of not already present and displays a circle from
//    * the source to the destination to picture a data transfer.
//    * @param fromId id of the source node
//    * @param toId id of the destination node
//    * @param color color to use for the circle
//    */
//   showSend (fromId: string, toId: string, color: string) {
//     if (!this.isConnected(fromId, toId) && !this.isConnected(toId, fromId)) {
//       this.createdLinks.get(fromId).set(toId, true)

//       this.links.push({ source: fromId, target: toId })

//       const force: any = this.simulation.force('link')
//       force.links(this.links)

//       this.link = this.link.data(this.links).join('line')

//       this.simulation.alpha(this.alpha).restart()
//     }

//     const nodeA: any = d3.select(`#${fromId}`).node()
//     const nodeAMatrix = nodeA.transform.baseVal[0].matrix
//     const nodeAx = nodeAMatrix.e
//     const nodeAy = nodeAMatrix.f

//     const nodeB: any = d3.select(`#${toId}`).node()
//     const nodeBMatrix = nodeB.transform.baseVal[0].matrix
//     const nodeBx = nodeBMatrix.e
//     const nodeBy = nodeBMatrix.f
//     this.svg
//       .select(".graph")
//       .append('circle')
//       .attr('cx', nodeAx)
//       .attr('cy', nodeAy)
//       .style('fill', color)
//       .style('stroke-width', 1) // set the stroke width
//       .style('stroke', '#aaa')
//       .attr('r', 10)
//       .transition()
//       .duration(400)
//       .attr('cx', nodeBx)
//       .attr('cy', nodeBy)
//       // .style("fill","blue")
//       .attr('r', 3)
//       .attr("pointer-events", "none")
//       .remove()
//   }
// }

// /**
//  * getColor return a random pastel color.
//  */
// function getColor () {
//   return (
//     'hsl(' +
//     360 * Math.random() +
//     ',' +
//     (25 + 70 * Math.random()) +
//     '%,' +
//     (85 + 10 * Math.random()) +
//     '%)'
//   )
// }


// // /**
// //  * checkShowBlocks checks if the blocks must be hidden or not.
// //  * @param checked value of the input field
// //  */
// // function checkShowBlocks (checked: boolean) {
// //   let style = 'none'
// //   if (checked) {
// //     style = 'block'
// //   }

// //   document.querySelectorAll<HTMLElement>('.node-content .blocks').forEach(n => {
// //     n.style.display = style
// //   })
// // }

// // /**
// //  * checkShowStore checks if the stores must be displayed or not.
// //  * @param checked value of the input field
// //  */
// // function checkShowStore (checked: boolean) {
// //   let style = 'none'
// //   if (checked) {
// //     style = 'block'
// //   }

// //   document.querySelectorAll<HTMLElement>('.node-content .store').forEach(n => {
// //     n.style.display = style
// //   })
// // }

// /**
//  * closePanel hides or shows the settings panel and update the button
//  * accordingly.
//  */
// function togglePanel () {
//   document.getElementById('settings-btn').classList.toggle('active')
//   const content = document.getElementById('settings-panel')
//   if (content.style.maxHeight) {
//     content.style.maxHeight = null
//   } else {
//     content.style.maxHeight = content.scrollHeight + 'px'
//   }
// }

// // /**
// //  * updateBlocks adds a new block to the block panel of the node.
// //  * @param id the node's id
// //  * @param block json structure sent by the proxy
// //  */
// // function updateBlocks (id: string, block: any) {
// //   const na = document.querySelector(`#${id} .node-content .blocks`)

// //   let content = ''

// //   content += '<div class="block">'
// //   content += `<p class="index">Block: ${block.Index}</p>`
// //   for (let j = 0; j < block.Txs.length; j++) {
// //     const tx = block.Txs[j]
// //     content += '<div class="tx">'
// //     content += `<p>Accepted: ${tx.Accepted}</p>`
// //     content += `<p>ID: ${tx.ID.substring(0, 12)}...</p>`
// //     content += `<p>Signature: ${tx.Identity.substring(0, 12)}...</p>`
// //     if (tx.Status !== '') {
// //       content += `<p>Status: <b>${tx.Status}</p>`
// //     }
// //     content += '</div>'
// //   }
// //   content += '</div>'

// //   na.innerHTML += content
// //   na.scrollTop = na.scrollHeight
// // }

// // /**
// //  * updateValue fetches the value of the node and update its value field
// //  * accordingly.
// //  * @param id node's id
// //  * @param addr address of the node's proxy
// //  */
// // function updateValue (id: string, addr: string) {
// //   fetch(addr)
// //     .then((res) => res.json())
// //     .then((out) => {
// //       let content = ''
// //       for (const m in out) {
// //         content += `<p>Value: <b>${out[m]}</b></p>`
// //       }
// //       const na = document.querySelector(`#${id} .node-content .store`)
// //       na.innerHTML = content
// //       na.scrollTop = na.scrollHeight
// //     })
// //     .catch((err) => {
// //       throw err
// //     })
// // }
