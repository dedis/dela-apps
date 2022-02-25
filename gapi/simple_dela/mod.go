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
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog"
	accessContract "go.dedis.ch/dela/contracts/access"
	"go.dedis.ch/dela/core"
	"go.dedis.ch/dela/core/txn"
	"go.dedis.ch/dela/core/txn/signed"
	"go.dedis.ch/dela/crypto/bls"
	"go.dedis.ch/dela/crypto/loader"
	"go.dedis.ch/dela/mino"
	"go.dedis.ch/dela/mino/minogrpc"
	"go.dedis.ch/dela/mino/minogrpc/session"
	"go.dedis.ch/dela/mino/router"
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
	n := 5

	delapkg.Logger = delapkg.Logger.Level(zerolog.WarnLevel)

	dir, err := ioutil.TempDir(os.TempDir(), "dela-integration-test")
	if err != nil {
		panic("failed to create  dir: " + err.Error())
	}

	fmt.Printf("using temps dir %s\n", dir)

	defer os.RemoveAll(dir)

	nodes := make([]dela, n)

	nodesPortStart := 5000
	proxyPortStart := 4000

	for i := 0; i < n; i++ {
		node, err := newDelaNode(filepath.Join(dir, fmt.Sprintf("node%d", i)),
			nodesPortStart+i)
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

		config := fmt.Sprintf("\t{\"id\": \"%s\", \"addr\": \"%s\", \"proxy\": "+
			"\"http://127.0.0.1:%04d\"}", getID(i), mino.GetAddress().String(),
			proxyPortStart+i)
		nodeConfigs[i] = config

		go func(i int, mino *minogrpc.Minogrpc) {
			dn := newDynamicNode(mino.GetAddress().String(), nodesPortStart+i,
				nodes[i], filepath.Join(dir, fmt.Sprintf("node%d", i)), stop)

			fmt.Printf("Server %d, addr: %s\n", i, mino.GetAddress().String())

			listen(dn)
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

// newDynamicNode returns a new initialized dynamic nodes
func newDynamicNode(addr string, port int, node dela, confPath string,
	globalstop chan struct{}) dynamicNode {

	dn := dynamicNode{
		addr:       addr,
		port:       port,
		node:       node,
		configPath: confPath,

		globalstop:  globalstop,
		sessionstop: make(chan struct{}),

		inWatcher:  core.NewWatcher(),
		outWatcher: core.NewWatcher(),
	}

	dn.watchPackets()

	return dn
}

// event redefines the internal.Event type from dela. We can't directly use it
// because it is in the internal/ package.
type event struct {
	address mino.Address
	pkt     router.Packet
}

// dynamicNode wraps a dela node that can be stopped et re-started
type dynamicNode struct {
	addr       string
	port       int
	node       dela
	configPath string

	globalstop  chan struct{}
	sessionstop chan struct{}

	// we use intermediary watchers because if we used the dela watcher, they
	// would close when the node stops, but Polypus still wants to read from it
	// when the node restarts.
	inWatcher  core.Observable
	outWatcher core.Observable
}

// start starts the dela node if not already started
func (dn *dynamicNode) start() {
	if dn.node != nil {
		fmt.Println("ERROR: node already started", dn.port)
		return
	}

	dn.sessionstop = make(chan struct{})

	fmt.Printf("starting :%d with config from %s\n", dn.port, dn.configPath)

	node, err := newDelaNode(dn.configPath, dn.port)
	if err != nil {
		panic("failed to create: " + err.Error())
	}

	dn.node = node

	dn.watchPackets()
}

// stop stops the dela node. It won't close the ins/outs channel opened by
// Polypus.
func (dn *dynamicNode) stop() {
	fmt.Println("stopping", dn.addr)

	if dn.node == nil {
		fmt.Println("ERROR: node already stopped")
		return
	}

	close(dn.sessionstop)
	dn.node.Stop()
	dn.node = nil
}

// watchPackets will notify the dynamicNode watchers when packets are
// sent/received from the dela node. This function must be called each time the
// dela node is (re)started.
func (dn *dynamicNode) watchPackets() {
	mino, ok := dn.node.GetMino().(*minogrpc.Minogrpc)
	if !ok {
		panic("not minogrpc")
	}

	watcher := mino.GetTrafficWatcher()

	ctx, cancel := context.WithCancel(context.Background())

	go func() {
		<-dn.sessionstop
		cancel()
	}()

	go func() {
		ins := watcher.WatchIns(ctx)

		for pkt := range ins {
			dn.inWatcher.Notify(event{
				address: pkt.Address,
				pkt:     pkt.Pkt,
			})
		}
	}()

	go func() {
		outs := watcher.WatchOuts(ctx)

		for pkt := range outs {
			dn.outWatcher.Notify(event{
				address: pkt.Address,
				pkt:     pkt.Pkt,
			})
		}
	}()
}

func (dn *dynamicNode) watchIns(ctx context.Context) <-chan event {
	return watch(ctx, dn.inWatcher)
}

func (dn *dynamicNode) watchOuts(ctx context.Context) <-chan event {
	return watch(ctx, dn.outWatcher)
}

// listen starts the dela proxy service that Polypus needs
func listen(dn dynamicNode) {
	srv := delahttp.NewHTTP(":" + strconv.Itoa(dn.port-1000))

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

		ins := dn.watchIns(r.Context())

		for {
			select {
			case in := <-ins:
				addr := in.address.(session.Address).GetDialAddress()
				tt := time.Now().UnixMicro()

				message := fmt.Sprintf(dataRecv, "*not used*", addr, tt, in.pkt.GetPacketID())

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

		outs := dn.watchOuts(r.Context())

		for {
			select {
			case out := <-outs:
				msgContent := out.pkt.GetMessage()
				addr := out.address.(session.Address).GetDialAddress()
				tt := time.Now().UnixMicro()

				message := fmt.Sprintf(dataSent, msgContent, addr, tt, out.pkt.GetPacketID())
				fmt.Fprintf(w, message)

				flusher.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})

	srv.RegisterHandler("/start", func(rw http.ResponseWriter, r *http.Request) {
		dn.start()

	})

	srv.RegisterHandler("/stop", func(rw http.ResponseWriter, r *http.Request) {
		dn.stop()
	})

	go srv.Listen()

	time.Sleep(time.Second)

	fmt.Println("server listening on", srv.GetAddr())

	<-dn.globalstop
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

// observer defines an observer to fill a channel
//
// - implements core.Observer
type observer struct {
	ch chan event
}

// NotifyCallback implements core.Observer. It drops the message if the channel
// is full.
func (o observer) NotifyCallback(e interface{}) {
	select {
	case o.ch <- e.(event):
	default:
		fmt.Println("channel full")
	}
}

// watch implements core.Observer
func watch(ctx context.Context, watcher core.Observable) <-chan event {
	obs := observer{ch: make(chan event, 10)}

	watcher.Add(obs)

	go func() {
		<-ctx.Done()
		watcher.Remove(obs)
		close(obs.ch)
	}()

	return obs.ch
}
