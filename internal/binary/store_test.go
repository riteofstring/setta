package binary

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestStoreStreamRoundTripsContent(t *testing.T) {
	t.Parallel()

	store, err := NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	ref, err := store.StoreStream(bytes.NewReader([]byte("payload")), "image/png", false, DefaultMaxUploadBytes)
	if err != nil {
		t.Fatalf("store stream: %v", err)
	}
	if ref.ContentID == "" {
		t.Fatal("expected content id")
	}
	if ref.ByteLength != int64(len("payload")) {
		t.Fatalf("expected byte length %d, got %d", len("payload"), ref.ByteLength)
	}

	payload, err := store.ReadBytes(ref.ContentID)
	if err != nil {
		t.Fatalf("read bytes: %v", err)
	}
	if string(payload) != "payload" {
		t.Fatalf("expected payload bytes, got %q", string(payload))
	}

	resolvedRef, err := store.ResolveRef(ref.ContentID)
	if err != nil {
		t.Fatalf("resolve ref: %v", err)
	}
	if resolvedRef.SHA256 != ref.SHA256 {
		t.Fatalf("expected sha256 %q, got %q", ref.SHA256, resolvedRef.SHA256)
	}
}

func TestStoreStreamRejectsOversizedPayload(t *testing.T) {
	t.Parallel()

	store, err := NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	_, err = store.StoreStream(bytes.NewReader([]byte("payload")), "image/png", false, 3)
	if err == nil {
		t.Fatal("expected oversized payload error")
	}
	var tooLargeErr *PayloadTooLargeError
	if !errors.As(err, &tooLargeErr) {
		t.Fatalf("expected PayloadTooLargeError, got %v", err)
	}
}

func TestStoreReadRejectsInvalidContentID(t *testing.T) {
	t.Parallel()

	store, err := NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	if _, err := store.ReadBytes("../escape"); err == nil {
		t.Fatal("expected invalid content id error")
	}
}

func TestStoreDeleteRemovesPayloadAndMetadata(t *testing.T) {
	t.Parallel()

	store, err := NewStore(filepath.Join(t.TempDir(), "binary"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	ref, err := store.StoreStream(bytes.NewReader([]byte("payload")), "image/png", false, DefaultMaxUploadBytes)
	if err != nil {
		t.Fatalf("store stream: %v", err)
	}

	if err := store.Delete(ref.ContentID); err != nil {
		t.Fatalf("delete payload: %v", err)
	}
	if _, err := store.ReadBytes(ref.ContentID); err == nil {
		t.Fatal("expected missing payload after delete")
	}
}

func TestStoreStreamCleansUpTempFileOnReadError(t *testing.T) {
	t.Parallel()

	root := filepath.Join(t.TempDir(), "binary")
	store, err := NewStore(root)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	expectedErr := errors.New("boom")
	_, err = store.StoreStream(&failingReader{
		chunks: [][]byte{[]byte("payload")},
		err:    expectedErr,
	}, "image/png", false, DefaultMaxUploadBytes)
	if err == nil {
		t.Fatal("expected read error")
	}
	if !errors.Is(err, expectedErr) {
		t.Fatalf("expected read error %v, got %v", expectedErr, err)
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected temp files to be cleaned up, found %d entries", len(entries))
	}
}

type failingReader struct {
	chunks [][]byte
	err    error
	index  int
}

func (r *failingReader) Read(p []byte) (int, error) {
	if r.index >= len(r.chunks) {
		return 0, r.err
	}
	n := copy(p, r.chunks[r.index])
	r.index++
	if r.index >= len(r.chunks) {
		return n, r.err
	}
	return n, nil
}

var _ io.Reader = (*failingReader)(nil)
