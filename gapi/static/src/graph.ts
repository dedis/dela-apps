export { Graph }

import * as d3 from 'd3'
import './stylesheets/styles.scss'
import { nodes, NodesEntity } from './nodes'
import { datai } from './message'
import { SENT, RECV, REPLAY } from './message'
import { getPalette } from './utils'
import { Slider } from './slider'
import { gray, select } from 'd3'

/**
 * Graph implements the primitives to create and update the graph.
 * @param svg Main SVG graph
 * @param svgBounds Main SVG dimensions
 * @param createdLinks We keep the created links to avoid duplicates. we use a map for efficiency.
 * @param links Contains the same as createdLinks but in a suitable form for d3
 * @param simulation The d3 simulation
 * @param link The simulation's links
 * @param alpha The alpha value for the simulation. Corresponds to the heat in common simulation system.
 * @param node_rad Radius of the nodes
 */
class Graph {

  nodes: NodesEntity[] | null

  svg: d3.Selection<SVGElement, {}, HTMLElement, any>;
  svgBounds: DOMRect

  createdLinks: Map<string, Map<string, boolean>>;
  links: Array<{ source: string; target: string }>;

  simulation: d3.Simulation<d3.SimulationNodeDatum, undefined>
  link: d3.Selection<SVGElement, {}, SVGGElement, unknown>

  alpha: number = 0.1

  node_rad: number = 20

  constructor(nodes: NodesEntity[] | null) {
    this.nodes = nodes
    this.svg = d3.select('#svg-graph')
    this.svgBounds = document.getElementById('svg-graph').getBoundingClientRect()
  }

  display() {
    const self = this

    this.links = []
    this.createdLinks = new Map<string, Map<string, boolean>>()

    // Set each node's color 
    const palette = getPalette(this.nodes.length)
    this.nodes.forEach((n, i) => {
      n.color = palette(i)
    })

    // reinitialize previous svg zooms
    this.svg.call(d3.zoom().on("zoom", zoom).transform, d3.zoomIdentity)
    d3.select("#reset-button").text("gps_fixed")

    this.svg.selectAll('*').remove()

    this.simulation = d3
      .forceSimulation()
      .force('link', d3.forceLink().strength(1).distance(100).id((d: any) => d.id))
      .force("charge", d3.forceManyBody().strength(-1000)/*.strength((d, i) => (i ? 0 : (-width * 2) / 3))*/)
      .force('center', d3.forceCenter(this.svgBounds.width / 2, this.svgBounds.height / 2))

    // gGraph is necessary to apply zoom transform (cannot apply on svg)
    const gGraph = this.svg
      .append("g")
      .attr("class", "graph")

    this.svg.call(d3.zoom().on("zoom", zoom)).on("dblclick.zoom", null)

    d3.select("#reset-button")
      .on("click", function () {
        self.svg.call(d3.zoom().on("zoom", zoom).transform, d3.zoomIdentity)
        d3.select("#reset-button").text("gps_fixed")
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
      .data(this.nodes)
      .enter()
      .append('g')
      .attr('id', (d: NodesEntity) => d.id)
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended))
      .on("click", updateNodeActions)


    updateNodeActions(this.nodes[0])

    gNode.append('circle')
      .attr('r', this.node_rad)
      .attr('fill', (d: NodesEntity) => d.color)

    gNode.append('text')
      .text((d: NodesEntity) => d.id)
      .attr("font-size", this.node_rad + "px")
      .attr('class', 'label')

    gNode.append('title')
      .text((d: NodesEntity) => d.id)

    gNode.append("foreignObject")
      .attr("class", "graph-action-list")
      .attr("width", 200)
      .attr("height", 100)

    this.simulation
      .nodes(this.nodes as undefined)
      .on('tick', ticked)


    // d3.select("#node-id").style("background", "grey")
    // d3.selectAll(".settings-container").style("background", `linear-gradient(to right,grey, grey)`)
    // d3.select("#graph-settings").style("background", `linear-gradient(to right,grey ${w}px, grey 50%, ${d.color} 70%)`)
    // d3
    // .select("#chart-settings")
    // .transition().duration(transitionDuration)
    // .style("background", `linear-gradient(to left,grey ${w}px, grey 50%, ${d.color} 70%)`)

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
      d3.select("#reset-button").text("gps_not_fixed")
    }

    function dragstarted(d: d3.SimulationNodeDatum) {
      if (!d3.event.active) self.simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
      d3.select(this)
        .select("circle")
        .attr("stroke", "black")
        .attr("stroke-width", 3)
    }

    function dragged(d: d3.SimulationNodeDatum) {
      d.fx = d3.event.x
      d.fy = d3.event.y
    }

    function dragended(d: d3.SimulationNodeDatum) {
      if (!d3.event.active) self.simulation.alphaTarget(0)
      d.fx = null;
      d.fy = null;
      d3.select(this)
        .select("circle")
        .attr("stroke", "none")
    }

    function updateNodeActions(d: NodesEntity) {
      const transitionDuration = 300
      const wGraph = (d3
        .select("#graph-settings")
        .select(".settings")
        .node() as HTMLElement)
        .clientWidth
      const wChart = (d3
        .select("#chart-settings")
        .select(".node-settings")
        .node() as HTMLElement)
        .clientWidth

      d3
        .select("#graph-settings")
        .transition().duration(transitionDuration)
        .style("background", `linear-gradient(to right,grey ${wGraph}px, grey 60%, ${d.color} 80%)`)
        .select("#settings-node-id")
        .text(d.id)
      d3
        .select("#chart-settings")
        .transition().duration(transitionDuration)
        .style("background", `linear-gradient(to right, ${d.color} ${wChart}px,${d.color} 20%, grey 40%)`)
      d3
        .select("#node-id")
        .transition().duration(transitionDuration)
        .style("background", d.color)

      d3.select("#stop-node-button")
        .text(d.stop === true ? "play_circle" : "block")
    }
  }

  listen() {
    const self = this
    document.getElementById('radius-slider').oninput = function (this: HTMLInputElement) {
      document.getElementById("radius-slider-value").innerText = this.value
      self.updateNodeRadius(parseFloat(this.value))
    }

    document.getElementById('link-slider').oninput = function (this: HTMLInputElement) {
      const value = 1000 * parseFloat(this.value) / parseFloat(this.max)
      document.getElementById("link-slider-value").innerText = this.value
      self.updateLinkVal(value)
    }

    window.addEventListener("resize", function () { self.reportWindowSize() })
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
    this.svg
      .select(".nodes")
      .selectAll("circle")
      .attr('r', this.node_rad)

    this.svg
      .select(".nodes")
      .selectAll("text.label")
      .attr("font-size", this.node_rad + "px")

    this.svg
      .select(".nodes")
      .selectAll(".graph-action-list")
      .selectAll("div")
      .style("font-size", this.node_rad + 5 + "px")

    this.svg
      .selectAll(".graph-message")
      .attr("r", this.node_rad / 2)
  }

  reportWindowSize() {
    this.svgBounds = document.getElementById('svg-graph').getBoundingClientRect()
    if (typeof this.simulation !== 'undefined') {
      this.simulation.force('center', d3.forceCenter(this.svgBounds.width / 2, this.svgBounds.height / 2))
      this.simulation.restart()
    }
  }

  /**
   * showMsgTransition creates the link of not already present and displays a circle from
   * the source to the destination to picture a data transfer.
   * @param fromNode id of the source node
   * @param toNode id of the destination node
   * @param color color to use for the circle
   */
  showMsgTransition(msg: datai, idx: number, status: number): SVGElement {
    const self = this
    if (!isConnected(msg) && !isConnected(msg)) {

      this.createdLinks.get(msg.fromNode).set(msg.toNode, true)
      this.links.push({ source: msg.fromNode, target: msg.toNode })

      const force: any = this.simulation.force('link')
      force.links(this.links)

      this.link = this.link.data(this.links).join('line')

      this.simulation.alpha(this.alpha).restart()
      // Update link size with initial input value of corresponding setting
      document.getElementById('link-slider').dispatchEvent(new Event('input'))
    }

    const nodeA: any = d3.select(`#${msg.fromNode}`).node()
    const nodeAMatrix = nodeA.transform.baseVal[0].matrix
    const nodeAx = nodeAMatrix.e
    const nodeAy = nodeAMatrix.f

    const nodeB: any = d3.select(`#${msg.toNode}`).node()
    const nodeBMatrix = nodeB.transform.baseVal[0].matrix
    const nodeBx = nodeBMatrix.e
    const nodeBy = nodeBMatrix.f

    const halfDistx = (nodeBx + nodeAx) / 2
    const halfDisty = (nodeBy + nodeAy) / 2

    const duration = 400

    if (status === SENT) {
      this.svg
        .selectAll(".graph-message")
        .each(function (this: SVGElement): void {
          const id = parseInt(this.id.slice(1))
          if (id >= idx)
            this.id = "_" + (id + 1)
        })

      const circle = this.svg
        .select(".graph")
        .append('circle')
        .attr("class", "graph-message")
        .attr('id', '_' + idx)
        .attr('cx', nodeAx)
        .attr('cy', nodeAy)
        .style('fill', msg.color)
        .attr('r', this.node_rad / 2)

      if (msg.fromNode === msg.toNode) {
        circle
          .transition()
          .ease(d3.easeLinear)
          .duration(duration)
          .attrTween('cx', function () {
            return function (t) {
              return nodeAx + self.node_rad * Math.cos(Math.PI * t)
            }
          })
          .attrTween('cy', function () {
            return function (t) {
              return nodeAy + self.node_rad * Math.sin(Math.PI * t)
            }
          })
      }
      else
        circle
          .transition()
          .ease(d3.easeLinear)
          .duration(duration)
          .attr('cx', halfDistx)
          .attr('cy', halfDisty)
      return circle.node() as SVGElement
    }
    else if (status === RECV) {
      if (msg.fromNode === msg.toNode) {
        this.svg
          .select('#_' + idx)
          .transition()
          .ease(d3.easeLinear)
          .duration(duration)
          .attrTween('cx', function () {
            return function (t) {
              return nodeAx + self.node_rad * Math.cos(Math.PI * t + Math.PI)
            }
          })
          .attrTween('cy', function () {
            return function (t) {
              return nodeAy + self.node_rad * Math.sin(Math.PI * t + Math.PI)
            }
          })
          .remove()
      }
      else
        this.svg
          .select('#_' + idx)
          .transition()
          .ease(d3.easeLinear)
          .duration(duration)
          .attr('cx', nodeBx)
          .attr('cy', nodeBy)
          .remove()
    }
    // else if (status === REPLAY) {
    //   const time = msg.timeRecv - msg.timeSent
    //   this.svg
    //     .select(".graph")
    //     .append('circle')
    //     .attr("class", "graph-message")
    //     .attr('id', '_' + idx)
    //     .attr('cx', nodeAx)
    //     .attr('cy', nodeAy)
    //     .style('fill', msg.color)
    //     .attr('r', this.node_rad / 2)
    //     .transition()
    //     .ease(d3.easeLinear)
    //     .duration(time)
    //     .attr('cx', nodeBx)
    //     .attr('cy', nodeBy)
    //     .remove()
    // }

    function isConnected(msg: datai): boolean {
      if (self.createdLinks.get(msg.fromNode) === undefined) {
        self.createdLinks.set(msg.fromNode, new Map<string, boolean>())
      }

      if (self.createdLinks.get(msg.fromNode).get(msg.toNode) === undefined) {
        return false
      }

      return true
    }
  }


  clearMsgNodes(list: Array<number> = undefined) {
    if (list === undefined)
      this.svg.selectAll(".graph-message").remove()
    else {
      list.forEach(idx => {
        this.svg.select("#_" + idx).remove()
      })
    }
  }

  showMsg(msg: datai, idx: number, per: number): SVGElement | undefined {
    const nodeA: any = d3.select(`#${msg.fromNode}`).node()
    const nodeAMatrix = nodeA.transform.baseVal[0].matrix
    const nodeAx = nodeAMatrix.e
    const nodeAy = nodeAMatrix.f

    const nodeB: any = d3.select(`#${msg.toNode}`).node()
    const nodeBMatrix = nodeB.transform.baseVal[0].matrix
    const nodeBx = nodeBMatrix.e
    const nodeBy = nodeBMatrix.f

    let posx
    let posy
    if (msg.fromNode === msg.toNode) {
      posx = nodeAx + this.node_rad * Math.cos(2 * Math.PI * per)
      posy = nodeAy + this.node_rad * Math.sin(2 * Math.PI * per)
    }
    else {
      posx = nodeAx + per * (nodeBx - nodeAx)
      posy = nodeAy + per * (nodeBy - nodeAy)
    }

    const msgNode = this.svg.select('#_' + idx)
    if (msgNode.empty()) {
      return this.svg
        .select(".graph")
        .append('circle')
        .attr("class", "graph-message")
        .attr('id', '_' + idx)
        .attr('cx', posx)
        .attr('cy', posy)
        .style('fill', msg.color)
        .attr('r', this.node_rad / 2)
        .node() as SVGElement

    }
    else {
      msgNode
        .attr('cx', posx)
        .attr('cy', posy)
    }
    return undefined
  }

  public toggleAction(node: NodesEntity, name: string) {
    const actions = this.svg
      .select("#" + node.id)
      .select(".graph-action-list")

    // if (gNode.select("." + name).empty())

    //   console.log(gNode.select(".graph-action-list"))

    // const actionOn = (gNode.select(".graph-action-list")
    //   .select("." + name).node() as HTMLElement).classList.toggle("on")
    // .classed("on", function () { return d3.select(this).classed("on") ? false : true })

    if (actions.select("." + name).empty()) {
      actions
        .append('xhtml:div')
        .attr('class', 'material-icons ' + name)
        .style("font-size", this.node_rad + 5 + "px")
        .text(name)
    }
    else {
      actions
        .select("." + name)
        .remove()
    }
  }
}