package controllers

import (
	"log"
	"path/filepath"
	"runtime"

	"go.dedis.ch/dela-apps/calypso"
	"go.dedis.ch/kyber/v3/suites"
)

// suite is the Kyber suite for Pedersen.
var suite = suites.MustFind("Ed25519")

// NewCtrl creates a new Ctrl. It gets and stored the current folder path of
// this file so that we can later reference our statics files.
func NewCtrl(caly *calypso.Calypso) *Ctrl {
	_, filename, _, ok := runtime.Caller(1)
	if !ok {
		log.Fatal("failed to get current path for Calypso GUI")
	}

	filename = filepath.Dir(filename)

	return &Ctrl{
		path: filename,
		caly: caly,
	}
}

// Ctrl holds all the gui controllers. This struct allows us to share common
// data to all the controllers.
type Ctrl struct {
	path string
	caly *calypso.Calypso
}

// Abs is a utility to compute the absolute file path
func (c Ctrl) Abs(path string) string {
	return filepath.Join(c.path, path)
}
