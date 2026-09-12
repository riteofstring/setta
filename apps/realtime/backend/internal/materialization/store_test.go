package materialization

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/setta/realtime/backend/internal/contracts"
)

type memoryOpener struct {
	values map[string][]byte
}

func (opener memoryOpener) Open(reference contracts.ContentReference) (io.ReadCloser, error) {
	value, exists := opener.values[reference.ID]
	if !exists {
		return nil, errors.New("missing source content")
	}
	return io.NopCloser(bytes.NewReader(value)), nil
}

type memoryWriter struct {
	calls  int
	failAt int
	values map[string][]byte
}

func (writer *memoryWriter) Put(invocationID string, mediaType string, source io.Reader) (contracts.ContentReference, error) {
	value, err := io.ReadAll(source)
	if err != nil {
		return contracts.ContentReference{}, err
	}
	writer.calls++
	if writer.calls == writer.failAt {
		return contracts.ContentReference{}, errors.New("injected writer failure")
	}
	id := fmt.Sprintf("restored-%d", writer.calls)
	digest := sha256.Sum256(value)
	writer.values[id] = value
	return contracts.ContentReference{
		ID: id, MediaType: mediaType, ByteLength: int64(len(value)),
		SHA256: hex.EncodeToString(digest[:]), InvocationID: invocationID,
	}, nil
}

func TestRestoreReturnsCreatedReferencesOnLaterFailure(t *testing.T) {
	store := openStore(t)
	values := map[string][]byte{
		"content-first":  []byte("first"),
		"content-second": []byte("second"),
	}
	first := contentReference("content-first", "original", "text/plain", values["content-first"])
	second := contentReference("content-second", "original", "text/plain", values["content-second"])
	outputs := map[string]json.RawMessage{"values": rawValue(t, []any{first, second})}
	if err := store.Replace("binding", strings.Repeat("d", 64), outputs, memoryOpener{values: values}); err != nil {
		t.Fatalf("Replace() error = %v", err)
	}
	writer := &memoryWriter{failAt: 2, values: make(map[string][]byte)}
	restored, err := store.Restore("binding", "restored", writer)
	if err == nil {
		t.Fatal("Restore() error = nil")
	}
	if len(restored.Content) != 1 || restored.Content[0].ID != "restored-1" {
		t.Fatalf("partial Content = %#v, want the first created reference", restored.Content)
	}
}

func contentReference(id string, invocationID string, mediaType string, value []byte) contracts.ContentReference {
	digest := sha256.Sum256(value)
	return contracts.ContentReference{
		ID: id, MediaType: mediaType, ByteLength: int64(len(value)),
		SHA256: hex.EncodeToString(digest[:]), InvocationID: invocationID,
	}
}

func rawValue(t *testing.T, value any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	return encoded
}

func openStore(t *testing.T) *Store {
	t.Helper()
	store, err := Open(filepath.Join(t.TempDir(), "materializations"))
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	return store
}

func TestOpenRejectsSymlinkMaterializationRoot(t *testing.T) {
	parent := t.TempDir()
	target := filepath.Join(parent, "target")
	if err := os.Mkdir(target, 0o700); err != nil {
		t.Fatalf("os.Mkdir() error = %v", err)
	}
	root := filepath.Join(parent, "root")
	if err := os.Symlink(target, root); err != nil {
		t.Skipf("os.Symlink() error = %v", err)
	}
	if _, err := Open(root); err == nil {
		t.Fatal("Open(symlink) error = nil")
	}
}

func restoredReferences(t *testing.T, raw json.RawMessage) []contracts.ContentReference {
	t.Helper()
	value, err := decodeValue(raw)
	if err != nil {
		t.Fatalf("decodeValue() error = %v", err)
	}
	known := make(map[string]contracts.ContentReference)
	result := make([]contracts.ContentReference, 0)
	if err := discoverReferences(value, 0, known, &result); err != nil {
		t.Fatalf("discoverReferences() error = %v", err)
	}
	return result
}

func contentFiles(t *testing.T, store *Store) []string {
	t.Helper()
	result := make([]string, 0)
	err := filepath.WalkDir(store.contentRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Type().IsRegular() {
			result = append(result, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("filepath.WalkDir() error = %v", err)
	}
	return result
}

func TestStoreRestoresRecursiveReferencesWithFreshIdentities(t *testing.T) {
	store := openStore(t)
	value := []byte("durable image bytes")
	reference := contentReference("content-original", "invocation-original", "image/png", value)
	outputs := map[string]json.RawMessage{
		"image": rawValue(t, map[string]any{
			"items": []any{reference, map[string]any{"nested": reference}},
			"title": "retained",
		}),
		"scalar": rawValue(t, 42),
	}
	fingerprint := strings.Repeat("a", 64)
	if err := store.Replace("binding:preview", fingerprint, outputs, memoryOpener{values: map[string][]byte{reference.ID: value}}); err != nil {
		t.Fatalf("Replace() error = %v", err)
	}
	reopened, err := Open(store.root)
	if err != nil {
		t.Fatalf("Open(existing) error = %v", err)
	}
	writer := &memoryWriter{values: make(map[string][]byte)}
	restored, err := reopened.Restore("binding:preview", "invocation-restored", writer)
	if err != nil {
		t.Fatalf("Restore() error = %v", err)
	}
	if restored.Fingerprint != fingerprint {
		t.Fatalf("Fingerprint = %q, want %q", restored.Fingerprint, fingerprint)
	}
	if len(restored.Content) != 1 || restored.Content[0].ID == reference.ID || restored.Content[0].InvocationID != "invocation-restored" {
		t.Fatalf("Content = %#v, want one freshly scoped reference", restored.Content)
	}
	if !bytes.Equal(writer.values[restored.Content[0].ID], value) {
		t.Fatalf("restored bytes = %q, want %q", writer.values[restored.Content[0].ID], value)
	}
	references := restoredReferences(t, restored.Outputs["image"])
	if len(references) != 1 || references[0] != restored.Content[0] {
		t.Fatalf("rewritten references = %#v, want %#v", references, restored.Content)
	}
	if string(restored.Outputs["scalar"]) != "42" {
		t.Fatalf("scalar output = %s, want 42", restored.Outputs["scalar"])
	}
}

func TestReplaceKeepsPreviousManifestOnFailureAndCleansReplacedContent(t *testing.T) {
	store := openStore(t)
	firstValue := []byte("first retained value")
	first := contentReference("content-first", "invocation-first", "text/plain", firstValue)
	if err := store.Replace("binding", strings.Repeat("1", 64), map[string]json.RawMessage{"value": rawValue(t, first)}, memoryOpener{values: map[string][]byte{first.ID: firstValue}}); err != nil {
		t.Fatalf("first Replace() error = %v", err)
	}
	secondValue := []byte("second retained value")
	second := contentReference("content-second", "invocation-second", "text/plain", secondValue)
	err := store.Replace("binding", strings.Repeat("2", 64), map[string]json.RawMessage{"value": rawValue(t, second)}, memoryOpener{values: map[string][]byte{second.ID: []byte("wrong")}})
	if err == nil {
		t.Fatal("failing Replace() error = nil")
	}
	writer := &memoryWriter{values: make(map[string][]byte)}
	retained, err := store.Restore("binding", "restore-first", writer)
	if err != nil {
		t.Fatalf("Restore(previous) error = %v", err)
	}
	if retained.Fingerprint != strings.Repeat("1", 64) || !bytes.Equal(writer.values[retained.Content[0].ID], firstValue) {
		t.Fatalf("retained previous result = %#v", retained)
	}
	if err := store.Replace("binding", strings.Repeat("2", 64), map[string]json.RawMessage{"value": rawValue(t, second)}, memoryOpener{values: map[string][]byte{second.ID: secondValue}}); err != nil {
		t.Fatalf("second Replace() error = %v", err)
	}
	files := contentFiles(t, store)
	if len(files) != 1 {
		t.Fatalf("content files = %v, want one replacement blob", files)
	}
	writer = &memoryWriter{values: make(map[string][]byte)}
	retained, err = store.Restore("binding", "restore-second", writer)
	if err != nil {
		t.Fatalf("Restore(replacement) error = %v", err)
	}
	if retained.Fingerprint != strings.Repeat("2", 64) || !bytes.Equal(writer.values[retained.Content[0].ID], secondValue) {
		t.Fatalf("restored replacement = %#v", retained)
	}
}

func TestReplaceEnforcesWholeStoreCapacityAndAccountsForReplacement(t *testing.T) {
	store := openStore(t)
	firstValue := []byte("first")
	first := contentReference("content-first", "original", "text/plain", firstValue)
	firstOutputs := map[string]json.RawMessage{"value": rawValue(t, first)}
	if err := store.Replace("first", strings.Repeat("a", 64), firstOutputs, memoryOpener{values: map[string][]byte{first.ID: firstValue}}); err != nil {
		t.Fatalf("Replace(first) error = %v", err)
	}
	secondValue := []byte("second")
	second := contentReference("content-second", "original", "text/plain", secondValue)
	secondOutputs := map[string]json.RawMessage{"value": rawValue(t, second)}
	secondCandidate, secondReferences, err := prepareReplacement("second", strings.Repeat("b", 64), secondOutputs, memoryOpener{values: map[string][]byte{second.ID: secondValue}})
	if err != nil {
		t.Fatalf("prepareReplacement() error = %v", err)
	}
	secondBytes, err := projectedReplacementBytes(bindingKey("second"), secondCandidate, secondReferences)
	if err != nil {
		t.Fatalf("projectedReplacementBytes() error = %v", err)
	}
	retainedBytes, err := store.storedBytes("")
	if err != nil {
		t.Fatalf("storedBytes() error = %v", err)
	}
	store.maximumBytes = retainedBytes + secondBytes - 1
	err = store.Replace("second", strings.Repeat("b", 64), secondOutputs, memoryOpener{values: map[string][]byte{second.ID: secondValue}})
	if !errors.Is(err, ErrCapacity) {
		t.Fatalf("Replace(over capacity) error = %v, want ErrCapacity", err)
	}
	if _, err := os.Stat(store.manifestPath(bindingKey("second"))); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("second manifest os.Stat() error = %v", err)
	}
	replacementCandidate, replacementReferences, err := prepareReplacement("first", strings.Repeat("c", 64), secondOutputs, memoryOpener{values: map[string][]byte{second.ID: secondValue}})
	if err != nil {
		t.Fatalf("prepareReplacement(replacement) error = %v", err)
	}
	replacementBytes, err := projectedReplacementBytes(bindingKey("first"), replacementCandidate, replacementReferences)
	if err != nil {
		t.Fatalf("projectedReplacementBytes(replacement) error = %v", err)
	}
	store.maximumBytes = replacementBytes
	if err := store.Replace("first", strings.Repeat("c", 64), secondOutputs, memoryOpener{values: map[string][]byte{second.ID: secondValue}}); err != nil {
		t.Fatalf("Replace(existing within capacity) error = %v", err)
	}
	retainedBytes, err = store.storedBytes("")
	if err != nil {
		t.Fatalf("storedBytes(replacement) error = %v", err)
	}
	if retainedBytes > store.maximumBytes {
		t.Fatalf("stored bytes = %d, maximum = %d", retainedBytes, store.maximumBytes)
	}
}

func TestRestoreReportsMissingAndCorruptMaterializations(t *testing.T) {
	t.Run("missing manifest", func(t *testing.T) {
		store := openStore(t)
		_, err := store.Restore("missing", "invocation", &memoryWriter{values: make(map[string][]byte)})
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("Restore() error = %v, want ErrNotFound", err)
		}
	})
	t.Run("missing content", func(t *testing.T) {
		store := openStore(t)
		value := []byte("retained")
		reference := contentReference("content", "original", "text/plain", value)
		if err := store.Replace("binding", strings.Repeat("b", 64), map[string]json.RawMessage{"value": rawValue(t, reference)}, memoryOpener{values: map[string][]byte{reference.ID: value}}); err != nil {
			t.Fatalf("Replace() error = %v", err)
		}
		if err := os.Remove(contentFiles(t, store)[0]); err != nil {
			t.Fatalf("os.Remove() error = %v", err)
		}
		writer := &memoryWriter{values: make(map[string][]byte)}
		_, err := store.Restore("binding", "restored", writer)
		if !errors.Is(err, ErrCorrupt) || writer.calls != 0 {
			t.Fatalf("Restore() error = %v, calls = %d, want ErrCorrupt before writes", err, writer.calls)
		}
	})
	t.Run("path escape", func(t *testing.T) {
		store := openStore(t)
		value := []byte("retained")
		reference := contentReference("content", "original", "text/plain", value)
		if err := store.Replace("binding", strings.Repeat("c", 64), map[string]json.RawMessage{"value": rawValue(t, reference)}, memoryOpener{values: map[string][]byte{reference.ID: value}}); err != nil {
			t.Fatalf("Replace() error = %v", err)
		}
		path := store.manifestPath(bindingKey("binding"))
		encoded, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("os.ReadFile() error = %v", err)
		}
		var retained manifest
		if err := json.Unmarshal(encoded, &retained); err != nil {
			t.Fatalf("json.Unmarshal() error = %v", err)
		}
		retained.Content[0].Path = "../../outside.content"
		encoded, err = json.Marshal(retained)
		if err != nil {
			t.Fatalf("json.Marshal() error = %v", err)
		}
		if err := os.WriteFile(path, encoded, 0o600); err != nil {
			t.Fatalf("os.WriteFile() error = %v", err)
		}
		_, err = store.Restore("binding", "restored", &memoryWriter{values: make(map[string][]byte)})
		if !errors.Is(err, ErrCorrupt) {
			t.Fatalf("Restore() error = %v, want ErrCorrupt", err)
		}
	})
}

func TestPruneReconcilesObsoleteAndOrphanedState(t *testing.T) {
	store := openStore(t)
	for index, bindingID := range []string{"keep", "remove"} {
		value := []byte(bindingID)
		reference := contentReference("content-"+bindingID, "original-"+bindingID, "text/plain", value)
		fingerprint := strings.Repeat(string(rune('a'+index)), 64)
		err := store.Replace(bindingID, fingerprint, map[string]json.RawMessage{"value": rawValue(t, reference)}, memoryOpener{values: map[string][]byte{reference.ID: value}})
		if err != nil {
			t.Fatalf("Replace(%q) error = %v", bindingID, err)
		}
	}
	orphanKey := bindingKey("orphan")
	orphanGeneration := filepath.Join(store.contentRoot, orphanKey, strings.Repeat("d", 32))
	if err := os.MkdirAll(orphanGeneration, 0o700); err != nil {
		t.Fatalf("os.MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(orphanGeneration, contentFileName(0)), []byte("orphan"), 0o600); err != nil {
		t.Fatalf("os.WriteFile() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(store.manifestRoot, ".manifest-crash.tmp"), []byte("partial"), 0o600); err != nil {
		t.Fatalf("os.WriteFile() error = %v", err)
	}
	if err := store.Prune(map[string]struct{}{"keep": {}}); err != nil {
		t.Fatalf("Prune() error = %v", err)
	}
	if _, err := os.Stat(store.manifestPath(bindingKey("remove"))); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("removed manifest os.Stat() error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(store.contentRoot, bindingKey("remove"))); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("removed content os.Stat() error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(store.contentRoot, orphanKey)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("orphan content os.Stat() error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(store.manifestRoot, ".manifest-crash.tmp")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("temporary manifest os.Stat() error = %v", err)
	}
	if _, err := store.Restore("keep", "restored", &memoryWriter{values: make(map[string][]byte)}); err != nil {
		t.Fatalf("Restore(keep) error = %v", err)
	}
}

func TestStoreRejectsInvalidMetadataAndUnsafeScans(t *testing.T) {
	store := openStore(t)
	if err := store.Replace("binding", strings.Repeat("A", 64), map[string]json.RawMessage{}, memoryOpener{values: map[string][]byte{}}); err == nil {
		t.Fatal("Replace(invalid fingerprint) error = nil")
	}
	invalid := map[string]any{
		"id": "content", "mediaType": "text/plain", "byteLength": 1,
		"sha256": "invalid", "invocationId": "original",
	}
	if err := store.Replace("binding", strings.Repeat("a", 64), map[string]json.RawMessage{"value": rawValue(t, invalid)}, memoryOpener{values: map[string][]byte{}}); err == nil {
		t.Fatal("Replace(invalid reference) error = nil")
	}
	if err := os.WriteFile(filepath.Join(store.manifestRoot, "unexpected"), []byte("value"), 0o600); err != nil {
		t.Fatalf("os.WriteFile() error = %v", err)
	}
	if err := store.Prune(map[string]struct{}{}); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("Prune() error = %v, want ErrCorrupt", err)
	}
}
