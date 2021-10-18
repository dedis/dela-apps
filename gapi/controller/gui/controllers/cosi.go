package controllers

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"

	"go.dedis.ch/dela/core/txn/signed"
)

// Transaction handles the home page
func (c *Ctrl) Transaction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			c.transactionGET(w, r)
		default:
			http.Error(w, "only GET request allowed", http.StatusBadRequest)
		}
	}
}

// Store handles the home page
func (c *Ctrl) Store() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			c.storeGET(w, r)
		default:
			http.Error(w, "only GET request allowed", http.StatusBadRequest)
		}
	}
}

func (c *Ctrl) transactionGET(w http.ResponseWriter, r *http.Request) {
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

	events := c.api.Cosi.Watch(ctx)

	type tx struct {
		Accepted bool
		Status   string
		Args     map[string]string
		ID       []byte
		Identity string
	}

	type event struct {
		Index uint64
		Txs   []tx
	}

	for {
		select {
		case e := <-events:
			txs := make([]tx, len(e.Transactions))

			for j, t := range e.Transactions {
				accepted, msg := t.GetStatus()
				args := make(map[string]string)

				signed := t.GetTransaction().(*signed.Transaction)
				for _, k := range signed.GetArgs() {
					args[k] = string(signed.GetArg(k))
				}

				buf, _ := signed.GetIdentity().MarshalText()

				txs[j] = tx{
					Args:     args,
					Accepted: accepted,
					Status:   msg,
					ID:       signed.GetID(),
					Identity: string(buf),
				}
			}

			result := event{
				Index: e.Index,
				Txs:   txs,
			}

			js, err := json.Marshal(&result)
			if err != nil {
				http.Error(w, "failed to marshall events: "+err.Error(), http.StatusInternalServerError)
				return
			}

			fmt.Fprintf(w, "data: %s\n\n", js)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func (c *Ctrl) storeGET(w http.ResponseWriter, r *http.Request) {

	store := c.api.Cosi.GetStore()

	result := make(map[string]string)

	key := [32]byte{0, 0, 10}
	val, err := store.Get(key[:])
	if err != nil {
		http.Error(w, "failed to get: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if len(val) == 0 {
		val = make([]byte, 8)
	}

	counter := binary.LittleEndian.Uint64(val)
	result[fmt.Sprintf("%s", key)] = fmt.Sprintf("%d", counter)

	js, err := json.MarshalIndent(&result, "", "\t")
	if err != nil {
		http.Error(w, "failed to marshall result: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	w.Write(js)
}
