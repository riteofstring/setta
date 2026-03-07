package deployments

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/projectstate"
)

func TestLoadPolicyAppliesDefaultsAndRejectsNever(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeDeploymentJSON(t, filepath.Join(root, "policy.json"), map[string]any{
		"allowRun": true,
	})

	policy, err := LoadPolicy(root)
	if err != nil {
		t.Fatalf("load policy: %v", err)
	}
	if !policy.AllowRun {
		t.Fatal("expected allowRun to stay true")
	}
	if !policy.AllowParamChanges || !policy.AllowVariantChanges || !policy.AllowLayoutChanges {
		t.Fatal("expected omitted deployment policy booleans to keep defaults")
	}
	if policy.RunSnapshotMode != RunSnapshotModeEphemeral {
		t.Fatalf("expected default snapshot mode ephemeral, got %q", policy.RunSnapshotMode)
	}

	writeDeploymentJSON(t, filepath.Join(root, "policy.json"), map[string]any{
		"runSnapshotMode": "never",
	})
	if _, err := LoadPolicy(root); !errors.Is(err, ErrDeploymentRunSnapshotModeNeverDenied) {
		t.Fatalf("expected never-mode rejection, got %v", err)
	}
}

func TestLoadManifestDefaultsListenerEnabled(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeDeploymentJSON(t, filepath.Join(root, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v1",
		"listener": map[string]any{
			"entrypoint": "listener/app.py",
		},
	})

	manifest, err := LoadManifest(root)
	if err != nil {
		t.Fatalf("load manifest: %v", err)
	}
	if manifest.Listener == nil {
		t.Fatal("expected listener config")
	}
	if !manifest.Listener.Enabled {
		t.Fatal("expected listener enabled default to be true")
	}
}

func TestOpenLoadsDeploymentRuntimeAndAppliesManifestDefaultProject(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	writeDeploymentFixture(t, root, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-beta",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Beta",
			},
		},
	}, map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v1",
	}, map[string]any{
		"allowRun": true,
	})

	runtime, err := Open(context.Background(), RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("open deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close deployment runtime: %v", err)
		}
	})

	if runtime.Manifest().DeploymentName != "demo-share" {
		t.Fatalf("expected deployment name demo-share, got %q", runtime.Manifest().DeploymentName)
	}
	if !runtime.Policy().AllowRun {
		t.Fatal("expected loaded policy to allow runs")
	}
	if runtime.Paths().DeploymentRoot != root {
		t.Fatalf("expected deployment root %q, got %q", root, runtime.Paths().DeploymentRoot)
	}

	snapshot := runtime.Base().Snapshot()
	if snapshot.Document.DefaultProjectID != "project-alpha" {
		t.Fatalf("expected manifest default project id project-alpha, got %q", snapshot.Document.DefaultProjectID)
	}
}

func TestRuntimeCreateSessionCreatesOverlayAndTouchesSession(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	writeDeploymentFixture(t, root, singleProjectDocument("project-alpha", "Alpha"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v1",
	}, map[string]any{})

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime, err := Open(context.Background(), RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
		Now: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("open deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close deployment runtime: %v", err)
		}
	})

	session, err := deploymentRuntime.CreateSessionWithID("session-a")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if session.CreatedAt != now || session.LastSeenAt != now {
		t.Fatalf("expected session timestamps %v, got %#v", now, session)
	}

	overlay, err := deploymentRuntime.Overlay("session-a")
	if err != nil {
		t.Fatalf("resolve session overlay: %v", err)
	}
	if _, err := overlay.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.Name = "Session Alpha"
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("mutate session overlay: %v", err)
	}

	baseProject, err := deploymentRuntime.Base().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("resolve base project: %v", err)
	}
	if baseProject.Name != "Alpha" {
		t.Fatalf("expected base project name Alpha, got %q", baseProject.Name)
	}

	now = now.Add(2 * time.Minute)
	if err := deploymentRuntime.TouchSession("session-a"); err != nil {
		t.Fatalf("touch session: %v", err)
	}
	touched, ok := deploymentRuntime.Session("session-a")
	if !ok {
		t.Fatal("expected session to exist after touch")
	}
	if touched.LastSeenAt != now {
		t.Fatalf("expected touched time %v, got %v", now, touched.LastSeenAt)
	}
}

func TestRuntimeSessionRunReservationLifecycle(t *testing.T) {
	t.Parallel()

	deploymentRuntime := openTestDeploymentRuntime(t)

	if _, err := deploymentRuntime.CreateSessionWithID("session-a"); err != nil {
		t.Fatalf("create session: %v", err)
	}

	if count, err := deploymentRuntime.SessionRunCount("session-a"); err != nil {
		t.Fatalf("session run count: %v", err)
	} else if count != 0 {
		t.Fatalf("expected initial run count 0, got %d", count)
	}

	reserved, err := deploymentRuntime.TryReserveSessionRun("session-a")
	if err != nil {
		t.Fatalf("reserve session run: %v", err)
	}
	if !reserved {
		t.Fatal("expected first reservation to succeed")
	}

	reserved, err = deploymentRuntime.TryReserveSessionRun("session-a")
	if err != nil {
		t.Fatalf("reserve session run second time: %v", err)
	}
	if reserved {
		t.Fatal("did not expect second reservation to succeed")
	}

	if count, err := deploymentRuntime.RollbackReservedSessionRun("session-a"); err != nil {
		t.Fatalf("rollback reserved run: %v", err)
	} else if count != 0 {
		t.Fatalf("expected rollback to restore run count 0, got %d", count)
	}

	if count, err := deploymentRuntime.IncrementSessionRunCount("session-a"); err != nil {
		t.Fatalf("increment run count: %v", err)
	} else if count != 1 {
		t.Fatalf("expected incremented run count 1, got %d", count)
	}
}

func TestRuntimeGetOrCreateSessionReusesLiveSessionAndReplacesUnknownID(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	writeDeploymentFixture(t, root, singleProjectDocument("project-alpha", "Alpha"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v1",
	}, map[string]any{})

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	nextGeneratedID := "generated-session"
	deploymentRuntime, err := Open(context.Background(), RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
		Now: func() time.Time {
			return now
		},
		IDGenerator: func() string {
			return nextGeneratedID
		},
	})
	if err != nil {
		t.Fatalf("open deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close deployment runtime: %v", err)
		}
	})

	session, err := deploymentRuntime.CreateSessionWithID("session-a")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	now = now.Add(2 * time.Minute)
	reused, created, err := deploymentRuntime.GetOrCreateSession("session-a")
	if err != nil {
		t.Fatalf("reuse live session: %v", err)
	}
	if created {
		t.Fatal("did not expect existing session reuse to report creation")
	}
	if reused.ID != "session-a" {
		t.Fatalf("expected reused session id session-a, got %q", reused.ID)
	}
	if !reused.LastSeenAt.After(session.LastSeenAt) {
		t.Fatalf("expected reused session last-seen time after %v, got %v", session.LastSeenAt, reused.LastSeenAt)
	}

	now = now.Add(2 * time.Minute)
	replacement, created, err := deploymentRuntime.GetOrCreateSession("missing-session")
	if err != nil {
		t.Fatalf("replace unknown session id: %v", err)
	}
	if !created {
		t.Fatal("expected unknown session id to create a new session")
	}
	if replacement.ID != nextGeneratedID {
		t.Fatalf("expected generated session id %q, got %q", nextGeneratedID, replacement.ID)
	}
	if replacement.ID == "missing-session" {
		t.Fatal("did not expect unknown session id to be adopted as the new session id")
	}
}

func TestRuntimeCleanupExpiredSessionsRemovesOnlyExpiredSessions(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	writeDeploymentFixture(t, root, singleProjectDocument("project-alpha", "Alpha"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v1",
	}, map[string]any{})

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime, err := Open(context.Background(), RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
		Now: func() time.Time {
			return now
		},
		SessionTTL: 30 * time.Second,
	})
	if err != nil {
		t.Fatalf("open deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close deployment runtime: %v", err)
		}
	})

	if _, err := deploymentRuntime.CreateSessionWithID("session-expired"); err != nil {
		t.Fatalf("create expired session: %v", err)
	}
	if _, err := deploymentRuntime.CreateSessionWithID("session-active"); err != nil {
		t.Fatalf("create active session: %v", err)
	}

	now = now.Add(45 * time.Second)
	if err := deploymentRuntime.TouchSession("session-active"); err != nil {
		t.Fatalf("touch active session: %v", err)
	}

	now = now.Add(29 * time.Second)
	expiredIDs, err := deploymentRuntime.CleanupExpiredSessions()
	if err != nil {
		t.Fatalf("cleanup expired sessions: %v", err)
	}
	if len(expiredIDs) != 1 || expiredIDs[0] != "session-expired" {
		t.Fatalf("expected only session-expired to be cleaned up, got %#v", expiredIDs)
	}
	if deploymentRuntime.HasSession("session-expired") {
		t.Fatal("did not expect expired session to remain")
	}
	if !deploymentRuntime.HasSession("session-active") {
		t.Fatal("expected active session to remain")
	}
	if _, err := deploymentRuntime.Overlay("session-expired"); !errors.Is(err, ErrUnknownSession) {
		t.Fatalf("expected expired overlay lookup to fail with unknown session, got %v", err)
	}
}

func TestRuntimeDeleteSessionRemovesOverlayAndRunState(t *testing.T) {
	t.Parallel()

	deploymentRuntime := openTestDeploymentRuntime(t)

	if _, err := deploymentRuntime.CreateSessionWithID("session-a"); err != nil {
		t.Fatalf("create session: %v", err)
	}
	if _, err := deploymentRuntime.IncrementSessionRunCount("session-a"); err != nil {
		t.Fatalf("increment session run count: %v", err)
	}

	if err := deploymentRuntime.DeleteSession("session-a"); err != nil {
		t.Fatalf("delete session: %v", err)
	}
	if deploymentRuntime.HasSession("session-a") {
		t.Fatal("did not expect deleted session to remain")
	}

	if _, err := deploymentRuntime.Overlay("session-a"); !errors.Is(err, ErrUnknownSession) {
		t.Fatalf("expected unknown session overlay error, got %v", err)
	}
	if _, err := deploymentRuntime.SessionRunCount("session-a"); !errors.Is(err, ErrUnknownSession) {
		t.Fatalf("expected unknown session run count error, got %v", err)
	}
}

func openTestDeploymentRuntime(t *testing.T) *Runtime {
	t.Helper()

	root := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	writeDeploymentFixture(t, root, singleProjectDocument("project-alpha", "Alpha"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v1",
	}, map[string]any{})

	deploymentRuntime, err := Open(context.Background(), RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("open deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close deployment runtime: %v", err)
		}
	})
	return deploymentRuntime
}

func writeDeploymentFixture(t *testing.T, root string, document projectstate.Document, manifest map[string]any, policy map[string]any) {
	t.Helper()

	writeDeploymentDocument(t, filepath.Join(root, projectstate.MainFileName), document)
	writeDeploymentJSON(t, filepath.Join(root, "manifest.json"), manifest)
	writeDeploymentJSON(t, filepath.Join(root, "policy.json"), policy)
}

func writeDeploymentDocument(t *testing.T, path string, document projectstate.Document) {
	t.Helper()

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize deployment document: %v", err)
	}
	payload, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		t.Fatalf("marshal deployment document: %v", err)
	}
	payload = append(payload, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir deployment document dir: %v", err)
	}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("write deployment document: %v", err)
	}
}

func writeDeploymentJSON(t *testing.T, path string, payload any) {
	t.Helper()

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal deployment json: %v", err)
	}
	encoded = append(encoded, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir deployment json dir: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write deployment json: %v", err)
	}
}

func singleProjectDocument(projectID string, name string) projectstate.Document {
	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: projectID,
		Projects: map[string]projectstate.Project{
			projectID: {
				ID:   projectID,
				Name: name,
			},
		},
	}
}
