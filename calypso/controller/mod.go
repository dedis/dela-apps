package controller

import (
	"go.dedis.ch/dela/cli"
	"go.dedis.ch/dela/cli/node"
	"go.dedis.ch/kyber/v3/suites"
)

// suite is the Kyber suite for Pedersen.
var suite = suites.MustFind("Ed25519")

// NewMinimal returns a new minimal initializer. The static files for the client
// GUI are not packed in the binairy, so one need to build its own binairy in
// order to use it.
func NewMinimal() node.Initializer {
	return minimal{}
}

// minimal is an initializer with the minimum set of commands
//
// - implements node.Initializer
type minimal struct{}

// SetCommands implements node.Initializer
func (m minimal) SetCommands(builder node.Builder) {
	cb := builder.SetCommand("calypso")
	cb.SetDescription("Set of commands to administrate Calypso")

	sub := cb.SetSubCommand("listen")
	sub.SetDescription("starts DKG by listening")
	sub.SetAction(builder.MakeAction(listenAction{}))

	sub = cb.SetSubCommand("register")
	sub.SetDescription("registers the calyso GUI to the dela proxy")
	sub.SetAction(builder.MakeAction(registerAction{}))

	sub = cb.SetSubCommand("setup")
	sub.SetDescription("setup Calypso and create the distributed key. " +
		"Must be run only once.")
	sub.SetAction(builder.MakeAction(setupAction{}))
	sub.SetFlags(
		cli.StringFlag{
			Name:     "pubkeys",
			Usage:    "a list of public keys in hex strings, separated by commas",
			Required: true,
		},
		cli.StringFlag{
			Name: "addrs",
			Usage: "a list of addresses corresponding to the public keys, " +
				"separated by commas",
			Required: true,
		},
		cli.IntFlag{
			Name:     "threshold",
			Usage:    "the minimum number of nodes that is needed to decrypt",
			Required: true,
		},
	)
}

// Inject implements node.Initializer. This function contains the initialization
// code run on each node that wants to support Calypso. We create the dkg actor
// and then use it to create the Calypso, which is then injected as a
// dependency. We will need this dependency in the setup phase.
func (m minimal) OnStart(ctx cli.Flags, inj node.Injector) error {
	return nil
}

// OnStop implements node.Initializer
func (m minimal) OnStop(node.Injector) error {
	return nil
}
