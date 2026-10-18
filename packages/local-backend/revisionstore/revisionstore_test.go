package revisionstore

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
	"time"

	"github.com/riteofstring/setta/packages/local-backend/projectfs"
)

type notes struct {
	Items []string `json:"items"`
}

const statePath = ".local/notes/state.json"

func validateNotes(value notes) error {
	if value.Items == nil {
		return errors.New("items are required")
	}
	for _, item := range value.Items {
		if item == "" {
			return errors.New("items must not be empty")
		}
	}
	return nil
}

func openRoot(t *testing.T, directory string) *projectfs.Root {
	t.Helper()
	root, err := projectfs.Open(directory)
	if err != nil {
		t.Fatalf("projectfs.Open() error = %v", err)
	}
	t.Cleanup(func() { _ = root.Close() })
	return root
}

func openStore(t *testing.T, directory string) *Store[notes] {
	t.Helper()
	store, err := Open(openRoot(t, directory), Options[notes]{
		Path:     statePath,
		Initial:  notes{Items: []string{}},
		Validate: validateNotes,
		MaxBytes: 1 << 20,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func requireItems(t *testing.T, label string, snapshot Snapshot[notes], err error, revision uint64, items ...string) {
	t.Helper()
	if items == nil {
		items = []string{}
	}
	if err != nil {
		t.Fatalf("%s error = %v", label, err)
	}
	if snapshot.Revision != revision || !reflect.DeepEqual(snapshot.Value.Items, items) {
		t.Fatalf("%s = %#v, want revision %d items %v", label, snapshot, revision, items)
	}
}

func TestStoreCreatesReplacesPublishesAndReloadsState(t *testing.T) {
	directory := t.TempDir()
	store := openStore(t, directory)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := store.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	requireItems(t, "initial", <-stream, nil, 0)

	updated, err := store.Replace(0, notes{Items: []string{"first"}})
	requireItems(t, "Replace()", updated, err, 1, "first")
	select {
	case published := <-stream:
		requireItems(t, "published", published, nil, 1, "first")
	case <-time.After(time.Second):
		t.Fatal("replacement was not published")
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if _, err := store.Snapshot(); !errors.Is(err, ErrClosed) {
		t.Fatalf("Snapshot(closed) error = %v", err)
	}

	reloaded, err := openStore(t, directory).Snapshot()
	requireItems(t, "Snapshot(reloaded)", reloaded, err, 1, "first")
}

func TestStoreRejectsConflictsAndInvalidValuesWithoutChangingDurableState(t *testing.T) {
	directory := t.TempDir()
	store := openStore(t, directory)
	if _, err := store.Replace(1, notes{Items: []string{"stale"}}); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("Replace(wrong revision) error = %v", err)
	}
	if _, err := store.Replace(0, notes{Items: []string{""}}); err == nil {
		t.Fatal("Replace(invalid) error = nil")
	}
	current, err := store.Snapshot()
	requireItems(t, "Snapshot()", current, err, 0)
	reloaded, err := openStore(t, directory).Snapshot()
	requireItems(t, "Snapshot(reloaded)", reloaded, err, 0)
}

func TestStoresRejectStaleWriterAndRefreshFromDurableState(t *testing.T) {
	directory := t.TempDir()
	first := openStore(t, directory)
	second := openStore(t, directory)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := second.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe(second) error = %v", err)
	}
	<-stream

	if _, err := first.Replace(0, notes{Items: []string{"first-writer"}}); err != nil {
		t.Fatalf("Replace(first) error = %v", err)
	}
	if _, err := second.Replace(0, notes{Items: []string{"stale-writer"}}); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("Replace(stale second) error = %v", err)
	}
	refreshed, err := second.Snapshot()
	requireItems(t, "Snapshot(second)", refreshed, err, 1, "first-writer")
	select {
	case published := <-stream:
		requireItems(t, "published", published, nil, 1, "first-writer")
	case <-time.After(time.Second):
		t.Fatal("durable state was not published to the stale store")
	}
	durable, err := openStore(t, directory).Snapshot()
	requireItems(t, "Snapshot(reloaded)", durable, err, 1, "first-writer")
}

func TestStoresSerializeConcurrentWritersAtOneRevision(t *testing.T) {
	directory := t.TempDir()
	writers := map[string]*Store[notes]{
		"first-writer":  openStore(t, directory),
		"second-writer": openStore(t, directory),
	}
	type result struct {
		item string
		err  error
	}
	start := make(chan struct{})
	results := make(chan result, len(writers))
	for item, store := range writers {
		go func() {
			<-start
			_, err := store.Replace(0, notes{Items: []string{item}})
			results <- result{item: item, err: err}
		}()
	}
	close(start)
	winner := ""
	conflicts := 0
	for range writers {
		outcome := <-results
		switch {
		case outcome.err == nil:
			winner = outcome.item
		case errors.Is(outcome.err, ErrRevisionConflict):
			conflicts++
		default:
			t.Fatalf("Replace(%s) error = %v", outcome.item, outcome.err)
		}
	}
	if winner == "" || conflicts != 1 {
		t.Fatalf("winner = %q, conflicts = %d", winner, conflicts)
	}
	durable, err := openStore(t, directory).Snapshot()
	requireItems(t, "Snapshot(reloaded)", durable, err, 1, winner)
}

func TestOpenRejectsCorruptStateAndSymlinkedStateDirectory(t *testing.T) {
	corrupt := t.TempDir()
	if err := os.MkdirAll(filepath.Join(corrupt, ".local", "notes"), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	content := []byte(`{"revision":3,"value":{"items":[""]}}`)
	if err := os.WriteFile(filepath.Join(corrupt, filepath.FromSlash(statePath)), content, 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	if _, err := Open(openRoot(t, corrupt), Options[notes]{
		Path:     statePath,
		Initial:  notes{Items: []string{}},
		Validate: validateNotes,
		MaxBytes: 1 << 20,
	}); err == nil {
		t.Fatal("Open(corrupt) error = nil")
	}

	if runtime.GOOS == "windows" {
		t.Skip("symlink permissions vary on Windows")
	}
	linked := t.TempDir()
	if err := os.Mkdir(filepath.Join(linked, ".local"), 0o755); err != nil {
		t.Fatalf("Mkdir() error = %v", err)
	}
	if err := os.Symlink(t.TempDir(), filepath.Join(linked, ".local", "notes")); err != nil {
		t.Fatalf("Symlink() error = %v", err)
	}
	if _, err := Open(openRoot(t, linked), Options[notes]{Path: statePath, MaxBytes: 1 << 20}); err == nil {
		t.Fatal("Open(symlinked) error = nil")
	}
}
