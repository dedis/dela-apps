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
	"io/ioutil"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"time"
)

const dataFormat = "data:{\"time\":\"%d\", \"toAddr\":\"%s\"}\n\n"

const n = 6

func main() {

	// Show on console the application stated
	main_server := http.NewServeMux()
	main_server.Handle("/", http.FileServer(http.Dir("../static")))

	// Creating sub-domain
	server := http.NewServeMux()

	for i := 1; i <= n; i++ {
		server.HandleFunc(fmt.Sprintf("/%d", i), getServerFunc())
	}

	out := new(strings.Builder)
	out.WriteString("{\"nodes\": [\n")

	lines := make([]string, n)
	for i := 1; i <= n; i++ {
		lines[i-1] = fmt.Sprintf("\t{\"id\": \"%s\", \"addr\": \"127.0.0.1:%04d\", "+
			"\"proxy\": \"http://127.0.0.1:8081/%d\"}", getID(i), i, i)
	}

	out.WriteString(strings.Join(lines, ",\n"))
	out.WriteString("\n]}")

	fmt.Printf("Configuration:\n------------\n\n%s\n\n------------\n", out.String())

	go http.ListenAndServe("localhost:8081", server)

	resp, _ := http.Get("http://127.0.0.1:8081")
	body, _ := ioutil.ReadAll(resp.Body)
	sb := string(body)
	log.Printf(sb)

	// Running Main Server
	http.ListenAndServe("localhost:8080", main_server)
}

func getServerFunc() func(w http.ResponseWriter, r *http.Request) {
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
			case <-time.After(time.Millisecond * 500 * time.Duration(rand.Intn(10))):
				randomDest := fmt.Sprintf("127.0.0.1:%04d", rand.Intn(n+1))
				fmt.Fprintf(w, dataFormat, time.Now().UnixMilli(), randomDest)

				flusher.Flush()
			case <-r.Context().Done():
				return
			}
		}
	}
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
