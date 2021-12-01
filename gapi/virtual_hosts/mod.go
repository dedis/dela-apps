// package main

// import (
// 	"fmt"
// 	"net/http"
// 	"time"

// 	dela_http "go.dedis.ch/dela/mino/proxy/http"
// )

// func main() {
// 	server := dela_http.NewHTTP("127.0.0.1:2000")
// 	server.RegisterHandler("/", func(rw http.ResponseWriter, r *http.Request) {
// 		rw.Write([]byte("Hello World"))
// 	})

// 	server.RegisterHandler("/sse", func(w http.ResponseWriter, r *http.Request) {
// 		flusher, ok := w.(http.Flusher)

// 		if !ok {
// 			http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
// 			return
// 		}

// 		w.Header().Set("Content-Type", "text/event-stream")
// 		w.Header().Set("Cache-Control", "no-cache")
// 		w.Header().Set("Connection", "keep-alive")
// 		w.Header().Set("Access-Control-Allow-Origin", "*")

// 		for {
// 			select {
// 			case <-time.After(time.Second * 2):
// 				fmt.Fprintf(w, "data: %s\n\n", "127.0.0.1:2000")
// 				flusher.Flush()
// 			case <-r.Context().Done():
// 				return
// 			}
// 		}
// 	})
// 	server.Listen()

// }

package main

import (
	"fmt"
	"net/http"
	"time"
)

const dataFormat = "data:{\"time\":\"%s\", \"dest\":\"%s\"}\n\n"
const timeFormat = "03:04:05 .999"

func main() {

	// Show on console the application stated
	main_server := http.NewServeMux()
	main_server.Handle("/", http.FileServer(http.Dir("../static")))

	//Creating sub-domain
	server1 := http.NewServeMux()
	server1.HandleFunc("/", server1func)

	server2 := http.NewServeMux()
	server2.HandleFunc("/", server2func)

	server3 := http.NewServeMux()
	server3.HandleFunc("/", server3func)

	server4 := http.NewServeMux()
	server4.HandleFunc("/", server4func)

	go func() {
		http.ListenAndServe("localhost:8081", server1)
	}()

	go func() {
		http.ListenAndServe("localhost:8082", server2)
	}()

	go func() {
		http.ListenAndServe("localhost:8083", server3)
	}()

	go func() {
		http.ListenAndServe("localhost:8084", server4)
	}()

	//Running Main Server
	http.ListenAndServe("localhost:8080", main_server)
}

func server1func(w http.ResponseWriter, r *http.Request) {
	set_header(w)
	fmt.Fprintf(w, dataFormat, time.Now().Format(timeFormat), "127.0.0.1:2002")
}

func server2func(w http.ResponseWriter, r *http.Request) {
	set_header(w)
	fmt.Fprintf(w, dataFormat, time.Now().Format(timeFormat), "127.0.0.1:2003")
}

func server3func(w http.ResponseWriter, r *http.Request) {
	set_header(w)
	fmt.Fprintf(w, dataFormat, time.Now().Format(timeFormat), "127.0.0.1:2004")
	fmt.Fprintf(w, dataFormat, time.Now().Format(timeFormat), "127.0.0.1:2001")
}

func server4func(w http.ResponseWriter, r *http.Request) {
	set_header(w)
	fmt.Fprintf(w, dataFormat, time.Now().Format(timeFormat), "127.0.0.1:2005")
	fmt.Fprintf(w, dataFormat, time.Now().Format(timeFormat), "127.0.0.1:2005")
}

func set_header(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
}
