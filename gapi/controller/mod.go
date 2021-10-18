package controller

import (
	"go.dedis.ch/dela/cli"
	"go.dedis.ch/dela/cli/node"
)

// NewController returns a new minimal controller.
func NewController() node.Initializer {
	return minimal{}
}

// minimal is an initializer with the minimum set of commands
//
// - implements node.Initializer
type minimal struct{}

// SetCommands implements node.Initializer
func (m minimal) SetCommands(builder node.Builder) {
	cb := builder.SetCommand("gapi")
	cb.SetDescription("Set of commands for the General API")

	sub := cb.SetSubCommand("register")
	sub.SetDescription("registers the GAPI GUI to the dela proxy")
	sub.SetAction(builder.MakeAction(registerAction{}))
}

// Inject implements node.Initializer.
func (m minimal) OnStart(ctx cli.Flags, inj node.Injector) error {
	return nil
}

// OnStop implements node.Initializer
func (m minimal) OnStop(node.Injector) error {
	return nil
}
