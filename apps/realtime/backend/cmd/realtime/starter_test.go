package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/riteofstring/setta/apps/realtime/backend/internal/contracts"
)

func TestCreatedProjectLoadsAndRunsWithoutSupplyingSource(t *testing.T) {
	python, err := exec.LookPath("python3")
	if err != nil {
		t.Fatal(err)
	}
	opened, err := openLocalApplication(filepath.Join(t.TempDir(), "new-project"), true, python)
	if err != nil {
		t.Fatal(err)
	}
	defer opened.Close()
	application := opened.(*localApplication)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	initialized, err := application.coordinator.Reload(ctx)
	if err != nil || initialized.LoadError != nil || len(initialized.Handlers) != 1 || initialized.Handlers[0] != "increment" {
		t.Fatalf("starter initialization: %#v, %v", initialized, err)
	}
	result, err := application.coordinator.Invoke(ctx, "increment", contracts.DirectInvokeRequest{Arguments: map[string]json.RawMessage{"step": json.RawMessage("2")}, Content: []contracts.ContentReference{}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Error != nil || string(result.Outputs["value"]) != "2" {
		t.Fatalf("starter invocation: %#v", result)
	}
	snapshot, err := application.projects.Snapshot()
	if err != nil || snapshot.Sections["code"].Kind != "code" {
		t.Fatalf("starter editor: %#v, %v", snapshot, err)
	}
}

func TestCreationPreservesExistingEntrypoint(t *testing.T) {
	root := t.TempDir()
	source := []byte("handlers = {\"custom\": lambda: {\"value\": 7}}\n")
	path := filepath.Join(root, "app.py")
	if err := os.WriteFile(path, source, 0o644); err != nil {
		t.Fatal(err)
	}
	launcher, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	opened, err := openLocalApplication(root, true, launcher)
	if err != nil {
		t.Fatal(err)
	}
	defer opened.Close()
	actual, err := os.ReadFile(path)
	if err != nil || string(actual) != string(source) {
		t.Fatalf("existing source changed: %q, %v", actual, err)
	}
}
