package jsonsourcewatch

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestServiceEmitsTrackedFileUpdates(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	jsonPath := filepath.Join(workspaceRoot, "data", "source.json")
	if err := os.MkdirAll(filepath.Dir(jsonPath), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(jsonPath, []byte("{\"alpha\":{\"fresh\":2}}\n"), 0o644); err != nil {
		t.Fatalf("write initial json source payload: %v", err)
	}

	updates := make(chan FileUpdate, 4)
	service, err := NewService(ServiceOptions{
		PollInterval: 10 * time.Millisecond,
		OnFileUpdate: func(_ context.Context, update FileUpdate) error {
			updates <- update
			return nil
		},
	})
	if err != nil {
		t.Fatalf("NewService returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := service.Close(); err != nil {
			t.Fatalf("close service: %v", err)
		}
	})

	if err := service.SyncInputs([]FileInput{
		{
			Path: jsonPath,
			Bindings: []Binding{
				{ProjectID: "project-alpha", SectionID: "json-section", VariantID: "json-variant"},
			},
		},
	}); err != nil {
		t.Fatalf("SyncInputs returned error: %v", err)
	}

	if err := os.WriteFile(jsonPath, []byte("{\"alpha\":{\"fresh\":3}}\n"), 0o644); err != nil {
		t.Fatalf("write updated json source payload: %v", err)
	}

	select {
	case update := <-updates:
		if update.Path != jsonPath {
			t.Fatalf("expected update path %q, got %q", jsonPath, update.Path)
		}
		if len(update.Bindings) != 1 || update.Bindings[0].VariantID != "json-variant" {
			t.Fatalf("expected single tracked binding, got %#v", update.Bindings)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for json source file update")
	}
}

func TestServiceEmitsTrackedFileDeletesAndCreates(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	jsonPath := filepath.Join(workspaceRoot, "data", "source.json")
	if err := os.MkdirAll(filepath.Dir(jsonPath), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(jsonPath, []byte("{\"alpha\":{\"fresh\":2}}\n"), 0o644); err != nil {
		t.Fatalf("write initial json source payload: %v", err)
	}

	updates := make(chan FileUpdate, 4)
	service, err := NewService(ServiceOptions{
		PollInterval: 10 * time.Millisecond,
		OnFileUpdate: func(_ context.Context, update FileUpdate) error {
			updates <- update
			return nil
		},
	})
	if err != nil {
		t.Fatalf("NewService returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := service.Close(); err != nil {
			t.Fatalf("close service: %v", err)
		}
	})

	if err := service.SyncInputs([]FileInput{
		{
			Path: jsonPath,
			Bindings: []Binding{
				{ProjectID: "project-alpha", SectionID: "json-section", VariantID: "json-variant"},
			},
		},
	}); err != nil {
		t.Fatalf("SyncInputs returned error: %v", err)
	}

	if err := os.Remove(jsonPath); err != nil {
		t.Fatalf("remove json source payload: %v", err)
	}
	select {
	case <-updates:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for json source file delete update")
	}

	if err := os.WriteFile(jsonPath, []byte("{\"alpha\":{\"fresh\":4}}\n"), 0o644); err != nil {
		t.Fatalf("rewrite json source payload: %v", err)
	}
	select {
	case <-updates:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for json source file create update")
	}
}

func TestServiceSyncInputsReplacesTrackedSnapshotAndMergesBindingsByPath(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	firstPath := filepath.Join(workspaceRoot, "settings.json")
	secondPath := filepath.Join(workspaceRoot, "project", "source.json")
	if err := os.MkdirAll(filepath.Dir(secondPath), 0o755); err != nil {
		t.Fatalf("mkdir project dir: %v", err)
	}
	if err := os.WriteFile(firstPath, []byte("{\"settings\":true}\n"), 0o644); err != nil {
		t.Fatalf("write first json source payload: %v", err)
	}
	if err := os.WriteFile(secondPath, []byte("{\"project\":true}\n"), 0o644); err != nil {
		t.Fatalf("write second json source payload: %v", err)
	}

	service, err := NewService(ServiceOptions{
		PollInterval: time.Hour,
		OnFileUpdate: func(context.Context, FileUpdate) error {
			return nil
		},
	})
	if err != nil {
		t.Fatalf("NewService returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := service.Close(); err != nil {
			t.Fatalf("close service: %v", err)
		}
	})

	if err := service.SyncInputs([]FileInput{
		{
			Path: firstPath,
			Bindings: []Binding{
				{ProjectID: "settings-project", SectionID: "settings-section", VariantID: "settings-variant"},
			},
		},
	}); err != nil {
		t.Fatalf("SyncInputs first snapshot returned error: %v", err)
	}

	firstTracks := service.snapshotTracks()
	if len(firstTracks) != 1 {
		t.Fatalf("expected 1 tracked file in first snapshot, got %#v", firstTracks)
	}
	if firstTracks[0].path != firstPath {
		t.Fatalf("expected first tracked path %q, got %q", firstPath, firstTracks[0].path)
	}
	if len(firstTracks[0].bindings) != 1 || firstTracks[0].bindings[0].VariantID != "settings-variant" {
		t.Fatalf("expected first snapshot to keep its binding, got %#v", firstTracks[0].bindings)
	}

	if err := service.SyncInputs([]FileInput{
		{
			Path: secondPath,
			Bindings: []Binding{
				{ProjectID: "main-project", SectionID: "json-section", VariantID: "variant-b"},
			},
		},
		{
			Path: secondPath,
			Bindings: []Binding{
				{ProjectID: "main-project", SectionID: "json-section", VariantID: "variant-a"},
			},
		},
	}); err != nil {
		t.Fatalf("SyncInputs second snapshot returned error: %v", err)
	}

	secondTracks := service.snapshotTracks()
	if len(secondTracks) != 1 {
		t.Fatalf("expected replacement snapshot to keep 1 tracked file, got %#v", secondTracks)
	}
	if secondTracks[0].path != secondPath {
		t.Fatalf("expected replacement tracked path %q, got %q", secondPath, secondTracks[0].path)
	}
	if len(secondTracks[0].bindings) != 2 {
		t.Fatalf("expected merged bindings for replacement snapshot, got %#v", secondTracks[0].bindings)
	}
	if secondTracks[0].bindings[0].VariantID != "variant-a" || secondTracks[0].bindings[1].VariantID != "variant-b" {
		t.Fatalf("expected replacement bindings to be merged and sorted, got %#v", secondTracks[0].bindings)
	}
}
