export { datai, dataSent, dataRecv }
export { SENT, RECV, REPLAY }

const SENT = 0
const RECV = 1
const REPLAY = 2

// format of saved and manipulated data
interface datai {
  message: string
  fromNode: string
  toNode: string
  timeSent: number
  timeRecv: number
  id: string
  color: string
}

// format of data sent by nodes
interface dataSent {
  message: string
  toAddr: string
  timeSent: string
  id: string
}

// format of data received by nodes
interface dataRecv {
  message: string
  fromAddr: string
  timeRecv: string
  id: string
}