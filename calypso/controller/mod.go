package controller

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"go.dedis.ch/dela-apps/calypso"
	guictrl "go.dedis.ch/dela-apps/calypso/controller/gui/controllers"
	"go.dedis.ch/dela/cli"
	"go.dedis.ch/dela/cli/node"
	"go.dedis.ch/dela/crypto/ed25519"
	"go.dedis.ch/dela/dkg"
	"go.dedis.ch/dela/mino"
	"go.dedis.ch/dela/mino/proxy"
	"go.dedis.ch/kyber/v3/suites"
	"golang.org/x/xerrors"
)

// suite is the Kyber suite for Pedersen.
var suite = suites.MustFind("Ed25519")

// formatter defines how messages are marshalled/unmarshalled for the deamon.
// Using this variable allows us to gain flexibility for the tests.
var formatter formatterI = jsonFormatter{}

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

	sub := cb.SetSubCommand("setup")
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
func (m minimal) Inject(ctx cli.Flags, inj node.Injector) error {
	var dkg dkg.DKG
	err := inj.Resolve(&dkg)
	if err != nil {
		return xerrors.Errorf("failed to resolve dkg: %v", err)
	}

	actor, err := dkg.Listen()
	if err != nil {
		return xerrors.Errorf("failed to listen dkg: %v", err)
	}

	caly := calypso.NewCalypso(actor)

	inj.Inject(caly)

	var proxy proxy.Proxy
	err = inj.Resolve(&proxy)
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

// GenerateRequest implements node.ActionTemplate
func (a setupAction) GenerateRequest(ctx cli.Flags) ([]byte, error) {
	pubkeysStr := ctx.String("pubkeys")
	if pubkeysStr == "" {
		return nil, xerrors.New("pubkeys not found")
	}

	addrsStr := ctx.String("addrs")
	if addrsStr == "" {
		return nil, xerrors.New("addrs not found")
	}

	threshold := ctx.Int("threshold")
	if threshold == 0 || threshold < 0 {
		return nil, xerrors.Errorf("threshold wrong or not provided: %d", threshold)
	}

	req := executeRequest{
		Threshold: threshold,
		Pubkeys:   strings.Split(pubkeysStr, ","),
		Addrs:     strings.Split(addrsStr, ","),
	}

	if len(req.Pubkeys) != len(req.Addrs) {
		return nil, xerrors.Errorf("there should be the same number of "+
			"pubkkeys and addrs, but got %d pubkeys and %d addrs: %v",
			len(req.Pubkeys), len(req.Addrs), req)
	}

	buffer, err := formatter.Marshal(req)
	if err != nil {
		return nil, xerrors.Errorf("failed to marshal the request: %v", err)
	}

	return buffer, nil
}

// Execute implements node.ActionTemplate
func (a setupAction) Execute(req node.Context) error {
	var no mino.Mino
	err := req.Injector.Resolve(&no)
	if err != nil {
		return xerrors.Errorf("failed to resolve mino: %v", err)
	}

	var ps calypso.PrivateStorage
	err = req.Injector.Resolve(&ps)
	if err != nil {
		return xerrors.Errorf("failed to resolve calypso: %v", err)
	}

	input := executeRequest{}
	err = formatter.Decode(&input, req.In)
	if err != nil {
		return xerrors.Errorf("failed to get the request: %v", err)
	}

	pubkeys := make([]ed25519.PublicKey, len(input.Pubkeys))
	addrs := make([]mino.Address, len(input.Addrs))
	for i, keyHex := range input.Pubkeys {
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
		addrs[i] = no.GetAddressFactory().FromText([]byte(input.Addrs[i]))
	}

	ca := internalCA{
		players: mino.NewAddresses(addrs...),
		pubkeys: pubkeys,
	}

	pubkey, err := ps.Setup(ca, input.Threshold)
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

// executeRequest holds the data sent to the deamon
type executeRequest struct {
	Threshold int
	// public keys encoded as hex strings
	Pubkeys []string
	Addrs   []string
}

// formatterI is an interface that defines the primitives needed to pass
// messages to the deamon
type formatterI interface {
	Marshal(interface{}) ([]byte, error)
	Decode(interface{}, io.Reader) error
}

// jsonFormatter is a formatter using json
//
// - implements formatterI
type jsonFormatter struct {
}

// Marshal implements formatterI
func (f jsonFormatter) Marshal(i interface{}) ([]byte, error) {
	return json.Marshal(i)
}

// Decode implements formatterI
func (f jsonFormatter) Decode(i interface{}, reader io.Reader) error {
	dec := json.NewDecoder(reader)
	return dec.Decode(i)
}
