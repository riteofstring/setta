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
