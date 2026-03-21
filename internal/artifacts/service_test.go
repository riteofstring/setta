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

func TestServiceImportFilesAllowsEmptyFilesAndCachesBinaryRef(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	emptyPath := filepath.Join(paths.workspaceRoot, "empty.bin")
	if err := os.WriteFile(emptyPath, []byte{}, 0o644); err != nil {
		t.Fatalf("write empty workspace file: %v", err)
	}

	imported, err := service.ImportFiles(context.Background(), ImportFilesRequest{
		Paths:       []string{emptyPath},
		UploadScope: UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("import empty file: %v", err)
	}
	if len(imported) != 1 {
		t.Fatalf("expected one imported artifact, got %#v", imported)
	}
	if imported[0].Size != 0 {
		t.Fatalf("expected empty import size, got %#v", imported)
	}

	importedPath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(imported[0].ID))
	payload, err := os.ReadFile(importedPath)
	if err != nil {
		t.Fatalf("read imported empty artifact: %v", err)
	}
	if len(payload) != 0 {
		t.Fatalf("expected imported empty artifact payload, got %q", string(payload))
	}

	// Empty files should still mint a cached file artifact with a binary-store payload ref.
	cached, ok := service.files[importedPath]
	if !ok {
		t.Fatalf("expected cached file artifact for %q", importedPath)
	}
	if cached.Type != ArtifactTypeFile {
		t.Fatalf("expected file artifact type, got %#v", cached)
	}
	if cached.Value.ByteLength != 0 {
		t.Fatalf("expected empty cached byte length, got %#v", cached.Value)
	}
	cachedPayload, err := service.ReadBinaryContent(cached.Value.ContentID)
	if err != nil {
		t.Fatalf("read cached binary payload: %v", err)
	}
	if len(cachedPayload) != 0 {
		t.Fatalf("expected empty cached binary payload, got %q", string(cachedPayload))
	}

	metadata, ok := service.metadata[importedPath]
	if !ok {
		t.Fatalf("expected cache metadata for %q", importedPath)
	}
	if metadata.LastKnownHash != hashBytes(payload) {
		t.Fatalf("expected empty-file hash %q, got %#v", hashBytes(payload), metadata)
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

	imageRef, err := paths.binaryStore.StoreBytes([]byte("png-bytes"), "image/png", false)
	if err != nil {
		t.Fatalf("store image payload: %v", err)
	}
	imageValue := mustRawJSON(t, imageRef)
	imageResults, err := service.Update(context.Background(), UpdateRequest{
		Artifacts: []RawArtifact{{
			Type:  ArtifactTypeImage,
			ID:    "artifacts/image.png",
			Value: &imageValue,
		}},
		UploadScope: UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("update image artifact: %v", err)
	}
	if len(imageResults) != 1 || imageResults[0].Status != SaveStatusSaved {
		t.Fatalf("expected saved image result, got %#v", imageResults)
	}
	imagePath := filepath.Join(paths.settaFilesRoot, "artifacts", "image.png")
	if payload, err := os.ReadFile(imagePath); err != nil || string(payload) != "png-bytes" {
		t.Fatalf("expected updated image artifact payload, got %q err=%v", string(payload), err)
	}
	loadedImages, err := service.LoadCachedImages(context.Background(), LoadCachedPathsRequest{Paths: []string{"artifacts/image.png"}})
	if err != nil {
		t.Fatalf("load cached image artifact after update: %v", err)
	}
	if len(loadedImages) != 1 || loadedImages[0] == nil {
		t.Fatalf("expected cached image artifact, got %#v", loadedImages)
	}
	imagePayload, err := paths.binaryStore.ReadBytes(loadedImages[0].Value.ContentID)
	if err != nil {
		t.Fatalf("read cached image bytes after update: %v", err)
	}
	if string(imagePayload) != "png-bytes" {
		t.Fatalf("expected cached image bytes, got %q", string(imagePayload))
	}

	chartValue := mustRawJSON(t, map[string][]any{
		"x": {1.0, 3.0},
		"y": {"alpha", ""},
	})
	chartResults, err := service.Update(context.Background(), UpdateRequest{
		Artifacts: []RawArtifact{{
			Type:  ArtifactTypeChartData,
			ID:    "artifacts/chart.csv",
			Value: &chartValue,
		}},
		UploadScope: UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("update chart artifact: %v", err)
	}
	if len(chartResults) != 1 || chartResults[0].Status != SaveStatusSaved {
		t.Fatalf("expected saved chart result, got %#v", chartResults)
	}
	loadedCharts, err := service.LoadCachedChartData(context.Background(), LoadCachedPathsRequest{Paths: []string{"artifacts/chart.csv"}})
	if err != nil {
		t.Fatalf("load cached chart after update: %v", err)
	}
	if len(loadedCharts) != 1 || loadedCharts[0] == nil {
		t.Fatalf("expected cached chart artifact, got %#v", loadedCharts)
	}
	if got := loadedCharts[0].Value["x"]; len(got) != 2 || got[0].(float64) != 1 || got[1].(float64) != 3 {
		t.Fatalf("unexpected cached chart x column: %#v", got)
	}
	if got := loadedCharts[0].Value["y"]; len(got) != 2 || got[0].(string) != "alpha" || got[1].(string) != "" {
		t.Fatalf("unexpected cached chart y column: %#v", got)
	}

	unsupportedValue := mustRawJSON(t, map[string]any{"payload": true})
	if _, err := service.Update(context.Background(), UpdateRequest{
		Artifacts:   []RawArtifact{{Type: ArtifactType("Unsupported"), ID: "artifacts/unsupported.bin", Value: &unsupportedValue}},
		UploadScope: UploadScopeGeneric,
	}); err == nil {
		t.Fatalf("expected unsupported artifact update error")
	} else {
		var artifactErr *Error
		if !strings.Contains(err.Error(), "not supported") || !errors.As(err, &artifactErr) || artifactErr.Kind != ErrorArtifactTypeUnsupported {
			t.Fatalf("expected unsupported artifact error, got %v", err)
		}
	}
}

func TestServiceValidateListenerUpdateRejectsInvalidPath(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	imageRef, err := paths.binaryStore.StoreBytes([]byte("png-bytes"), "image/png", false)
	if err != nil {
		t.Fatalf("store image payload: %v", err)
	}
	imageValue := mustRawJSON(t, imageRef)
	if _, err := service.ValidateListenerUpdate(RawArtifact{
		Type:  ArtifactTypeImage,
		ID:    "\x00bad",
		Value: &imageValue,
	}, UploadScopeGeneric); err == nil {
		t.Fatalf("expected invalid path rejection")
	} else {
		var artifactErr *Error
		if !errors.As(err, &artifactErr) || artifactErr.Kind != ErrorPathForbidden {
			t.Fatalf("expected path-forbidden artifact error, got %v", err)
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

func TestServiceUpdateEnforcesConfiguredUploadPolicies(t *testing.T) {
	t.Parallel()

	oversizedGenericPolicies := &UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes: 5,
			MaxFileLabel: "5 bytes",
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes: 10,
			MaxFileLabel: "10 bytes",
		},
	}
	oversizedGenericService, oversizedGenericPaths := newArtifactTestServiceWithPolicies(t, oversizedGenericPolicies)
	oversizedGenericRef, err := oversizedGenericPaths.binaryStore.StoreBytes(make([]byte, 11), "application/octet-stream", false)
	if err != nil {
		t.Fatalf("store oversized generic payload: %v", err)
	}
	oversizedGenericValue := mustRawJSON(t, oversizedGenericRef)
	if _, err := oversizedGenericService.Update(context.Background(), UpdateRequest{
		Artifacts:   []RawArtifact{{Type: ArtifactTypeFile, ID: "artifacts/dropzone.bin", Value: &oversizedGenericValue}},
		UploadScope: UploadScopeGeneric,
	}); err == nil {
		t.Fatalf("expected oversized dropzone update rejection")
	} else {
		assertArtifactErrorKind(t, err, ErrorTooLarge)
	}

	disabledGenericPolicies := &UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes: 5,
			MaxFileLabel: "5 bytes",
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes: 0,
			MaxFileLabel: "0 B",
		},
	}
	disabledGenericService, disabledGenericPaths := newArtifactTestServiceWithPolicies(t, disabledGenericPolicies)
	disabledGenericRef, err := disabledGenericPaths.binaryStore.StoreBytes([]byte("x"), "application/octet-stream", false)
	if err != nil {
		t.Fatalf("store disabled generic payload: %v", err)
	}
	disabledGenericValue := mustRawJSON(t, disabledGenericRef)
	if _, err := disabledGenericService.Update(context.Background(), UpdateRequest{
		Artifacts:   []RawArtifact{{Type: ArtifactTypeFile, ID: "artifacts/blocked.bin", Value: &disabledGenericValue}},
		UploadScope: UploadScopeGeneric,
	}); err == nil {
		t.Fatalf("expected disabled dropzone update rejection")
	} else {
		assertArtifactErrorKind(t, err, ErrorTooLarge)
	}

	oversizedChatPolicies := &UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes: 5,
			MaxFileLabel: "5 bytes",
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes: 10,
			MaxFileLabel: "10 bytes",
		},
	}
	oversizedChatService, oversizedChatPaths := newArtifactTestServiceWithPolicies(t, oversizedChatPolicies)
	oversizedChatRef, err := oversizedChatPaths.binaryStore.StoreBytes([]byte("123456"), "text/plain", false)
	if err != nil {
		t.Fatalf("store oversized chat payload: %v", err)
	}
	oversizedChatValue := mustRawJSON(t, oversizedChatRef)
	if _, err := oversizedChatService.Update(context.Background(), UpdateRequest{
		Artifacts:   []RawArtifact{{Type: ArtifactTypeFile, ID: "artifacts/too-big.txt", Value: &oversizedChatValue}},
		UploadScope: UploadScopeChat,
	}); err == nil {
		t.Fatalf("expected oversized chat update rejection")
	} else {
		assertArtifactErrorKind(t, err, ErrorTooLarge)
	}

	disabledChatPolicies := &UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes: 0,
			MaxFileLabel: "0 B",
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes: 10,
			MaxFileLabel: "10 bytes",
		},
	}
	disabledChatService, disabledChatPaths := newArtifactTestServiceWithPolicies(t, disabledChatPolicies)
	disabledChatRef, err := disabledChatPaths.binaryStore.StoreBytes([]byte("x"), "text/plain", false)
	if err != nil {
		t.Fatalf("store disabled chat payload: %v", err)
	}
	disabledChatValue := mustRawJSON(t, disabledChatRef)
	if _, err := disabledChatService.Update(context.Background(), UpdateRequest{
		Artifacts:   []RawArtifact{{Type: ArtifactTypeFile, ID: "artifacts/blocked.txt", Value: &disabledChatValue}},
		UploadScope: UploadScopeChat,
	}); err == nil {
		t.Fatalf("expected disabled chat update rejection")
	} else {
		assertArtifactErrorKind(t, err, ErrorTooLarge)
	}

	disallowedChatMimePolicies := &UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes:        10,
			MaxFileLabel:        "10 bytes",
			AllowedMimePrefixes: []string{"image/"},
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes: 10,
			MaxFileLabel: "10 bytes",
		},
	}
	disallowedChatMimeService, disallowedChatMimePaths := newArtifactTestServiceWithPolicies(t, disallowedChatMimePolicies)
	disallowedChatMimeRef, err := disallowedChatMimePaths.binaryStore.StoreBytes([]byte("12345"), "text/plain", false)
	if err != nil {
		t.Fatalf("store disallowed chat payload: %v", err)
	}
	disallowedChatMimeValue := mustRawJSON(t, disallowedChatMimeRef)
	if _, err := disallowedChatMimeService.Update(context.Background(), UpdateRequest{
		Artifacts:   []RawArtifact{{Type: ArtifactTypeFile, ID: "artifacts/notes.txt", Value: &disallowedChatMimeValue}},
		UploadScope: UploadScopeChat,
	}); err == nil {
		t.Fatalf("expected disallowed chat mime rejection")
	} else {
		assertArtifactErrorKind(t, err, ErrorMimeNotAllowed)
	}
}

func TestServiceImportFilesEnforcesConfiguredUploadPolicies(t *testing.T) {
	t.Parallel()

	disallowedDropzoneMimePolicies := &UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes: 5,
			MaxFileLabel: "5 bytes",
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes:        10,
			MaxFileLabel:        "10 bytes",
			AllowedMimePrefixes: []string{"image/"},
		},
	}
	disallowedDropzoneService, disallowedDropzonePaths := newArtifactTestServiceWithPolicies(t, disallowedDropzoneMimePolicies)
	disallowedDropzonePath := filepath.Join(disallowedDropzonePaths.workspaceRoot, "notes.txt")
	if err := os.WriteFile(disallowedDropzonePath, []byte("12345"), 0o644); err != nil {
		t.Fatalf("write disallowed dropzone file: %v", err)
	}
	if _, err := disallowedDropzoneService.ImportFiles(context.Background(), ImportFilesRequest{
		Paths:       []string{disallowedDropzonePath},
		UploadScope: UploadScopeGeneric,
	}); err == nil {
		t.Fatalf("expected disallowed dropzone import rejection")
	} else {
		assertArtifactErrorKind(t, err, ErrorMimeNotAllowed)
	}

	chatLimitPolicies := &UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes: 4,
			MaxFileLabel: "4 bytes",
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes: 10,
			MaxFileLabel: "10 bytes",
		},
	}
	chatLimitService, chatLimitPaths := newArtifactTestServiceWithPolicies(t, chatLimitPolicies)
	chatLimitPath := filepath.Join(chatLimitPaths.workspaceRoot, "oversized.txt")
	if err := os.WriteFile(chatLimitPath, []byte("12345"), 0o644); err != nil {
		t.Fatalf("write oversized chat file: %v", err)
	}
	if _, err := chatLimitService.ImportFiles(context.Background(), ImportFilesRequest{
		Paths:       []string{chatLimitPath},
		UploadScope: UploadScopeChat,
	}); err == nil {
		t.Fatalf("expected chat import size rejection")
	} else {
		assertArtifactErrorKind(t, err, ErrorTooLarge)
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

	return newArtifactTestServiceWithPolicies(t, nil)
}

func newArtifactTestServiceWithPolicies(t *testing.T, uploadPolicies *UploadPolicies) (*Service, artifactTestPaths) {
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
		UploadPolicies: uploadPolicies,
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

func assertArtifactErrorKind(t *testing.T, err error, kind ErrorKind) {
	t.Helper()

	var artifactErr *Error
	if !errors.As(err, &artifactErr) || artifactErr.Kind != kind {
		t.Fatalf("expected %s error, got %v", kind, err)
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
