package reviewstate

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
	"time"
)

func TestStoreCreatesReplacesPublishesAndReloadsState(t *testing.T) {
	root := t.TempDir()
	store, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := store.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	initial := <-stream
	if initial.Revision != 0 || initial.ProjectID != "project-one" {
		t.Fatalf("initial state = %#v", initial)
	}
	candidate := initial
	candidate.Revision = 1
	updated, err := store.Replace(0, candidate)
	if err != nil {
		t.Fatalf("Replace() error = %v", err)
	}
	if updated.Revision != 1 {
		t.Fatalf("updated state = %#v", updated)
	}
	select {
	case published := <-stream:
		if published.Revision != 1 {
			t.Fatalf("published state = %#v", published)
		}
	case <-time.After(time.Second):
		t.Fatal("replacement was not published")
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	reloaded, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open(reload) error = %v", err)
	}
	defer reloaded.Close()
	snapshot, err := reloaded.Snapshot()
	if err != nil || snapshot.Revision != 1 {
		t.Fatalf("Snapshot() = %#v, %v", snapshot, err)
	}
}

func TestStoreRejectsConflictsWithoutChangingDurableState(t *testing.T) {
	root := t.TempDir()
	store, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()
	initial, _ := store.Snapshot()
	wrongRevision := initial
	wrongRevision.Revision = 2
	if _, err := store.Replace(0, wrongRevision); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("Replace(wrong revision) error = %v", err)
	}
	wrongIdentity := initial
	wrongIdentity.ProjectID = "project-two"
	wrongIdentity.Revision = 1
	if _, err := store.Replace(0, wrongIdentity); !errors.Is(err, ErrIdentityConflict) {
		t.Fatalf("Replace(wrong identity) error = %v", err)
	}
	current, err := store.Snapshot()
	if err != nil || !reflect.DeepEqual(current, initial) {
		t.Fatalf("Snapshot() = %#v, %v", current, err)
	}
}

func TestStoreRejectsSymlinkedStateDirectory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink permissions vary on Windows")
	}
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".local"), 0o755); err != nil {
		t.Fatalf("Mkdir() error = %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(root, ".local", "review")); err != nil {
		t.Fatalf("Symlink() error = %v", err)
	}
	if _, err := Open(root, "project-one"); err == nil {
		t.Fatal("Open() error = nil")
	}
}

func TestStoreRejectsAnotherProjectIdentity(t *testing.T) {
	root := t.TempDir()
	store, err := Open(root, "project-one")
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if _, err := Open(root, "project-two"); !errors.Is(err, ErrIdentityConflict) {
		t.Fatalf("Open(other identity) error = %v", err)
	}
}
