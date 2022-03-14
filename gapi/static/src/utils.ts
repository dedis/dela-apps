import { scaleSequential, interpolateRainbow } from "d3"
export { getSortedIdx, getPalette, supportsPassive, cssTransformParsing }

const supportsPassive = supportsPassiveTest()
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

/**
 * Test via a getter in the options object to see if the passive property is accessed
 */
function supportsPassiveTest(): boolean {
  let support = false;
  try {
    var opts = Object.defineProperty({}, 'passive', {
      get: function () {
        support = true;
      }
    });
    window.addEventListener("testPassive", null, opts);
    window.removeEventListener("testPassive", null, opts);
  } catch (e) { }
  return support
}

/**
 * Function used to retrieve numeric data from CSS transform strings
 * @param name transform name
 * @param transform CSS transform string
 */
function cssTransformParsing(name: string, transform: string): Array<number> {
  switch (name) {
    case "translate":
      const commaIdx = transform.indexOf(",")
      const x = parseFloat(transform.slice(10, commaIdx))
      const y = parseFloat(transform.slice(commaIdx + 1, -1))
      return [x, y]
      break
    default:
      break

  }
}
