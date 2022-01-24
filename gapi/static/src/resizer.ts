
export { Resizer }

class Resizer {

  resizer: HTMLElement | null
  graph: HTMLElement | null
  chart: HTMLElement | null
  parentWidth: number
  mDown: boolean
  beginX: number
  width: number
  // beginClientX: number
  // sliderLong: number
  // per: number

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
        self.parentWidth = this.parentElement.clientWidth
        self.beginX = this.parentElement.offsetLeft
        // self.beginX = e.offsetX
        // self.positionX = e.offsetX
        // self.beginClientX = e.clientX
        // self.sliderLong = self.resizer.clientWidth
        // self.per = self.positionX / self.sliderLong * 100
        // self.bar.style.width = self.per + '%'
      }
    })
    document.addEventListener('mousemove', function (e: MouseEvent) {
      if (self.mDown) {
        // const graph = document.getElementById("graph-container")
        // const chart = document.getElementById("chart-container")
        // const x = e.pageX

        const ratio = (e.clientX - self.beginX - self.width / 2) / (self.parentWidth - self.width)
        self.graph.style.flex = (ratio).toString()
        self.chart.style.flex = (1 - ratio).toString()
        // var moveX = e.clientX - self.beginClientX
        // self.positionX = (self.beginX + moveX > self.sliderLong) ?
        //   self.sliderLong : (self.beginX + moveX < 0) ? 0 : self.beginX + moveX
        // self.per = self.positionX / self.sliderLong * 100
        // self.bar.style.width = self.per + '%'
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