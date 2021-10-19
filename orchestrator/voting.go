package main

import (
	"fmt"
	"log"
	"os/exec"
	"path/filepath"
	"strings"
)

func grantVoting(ctx *context, inputs ...string) error {
	keyPath := filepath.Join(ctx.tmpdir, "private.key")

	if len(inputs) == 1 {
		keyPath = inputs[0]
	}

	pubKey, err := getPubKey(keyPath)
	if err != nil {
		log.Fatalf("failed to get pubKey: %v\n", err)
	}

	args := []string{
		"--config", ctx.nodes[0].Dir,
		"pool", "add",
		"--key", keyPath,
		"--args", "go.dedis.ch/dela.ContractArg",
		"--args", "go.dedis.ch/dela.Access",
		"--args", "access:grant_id",
		"--args", "0300000000000000000000000000000000000000000000000000000000000000",
		"--args", "access:grant_contract",
		"--args", "go.dedis.ch/dela.Evoting",
		"--args", "access:grant_command",
		"--args", "all",
		"--args", "access:identity",
		"--args", pubKey,
		"--args", "access:command",
		"--args", "GRANT",
	}

	out, err := exec.Command("memcoin", args...).Output()
	if err != nil {
		log.Fatalf("failed to add right: %v\n", err)
	}

	if len(out) != 0 {
		log.Println(string(out))
	}

	return nil
}

func initDKG(ctx *context, inputs ...string) error {
	for i, node := range ctx.nodes {
		args := []string{
			"--config", node.Dir,
			"dkg", "init",
		}

		log.Printf("%s %s", "memcoin", strings.Join(args, " "))

		out, err := exec.Command("memcoin", args...).Output()
		if err != nil {
			log.Fatalf("failed to init dkg for %d: %v\n", i, err)
		}

		if len(out) != 0 {
			log.Println(string(out))
		}

		fmt.Println("DKG initialized for", i)
	}

	args := []string{
		"--config", ctx.nodes[0].Dir,
		"dkg", "setup",
	}

	for i, node := range ctx.nodes {
		out, err := exec.Command("memcoin", "--config", node.Dir, "dkg",
			"export").Output()
		if err != nil {
			log.Fatalf("failed to export DKG for %d: %v\n", i, err)
		}

		args = append(args, "--member", strings.Trim(string(out), "\n\r "))
	}

	log.Printf("%s %s", "memcoin", strings.Join(args, " "))

	out, err := exec.Command("memcoin", args...).Output()
	if err != nil {
		log.Fatalf("failed to setup DKG: %v\n", err)
	}

	if len(out) != 0 {
		log.Println(string(out))
	}

	return nil
}

func initShuffle(ctx *context, inputs ...string) error {
	keyPath := filepath.Join(ctx.tmpdir, "private.key")
	if len(inputs) == 1 {
		keyPath = inputs[0]
	}

	for i, node := range ctx.nodes {
		args := []string{
			"--config", node.Dir,
			"shuffle", "init",
			"--signer", keyPath,
		}

		log.Printf("%s %s", "memcoin", strings.Join(args, " "))

		out, err := exec.Command("memcoin", args...).Output()
		if err != nil {
			log.Fatalf("failed to init shuffle for %d: %v\n", i, err)
		}

		if len(out) != 0 {
			log.Println(string(out))
		}

		fmt.Println("shuffle initialized for", i)
	}

	return nil
}

func registerVotingHandlers(ctx *context, inputs ...string) error {
	keyPath := filepath.Join(ctx.tmpdir, "private.key")
	if len(inputs) == 1 {
		keyPath = inputs[0]
	}

	args := []string{
		"--config", ctx.nodes[0].Dir,
		"e-voting", "registerHandlers", "--signer", keyPath,
	}

	log.Printf("%s %s", "memcoin", strings.Join(args, " "))

	out, err := exec.Command("memcoin", args...).Output()
	if err != nil {
		log.Fatalf("failed to start voting proxy: %v\n", err)
	}

	if len(out) != 0 {
		log.Println(string(out))
	}

	return nil
}

func launchVotingScenario(ctx *context, inputs ...string) error {
	args := []string{
		"--config", ctx.nodes[0].Dir,
		"e-voting", "scenarioTest",
	}

	for i, node := range ctx.nodes {
		out, err := exec.Command("memcoin", "--config", node.Dir, "dkg",
			"export").Output()
		if err != nil {
			log.Fatalf("failed to export DKG for %d: %v\n", i, err)
		}

		args = append(args, "--member", strings.Trim(string(out), "\n\r "))
	}

	log.Printf("%s %s", "memcoin", strings.Join(args, " "))

	out, err := exec.Command("memcoin", args...).Output()
	if err != nil {
		log.Fatalf("failed to exec scenario test: %v\n", err)
	}

	if len(out) != 0 {
		log.Println(string(out))
	}

	return nil
}
