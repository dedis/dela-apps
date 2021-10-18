// Package main implements a CLI to orchestrate commands on Dela nodes.
package main

import (
	"bufio"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"golang.org/x/xerrors"
)

const startNodePort = 2001
const startProxyPort = 8081

type command interface {
	run(ctx *context, inputs ...string) error
	getName() string
	getDesc() string
}

type context struct {
	nodes  Nodes
	n      int
	tmpdir string
	cmdMap map[string]command
}

func main() {
	n := flag.Int("n", 10, "number of nodes to create")
	target := flag.String("target", "", "root folder where to store the "+
		"configurations, can be empty")

	flag.Parse()

	tmpdir, err := ioutil.TempDir(*target, "dela-integration-*")
	if err != nil {
		log.Fatalf("failed to create tmpdir: %v\n", err)
	}

	defer os.RemoveAll(tmpdir)

	commands := []command{
		NewCommand("start", "start the nodes", start),
		NewCommand("startChain", "create a new chain", startChain),
		NewCommand("share", "share the certificates", share),
		NewCommand("startProxy", "start the proxies", startProxy),
		NewCommand("registerHandler", "register the gapi handler", registerHandler),
		NewCommand("printConfig", "prints the configuration", printConfig),
		NewCommand("stop", "stop the nodes", stop),
		NewCommand("help", "print help", help),
		NewCommand("remove", "remove the content of the temp dir", remove),
	}

	cmdMap := make(map[string]command)
	for _, cmd := range commands {
		cmdMap[cmd.getName()] = cmd
	}

	context := &context{
		n:      *n,
		tmpdir: tmpdir,
		cmdMap: cmdMap,
	}

	for {
		fmt.Print("> what do you want to do ? ")
		reader := bufio.NewReader(os.Stdin)
		input, err := reader.ReadString('\n')
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
		}
		input = strings.TrimSuffix(input, "\n")

		args := strings.Fields(input)
		if len(args) == 0 {
			args = append(args, "help")
		}

		cmdName := args[0]

		if cmdName == "exit" {
			fmt.Println("bye!")
			return
		}

		cmd := cmdMap[cmdName]
		if cmd == nil {
			cmd = cmdMap["help"]
		}

		err = cmd.run(context, args[1:]...)
		if err != nil {
			log.Printf("failed to run: %v", err)
		}
	}

}

// Nodes defines an array of node
type Nodes []*Node

// Node contains all information about a running node
type Node struct {
	Dir   string
	ID    string
	Addr  string
	Proxy string
	proc  *os.Process
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

// NewCommand creates a new command
func NewCommand(name, description string, run func(c *context, inputs ...string) error) command {
	return genericCMD{
		name: name,
		desc: description,
		f:    run,
	}
}

// genericCMD provides a generic command
//
// - implements command
type genericCMD struct {
	name string
	desc string
	f    func(c *context, inputs ...string) error
}

// run implements command.
func (cmd genericCMD) run(ctx *context, inputs ...string) error {
	return cmd.f(ctx, inputs...)
}

// getName implements command.
func (cmd genericCMD) getName() string {
	return cmd.name
}

// getDesc implements command.
func (cmd genericCMD) getDesc() string {
	return cmd.desc
}

func start(ctx *context, inputs ...string) error {
	if len(inputs) > 0 {
		n, err := strconv.ParseUint(inputs[0], 10, 64)
		if err != nil {
			return xerrors.Errorf("failed to convert n: %v", err)
		}

		log.Printf("setting n to %d", n)
		ctx.n = int(n)
	}

	ctx.nodes = make(Nodes, ctx.n)

	for i := 0; i < ctx.n; i++ {
		dir := fmt.Sprintf("%s/%d", ctx.tmpdir, i+1)

		err := os.MkdirAll(dir, os.ModePerm)
		if err != nil {
			log.Fatalf("failed to create dir: %v\n", err)
		}

		args := []string{
			"--config", dir,
			"start",
			"--port", fmt.Sprintf("%d", startNodePort+i),
		}

		outfile, err := os.Create(filepath.Join(dir, "stdout.txt"))
		if err != nil {
			log.Fatalf("failed to create outfile: %v\n", err)
		}

		errfile, err := os.Create(filepath.Join(dir, "stderr.txt"))
		if err != nil {
			log.Fatalf("failed to create errfile: %v\n", err)
		}

		cmd := exec.Command("memcoin", args...)
		cmd.Env = os.Environ()
		cmd.Env = append(cmd.Env, "LLVL=info")
		cmd.Env = append(cmd.Env, fmt.Sprintf(`UNIKERNEL_TCP=%s:%d`, "192.168.232.128", 9001+i))

		cmd.Stdout = outfile
		cmd.Stderr = errfile

		log.Printf("%s %s", "memcoin", strings.Join(args, " "))

		err = cmd.Start()
		if err != nil {
			log.Fatalf("failed to run %s: %v\n", dir, err)
		}

		ctx.nodes[i] = &Node{
			Dir:  dir,
			ID:   getID(i),
			Addr: fmt.Sprintf("127.0.0.1:%d", startNodePort+i),
			proc: cmd.Process,
		}
	}

	return nil
}

func startChain(ctx *context, inputs ...string) error {
	args := []string{
		"--config", ctx.nodes[0].Dir,
		"ordering", "setup",
	}

	for _, node := range ctx.nodes {
		out, err := exec.Command("memcoin", "--config", node.Dir, "ordering", "export").Output()
		if err != nil {
			log.Fatalf("failed to export node %s: %v\n", node.ID, err)
		}

		outStr := strings.Trim(string(out), "\n\r")

		args = append(args, "--member", outStr)
	}

	log.Printf("%s %s", "memcoin", strings.Join(args, " "))

	out, err := exec.Command("memcoin", args...).Output()
	if err != nil {
		log.Fatalf("failed to create chain: %v\n", err)
	}

	if len(out) != 0 {
		log.Println(string(out))
	}

	return nil
}

func stop(ctx *context, inputs ...string) error {
	for _, node := range ctx.nodes {
		err := node.proc.Signal(os.Interrupt)
		if err != nil {
			err := node.proc.Kill()
			if err != nil {
				log.Printf("failed to kill proc %s: %v\n", node.ID, err)
			}
		}

		fmt.Printf("proc %s stopped\n", node.ID)
	}

	return nil
}

func share(ctx *context, inputs ...string) error {
	// it is not safe to share the certificates concurrently.
	numTickets := 1

	log.Println("let's share the certificates")

	args := []string{
		"--config", ctx.nodes[0].Dir,
		"minogrpc", "token",
	}

	token, err := exec.Command("memcoin", args...).Output()
	if err != nil {
		log.Fatalf("failed to get token: %v\n", err)
	}

	tokenStr := strings.Trim(string(token), "\n\r")

	wait := sync.WaitGroup{}
	wait.Add(len(ctx.nodes) - 1)

	tickets := make(chan struct{}, numTickets)
	for i := 0; i < numTickets; i++ {
		tickets <- struct{}{}
	}

	for i := 1; i < len(ctx.nodes); i++ {
		go func(i int, addr string) {
			defer wait.Done()

			<-tickets

			args := append([]string{
				"--config", ctx.nodes[i].Dir,
				"minogrpc", "join",
				"--address", addr,
			}, strings.Split(tokenStr, " ")...)

			log.Printf("%s %s", "memcoin", strings.Join(args, " "))

			out, err := exec.Command("memcoin", args...).Output()
			if err != nil {
				log.Fatalf("failed to share certificate for %s: %v\n", ctx.nodes[i].ID, err)
			}

			if len(out) != 0 {
				log.Println(string(out))
			}

			tickets <- struct{}{}

		}(i, ctx.nodes[0].Addr)
	}

	wait.Wait()

	log.Printf("certificates shared")

	return nil
}

func startProxy(ctx *context, inputs ...string) error {
	wait := sync.WaitGroup{}
	wait.Add(len(ctx.nodes))

	for i, node := range ctx.nodes {
		go func(i int, node *Node) {
			defer wait.Done()

			proxyAddr := fmt.Sprintf("127.0.0.1:%d", startProxyPort+i)

			args := []string{
				"--config", node.Dir,
				"proxy", "start",
				"--clientaddr", proxyAddr,
			}

			log.Printf("%s %s", "memcoin", strings.Join(args, " "))

			out, err := exec.Command("memcoin", args...).Output()
			if err != nil {
				log.Fatalf("failed to start proxy for %d: %v\n", i, err)
			}

			if len(out) != 0 {
				log.Println(string(out))
			}

			node.Proxy = "http://" + proxyAddr

			fmt.Println("proxy started for", i, "at", proxyAddr)
		}(i, node)
	}
	wait.Wait()

	return nil
}

func registerHandler(ctx *context, inputs ...string) error {
	for i, node := range ctx.nodes {
		args := []string{
			"--config", node.Dir,
			"gapi", "register",
		}

		log.Printf("%s %s", "memcoin", strings.Join(args, " "))

		out, err := exec.Command("memcoin", args...).Output()
		if err != nil {
			log.Fatalf("failed to register handler for %d: %v\n", i, err)
		}

		if len(out) != 0 {
			log.Println(string(out))
		}

		fmt.Println("handler registered for", i)
	}

	return nil
}

func printConfig(ctx *context, inputs ...string) error {
	out := new(strings.Builder)
	out.WriteString(`{"nodes":[`)
	nodesStr := make([]string, len(ctx.nodes))
	for i, node := range ctx.nodes {
		nodesStr[i] = fmt.Sprintf(`{"id": "%s", "addr": "%s", "proxy": "%s"}`, node.ID, node.Addr, node.Proxy)
	}
	out.WriteString(strings.Join(nodesStr, ","))
	out.WriteString(`]}`)

	fmt.Println(out.String())

	return nil
}

func help(ctx *context, inputs ...string) error {
	fmt.Printf("Help:\n\n")

	for _, cmd := range ctx.cmdMap {
		fmt.Printf("\t- '%s'\t%s\n", cmd.getName(), cmd.getDesc())
	}

	fmt.Printf("\t- '%s'\t%s\n", "exit", "exit the program")

	fmt.Print("\n")

	return nil
}

func remove(ctx *context, inputs ...string) error {
	err := os.RemoveAll(ctx.tmpdir)
	if err != nil {
		return xerrors.Errorf("failed to remove tmp dir")
	}

	err = os.MkdirAll(ctx.tmpdir, os.ModePerm)
	if err != nil {
		return xerrors.Errorf("failed to make tmp dir")
	}

	return nil
}
