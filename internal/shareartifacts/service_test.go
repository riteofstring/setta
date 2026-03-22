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

func TestServiceCreateSessionDoesNotPreloadImageCache(t *testing.T) {
	t.Parallel()

	service, runtime, deploymentRoot := newShareArtifactTestService(t, true)

	artifactPath := filepath.Join(deploymentRoot, "artifacts", "preview.png")
	if err := os.MkdirAll(filepath.Dir(artifactPath), 0o755); err != nil {
		t.Fatalf("mkdir artifact parent: %v", err)
	}
	if err := os.WriteFile(artifactPath, []byte("fake-image"), 0o644); err != nil {
		t.Fatalf("write disk artifact: %v", err)
	}

	if _, err := runtime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	service.mu.RLock()
	_, hasOverlay := service.sessions["share-a"]
	_, hasCachedImage := service.images[artifactPath]
	service.mu.RUnlock()
	if hasOverlay {
		t.Fatal("expected session bootstrap to leave artifact overlay empty before the first load")
	}
	if hasCachedImage {
		t.Fatal("expected session bootstrap to leave image cache empty before the first load")
	}

	loaded, err := service.LoadCachedImages(context.Background(), "share-a", artifacts.LoadCachedPathsRequest{
		Paths: []string{artifactPath},
	})
	if err != nil {
		t.Fatalf("load cached image after session bootstrap: %v", err)
	}
	if len(loaded) != 1 || loaded[0] == nil {
		t.Fatalf("expected lazy cached image load, got %#v", loaded)
	}

	service.mu.RLock()
	_, hasCachedImage = service.images[artifactPath]
	service.mu.RUnlock()
	if !hasCachedImage {
		t.Fatal("expected first image load to populate the cache")
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

func TestServiceUpdateUsesSharedUploadPolicies(t *testing.T) {
	t.Parallel()

	uploadPolicies := &artifacts.UploadPolicies{
		Chat: artifacts.ScopeUploadPolicy{
			MaxFileBytes:        10,
			MaxFileLabel:        "10 bytes",
			AllowedMimePrefixes: []string{"image/"},
		},
		Generic: artifacts.ScopeUploadPolicy{
			MaxFileBytes: 4,
			MaxFileLabel: "4 bytes",
		},
	}
	service, runtime, _ := newShareArtifactTestServiceWithPolicies(t, true, uploadPolicies)
	if _, err := runtime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	disallowedChatRef, err := service.binaryStore.StoreBytes([]byte("12345"), "text/plain", false)
	if err != nil {
		t.Fatalf("store disallowed chat payload: %v", err)
	}
	disallowedChatValue := mustShareArtifactRawJSON(t, disallowedChatRef)
	if _, err := service.Update(context.Background(), "share-a", artifacts.UpdateRequest{
		Artifacts: []artifacts.RawArtifact{{
			Type:  artifacts.ArtifactTypeFile,
			ID:    "artifacts/notes.txt",
			Value: &disallowedChatValue,
		}},
		UploadScope: artifacts.UploadScopeChat,
	}); err == nil {
		t.Fatal("expected disallowed chat mime rejection")
	} else {
		assertShareArtifactErrorKind(t, err, artifacts.ErrorMimeNotAllowed)
	}

	oversizedGenericRef, err := service.binaryStore.StoreBytes([]byte("12345"), "text/plain", false)
	if err != nil {
		t.Fatalf("store oversized generic payload: %v", err)
	}
	oversizedGenericValue := mustShareArtifactRawJSON(t, oversizedGenericRef)
	if _, err := service.Update(context.Background(), "share-a", artifacts.UpdateRequest{
		Artifacts: []artifacts.RawArtifact{{
			Type:  artifacts.ArtifactTypeFile,
			ID:    "artifacts/too-big.txt",
			Value: &oversizedGenericValue,
		}},
		UploadScope: artifacts.UploadScopeGeneric,
	}); err == nil {
		t.Fatal("expected oversized generic rejection")
	} else {
		assertShareArtifactErrorKind(t, err, artifacts.ErrorTooLarge)
	}
}

func newShareArtifactTestService(t *testing.T, allowParamChanges bool) (*Service, *deployments.Runtime, string) {
	t.Helper()

	return newShareArtifactTestServiceWithPolicies(t, allowParamChanges, nil)
}

func newShareArtifactTestServiceWithPolicies(t *testing.T, allowParamChanges bool, uploadPolicies *artifacts.UploadPolicies) (*Service, *deployments.Runtime, string) {
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
		Deployment:     deploymentRuntime,
		BinaryStore:    binaryStore,
		UploadPolicies: uploadPolicies,
	})
	if err != nil {
		t.Fatalf("new share artifact service: %v", err)
	}
	return service, deploymentRuntime, deploymentRoot
}

func writeShareArtifactDeploymentFixture(t *testing.T, deploymentRoot string, allowParamChanges bool) {
	t.Helper()

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:                   "project-alpha",
				Name:                 "Alpha",
				ProjectChatWindowing: &defaultWindowing,
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

func mustShareArtifactRawJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()

	content, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	return json.RawMessage(content)
}

func assertShareArtifactErrorKind(t *testing.T, err error, kind artifacts.ErrorKind) {
	t.Helper()

	var artifactErr *artifacts.Error
	if !errors.As(err, &artifactErr) || artifactErr.Kind != kind {
		t.Fatalf("expected %s error, got %v", kind, err)
	}
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
