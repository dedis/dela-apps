
export { Resizer }

/**
 * Resizer handles the resizing of both the graph and the chart
 * by modifying their flex values
 */
class Resizer {

  resizer: HTMLElement | null
  graph: HTMLElement | null
  chart: HTMLElement | null
  parentWidth: number
  mDown: boolean
  beginX: number
  width: number

  constructor(id: string) {
    this.resizer = document.getElementById(id)
    this.graph = document.getElementById("graph-container")
    this.chart = document.getElementById("chart-container")
    const style = getComputedStyle(this.resizer)
    this.width = this.resizer.offsetWidth +
      parseFloat(style.marginLeft) +
      parseFloat(style.marginRight)
  }

  listen() {
    const self = this

    self.resizer.addEventListener('mousedown', function (e: MouseEvent) {
      if (e.button == 0) { // Judgment click the left button
        self.mDown = true
        // Save values that will remain the same when mousemove
        self.parentWidth = this.parentElement.parentElement.clientWidth
        self.beginX = this.parentElement.parentElement.offsetLeft
      }
    })
    document.addEventListener('mousemove', function (e: MouseEvent) {
      if (self.mDown) {
        const ratio = (e.clientX - self.beginX - self.width / 2) / (self.parentWidth - self.width)
        self.graph.style.flex = (ratio).toString()
        self.chart.style.flex = (1 - ratio).toString()
        e.preventDefault()
      }
    })
    document.addEventListener('mouseup', function (e) {
      if (self.mDown) {
        self.mDown = false
      }
    })
  }
}