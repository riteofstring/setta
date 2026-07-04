package main

import (
	"bytes"
	"context"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/appstate"
	"setta/internal/semanticgraph"
)

func TestRunSeedsSemanticGraphWorkspaceRoot(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceDir := t.TempDir()
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := run([]string{"--app-data-dir", appDataDir, "--workspace-root", workspaceDir}, &stdout, &stderr, emptyEnv)
	if code != 0 {
		t.Fatalf("run exit = %d, stderr = %q", code, stderr.String())
	}
	stateStore, err := appstate.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new app state store: %v", err)
	}
	state, err := stateStore.Load()
	if err != nil {
		t.Fatalf("load app state: %v", err)
	}
	if state.SelectedWorkspaceID == "" {
		t.Fatal("selected workspace id is empty")
	}
	store, err := semanticgraph.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new semantic graph store: %v", err)
	}
	defer store.Close()
	graph, err := store.ReadGraph(context.Background(), state.SelectedWorkspaceID)
	if err != nil {
		t.Fatalf("read semantic graph: %v", err)
	}
	if len(graph.Nodes) != 4 {
		t.Fatalf("seeded node count = %d, want 4", len(graph.Nodes))
	}
	if len(graph.Edges) != 3 {
		t.Fatalf("seeded edge count = %d, want 3", len(graph.Edges))
	}
	detail, ok, err := store.ReadNodeDetail(context.Background(), state.SelectedWorkspaceID, seedConstraintNodeID)
	if err != nil {
		t.Fatalf("read semantic node detail: %v", err)
	}
	if !ok {
		t.Fatalf("seeded node %s missing", seedConstraintNodeID)
	}
	if len(detail.Evidence) != 1 || len(detail.Activity) != 1 || len(detail.SteeringDirectives) != 1 || len(detail.ContextPackHistory) != 1 {
		t.Fatalf("seeded detail missing records: %+v", detail)
	}
	history, err := store.ReadEventHistory(context.Background(), state.SelectedWorkspaceID, seedConstraintNodeID, 0, 20)
	if err != nil {
		t.Fatalf("read semantic event history: %v", err)
	}
	if len(history.Events) < 6 {
		t.Fatalf("target history count = %d, want at least 6", len(history.Events))
	}
	if !strings.Contains(stdout.String(), "workspaceId="+state.SelectedWorkspaceID) {
		t.Fatalf("stdout = %q, want workspace id", stdout.String())
	}
}

func TestRunSemanticGraphSeedIsIdempotent(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceDir := t.TempDir()
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	args := []string{"--app-data-dir", appDataDir, "--workspace-root", workspaceDir}
	if code := run(args, &stdout, &stderr, emptyEnv); code != 0 {
		t.Fatalf("first run exit = %d, stderr = %q", code, stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := run(args, &stdout, &stderr, emptyEnv); code != 0 {
		t.Fatalf("second run exit = %d, stderr = %q", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "already exists") {
		t.Fatalf("stdout = %q, want already exists", stdout.String())
	}
}

func TestConfigRequiresWorkspaceRoot(t *testing.T) {
	var stderr bytes.Buffer
	_, err := configFromArgs([]string{"--app-data-dir", t.TempDir()}, &stderr, emptyEnv)
	if err == nil {
		t.Fatal("config succeeded, want workspace root error")
	}
	if !strings.Contains(err.Error(), "--workspace-root is required") {
		t.Fatalf("error = %q, want workspace root", err.Error())
	}
}

func TestConfigRejectsWorkspacePathAlias(t *testing.T) {
	var stderr bytes.Buffer
	_, err := configFromArgs([]string{"--app-data-dir", t.TempDir(), "--workspace-path", t.TempDir()}, &stderr, emptyEnv)
	if err == nil {
		t.Fatal("config succeeded, want unsupported workspace path flag error")
	}
	if !strings.Contains(err.Error(), "flag provided but not defined") {
		t.Fatalf("error = %q, want unsupported flag", err.Error())
	}
}

func TestConfigRejectsRelativeSemanticGraphSeedPaths(t *testing.T) {
	var stderr bytes.Buffer
	_, err := configFromArgs([]string{"--app-data-dir", filepath.Join("relative", "app-data"), "--workspace-root", t.TempDir()}, &stderr, emptyEnv)
	if err == nil {
		t.Fatal("config succeeded, want relative app data error")
	}

	_, err = configFromArgs([]string{"--app-data-dir", t.TempDir(), "--workspace-root", filepath.Join("relative", "workspace")}, &stderr, emptyEnv)
	if err == nil {
		t.Fatal("config succeeded, want relative workspace root error")
	}
}

func emptyEnv(string) string {
	return ""
}
