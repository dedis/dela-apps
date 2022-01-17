package main

import (
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"
)

const dataSent = "data:{\"message\":\"%s\", \"toAddr\":\"%s\", \"timeSent\":\"%d\", \"id\":\"%d\"}\n\n"
const dataRecv = "data:{\"message\":\"%s\", \"fromAddr\":\"%s\", \"timeRecv\":\"%d\", \"id\":\"%d\"}\n\n"

const n = 3

func newNodes(n int) *nodes {
	s := make(map[int]*node)

	for i := 1; i <= n; i++ {
		s[i] = newNode()
	}

	return &nodes{
		s: s,
	}
}

type nodes struct {
	sync.Mutex
	s map[int]*node
}

func (n *nodes) get(i int) *node {
	n.Lock()
	defer n.Unlock()

	return n.s[i]
}

func newNode() *node {
	return &node{
		incomings: make(chan string, 100),
	}
}

type node struct {
	incomings chan string
	isStopped bool
}

func main() {

	nodes := newNodes(n)

	// Show on console the application stated
	mainServer := http.NewServeMux()
	mainServer.Handle("/", http.FileServer(http.Dir("../static")))

	// Creating sub-domain
	server := http.NewServeMux()

	for i := 1; i <= n; i++ {
		server.HandleFunc(fmt.Sprintf("/%d/sent", i), getSentFunc(nodes, i))
		server.HandleFunc(fmt.Sprintf("/%d/recv", i), getRecvFunc(nodes.get(i)))

		server.HandleFunc(fmt.Sprintf("/%d/start", i), getStartFunc(nodes.get(i)))
		server.HandleFunc(fmt.Sprintf("/%d/stop", i), getStopFunc(nodes.get(i)))
	}

	printConfig()

	go http.ListenAndServe("localhost:8081", server)

	// Running Main Server
	http.ListenAndServe("localhost:8080", mainServer)
}

func getSentFunc(nodes *nodes, nodeIndex int) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		id := 0
		flusher, ok := w.(http.Flusher)

		if !ok {
			http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
			return
		}

		currentNode := nodes.get(nodeIndex)

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		for {
			select {
			case <-time.After(time.Millisecond * 4000 /** time.Duration(rand.Intn(10))*/):

				// if the node is stopped it won't send messages
				if currentNode.isStopped {
					continue
				}

				destIndex := rand.Intn(n) + 1
				for destIndex == nodeIndex {
					destIndex = rand.Intn(n) + 1
				}

				toAddr := fmt.Sprintf("127.0.0.1:%04d", destIndex)
				msg := strings.Repeat("Hello this is a very long message. ", 15)
				message := fmt.Sprintf(dataSent, msg, toAddr, rand.Int63n(100), id)
				fmt.Fprint(w, message)
				flusher.Flush()

				go func(node *node, id int) {
					// notify the receiving node after 1 second
					time.Sleep(time.Second)
					msg := strings.Repeat("Hello this is a very long message. ", 15)
					fromAddr := fmt.Sprintf("127.0.0.1:%04d", nodeIndex)
					message := fmt.Sprintf(dataRecv, msg, fromAddr, rand.Int63n(100)+10, id)
					node.incomings <- message
				}(nodes.get(destIndex), id)

				id++

			case <-r.Context().Done():
				return
			}
		}
	}
}

// getRecvFunc listen on the incoming channel of the node and return the
// received message. Must be called only once per node.
func getRecvFunc(node *node) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {

		flusher, ok := w.(http.Flusher)

		if !ok {
			http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		for {
			select {
			case msg := <-node.incomings:
				fmt.Fprint(w, msg)
				flusher.Flush()

			case <-r.Context().Done():
				select {
				case <-node.incomings:
				case <-time.After(time.Millisecond * 1500):
				}
				return
			}
		}
	}
}

// getStartFunc notifies the node that it should be started. Has no effect if it
// is already started.
func getStartFunc(node *node) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		fmt.Println("starting node")
		node.start()
	}
}

// getStopFunc notifies the node that it should be stopped. Has no effect if it
// is already stopped.
func getStopFunc(node *node) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		fmt.Println("stopping node")
		node.stop()
	}
}

func (node *node) stop() {
	node.isStopped = true
}

func (node *node) start() {
	node.isStopped = false
}

func printConfig() {
	out := new(strings.Builder)
	out.WriteString("{\"nodes\": [\n")

	lines := make([]string, n)
	for i := 1; i <= n; i++ {
		lines[i-1] = fmt.Sprintf("\t{\"id\": \"%s\", \"addr\": \"127.0.0.1:%04d\", "+
			"\"proxy\": \"http://127.0.0.1:8081/%d\"}", getID(i), i, i)
	}

	out.WriteString(strings.Join(lines, ",\n"))
	out.WriteString("\n]}")
	fmt.Printf("\n------------\nVisualization Configuration:\n------------\n\n%s\n\n------------\n", out.String())
}

// getID return a string of form AA to ZZ
func getID(i int) string {
	if i < 0 || i > 675 {
		return "UNDEFINED"
	}

	firstLetter := byte('A') + byte(i/26)
	secondLetter := byte('A') + byte(i%26)

	return string(firstLetter) + string(secondLetter)
}
