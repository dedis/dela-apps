package controller

import (
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"

	"go.dedis.ch/dela-apps/calypso"
	guictrl "go.dedis.ch/dela-apps/calypso/controller/gui/controllers"
	"go.dedis.ch/dela/cli/node"
	"go.dedis.ch/dela/crypto/ed25519"
	"go.dedis.ch/dela/dkg"
	"go.dedis.ch/dela/mino"
	"go.dedis.ch/dela/mino/proxy"
	"golang.org/x/xerrors"
)

// listenAction is an action that starts DKG. Must be called on each node.
//
// - implements node.ActionTemplate
type listenAction struct{}

func (a listenAction) Execute(ctx node.Context) error {
	var dkg dkg.DKG
	err := ctx.Injector.Resolve(&dkg)
	if err != nil {
		return xerrors.Errorf("failed to resolve dkg: %v", err)
	}

	actor, err := dkg.Listen()
	if err != nil {
		return xerrors.Errorf("failed to listen dkg: %v", err)
	}

	ctx.Injector.Inject(actor)

	return nil
}

// registerAction is an action that registers the handlers to the dela proxy
//
// - implements node.ActionTemplate
type registerAction struct{}

func (a registerAction) Execute(ctx node.Context) error {
	var actor dkg.Actor
	err := ctx.Injector.Resolve(&actor)
	if err != nil {
		return xerrors.Errorf("failed to resolve actor: %v", err)
	}

	caly := calypso.NewCalypso(actor)

	ctx.Injector.Inject(caly)

	var proxy proxy.Proxy
	err = ctx.Injector.Resolve(&proxy)
	if err != nil {
		return xerrors.Errorf("failed to resolve proxy: %v", err)
	}

	ctrl := guictrl.NewCtrl(caly)

	fs := http.FileServer(http.Dir(ctrl.Abs("gui/assets")))
	proxy.RegisterHandler("/assets/", tofunc(http.StripPrefix("/assets/", fs)))
	proxy.RegisterHandler("/", ctrl.HomeHandler())
	proxy.RegisterHandler("/pubkey", ctrl.PubkeyHandler())
	proxy.RegisterHandler("/encrypt", ctrl.EncryptHandler())
	proxy.RegisterHandler("/write", ctrl.WriteHandler())
	proxy.RegisterHandler("/read", ctrl.ReadHandler())

	return nil
}

func tofunc(h http.Handler) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.ServeHTTP(w, r)
	})
}

// setupAction is an action to setup Calypso. This action performs the DKG key
// sharing and should only be run once on a node.
//
// - implements node.ActionTemplate
type setupAction struct{}

// Execute implements node.ActionTemplate
func (a setupAction) Execute(ctx node.Context) error {
	var no mino.Mino
	err := ctx.Injector.Resolve(&no)
	if err != nil {
		return xerrors.Errorf("failed to resolve mino: %v", err)
	}

	var ps calypso.PrivateStorage
	err = ctx.Injector.Resolve(&ps)
	if err != nil {
		return xerrors.Errorf("failed to resolve calypso: %v", err)
	}

	pubkeysStr := strings.Split(ctx.Flags.String("pubkeys"), ",")
	if len(pubkeysStr) == 0 {
		return xerrors.New("pubkeys not found")
	}

	addrsStr := strings.Split(ctx.Flags.String("addrs"), ",")
	if len(addrsStr) == 0 {
		return xerrors.New("addrs not found")
	}

	threshold := ctx.Flags.Int("threshold")
	if threshold == 0 || threshold < 0 {
		return xerrors.Errorf("threshold wrong or not provided: %d", threshold)
	}

	if len(pubkeysStr) != len(addrsStr) {
		return xerrors.Errorf("there should be the same number of "+
			"pubkkeys and addrs, but got %d pubkeys and %d addrs",
			len(pubkeysStr), len(addrsStr))
	}

	pubkeys := make([]ed25519.PublicKey, len(pubkeysStr))
	addrs := make([]mino.Address, len(addrsStr))
	for i, keyHex := range pubkeysStr {
		point := suite.Point()

		keyBuf, err := hex.DecodeString(keyHex)
		if err != nil {
			return xerrors.Errorf("failed to decode hex key: %v", err)
		}

		err = point.UnmarshalBinary(keyBuf)
		if err != nil {
			return xerrors.Errorf("failed to unmarshal point: %v", err)
		}

		pubkeys[i] = ed25519.NewPublicKeyFromPoint(point)

		addrBuf, err := base64.StdEncoding.DecodeString(addrsStr[i])
		if err != nil {
			return xerrors.Errorf("base64 address: %v", err)
		}

		addrs[i] = no.GetAddressFactory().FromText(addrBuf)

		fmt.Println("addr:", addrs[i].String())
	}

	ca := internalCA{
		players: mino.NewAddresses(addrs...),
		pubkeys: pubkeys,
	}

	pubkey, err := ps.Setup(ca, threshold)
	if err != nil {
		return xerrors.Errorf("failed to setup calypso: %v", err)
	}

	pubkeyBuf, err := pubkey.MarshalBinary()
	if err != nil {
		return xerrors.Errorf("failed to mashal pubkey: %v", err)
	}

	fmt.Printf("Calypso has been successfully setup. "+
		"Here is the Calypso shared pub key: %s\n", hex.EncodeToString(pubkeyBuf))

	return nil
}
