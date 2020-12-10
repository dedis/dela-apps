package json

import (
	"encoding/json"

	"go.dedis.ch/dela-apps/calypso"
	"go.dedis.ch/dela/serde"
	"go.dedis.ch/kyber/v3/suites"
	"golang.org/x/xerrors"
)

func init() {
	calypso.RegisterRecordFormats(serde.FormatJSON, newRecordFormat())
}

// Record is a JSON record
type Record struct {
	K  []byte
	C  []byte
	AC json.RawMessage
}

type recordFormat struct {
	suite suites.Suite
}

func newRecordFormat() recordFormat {
	return recordFormat{
		suite: suites.MustFind("Ed25519"),
	}
}

func (f recordFormat) Encode(ctx serde.Context, msg serde.Message) ([]byte, error) {
	record, ok := msg.(calypso.Record)
	if !ok {
		return nil, xerrors.Errorf("unsupported message of type '%T'", msg)
	}

	kBuf, err := record.GetK().MarshalBinary()
	if err != nil {
		return nil, xerrors.Errorf("failed to marshal K: %v", err)
	}

	cBuf, err := record.GetC().MarshalBinary()
	if err != nil {
		return nil, xerrors.Errorf("failed to marshal C: %v", err)
	}

	m := Record{
		K: kBuf,
		C: cBuf,
	}

	data, err := ctx.Marshal(m)
	if err != nil {
		return nil, xerrors.Errorf("couldn't marshal: %v", err)
	}

	return data, nil
}

func (f recordFormat) Decode(ctx serde.Context, data []byte) (serde.Message, error) {
	m := Record{}
	err := ctx.Unmarshal(data, &m)
	if err != nil {
		return nil, xerrors.Errorf("couldn't unmarshal record: %v", err)
	}

	K := f.suite.Point()
	err = K.UnmarshalBinary(m.K)
	if err != nil {
		return nil, xerrors.Errorf("failed to unmarshal K: %v", err)
	}

	C := f.suite.Point()
	err = C.UnmarshalBinary(m.C)
	if err != nil {
		return nil, xerrors.Errorf("failed to unmarshal C: %v", err)
	}

	r := calypso.NewRecord(K, C, nil)

	return r, nil
}
