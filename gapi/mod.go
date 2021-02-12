// Package gapi contains the Generic API for Dela. Which offers handlers to get
// various data about the chain's state.
package gapi

import (
	"go.dedis.ch/dela/core/ordering/cosipbft"
	"go.dedis.ch/dela/mino/minogrpc"
)

// GAPI ...
type GAPI struct {
	Cosi *cosipbft.Service
	Grpc *minogrpc.Minogrpc
}

// NewGAPI ...
func NewGAPI(cosi *cosipbft.Service, grpc *minogrpc.Minogrpc) GAPI {
	return GAPI{
		Cosi: cosi,
		Grpc: grpc,
	}
}
