export { Slider }

class Slider {

  slider: HTMLElement | null
  bar: HTMLElement | null
  mDown: boolean
  beginX: number
  positionX: number
  beginClientX: number
  sliderLong: number
  per: number
  currentTime: HTMLElement

  constructor(id: string) {
    this.slider = document.getElementById(id)
    this.bar = this.slider.querySelector('.progress-bar')
    this.currentTime = document.getElementById("current-time")
  }

  listen() {
    const self = this

    self.slider.addEventListener('mousedown', function (e: MouseEvent) {
      if (e.button == 0) { // Judgment click the left button
        self.mDown = true
        self.beginX = e.offsetX
        self.positionX = e.offsetX
        self.beginClientX = e.clientX
        self.sliderLong = self.slider.clientWidth
        self.per = self.positionX / self.sliderLong
        self.bar.style.width = self.per * 100 + '%'
      }
    })
    document.addEventListener('mousemove', function (e: MouseEvent) {
      if (self.mDown) {
        var moveX = e.clientX - self.beginClientX
        self.positionX = (self.beginX + moveX > self.sliderLong) ?
          self.sliderLong : (self.beginX + moveX < 0) ? 0 : self.beginX + moveX
        self.per = self.positionX / self.sliderLong
        self.bar.style.width = self.per * 100 + '%'
        e.preventDefault()
      }
    })
  }
  setWidth(per: number) {
    this.per = per
    this.bar.style.width = per * 100 + '%'
  }
}
