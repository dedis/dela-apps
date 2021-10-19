package controllers

import (
	"context"
	"fmt"
	"net/http"
)

// Sent handles the home page
func (c *Ctrl) Sent() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			c.sentGET(w, r)
		default:
			http.Error(w, "only GET request allowed", http.StatusBadRequest)
		}
	}
}

func (c *Ctrl) sentGET(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)

	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	watcher := c.api.Grpc.GetTrafficWatcher()
	ins := watcher.WatchIns(ctx)

	for {
		select {
		case in := <-ins:
			fmt.Fprintf(w, "data: %s\n\n", in.Address.String())
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}
