package shareartifacts

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/artifacts"
	binarypayload "setta/internal/binary"
	"setta/internal/deployments"
	"setta/internal/projectstate"
)

func TestServiceUpdateAndLoadUsePerSessionOverlayAndLeaveDiskUntouched(t *testing.T) {
	t.Parallel()

	service, runtime, deploymentRoot := newShareArtifactTestService(t, true)
	if _, err := runtime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share-a session: %v", err)
	}
	if _, err := runtime.CreateSessionWithID("share-b"); err != nil {
		t.Fatalf("create share-b session: %v", err)
	}

	artifactPath := filepath.Join(deploymentRoot, "artifacts", "stroke.json")
	if err := os.MkdirAll(filepath.Dir(artifactPath), 0o755); err != nil {
		t.Fatalf("mkdir artifact parent: %v", err)
	}
	if err := os.WriteFile(artifactPath, []byte("{\n  \"strokeStyle\": \"#111111\"\n}\n"), 0o644); err != nil {
		t.Fatalf("write disk artifact: %v", err)
	}

	value := json.RawMessage(`{"strokeStyle":"#000000","lineWidth":2,"lineCap":"butt"}`)
	results, err := service.Update(context.Background(), "share-a", artifacts.UpdateRequest{
		Artifacts: []artifacts.RawArtifact{{
			Type:  artifacts.ArtifactTypeBrushStroke,
			ID:    artifactPath,
			Value: &value,
		}},
		UploadScope: artifacts.UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("update share overlay: %v", err)
	}
	if len(results) != 1 || results[0].ID != "artifacts/stroke.json" {
		t.Fatalf("expected normalized save result, got %#v", results)
	}

	diskPayload, err := os.ReadFile(artifactPath)
	if err != nil {
		t.Fatalf("read disk artifact: %v", err)
	}
	if strings.Contains(string(diskPayload), "#000000") {
		t.Fatalf("expected disk artifact to remain unchanged, got %q", string(diskPayload))
	}

	loadedA, err := service.LoadCachedBrushStrokes(context.Background(), "share-a", artifacts.LoadCachedPathsRequest{
		Paths: []string{artifactPath},
	})
	if err != nil {
		t.Fatalf("load share-a brush strokes: %v", err)
	}
	if len(loadedA) != 1 || loadedA[0] == nil {
		t.Fatalf("expected share-a overlay artifact, got %#v", loadedA)
	}
	if loadedA[0].ID != "artifacts/stroke.json" || !strings.Contains(string(loadedA[0].Value), "#000000") {
		t.Fatalf("expected share-a overlay payload, got %#v", loadedA[0])
	}

	loadedB, err := service.LoadCachedBrushStrokes(context.Background(), "share-b", artifacts.LoadCachedPathsRequest{
		Paths: []string{artifactPath},
	})
	if err != nil {
		t.Fatalf("load share-b brush strokes: %v", err)
	}
	if len(loadedB) != 1 || loadedB[0] == nil {
		t.Fatalf("expected share-b disk artifact, got %#v", loadedB)
	}
	if strings.Contains(string(loadedB[0].Value), "#000000") || !strings.Contains(string(loadedB[0].Value), "#111111") {
		t.Fatalf("expected share-b disk payload, got %#v", loadedB[0])
	}
}

func TestServiceDeleteIsInMemoryOnlyAndNormalizesIDs(t *testing.T) {
	t.Parallel()

	service, runtime, deploymentRoot := newShareArtifactTestService(t, true)
	if _, err := runtime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	artifactPath := filepath.Join(deploymentRoot, "artifacts", "delete.txt")
	if err := os.MkdirAll(filepath.Dir(artifactPath), 0o755); err != nil {
		t.Fatalf("mkdir artifact parent: %v", err)
	}
	if err := os.WriteFile(artifactPath, []byte("keep me"), 0o644); err != nil {
		t.Fatalf("write disk artifact: %v", err)
	}

	deleted, err := service.Delete(context.Background(), "share-a", artifacts.DeleteRequest{
		Artifacts: []artifacts.DeleteRequestItem{{
			ID:   artifactPath,
			Type: artifacts.ArtifactTypeFile,
		}},
	})
	if err != nil {
		t.Fatalf("delete share artifact: %v", err)
	}
	if len(deleted) != 1 || deleted[0] != "artifacts/delete.txt" {
		t.Fatalf("expected normalized deleted ids, got %#v", deleted)
	}

	content, err := os.ReadFile(artifactPath)
	if err != nil {
		t.Fatalf("read disk artifact after delete: %v", err)
	}
	if string(content) != "keep me" {
		t.Fatalf("expected disk artifact to remain after share delete, got %q", string(content))
	}
}

func TestServiceDeleteShareSessionDropsOverlayState(t *testing.T) {
	t.Parallel()

	service, runtime, deploymentRoot := newShareArtifactTestService(t, true)
	if _, err := runtime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	artifactPath := filepath.Join(deploymentRoot, "artifacts", "stroke.json")
	if err := os.MkdirAll(filepath.Dir(artifactPath), 0o755); err != nil {
		t.Fatalf("mkdir artifact parent: %v", err)
	}
	if err := os.WriteFile(artifactPath, []byte("{\n  \"strokeStyle\": \"#111111\"\n}\n"), 0o644); err != nil {
		t.Fatalf("write disk artifact: %v", err)
	}

	value := json.RawMessage(`{"strokeStyle":"#000000","lineWidth":2,"lineCap":"butt"}`)
	if _, err := service.Update(context.Background(), "share-a", artifacts.UpdateRequest{
		Artifacts: []artifacts.RawArtifact{{
			Type:  artifacts.ArtifactTypeBrushStroke,
			ID:    artifactPath,
			Value: &value,
		}},
		UploadScope: artifacts.UploadScopeGeneric,
	}); err != nil {
		t.Fatalf("update share overlay: %v", err)
	}

	service.DeleteShareSession("share-a")

	loaded, err := service.LoadCachedBrushStrokes(context.Background(), "share-a", artifacts.LoadCachedPathsRequest{
		Paths: []string{artifactPath},
	})
	if err != nil {
		t.Fatalf("load brush after overlay drop: %v", err)
	}
	if len(loaded) != 1 || loaded[0] == nil {
		t.Fatalf("expected disk artifact after overlay drop, got %#v", loaded)
	}
	if strings.Contains(string(loaded[0].Value), "#000000") || !strings.Contains(string(loaded[0].Value), "#111111") {
		t.Fatalf("expected disk payload after overlay drop, got %#v", loaded[0])
	}
}

func TestServiceUpdateRejectsPolicyDenied(t *testing.T) {
	t.Parallel()

	service, runtime, deploymentRoot := newShareArtifactTestService(t, false)
	if _, err := runtime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	artifactPath := filepath.Join(deploymentRoot, "artifacts", "stroke.json")
	value := json.RawMessage(`{"strokeStyle":"#000000"}`)
	_, err := service.Update(context.Background(), "share-a", artifacts.UpdateRequest{
		Artifacts: []artifacts.RawArtifact{{
			Type:  artifacts.ArtifactTypeBrushStroke,
			ID:    artifactPath,
			Value: &value,
		}},
		UploadScope: artifacts.UploadScopeGeneric,
	})
	if err == nil {
		t.Fatal("expected policy denial")
	}
	var artifactErr *artifacts.Error
	if !errors.As(err, &artifactErr) {
		t.Fatalf("expected artifacts.Error, got %v", err)
	}
	if artifactErr.Kind != artifacts.ErrorPolicyDenied {
		t.Fatalf("expected policy denied kind, got %#v", artifactErr)
	}
}

func newShareArtifactTestService(t *testing.T, allowParamChanges bool) (*Service, *deployments.Runtime, string) {
	t.Helper()

	root := t.TempDir()
	deploymentRoot := filepath.Join(root, "deployment")
	runtimeRoot := filepath.Join(root, "runtime")
	writeShareArtifactDeploymentFixture(t, deploymentRoot, allowParamChanges)

	deploymentRuntime, err := deployments.Open(context.Background(), deployments.RuntimeOptions{
		DeploymentRoot: deploymentRoot,
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

	binaryStore, err := binarypayload.NewStore(filepath.Join(root, "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}
	service, err := NewService(ServiceOptions{
		Deployment:  deploymentRuntime,
		BinaryStore: binaryStore,
	})
	if err != nil {
		t.Fatalf("new share artifact service: %v", err)
	}
	return service, deploymentRuntime, deploymentRoot
}

func writeShareArtifactDeploymentFixture(t *testing.T, deploymentRoot string, allowParamChanges bool) {
	t.Helper()

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	writeShareArtifactJSON(t, filepath.Join(deploymentRoot, projectstate.MainFileName), document)
	writeShareArtifactJSON(t, filepath.Join(deploymentRoot, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "share-artifacts",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v1",
	})
	writeShareArtifactJSON(t, filepath.Join(deploymentRoot, "policy.json"), map[string]any{
		"allowParamChanges": allowParamChanges,
		"allowRun":          true,
	})
}

func writeShareArtifactJSON(t *testing.T, path string, payload any) {
	t.Helper()

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	encoded = append(encoded, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir parent: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write json file: %v", err)
	}
}
