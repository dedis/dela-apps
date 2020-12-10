package calypso

import (
	"go.dedis.ch/dela/core/access"
	"go.dedis.ch/dela/crypto"
	"go.dedis.ch/kyber/v3"
)

// PrivateStorage defines the primitives to run a Calypso-like app. It is mainly
// a wrapper arround DKG that provides a storage and authorization layer.
type PrivateStorage interface {
	// Setup must be called only ONCE by one of the node to setup the secret
	// sharing
	Setup(ca crypto.CollectiveAuthority, threshold int) (pubKey kyber.Point, err error)

	// GetPublicKey returns the collective public key. Returns an error if the
	// setup has not been done.
	GetPublicKey() (kyber.Point, error)

	Write(message EncryptedMessage, ac access.Service) (ID []byte, err error)
	Read(ID []byte, idents ...access.Identity) (msg []byte, err error)
	UpdateAccess(ID []byte, ident access.Identity, ac access.Service) error
}

// EncryptedMessage wraps the K, C arguments needed to decrypt a message. K is
// the ephemeral DH public key and C the blinded secret. The combination of (K,
// C) should always be uniq, as it is used to compute the storage key.
type EncryptedMessage interface {
	GetK() kyber.Point
	GetC() kyber.Point
}
