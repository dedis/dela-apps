package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io/ioutil"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"time"

	"github.com/rs/zerolog"
	accessContract "go.dedis.ch/dela/contracts/access"
	"go.dedis.ch/dela/core/txn"
	"go.dedis.ch/dela/core/txn/signed"
	"go.dedis.ch/dela/crypto/bls"
	"go.dedis.ch/dela/crypto/loader"
	"go.dedis.ch/dela/mino/minogrpc"
	"go.dedis.ch/dela/mino/minogrpc/session"
	"golang.org/x/xerrors"

	delapkg "go.dedis.ch/dela"
	delahttp "go.dedis.ch/dela/mino/proxy/http"
)

const dataSent = "data:{\"message\":%s, \"toAddr\":\"%s\", \"timeSent\":\"%d\", \"id\":\"%s\"}\n\n"
const dataRecv = "data:{\"message\":\"%s\", \"fromAddr\":\"%s\", \"timeRecv\":\"%d\", \"id\":\"%s\"}\n\n"

const txWait = time.Second * 20

func init() {
	rand.Seed(0)
}

// Start N nodes
// Use the value contract
// Check the state
func main() {
	n := 20

	delapkg.Logger = delapkg.Logger.Level(zerolog.WarnLevel)

	dir, err := ioutil.TempDir(os.TempDir(), "dela-integration-test")
	if err != nil {
		panic("failed to create  dir: " + err.Error())
	}

	fmt.Printf("using temps dir %s\n", dir)

	defer os.RemoveAll(dir)

	nodes := make([]dela, n)

	for i := 0; i < n; i++ {
		node, err := newDelaNode(filepath.Join(dir, fmt.Sprintf("node%d", i)), 0)
		if err != nil {
			panic("failed to create: " + err.Error())
		}

		nodes[i] = node
	}

	stop := make(chan struct{})

	config := new(strings.Builder)
	config.WriteString("{\"nodes\": [\n")

	nodeConfigs := make([]string, len(nodes))

	for i, node := range nodes {
		mino, ok := node.GetMino().(*minogrpc.Minogrpc)
		if !ok {
			panic(fmt.Sprintf("mino not watchable: %T", node.GetMino()))
		}

		config := fmt.Sprintf("\t{\"id\": \"%s\", \"addr\": \"%s\", \"proxy\": \"http://127.0.0.1:%04d\"}", getID(i), mino.GetAddress().String(), 4000+i)
		nodeConfigs[i] = config

		go func(i int, mino *minogrpc.Minogrpc) {
			fmt.Printf("Server %d, addr: %s\n", i, mino.GetAddress().String())
			listen(mino, fmt.Sprintf(":%04d", 4000+i), stop)
		}(i, mino)
	}

	config.WriteString(strings.Join(nodeConfigs, ",\n"))
	config.WriteString("\n]}")

	fmt.Println("\n\n", config.String(), "\n\n")

	nodes[0].Setup(nodes[1:]...)

	l := loader.NewFileLoader(filepath.Join(dir, "private.key"))

	signerdata, err := l.LoadOrCreate(newKeyGenerator())
	if err != nil {
		panic("failed to load or create signer: " + err.Error())
	}

	signer, err := bls.NewSignerFromBytes(signerdata)
	if err != nil {
		panic("failed to create signer: " + err.Error())
	}

	pubKey := signer.GetPublicKey()
	cred := accessContract.NewCreds(aKey[:])

	for _, node := range nodes {
		node.GetAccessService().Grant(node.(cosiDelaNode).GetAccessStore(), cred, pubKey)
	}

	manager := signed.NewManager(signer, &txClient{})

	pubKeyBuf, err := signer.GetPublicKey().MarshalBinary()
	if err != nil {
		panic("failed to marshal pubkey: " + err.Error())
	}

	args := []txn.Arg{
		{Key: "go.dedis.ch/dela.ContractArg", Value: []byte("go.dedis.ch/dela.Access")},
		{Key: "access:grant_id", Value: []byte(hex.EncodeToString(valueAccessKey[:]))},
		{Key: "access:grant_contract", Value: []byte("go.dedis.ch/dela.Value")},
		{Key: "access:grant_command", Value: []byte("all")},
		{Key: "access:identity", Value: []byte(base64.StdEncoding.EncodeToString(pubKeyBuf))},
		{Key: "access:command", Value: []byte("GRANT")},
	}

	err = addAndWait(manager, nodes[0].(cosiDelaNode), args...)
	if err != nil {
		panic("failed to add and wait: " + err.Error())
	}

	key1 := make([]byte, 32)

	_, err = rand.Read(key1)
	if err != nil {
		panic("failed to read random: " + err.Error())
	}

	args = []txn.Arg{
		{Key: "go.dedis.ch/dela.ContractArg", Value: []byte("go.dedis.ch/dela.Value")},
		{Key: "value:key", Value: key1},
		{Key: "value:value", Value: []byte("value1")},
		{Key: "value:command", Value: []byte("WRITE")},
	}

	err = addAndWait(manager, nodes[0].(cosiDelaNode), args...)
	if err != nil {
		panic("failed to add and wait: " + err.Error())
	}

	proof, err := nodes[0].GetOrdering().GetProof(key1)
	if err != nil {
		panic("failed to get proof: " + err.Error())
	}

	if !bytes.Equal([]byte("value1"), proof.GetValue()) {
		panic(fmt.Sprintf("bytes not equal: %s != %s", "value1", proof.GetValue()))
	}

	key2 := make([]byte, 32)

	_, err = rand.Read(key2)
	if err != nil {
		panic("failed to read random: " + err.Error())
	}

	args = []txn.Arg{
		{Key: "go.dedis.ch/dela.ContractArg", Value: []byte("go.dedis.ch/dela.Value")},
		{Key: "value:key", Value: key2},
		{Key: "value:value", Value: []byte("value2")},
		{Key: "value:command", Value: []byte("WRITE")},
	}

	err = addAndWait(manager, nodes[0].(cosiDelaNode), args...)
	if err != nil {
		panic("failed to add and wait: " + err.Error())
	}

	done := make(chan os.Signal)

	go func() {
		for {
			args = []txn.Arg{
				{Key: "go.dedis.ch/dela.ContractArg", Value: []byte("go.dedis.ch/dela.Value")},
				{Key: "value:key", Value: key2},
				{Key: "value:value", Value: []byte("value2")},
				{Key: "value:command", Value: []byte("WRITE")},
			}

			fmt.Println("sending TX")

			addAndWait(manager, nodes[0].(cosiDelaNode), args...)

			time.Sleep(time.Second * 10)
		}
	}()

	go func() {
		signal.Notify(done, os.Interrupt, os.Kill)
	}()

	fmt.Println("press CTRL+C to exit")
	<-done

	close(stop)
	fmt.Println("done, bye 👋")
}

func listen(minogrpc *minogrpc.Minogrpc, addr string, stop chan struct{}) {
	srv := delahttp.NewHTTP(addr)

	watcher := minogrpc.GetTrafficWatcher()

	srv.RegisterHandler("/recv", func(w http.ResponseWriter, r *http.Request) {
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

		ins := watcher.WatchIns(ctx)

		for {
			select {
			case in := <-ins:
				message := fmt.Sprintf(dataRecv, "*not used*", in.Address.(session.Address).GetDialAddress(), time.Now().UnixMicro(), in.Pkt.GetPacketID())
				fmt.Fprintf(w, message)
				flusher.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})

	srv.RegisterHandler("/sent", func(w http.ResponseWriter, r *http.Request) {
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

		outs := watcher.WatchOuts(ctx)

		for {
			select {
			case out := <-outs:
				msgContent := out.Pkt.GetMessage()

				message := fmt.Sprintf(dataSent, msgContent, out.Address.(session.Address).GetDialAddress(), time.Now().UnixMicro(), out.Pkt.GetPacketID())
				fmt.Fprintf(w, message)

				flusher.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})

	go srv.Listen()

	time.Sleep(time.Second)

	fmt.Println("server listening on", srv.GetAddr())

	<-stop
	srv.Stop()
}

// -----------------------------------------------------------------------------
// Utility functions

func addAndWait(manager txn.Manager, node cosiDelaNode, args ...txn.Arg) error {
	manager.Sync()

	tx, err := manager.Make(args...)
	if err != nil {
		return xerrors.Errorf("failed to make tx: %v", err)
	}

	err = node.GetPool().Add(tx)
	if err != nil {
		return xerrors.Errorf("failed to add tx to pool: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), txWait)
	defer cancel()

	events := node.GetOrdering().Watch(ctx)

	for event := range events {
		for _, result := range event.Transactions {
			tx := result.GetTransaction()

			if bytes.Equal(tx.GetID(), tx.GetID()) {
				accepted, err := event.Transactions[0].GetStatus()
				if err != "" {
					return xerrors.Errorf("got error status: %s", err)
				}

				if !accepted {
					return xerrors.New("transaction not accepted")
				}

				return nil
			}
		}
	}

	return xerrors.New("transaction not found")
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
