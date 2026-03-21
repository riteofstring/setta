package binary

import (
	"bytes"
	"errors"
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
