import * as d3 from 'd3'
import './stylesheets/style.scss'
import { graphi } from './graph'
import { SimulationNodeDatum } from 'd3'

/**
 * sayHi is the entry point.
 */
export function sayHi () {
  document.getElementById('settings-btn').addEventListener('click', function () {
    togglePanel()
  })

  document.getElementById('close-settings').addEventListener('click', function () {
    togglePanel()
  })

  const v = new Visu()
  v.listen()

  document.getElementById('collision-update').addEventListener('click', function () {
    const val = document.getElementById('collision-value') as HTMLFormElement
    v.updateCollision(val.value)
  })

  document.getElementById('link-update').addEventListener('click', function () {
    const val = document.getElementById('link-value') as HTMLFormElement
    v.updateLinkVal(val.value)
  })
}

/**
 * Visu implements the primitives to create and update the graph.
 */
class Visu {
  // we keep all the sse connection in this array so we can close the
  // connections when we reload the graph.
  sources: Array<EventSource>;

  // settings elements
  showBlocks: HTMLFormElement;
  showStore: HTMLFormElement;

  // the main svg element
  svg: d3.Selection<SVGElement, {}, HTMLElement, any>;

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
  alpha = 0

  constructor () {
    this.sources = []
    this.showBlocks = document.getElementById('show-blocks') as HTMLFormElement
    this.showStore = document.getElementById('show-store') as HTMLFormElement

    this.showBlocks.addEventListener('click', function () {
      checkShowBlocks(this.checked)
    })

    this.showStore.addEventListener('click', function () {
      checkShowStore(this.checked)
    })
  }

  updateCollision (val: number) {
    this.simulation.force('collision', d3.forceCollide().radius(val))
    this.simulation.alpha(this.alpha).restart()
  }

  updateLinkVal (val: number) {
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

  listen () {
    const self = this
    const form = document.getElementById('submitButton')
    this.svg = d3.select('svg')

    form.onclick = function () {
      self.display()
    }
  }

  display () {
    // close previous connections if any
    this.sources.forEach((e) => {
      e.close()
    })

    this.sources = []
    this.createdLinks = new Map<string, Map<string, boolean>>()
    this.links = []

    // get the data from the textarea
    const inputData = document.getElementById('nodesData') as HTMLInputElement
    const graph: graphi = JSON.parse(inputData.value)

    // set a random color for each node
    graph.nodes.forEach((n) => {
      n.color = getColor()
    })

    const width = document.body.clientWidth
    const height = document.body.clientHeight

    const self = this

    this.svg.selectAll('*').remove()

    this.link = this.svg
      .append('g')
      .attr('class', 'links')
      .attr('stroke-width', 1.5)
      .selectAll('line')

    this.simulation = d3
      .forceSimulation()
      .force(
        'link',
        d3
          .forceLink()
          .distance(300)
          .id(function (d: any) {
            return d.id
          })
      )
      //   .force(
      //     "charge",
      //     d3.forceManyBody().strength((d, i) => (i ? 0 : (-width * 2) / 3))
      //   )
      .force('collision', d3.forceCollide().radius(100))
      .force('center', d3.forceCenter(width / 2, height / 2))

    const gNode = this.svg
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(graph.nodes)
      .enter()
      .append('g')
      .attr('id', function (d) {
        return d.id
      })
    gNode
      .append('circle')
      .attr('r', 50)
      .attr('fill', function (d) {
        return d.color
      })
      .call(
        d3
          .drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended)
      )

    const fo = gNode.append('foreignObject')
    fo.attr('width', 300)
    fo.attr('height', 300)
    fo.attr('x', -150)
    fo.attr('y', 50)
    const div = fo.append('xhtml:div')
    div.attr('class', 'node-content')
    div.append('div').attr('class', 'store')
    div.append('div').attr('class', 'blocks')

    checkShowBlocks(self.showBlocks.checked)
    checkShowStore(self.showStore.checked)

    gNode
      .append('text')
      .text(function (d) {
        return d.id
      })
      .attr('x', -20)
      .attr('y', 3)
      .attr('class', 'label')

    gNode.append('title').text(function (d) {
      return d.id
    })

    this.simulation.nodes(graph.nodes as undefined).on('tick', ticked)

    // const force: any = simulation.force("link");
    // force.links(links);

    function ticked () {
      self.link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      gNode.attr('transform', function (d: any) {
        return 'translate(' + d.x + ',' + d.y + ')'
      })
    }

    function dragstarted (d: any) {
      if (!d3.event.active) self.simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    }

    function dragged (d: any) {
      d.fx = d3.event.x
      d.fy = d3.event.y
    }

    function dragended (d: any) {
      if (!d3.event.active) self.simulation.alphaTarget(0)
      // d.fx = null;
      // d.fy = null;
    }

    const add2Id = new Map<string, string>()
    graph.nodes.forEach((node) => {
      add2Id.set(node.addr, node.id)
      add2Id.set(`Orchestrator:${node.addr}`, node.id)
    })

    graph.nodes.forEach((node) => {
      const txSrc = new EventSource(node.proxy + '/transactions')
      this.sources.push(txSrc)
      txSrc.onmessage = function (e) {
        const block = JSON.parse(e.data)
        updateBlocks(node.id, block)
        updateValue(node.id, node.proxy + '/store')
      }

      const trafficSrc = new EventSource(node.proxy + '/traffic/sent')
      this.sources.push(trafficSrc)
      trafficSrc.onmessage = function (e) {
        if (add2Id.get(e.data) !== undefined) {
          self.showSend(node.id, add2Id.get(e.data), node.color)
        }
      }
    })
  }

  isConnected (fromId: string, toId: string): boolean {
    if (this.createdLinks.get(fromId) === undefined) {
      this.createdLinks.set(fromId, new Map<string, boolean>())
    }

    if (this.createdLinks.get(fromId).get(toId) === undefined) {
      return false
    }

    return true
  }

  /**
   * showSend creates the link of not already present and displays a circle from
   * the source to the destination to picture a data transfer.
   * @param fromId id of the source node
   * @param toId id of the destination node
   * @param color color to use for the circle
   */
  showSend (fromId: string, toId: string, color: string) {
    if (!this.isConnected(fromId, toId) && !this.isConnected(toId, fromId)) {
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
      .append('circle')
      .attr('cx', nodeAx)
      .attr('cy', nodeAy)
      .style('fill', color)
      .style('stroke-width', 1) // set the stroke width
      .style('stroke', '#aaa')
      .attr('r', 10)
      .transition()
      .duration(400)
      .attr('cx', nodeBx)
      .attr('cy', nodeBy)
      // .style("fill","blue")
      .attr('r', 3)
      .remove()
  }
}

/**
 * getColor return a random pastel color.
 */
function getColor () {
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

/**
 * checkShowBlocks checks if the blocks must be hidden or not.
 * @param checked value of the input field
 */
function checkShowBlocks (checked: boolean) {
  let style = 'none'
  if (checked) {
    style = 'block'
  }

  document.querySelectorAll<HTMLElement>('.node-content .blocks').forEach(n => {
    n.style.display = style
  })
}

/**
 * checkShowStore checks if the stores must be displayed or not.
 * @param checked value of the input field
 */
function checkShowStore (checked: boolean) {
  let style = 'none'
  if (checked) {
    style = 'block'
  }

  document.querySelectorAll<HTMLElement>('.node-content .store').forEach(n => {
    n.style.display = style
  })
}

/**
 * closePanel hides or shows the settings panel and update the button
 * accordingly.
 */
function togglePanel () {
  document.getElementById('settings-btn').classList.toggle('active')
  const content = document.getElementById('settings-panel')
  if (content.style.maxHeight) {
    content.style.maxHeight = null
  } else {
    content.style.maxHeight = content.scrollHeight + 'px'
  }
}

/**
 * updateBlocks adds a new block to the block panel of the node.
 * @param id the node's id
 * @param block json structure sent by the proxy
 */
function updateBlocks (id: string, block: any) {
  const na = document.querySelector(`#${id} .node-content .blocks`)

  let content = ''

  content += '<div class="block">'
  content += `<p class="index">Block: ${block.Index}</p>`
  for (let j = 0; j < block.Txs.length; j++) {
    const tx = block.Txs[j]
    content += '<div class="tx">'
    content += `<p>Accepted: ${tx.Accepted}</p>`
    content += `<p>ID: ${tx.ID.substring(0, 12)}...</p>`
    content += `<p>Signature: ${tx.Identity.substring(0, 12)}...</p>`
    if (tx.Status !== '') {
      content += `<p>Status: <b>${tx.Status}</p>`
    }
    content += '</div>'
  }
  content += '</div>'

  na.innerHTML += content
  na.scrollTop = na.scrollHeight
}

/**
 * updateValue fetches the value of the node and update its value field
 * accordingly.
 * @param id node's id
 * @param addr address of the node's proxy
 */
function updateValue (id: string, addr: string) {
  fetch(addr)
    .then((res) => res.json())
    .then((out) => {
      let content = ''
      for (const m in out) {
        content += `<p>Value: <b>${out[m]}</b></p>`
      }
      const na = document.querySelector(`#${id} .node-content .store`)
      na.innerHTML = content
      na.scrollTop = na.scrollHeight
    })
    .catch((err) => {
      throw err
    })
}
