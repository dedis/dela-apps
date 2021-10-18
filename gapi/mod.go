// Package gapi contains the Generic API for Dela. Which offers handlers to get
// various data about the chain's state.
package gapi

import (
	"go.dedis.ch/dela/core/ordering/cosipbft"
	"go.dedis.ch/dela/mino/minogrpc"
)

// GAPI defines the Generic API. It offers global APIs to get the chain's state.
type GAPI struct {
	Cosi *cosipbft.Service
	Grpc *minogrpc.Minogrpc
}

// NewGAPI returns a new initialized GAPI.
func NewGAPI(cosi *cosipbft.Service, grpc *minogrpc.Minogrpc) GAPI {
	return GAPI{
		Cosi: cosi,
		Grpc: grpc,
	}
}
