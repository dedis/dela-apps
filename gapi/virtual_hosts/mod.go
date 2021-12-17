package main

import (
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"
)

const dataFormat = "data:{\"timeSent\":\"%d\", \"toAddr\":\"%s\"}\nid:%d\n\n"

const n = 3

func newNodes(n int) *nodes {
	s := make(map[int]node)

	for i := 1; i <= n; i++ {
		s[i] = newNode()
	}

	return &nodes{
		s: s,
	}
}

type nodes struct {
	sync.Mutex
	s map[int]node
}

func (n *nodes) get(i int) node {
	n.Lock()
	defer n.Unlock()

	return n.s[i]
}

func newNode() node {
	return node{
		incomings: make(chan string, 100),
	}
}

type node struct {
	incomings chan string
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
	}

	for i := 1; i <= n; i++ {
		server.HandleFunc(fmt.Sprintf("/%d/recv", i), getRecvFunc(nodes.get(i)))
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

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		for {
			select {
			case <-time.After(time.Millisecond * 500 /** time.Duration(rand.Intn(10))*/):
				destIndex := rand.Intn(n) + 1
				randomDest := fmt.Sprintf("127.0.0.1:%04d", destIndex)

				message := fmt.Sprintf(dataFormat, time.Now().UnixMilli(), randomDest, id)
				fmt.Fprint(w, message)
				flusher.Flush()

				go func(node node, id int) {
					sourceAddr := fmt.Sprintf("127.0.0.1:%04d", nodeIndex)
					message := fmt.Sprintf(dataFormat, time.Now().UnixMilli(), sourceAddr, id)

					// notify the receiving node after 1 second
					time.Sleep(time.Second)
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
func getRecvFunc(node node) func(http.ResponseWriter, *http.Request) {
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
				fmt.Println("message received:", msg)
				fmt.Fprint(w, msg)
				flusher.Flush()

			case <-r.Context().Done():
				return
			}
		}
	}
}

// func getServerRecvFunc(w http.ResponseWriter, r *http.Request) {

// 	flusher, ok := w.(http.Flusher)

// 	if !ok {
// 		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
// 		return
// 	}

// 	w.Header().Set("Content-Type", "text/event-stream")
// 	w.Header().Set("Cache-Control", "no-cache")
// 	w.Header().Set("Connection", "keep-alive")
// 	w.Header().Set("Access-Control-Allow-Origin", "*")

// 	for {
// 		select {
// 		case <-time.After(time.Millisecond * 3000 /** time.Duration(rand.Intn(10))*/):
// 			path := r.URL.Path[:len(r.URL.Path)-4]

// 			for len(messages[path]) > 0 {
// 				n := len(messages[path]) - 1
// 				fmt.Fprint(w, messages[path][n])
// 				messages[path] = messages[path][:n]
// 				flusher.Flush()
// 			}

// 		case <-r.Context().Done():
// 			return
// 		}
// 	}
// }

func printConfig() {
	out := new(strings.Builder)
	out.WriteString("{\"nodes\": [\n")

	lines := make([]string, n)
	for i := 1; i <= n; i++ {
		lines[i-1] = fmt.Sprintf("\t{\"id\": \"%s\", \"addr\": \"127.0.0.1:%04d\", "+
			"\"proxy\": \"http://127.0.0.1:8081/%d/sent\"}", getID(i), i, i)
	}

	out.WriteString(strings.Join(lines, ",\n"))
	out.WriteString("\n]}")
	fmt.Printf("\n------------\nVisualization Configuration:\n------------\n\n%s\n\n------------\n", out.String())

	out2 := new(strings.Builder)
	for i := 1; i <= n; i++ {
		lines[i-1] = fmt.Sprintf("\"http://127.0.0.1:8081/%d/recv\"", i)
	}
	out2.WriteString(strings.Join(lines, ", "))
	fmt.Printf("JS Server Configuration:\n------------\n\nsources = [%s]\n\n------------\n", out2.String())
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
