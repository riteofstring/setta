package content

import (
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/setta/realtime/backend/internal/contracts"
)

func TestStoreUsesOneValidatedReferencePath(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()
	reference, err := store.Put("invocation-one", "text/plain", strings.NewReader("artifact"))
	if err != nil {
		t.Fatalf("Put() error = %v", err)
	}
	reader, err := store.Open(reference)
	if err != nil {
		t.Fatalf("Open(reference) error = %v", err)
	}
	data, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("ReadAll() error = %v", err)
	}
	if err := reader.Close(); err != nil {
		t.Fatalf("Close(reader) error = %v", err)
	}
	if string(data) != "artifact" || reference.ByteLength != int64(len(data)) {
		t.Fatalf("content = %q, reference = %#v", data, reference)
	}
	tampered := reference
	tampered.MediaType = "image/png"
	if _, err := store.Open(tampered); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Open(tampered) error = %v, want not found", err)
	}
}

func TestDeleteInvocationRemovesOnlyItsValues(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()
	first, _ := store.Put("invocation-one", "text/plain", strings.NewReader("one"))
	second, _ := store.Put("invocation-two", "text/plain", strings.NewReader("two"))
	if err := store.DeleteInvocation("invocation-one"); err != nil {
		t.Fatalf("DeleteInvocation() error = %v", err)
	}
	if _, err := store.Open(first); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Open(first) error = %v, want not found", err)
	}
	reader, err := store.Open(second)
	if err != nil {
		t.Fatalf("Open(second) error = %v", err)
	}
	reader.Close()
}

func TestDeleteReferencesPreservesOtherInvocationValues(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()
	input, _ := store.Put("invocation-one", "text/plain", strings.NewReader("input"))
	output, _ := store.Put("invocation-one", "text/plain", strings.NewReader("output"))
	if err := store.DeleteReferences([]contracts.ContentReference{input}); err != nil {
		t.Fatalf("DeleteReferences() error = %v", err)
	}
	if _, err := store.Open(input); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Open(input) error = %v, want not found", err)
	}
	reader, err := store.Open(output)
	if err != nil {
		t.Fatalf("Open(output) error = %v", err)
	}
	reader.Close()
}

func TestStoreBoundsTotalSessionContent(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()
	store.bytes = MaximumSessionBytes
	if _, err := store.Put("invocation-a", "application/octet-stream", strings.NewReader("x")); !errors.Is(err, ErrCapacity) {
		t.Fatalf("Put() error = %v, want capacity", err)
	}
}
