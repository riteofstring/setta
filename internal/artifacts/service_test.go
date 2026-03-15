package artifacts

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	binarypayload "setta/internal/binary"
)

func TestServiceImportLoadAndDeleteFlow(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	workspaceFile := filepath.Join(paths.workspaceRoot, "source.txt")
	if err := os.WriteFile(workspaceFile, []byte("imported file"), 0o644); err != nil {
		t.Fatalf("write workspace file: %v", err)
	}

	// Import should persist a new file artifact under the artifact root using a state-relative id.
	imported, err := service.ImportFiles(context.Background(), ImportFilesRequest{
		Paths:       []string{workspaceFile},
		UploadScope: UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("import files: %v", err)
	}
	if len(imported) != 1 {
		t.Fatalf("expected one imported artifact, got %#v", imported)
	}
	if !strings.HasPrefix(imported[0].ID, "artifacts/") {
		t.Fatalf("expected state-relative artifact id, got %q", imported[0].ID)
	}
	importedPath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(imported[0].ID))
	if payload, err := os.ReadFile(importedPath); err != nil || string(payload) != "imported file" {
		t.Fatalf("expected imported artifact payload, got %q err=%v", string(payload), err)
	}

	imageID := "artifacts/preview.png"
	imagePath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(imageID))
	if err := os.WriteFile(imagePath, []byte("png-bytes"), 0o644); err != nil {
		t.Fatalf("write image artifact: %v", err)
	}
	images, err := service.LoadCachedImages(context.Background(), LoadCachedPathsRequest{Paths: []string{imageID}})
	if err != nil {
		t.Fatalf("load cached images: %v", err)
	}
	if len(images) != 1 || images[0] == nil {
		t.Fatalf("expected one cached image artifact, got %#v", images)
	}
	if images[0].ID != imageID {
		t.Fatalf("expected image id %q, got %q", imageID, images[0].ID)
	}
	imagePayload, err := paths.binaryStore.ReadBytes(images[0].Value.ContentID)
	if err != nil {
		t.Fatalf("read image payload from binary store: %v", err)
	}
	if string(imagePayload) != "png-bytes" {
		t.Fatalf("expected image payload round-trip, got %q", string(imagePayload))
	}

	chartID := "artifacts/chart.csv"
	chartPath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(chartID))
	if err := os.WriteFile(chartPath, []byte("x,y\n1,2\n3,4\n"), 0o644); err != nil {
		t.Fatalf("write chart artifact: %v", err)
	}
	charts, err := service.LoadCachedChartData(context.Background(), LoadCachedPathsRequest{Paths: []string{chartID}})
	if err != nil {
		t.Fatalf("load cached chart data: %v", err)
	}
	if len(charts) != 1 || charts[0] == nil {
		t.Fatalf("expected one cached chart artifact, got %#v", charts)
	}
	if got := charts[0].Value["x"]; len(got) != 2 || got[0].(float64) != 1 || got[1].(float64) != 3 {
		t.Fatalf("unexpected chart column x: %#v", got)
	}

	brushID := "artifacts/stroke.json"
	brushPath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(brushID))
	if err := os.WriteFile(brushPath, []byte(`{"strokeStyle":"#000000","lineWidth":2,"lineCap":"round","points":[[1,2],"BREAK"],"globalCompositeOperation":"source-over"}`), 0o644); err != nil {
		t.Fatalf("write brush artifact: %v", err)
	}
	brushes, err := service.LoadCachedBrushStrokes(context.Background(), LoadCachedPathsRequest{Paths: []string{brushID}})
	if err != nil {
		t.Fatalf("load cached brushes: %v", err)
	}
	if len(brushes) != 1 || brushes[0] == nil {
		t.Fatalf("expected one cached brush artifact, got %#v", brushes)
	}
	var brushValue map[string]any
	if err := json.Unmarshal(brushes[0].Value, &brushValue); err != nil {
		t.Fatalf("decode brush value: %v", err)
	}
	if brushValue["strokeStyle"] != "#000000" {
		t.Fatalf("expected brush strokeStyle, got %#v", brushValue)
	}

	transformID := "artifacts/transform.json"
	transformPath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(transformID))
	if err := os.WriteFile(transformPath, []byte(`{"transform":[1,0,0,1,3,4],"eraserStrokes":[]}`), 0o644); err != nil {
		t.Fatalf("write transform artifact: %v", err)
	}
	transforms, err := service.LoadCachedDrawAreaLayerItemTransforms(context.Background(), LoadCachedPathsRequest{Paths: []string{transformID}})
	if err != nil {
		t.Fatalf("load cached transforms: %v", err)
	}
	if len(transforms) != 1 || transforms[0] == nil {
		t.Fatalf("expected one cached transform artifact, got %#v", transforms)
	}

	// Delete should remove the imported file artifact from disk and return the normalized id.
	deleted, err := service.Delete(context.Background(), DeleteRequest{
		Artifacts: []DeleteRequestItem{{ID: imported[0].ID, Type: ArtifactTypeFile}},
	})
	if err != nil {
		t.Fatalf("delete artifacts: %v", err)
	}
	if len(deleted) != 1 || deleted[0] != imported[0].ID {
		t.Fatalf("expected deleted id %q, got %#v", imported[0].ID, deleted)
	}
	if _, err := os.Stat(importedPath); !os.IsNotExist(err) {
		t.Fatalf("expected imported artifact to be removed, stat err=%v", err)
	}
}

func TestServiceUpdateHandlesConflictsAndUnsupportedTypes(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	fileRef, err := paths.binaryStore.StoreBytes([]byte("hello"), "text/plain", false)
	if err != nil {
		t.Fatalf("store file payload: %v", err)
	}
	fileValue := mustRawJSON(t, fileRef)
	fileResults, err := service.Update(context.Background(), UpdateRequest{
		Artifacts: []RawArtifact{{
			Type:  ArtifactTypeFile,
			ID:    "artifacts/notes.txt",
			Value: &fileValue,
		}},
		UploadScope: UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("update file artifact: %v", err)
	}
	if len(fileResults) != 1 || fileResults[0].Status != SaveStatusSaved {
		t.Fatalf("expected saved file result, got %#v", fileResults)
	}
	filePath := filepath.Join(paths.settaFilesRoot, "artifacts", "notes.txt")
	if payload, err := os.ReadFile(filePath); err != nil || string(payload) != "hello" {
		t.Fatalf("expected file artifact bytes, got %q err=%v", string(payload), err)
	}

	unchangedResults, err := service.Update(context.Background(), UpdateRequest{
		Artifacts: []RawArtifact{{
			Type:  ArtifactTypeFile,
			ID:    "artifacts/notes.txt",
			Value: &fileValue,
		}},
		UploadScope: UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("update unchanged file artifact: %v", err)
	}
	if unchangedResults[0].Status != SaveStatusUnchanged {
		t.Fatalf("expected unchanged result, got %#v", unchangedResults)
	}

	if err := os.WriteFile(filePath, []byte("external"), 0o644); err != nil {
		t.Fatalf("write external file contents: %v", err)
	}
	nextRef, err := paths.binaryStore.StoreBytes([]byte("next"), "text/plain", false)
	if err != nil {
		t.Fatalf("store next file payload: %v", err)
	}
	nextValue := mustRawJSON(t, nextRef)
	skip := SaveConflictStrategySkip
	skipped, err := service.Update(context.Background(), UpdateRequest{
		Artifacts: []RawArtifact{{
			Type:  ArtifactTypeFile,
			ID:    "artifacts/notes.txt",
			Value: &nextValue,
		}},
		ConflictStrategy: &skip,
		UploadScope:      UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("update skipped file artifact: %v", err)
	}
	if skipped[0].Status != SaveStatusSkipped {
		t.Fatalf("expected skipped result, got %#v", skipped)
	}
	if payload, err := os.ReadFile(filePath); err != nil || string(payload) != "external" {
		t.Fatalf("expected skipped write to preserve external contents, got %q err=%v", string(payload), err)
	}

	backup := SaveConflictStrategyBackup
	conflicted, err := service.Update(context.Background(), UpdateRequest{
		Artifacts: []RawArtifact{{
			Type:  ArtifactTypeFile,
			ID:    "artifacts/notes.txt",
			Value: &nextValue,
		}},
		ConflictStrategy: &backup,
		UploadScope:      UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("update conflicting file artifact: %v", err)
	}
	if conflicted[0].Status != SaveStatusConflict || conflicted[0].BackupPath == nil {
		t.Fatalf("expected conflict with backup path, got %#v", conflicted)
	}
	if payload, err := os.ReadFile(filePath); err != nil || string(payload) != "next" {
		t.Fatalf("expected backup strategy to overwrite file, got %q err=%v", string(payload), err)
	}
	if _, err := os.Stat(filepath.Join(paths.settaFilesRoot, filepath.FromSlash(*conflicted[0].BackupPath))); err != nil {
		t.Fatalf("expected backup file to exist: %v", err)
	}

	brushValue := json.RawMessage(`{"strokeStyle":"#ffffff","lineWidth":1,"lineCap":"round","points":[[0,1]],"globalCompositeOperation":"source-over"}`)
	transformValue := json.RawMessage(`{"transform":[1,0,0,1,10,12],"eraserStrokes":[]}`)
	multiResults, err := service.Update(context.Background(), UpdateRequest{
		Artifacts: []RawArtifact{
			{Type: ArtifactTypeBrushStroke, ID: "artifacts/stroke.json", Value: &brushValue},
			{Type: ArtifactTypeDrawAreaLayerItemTransform, ID: "artifacts/transform.json", Value: &transformValue},
		},
		UploadScope: UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("update json artifacts: %v", err)
	}
	if len(multiResults) != 2 || multiResults[0].Status != SaveStatusSaved || multiResults[1].Status != SaveStatusSaved {
		t.Fatalf("expected saved json artifacts, got %#v", multiResults)
	}

	unsupportedValue := mustRawJSON(t, map[string]any{"contentId": "x", "byteLength": 1})
	if _, err := service.Update(context.Background(), UpdateRequest{
		Artifacts:   []RawArtifact{{Type: ArtifactTypeImage, ID: "artifacts/image.png", Value: &unsupportedValue}},
		UploadScope: UploadScopeGeneric,
	}); err == nil {
		t.Fatalf("expected unsupported image update error")
	} else {
		var artifactErr *Error
		if !strings.Contains(err.Error(), "not supported") || !errors.As(err, &artifactErr) || artifactErr.Kind != ErrorArtifactTypeUnsupported {
			t.Fatalf("expected unsupported artifact error, got %v", err)
		}
	}
}

func TestServiceRejectsOversizedFileArtifactsAndOutsideRootDeletes(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	oversizedPayload := make([]byte, defaultMaxGenericFileBytes+1)
	oversizedRef, err := paths.binaryStore.StoreBytes(oversizedPayload, "application/octet-stream", false)
	if err != nil {
		t.Fatalf("store oversized payload: %v", err)
	}
	oversizedValue := mustRawJSON(t, oversizedRef)
	if _, err := service.Update(context.Background(), UpdateRequest{
		Artifacts:   []RawArtifact{{Type: ArtifactTypeFile, ID: "artifacts/oversized.bin", Value: &oversizedValue}},
		UploadScope: UploadScopeGeneric,
	}); err == nil {
		t.Fatalf("expected oversized file rejection")
	} else {
		var artifactErr *Error
		if !errors.As(err, &artifactErr) || artifactErr.Kind != ErrorTooLarge {
			t.Fatalf("expected too-large error, got %v", err)
		}
	}

	if _, err := service.Delete(context.Background(), DeleteRequest{
		Artifacts: []DeleteRequestItem{{ID: "code/escape.txt", Type: ArtifactTypeFile}},
	}); err == nil {
		t.Fatalf("expected outside-root delete rejection")
	} else {
		var artifactErr *Error
		if !errors.As(err, &artifactErr) || artifactErr.Kind != ErrorPathForbidden {
			t.Fatalf("expected path-forbidden error, got %v", err)
		}
	}
}

type artifactTestPaths struct {
	workspaceRoot  string
	settaFilesRoot string
	artifactsRoot  string
	binaryStore    *binarypayload.Store
}

func newArtifactTestService(t *testing.T) (*Service, artifactTestPaths) {
	t.Helper()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaFilesRoot := filepath.Join(root, "setta_files")
	artifactsRoot := filepath.Join(settaFilesRoot, "artifacts")
	for _, path := range []string{workspaceRoot, settaFilesRoot, artifactsRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	binaryStore, err := binarypayload.NewStore(filepath.Join(root, "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}
	service, err := NewService(ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		ArtifactsRoot:  artifactsRoot,
		BinaryStore:    binaryStore,
		TimeNow: func() time.Time {
			return time.Date(2026, time.March, 10, 9, 8, 7, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new artifact service: %v", err)
	}
	return service, artifactTestPaths{
		workspaceRoot:  workspaceRoot,
		settaFilesRoot: settaFilesRoot,
		artifactsRoot:  artifactsRoot,
		binaryStore:    binaryStore,
	}
}

func mustRawJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	content, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	return json.RawMessage(content)
}
