package lsp

import (
	"bufio"
	"strings"
	"testing"
)

func TestReadEnvelopeRejectsMalformedProtocolFrame(t *testing.T) {
	_, err := readEnvelope(bufio.NewReader(strings.NewReader("Content-Length: not-a-number\r\n\r\n")))
	if err == nil {
		t.Fatal("readEnvelope() error = nil, want malformed Content-Length failure")
	}
}
