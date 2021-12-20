var http = require('http');
var url = require('url');
var querystring = require('querystring');
var EventSource = require("eventsource");
// let static = require('node-static');
// let fileServer = new static.Server('.');

const n = 3
const port = 8082
// const proxys = []
// const addrs = []
sources = ["http://127.0.0.1:8081/1/recv", "http://127.0.0.1:8081/2/recv", "http://127.0.0.1:8081/3/recv"]

// for (let i=1; i<=n; i++) {
//     proxys.push("http://127.0.0.1:8081/" + i.toString())
//     addrs.push("http://127.0.0.1:" + "0".repeat(4 - i.toString().length) + n.toString())
// }

const server = http.createServer(function(req, res) {

    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    if (req.url == "/1") {
        res.write('data: hello\n\n')
        sources.forEach((source, idx) => {
            const trafficSrc = new EventSource(source)
            trafficSrc.onmessage = function(e){
                console.log(trafficSrc.url)

                //res.write("data:{\"timeRecv\":\"" + Date.now() + "\", \"fromAddr\":\"" + addrs[idx] + "\"}\n\n");
            }
        }) 
    }
    else {
        res.write("404 page not found")
        res.end()
    }
}).listen(port);