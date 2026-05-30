package jsonio

import (
	"encoding/json"
	"errors"
	"io"
)

var ErrMultipleValues = errors.New("JSON input must contain exactly one value")

func DecodeSingle(reader io.Reader, target any) error {
	decoder := json.NewDecoder(reader)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return ErrMultipleValues
		}
		return err
	}
	return nil
}
