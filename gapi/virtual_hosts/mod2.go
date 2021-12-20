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

var messages = sync.Map{}

// var idSent = 0

func main() {

	// Show on console the application stated
	main_server := http.NewServeMux()
	main_server.Handle("/", http.FileServer(http.Dir("../static")))

	// Creating sub-domain
	server := http.NewServeMux()

	for i := 1; i <= n; i++ {
		server.HandleFunc(fmt.Sprintf("/%d/sent", i), getServerFunc)
	}

	for i := 1; i <= n; i++ {
		server.HandleFunc(fmt.Sprintf("/%d/recv", i), getServerFunc)
	}

	printConfig()

	go http.ListenAndServe("localhost:8081", server)

	// Running Main Server
	http.ListenAndServe("localhost:8080", main_server)
}

func getServerFunc(w http.ResponseWriter, r *http.Request) {

	id := 0
	path := r.URL.Path
	node := path[:len(path)-4]
	event := path[len(path)-4:]

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
		case <-time.After(time.Millisecond * 30000 /** time.Duration(rand.Intn(10))*/):
			if event == "sent" {
				randomDest := fmt.Sprintf("127.0.0.1:%04d", rand.Intn(n)+1)
				message := fmt.Sprintf(dataFormat, time.Now().UnixMilli(), randomDest, id)
				fmt.Fprint(w, message)
				flusher.Flush()
				id++
				key := fmt.Sprintf(node, id)
				_, ok := messages.LoadOrStore(key, message)
				if ok {
					http.Error(w, "message lost", http.StatusInternalServerError)
				}
			} else if event == "recv" {
				messages.Range(func(k, message interface{}) bool {
					key := k.(string)
					if key[:len(node)] == node {
						fmt.Fprint(w, message)
						flusher.Flush()
						messages.Delete(k)
					}
					return true
				})

			} else {
				http.Error(w, "page not found", http.StatusNotFound)
			}

		case <-r.Context().Done():
			return
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