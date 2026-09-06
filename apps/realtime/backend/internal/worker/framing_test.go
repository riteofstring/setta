package worker

import (
	"bytes"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestFramerRoundTripsBackToBackPartialWrites(t *testing.T) {
	var wire bytes.Buffer
	framer, err := NewFramer(strings.NewReader(""), &shortWriter{writer: &wire}, 1024)
	if err != nil {
		t.Fatalf("NewFramer() error = %v", err)
	}
	first := []byte(`{"jsonrpc":"2.0","id":1,"result":{"value":"π"}}`)
	second := []byte(`{"jsonrpc":"2.0","method":"runtime/update","params":{}}`)
	if err := framer.Write(first); err != nil {
		t.Fatalf("Write(first) error = %v", err)
	}
	if err := framer.Write(second); err != nil {
		t.Fatalf("Write(second) error = %v", err)
	}
	reader, err := NewFramer(&oneByteReader{reader: bytes.NewReader(wire.Bytes())}, io.Discard, 1024)
	if err != nil {
		t.Fatalf("NewFramer(reader) error = %v", err)
	}
	for index, want := range [][]byte{first, second} {
		got, err := reader.Read()
		if err != nil {
			t.Fatalf("Read(%d) error = %v", index, err)
		}
		if !bytes.Equal(got, want) {
			t.Fatalf("Read(%d) = %q, want %q", index, got, want)
		}
	}
}

func TestFramerRejectsMalformedAndOversizedHeaders(t *testing.T) {
	for _, test := range []struct {
		name string
		wire string
		want error
	}{
		{name: "missing", wire: "X-Length: 2\r\n\r\n{}", want: ErrFrameMalformed},
		{name: "repeated", wire: "Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}", want: ErrFrameMalformed},
		{name: "lf only", wire: "Content-Length: 2\n\n{}", want: ErrFrameMalformed},
		{name: "zero", wire: "Content-Length: 0\r\n\r\n", want: ErrFrameMalformed},
		{name: "signed", wire: "Content-Length: +2\r\n\r\n{}", want: ErrFrameMalformed},
		{name: "oversized", wire: "Content-Length: 3\r\n\r\n{}x", want: ErrFrameTooLarge},
	} {
		t.Run(test.name, func(t *testing.T) {
			framer, err := NewFramer(strings.NewReader(test.wire), io.Discard, 2)
			if err != nil {
				t.Fatalf("NewFramer() error = %v", err)
			}
			if _, err := framer.Read(); !errors.Is(err, test.want) {
				t.Fatalf("Read() error = %v, want %v", err, test.want)
			}
		})
	}
}

func TestBoundedLogSeparatesAndTruncatesStreams(t *testing.T) {
	stdout, err := NewBoundedLog(5)
	if err != nil {
		t.Fatalf("NewBoundedLog(stdout) error = %v", err)
	}
	stderr, err := NewBoundedLog(8)
	if err != nil {
		t.Fatalf("NewBoundedLog(stderr) error = %v", err)
	}
	if count, err := stdout.Write([]byte("stdout")); err != nil || count != 6 {
		t.Fatalf("stdout Write() = %d, %v", count, err)
	}
	if _, err := stderr.Write([]byte("stderr")); err != nil {
		t.Fatalf("stderr Write() error = %v", err)
	}
	if content, truncated := stdout.Snapshot(); content != "stdou" || !truncated {
		t.Fatalf("stdout snapshot = %q, %t", content, truncated)
	}
	if content, truncated := stderr.Snapshot(); content != "stderr" || truncated {
		t.Fatalf("stderr snapshot = %q, %t", content, truncated)
	}
}

func TestWireDecoderRejectsDuplicateFields(t *testing.T) {
	_, err := decodeWireMessage([]byte(`{"jsonrpc":"2.0","id":1,"id":2,"result":null}`))
	if !errors.Is(err, ErrProtocol) {
		t.Fatalf("decodeWireMessage() error = %v, want protocol violation", err)
	}
}

type shortWriter struct {
	writer io.Writer
}

func (writer *shortWriter) Write(content []byte) (int, error) {
	if len(content) > 3 {
		content = content[:3]
	}
	return writer.writer.Write(content)
}

type oneByteReader struct {
	reader io.Reader
}

func (reader *oneByteReader) Read(content []byte) (int, error) {
	if len(content) > 1 {
		content = content[:1]
	}
	return reader.reader.Read(content)
}
