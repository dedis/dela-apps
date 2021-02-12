package controller

import (
	"go.dedis.ch/dela-apps/gapi"
	guictrl "go.dedis.ch/dela-apps/gapi/controller/gui/controllers"
	"go.dedis.ch/dela/cli/node"
	"go.dedis.ch/dela/core/ordering/cosipbft"
	"go.dedis.ch/dela/mino/minogrpc"
	"go.dedis.ch/dela/mino/proxy"
	"golang.org/x/xerrors"
)

// registerAction is an action that registers the handlers to the dela proxy
//
// - implements node.ActionTemplate
type registerAction struct{}

func (a registerAction) Execute(ctx node.Context) error {
	var cosi *cosipbft.Service
	err := ctx.Injector.Resolve(&cosi)
	if err != nil {
		return xerrors.Errorf("failed to resolve cosi: %v", err)
	}

	var grpc *minogrpc.Minogrpc
	err = ctx.Injector.Resolve(&grpc)
	if err != nil {
		return xerrors.Errorf("failed to resolve mino grpc: %v", err)
	}

	api := gapi.NewGAPI(cosi, grpc)

	ctx.Injector.Inject(&api)

	var proxy proxy.Proxy
	err = ctx.Injector.Resolve(&proxy)
	if err != nil {
		return xerrors.Errorf("failed to resolve proxy: %v", err)
	}

	ctrl := guictrl.NewCtrl(&api)

	proxy.RegisterHandler("/transactions", ctrl.Transaction())
	proxy.RegisterHandler("/store", ctrl.Store())
	proxy.RegisterHandler("/traffic/sent", ctrl.Sent())

	return nil
}
