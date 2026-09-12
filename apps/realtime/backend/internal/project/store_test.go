package project

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
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
	if updated.Version != contracts.ProjectVersion {
		t.Fatalf("project version = %d", updated.Version)
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

func TestStoreRejectsVersionOneProject(t *testing.T) {
	path := filepath.Join(t.TempDir(), "project.json")
	project, err := NewProject("Legacy")
	if err != nil {
		t.Fatalf("NewProject() error = %v", err)
	}
	project.Version = 1
	data, err := json.Marshal(project)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	if _, err := Open(path, false); err == nil || !strings.Contains(err.Error(), "unsupported project version 1") {
		t.Fatalf("Open() error = %v", err)
	}
}

func TestStoreAppliesPipelineCreationAtomicallyAndPublishesOnce(t *testing.T) {
	path := filepath.Join(t.TempDir(), "project.json")
	store, err := Open(path, true)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := store.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	initial := <-stream
	source := contracts.Section{ID: "source", Kind: "input", Name: "Source", Width: contracts.SizeValue{Value: 320}, Height: contracts.SizeValue{Value: 128}, Children: []string{}, Data: json.RawMessage(`{"inputKind":"text","value":"","label":"Source"}`)}
	handler := contracts.Section{ID: "render-handler", Kind: "handler", Name: "Render", Width: contracts.SizeValue{Value: 320}, Height: contracts.SizeValue{Value: 180}, Children: []string{}, Data: json.RawMessage(`{"bindingId":"render"}`)}
	sourceLayout := contracts.TopLevelSectionLayout{X: 0, Y: 0, ZIndex: 1}
	handlerLayout := contracts.TopLevelSectionLayout{X: 360, Y: 0, ZIndex: 2}
	binding := contracts.Binding{
		ID: "render", Trigger: contracts.BindingTrigger{Kind: "event", SectionID: "source", Event: "change"}, Handler: "render",
		Arguments:  map[string]json.RawMessage{"value": json.RawMessage(`"$event.value"`)},
		Scheduling: contracts.SchedulingPolicy{Mode: "latest", ConcurrencyGroup: "render", ConcurrencyLimit: 1}, Outputs: map[string]contracts.BindingOutput{"value": {}},
	}
	updated, err := store.Apply(contracts.ApplyRequest{
		ProjectID: initial.ID, ExpectedRevision: initial.Revision,
		Operations: []json.RawMessage{
			rawOperation(t, contracts.UpsertSectionOperation{Operation: "upsertSection", Section: source, Layout: &sourceLayout}),
			rawOperation(t, contracts.UpsertSectionOperation{Operation: "upsertSection", Section: handler, Layout: &handlerLayout}),
			rawOperation(t, contracts.SetBindingOperation{Operation: "setBinding", Binding: binding}),
		},
	})
	if err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if updated.Revision != 1 || len(updated.Bindings) != 1 || len(updated.Sections) != 2 {
		t.Fatalf("updated project = %#v", updated)
	}
	published := <-stream
	if published.Revision != updated.Revision {
		t.Fatalf("published project = %#v", published)
	}
	select {
	case duplicate := <-stream:
		t.Fatalf("duplicate publication = %#v", duplicate)
	default:
	}
}

func TestStoreRejectsInvalidPipelineWithoutChangingState(t *testing.T) {
	path := filepath.Join(t.TempDir(), "project.json")
	store, err := Open(path, true)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()
	initial, err := store.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	binding := contracts.Binding{
		ID: "orphan", Trigger: contracts.BindingTrigger{Kind: "disconnected"}, Handler: "orphan", Arguments: map[string]json.RawMessage{},
		Scheduling: contracts.SchedulingPolicy{Mode: "once", ConcurrencyGroup: "orphan", ConcurrencyLimit: 1}, Outputs: map[string]contracts.BindingOutput{},
	}
	_, err = store.Apply(contracts.ApplyRequest{ProjectID: initial.ID, ExpectedRevision: initial.Revision, Operations: []json.RawMessage{rawOperation(t, contracts.SetBindingOperation{Operation: "setBinding", Binding: binding})}})
	if err == nil {
		t.Fatal("Apply() error = nil")
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	current, snapshotErr := store.Snapshot()
	if string(after) != string(before) || snapshotErr != nil || current.Revision != initial.Revision || len(current.Bindings) != 0 {
		t.Fatalf("failed apply changed state: snapshot=%#v error=%v", current, snapshotErr)
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

func rawOperation(t *testing.T, value any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	return data
}
