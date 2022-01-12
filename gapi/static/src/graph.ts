export { Graph }
import * as d3 from 'd3'
import './stylesheets/styles.scss'
import { nodes, NodesEntity } from './nodes'
import { easeLinear, SimulationNodeDatum } from 'd3'
import { datai } from './message'
import { SENT, RECV, REPLAY } from './message'

/**
 * Graph implements the primitives to create and update the graph.
 */
class Graph {

  nodes: NodesEntity[] | null

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

  constructor(nodes: NodesEntity[] | null) {
    this.nodes = nodes
    this.svg = d3.select('#svg-graph')
    this.svgBounds = document.getElementById('svg-graph').getBoundingClientRect()
  }

  display() {
    this.links = []
    this.createdLinks = new Map<string, Map<string, boolean>>()

    // Set each node's color 
    const color = d3.scaleSequential(d3.interpolateRainbow).domain([0, this.nodes.length])
    this.nodes.forEach((n, i) => {
      n.color = color(i)
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

    // gGraph is necessary to apply zoom transform (cannot apply on svg)
    const gGraph = this.svg
      .append("g")
      .attr("class", "graph")

    this.svg.call(d3.zoom().on("zoom", zoom))

    d3.select("#reset-button")
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
      .data(this.nodes)
      .enter()
      .append('g')
      .attr('id', (d: NodesEntity) => d.id)
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended))

    gNode.append('circle')
      .attr('r', this.node_rad)
      .attr('fill', (d: NodesEntity) => d.color)

    gNode.append('text')
      .text((d: NodesEntity) => d.id)
      .attr("font-size", this.node_rad + "px")
      .attr('class', 'label')

    gNode.append('title')
      .text((d: NodesEntity) => d.id)

    this.simulation
      .nodes(this.nodes as undefined)
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
    this.svg.selectAll("circle").attr('r', this.node_rad)
    this.svg.selectAll("text.label").attr("font-size", this.node_rad + "px")
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
   * @param fromNode id of the source node
   * @param toNode id of the destination node
   * @param color color to use for the circle
   */
  showSend(msg: datai, idx: number, status: number) {
    const self = this
    if (!isConnected(msg) && !isConnected(msg)) {

      this.createdLinks.get(msg.fromNode).set(msg.toNode, true)
      this.links.push({ source: msg.fromNode, target: msg.toNode })

      const force: any = this.simulation.force('link')
      force.links(this.links)

      this.link = this.link.data(this.links).join('line')

      this.simulation.alpha(this.alpha).restart()
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

    if (status === SENT) {
      this.svg
        .select(".graph")
        .append('circle')
        .attr("class", "message-node")
        .attr('id', 'msg' + idx)
        .attr('cx', nodeAx)
        .attr('cy', nodeAy)
        .style('fill', msg.color)
        .style('stroke-width', 1) // set the stroke width
        .style('stroke', '#aaa')
        .attr('r', this.node_rad / 2)
        .transition()
        .ease(easeLinear)
        .duration(400)
        .attr('cx', halfDistx)
        .attr('cy', halfDisty)
      // .style("fill","blue")
      // .attr('r', this.node_rad / 7)
      // .attr("pointer-events", "none")
      // .remove()
    }
    else if (status === RECV) {
      this.svg
        .select('#msg' + idx)
        .transition()
        .ease(easeLinear)
        .duration(400)
        .attr('cx', nodeBx)
        .attr('cy', nodeBy)
        .remove()
    }
    else if (status === REPLAY) {
      const time = msg.timeRecv - msg.timeSent
      this.svg
        .select(".graph")
        .append('circle')
        .attr("class", "message-node")
        .attr('id', 'msg' + idx)
        .attr('cx', nodeAx)
        .attr('cy', nodeAy)
        .style('fill', msg.color)
        .style('stroke-width', 1) // set the stroke width
        .style('stroke', '#aaa')
        .attr('r', this.node_rad / 2)
        .transition()
        .ease(easeLinear)
        .duration(time)
        .attr('cx', nodeBx)
        .attr('cy', nodeBy)
        .remove()
    }

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

  clearMsgNodes(list: Array<number> = null) {
    if (list === null)
      this.svg.selectAll(".message-node").remove()
    else {
      list.forEach(idx => {
        this.svg.select("#msg" + idx).remove()
      })
    }
  }

  showMsg(msg: datai, idx: number, per: number) {
    const nodeA: any = d3.select(`#${msg.fromNode}`).node()
    const nodeAMatrix = nodeA.transform.baseVal[0].matrix
    const nodeAx = nodeAMatrix.e
    const nodeAy = nodeAMatrix.f

    const nodeB: any = d3.select(`#${msg.toNode}`).node()
    const nodeBMatrix = nodeB.transform.baseVal[0].matrix
    const nodeBx = nodeBMatrix.e
    const nodeBy = nodeBMatrix.f

    const posx = nodeAx + per * (nodeBx - nodeAx)
    const posy = nodeAy + per * (nodeBy - nodeAy)

    const msgNode = this.svg.select('#msg' + idx)
    if (msgNode.empty()) {
      this.svg
        .select(".graph")
        .append('circle')
        .attr("class", "message-node")
        .attr('id', 'msg' + idx)
        .attr('cx', posx)
        .attr('cy', posy)
        .style('fill', msg.color)
        .style('stroke-width', 1) // set the stroke width
        .style('stroke', '#aaa')
        .attr('r', this.node_rad / 2)
    }
    else {
      msgNode
        .attr('cx', posx)
        .attr('cy', posy)
    }
  }
}