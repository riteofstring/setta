package bootstrap

import _ "embed"

//go:embed setta_worker.py
var source []byte

func Source() []byte {
	return append([]byte(nil), source...)
}
