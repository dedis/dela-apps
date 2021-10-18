package controllers

import (
	"sync"

	"go.dedis.ch/dela-apps/gapi"
)

// NewCtrl creates a new Ctrl. It gets and stored the current folder path of
// this file so that we can later reference our statics files.
func NewCtrl(api *gapi.GAPI) *Ctrl {
	ctrl := &Ctrl{
		api: api,
	}

	return ctrl
}

// Ctrl holds all the gui controllers. This struct allows us to share common
// data to all the controllers.
type Ctrl struct {
	sync.Mutex
	api *gapi.GAPI
}
