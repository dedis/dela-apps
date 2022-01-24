import { scaleSequential, interpolateRainbow } from "d3"
export { getSortedIdx, getPalette }

/**
 * Returns the index of x when sorted in arr 
 */
function getSortedIdx(x: number, arr: Array<any>, f = (d: any) => d): number {
  let sortedIdx = 0
  for (let i = arr.length - 1; i >= 0; i--)
    if (x >= f(arr[i])) {
      sortedIdx = i + 1
      break
    }
  return sortedIdx
}
/**
 * Returns a palette of n colors evenly distributed 
 */
function getPalette(n: number) {
  return scaleSequential(interpolateRainbow).domain([0, n])
}