package project

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/setta/realtime/backend/internal/contracts"
)

func TestStoreCreatesMutatesAndReloadsProject(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".local", "realtime", "project.json")
	store, err := Open(path, true)
	if err != nil {
		t.Fatalf("Open(create) error = %v", err)
	}
	snapshot, err := store.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	updated, err := store.Apply(contracts.ApplyRequest{
		ProjectID:        snapshot.ID,
		ExpectedRevision: snapshot.Revision,
		Operations:       []json.RawMessage{json.RawMessage(`{"op":"setName","name":"Changed"}`)},
	})
	if err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if updated.Revision != 1 || updated.Name != "Changed" {
		t.Fatalf("Apply() = %#v", updated)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	reloaded, err := Open(path, false)
	if err != nil {
		t.Fatalf("Open(load) error = %v", err)
	}
	defer reloaded.Close()
	loaded, err := reloaded.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot(reloaded) error = %v", err)
	}
	if loaded.ID != snapshot.ID || loaded.Revision != 1 || loaded.Name != "Changed" {
		t.Fatalf("Snapshot(reloaded) = %#v", loaded)
	}
}

func TestStoreRejectsRevisionConflictWithoutWriting(t *testing.T) {
	path := filepath.Join(t.TempDir(), "project.json")
	store, err := Open(path, true)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()
	snapshot, _ := store.Snapshot()
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(before) error = %v", err)
	}
	_, err = store.Apply(contracts.ApplyRequest{
		ProjectID: snapshot.ID, ExpectedRevision: 99,
		Operations: []json.RawMessage{json.RawMessage(`{"op":"setName","name":"Wrong"}`)},
	})
	if !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("Apply() error = %v, want revision conflict", err)
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(after) error = %v", err)
	}
	if string(after) != string(before) {
		t.Fatal("conflict changed durable project")
	}
}

func TestStoreSubscriptionStartsCurrentAndCoalescesToLatest(t *testing.T) {
	path := filepath.Join(t.TempDir(), "project.json")
	store, err := Open(path, true)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()
	ctx, cancel := context.WithCancel(context.Background())
	stream, err := store.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	initial := <-stream
	current := initial
	for _, name := range []string{"One", "Two", "Three"} {
		var applyErr error
		current, applyErr = store.Apply(contracts.ApplyRequest{
			ProjectID: current.ID, ExpectedRevision: current.Revision,
			Operations: []json.RawMessage{json.RawMessage(`{"op":"setName","name":"` + name + `"}`)},
		})
		if applyErr != nil {
			t.Fatalf("Apply(%s) error = %v", name, applyErr)
		}
	}
	select {
	case received := <-stream:
		if received.Name != "Three" || received.Revision != 3 {
			t.Fatalf("subscription received %#v", received)
		}
	case <-time.After(time.Second):
		t.Fatal("subscription did not publish")
	}
	cancel()
}

func TestStoreCreationIsExclusive(t *testing.T) {
	path := filepath.Join(t.TempDir(), "project.json")
	first, err := Open(path, true)
	if err != nil {
		t.Fatalf("Open(first) error = %v", err)
	}
	defer first.Close()
	if _, err := Open(path, true); !errors.Is(err, ErrAlreadyExists) {
		t.Fatalf("Open(second) error = %v, want already exists", err)
	}
}
