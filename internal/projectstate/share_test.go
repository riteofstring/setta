package projectstate

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func TestOpenOverlayRuntimeUsesInMemorySavePolicy(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}

	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if runtime.SavePolicy() != SavePolicyInMemory {
		t.Fatalf("expected in-memory save policy, got %q", runtime.SavePolicy())
	}
}

func TestSessionOverlayRegistryCreatesOverlayFromBaseSnapshot(t *testing.T) {
	t.Parallel()

	base := openTestRuntime(t, newTestStore(t, filepath.Join(t.TempDir(), "project.json")))
	if _, err := base.Mutate(func(document Document) (Document, error) {
		document.Projects["project-alpha"] = Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate base runtime: %v", err)
	}

	registry := openTestOverlayRegistry(t, base)
	sessionRuntime, err := registry.GetOrCreate("session-a")
	if err != nil {
		t.Fatalf("get or create session overlay: %v", err)
	}

	snapshot := sessionRuntime.Snapshot()
	if sessionRuntime.SavePolicy() != SavePolicyInMemory {
		t.Fatalf("expected session runtime in-memory save policy, got %q", sessionRuntime.SavePolicy())
	}
	if _, ok := snapshot.Document.Projects["project-alpha"]; !ok {
		t.Fatal("expected session overlay to start from base snapshot")
	}
}

func TestSessionOverlayRegistrySaveDoesNotPersistToBaseStore(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	base := openTestRuntime(t, store)
	if _, err := base.Mutate(func(document Document) (Document, error) {
		document.Projects["project-alpha"] = Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate base runtime: %v", err)
	}
	if _, err := base.Save(context.Background()); err != nil {
		t.Fatalf("save base runtime: %v", err)
	}

	registry := openTestOverlayRegistry(t, base)
	sessionRuntime, err := registry.GetOrCreate("session-a")
	if err != nil {
		t.Fatalf("get or create session overlay: %v", err)
	}
	if _, err := sessionRuntime.Mutate(func(document Document) (Document, error) {
		document.Projects["session-only"] = Project{
			ID:   "session-only",
			Name: "Session Only",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate session runtime: %v", err)
	}
	if _, err := sessionRuntime.Save(context.Background()); err != nil {
		t.Fatalf("save session runtime: %v", err)
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load base store: %v", err)
	}
	if _, ok := loaded.Projects["session-only"]; ok {
		t.Fatal("did not expect session-only project to persist into the base store")
	}
	if _, ok := base.Snapshot().Document.Projects["session-only"]; ok {
		t.Fatal("did not expect session-only project to leak into the base runtime")
	}
}

func TestSessionOverlayRegistryDeleteRemovesOverlay(t *testing.T) {
	t.Parallel()

	base := openTestRuntime(t, newTestStore(t, filepath.Join(t.TempDir(), "project.json")))
	registry := openTestOverlayRegistry(t, base)

	if _, err := registry.GetOrCreate("session-a"); err != nil {
		t.Fatalf("get or create session overlay: %v", err)
	}
	if err := registry.Delete("session-a"); err != nil {
		t.Fatalf("delete session overlay: %v", err)
	}
	if registry.Has("session-a") {
		t.Fatal("expected session overlay to be removed")
	}
	if _, err := registry.Get("session-a"); !errors.Is(err, ErrUnknownOverlaySession) {
		t.Fatalf("expected unknown overlay session error, got %v", err)
	}
}

func TestResolveDeploymentPathPolicyConstrainsRoots(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	policy, err := ResolveDeploymentPathPolicy(
		filepath.Join(tmpDir, "deployment"),
		filepath.Join(tmpDir, "runtime"),
	)
	if err != nil {
		t.Fatalf("resolve deployment path policy: %v", err)
	}

	artifactPath, err := policy.ResolveArtifactPath("images/icon.png")
	if err != nil {
		t.Fatalf("resolve artifact path: %v", err)
	}
	if artifactPath != filepath.Join(policy.ArtifactsRoot, "images", "icon.png") {
		t.Fatalf("expected artifact path inside artifacts root, got %q", artifactPath)
	}

	if _, err := policy.ResolveCodePath("../escape.py"); err == nil {
		t.Fatal("expected code path escape error")
	}
	if _, err := policy.ResolveJSONSourcePath("../escape.json"); err == nil {
		t.Fatal("expected json source path escape error")
	}

	sessionRunRoot, err := policy.SessionRunRoot("session-a")
	if err != nil {
		t.Fatalf("resolve session run root: %v", err)
	}
	if sessionRunRoot != filepath.Join(policy.ShareRunsRoot, "session-a") {
		t.Fatalf("expected session run root %q, got %q", filepath.Join(policy.ShareRunsRoot, "session-a"), sessionRunRoot)
	}

	if _, err := policy.ResolveSessionRunPath("session-a", "../escape.txt"); err == nil {
		t.Fatal("expected session run path escape error")
	}
}

func openTestOverlayRegistry(t *testing.T, base *Runtime) *SessionOverlayRegistry {
	t.Helper()

	tmpDir := t.TempDir()
	registry, err := OpenSessionOverlayRegistry(base, OverlayRegistryOptions{
		DeploymentRoot: filepath.Join(tmpDir, "deployment"),
		RuntimeRoot:    filepath.Join(tmpDir, "runtime"),
	})
	if err != nil {
		t.Fatalf("open session overlay registry: %v", err)
	}
	t.Cleanup(func() {
		if err := registry.Close(); err != nil {
			t.Fatalf("close session overlay registry: %v", err)
		}
	})
	return registry
}
