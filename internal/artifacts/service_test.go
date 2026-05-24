package artifacts

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	binarypayload "setta/internal/binary"
)

func TestServiceImportLoadAndDeleteFlow(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	workspaceFile := filepath.Join(paths.workspaceRoot, "source.txt")
	writeArtifactTestFile(t, workspaceFile, "imported file")

	imported, importedPath := importWorkspaceArtifactForTest(t, service, paths, workspaceFile, "imported file")
	assertCachedImageRoundTrip(t, service, paths)
	assertCachedChartRoundTrip(t, service, paths)
	assertCachedBrushStrokeRoundTrip(t, service, paths)
	assertCachedTransformRoundTrip(t, service, paths)
	assertImportedArtifactDelete(t, service, imported, importedPath)
}

func writeArtifactTestFile(t *testing.T, path string, payload string) {
	t.Helper()

	if err := os.WriteFile(path, []byte(payload), 0o644); err != nil {
		t.Fatalf("write artifact test file %q: %v", path, err)
	}
}

func importWorkspaceArtifactForTest(
	t *testing.T,
	service *Service,
	paths artifactTestPaths,
	workspaceFile string,
	expectedPayload string,
) (ImportFilesResponseItem, string) {
	t.Helper()

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
	assertArtifactFilePayload(t, importedPath, expectedPayload, "imported artifact payload")
	return imported[0], importedPath
}

func assertCachedImageRoundTrip(t *testing.T, service *Service, paths artifactTestPaths) {
	t.Helper()

	imageID := "artifacts/preview.png"
	imagePath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(imageID))
	writeArtifactTestFile(t, imagePath, "png-bytes")
	image := loadSingleCachedImage(t, service, imageID)
	assertCachedArtifactID(t, image.ID, imageID)
	assertCachedImagePayload(t, paths, image, "png-bytes")
}

func assertCachedChartRoundTrip(t *testing.T, service *Service, paths artifactTestPaths) {
	t.Helper()

	chartID := "artifacts/chart.csv"
	chartPath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(chartID))
	writeArtifactTestFile(t, chartPath, "x,y\n1,2\n3,4\n")
	chart := loadSingleCachedChart(t, service, chartID)
	assertChartColumn(t, chart.Value, "x", []any{1.0, 3.0})
}

func assertCachedBrushStrokeRoundTrip(t *testing.T, service *Service, paths artifactTestPaths) {
	t.Helper()

	brushID := "artifacts/stroke.json"
	brushPath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(brushID))
	writeArtifactTestFile(t, brushPath, `{"strokeStyle":"#000000","lineWidth":2,"lineCap":"round","points":[[1,2],"BREAK"],"globalCompositeOperation":"source-over"}`)
	brushValue := decodeJSONRawMessage(t, loadSingleCachedBrush(t, service, brushID).Value)
	if brushValue["strokeStyle"] != "#000000" {
		t.Fatalf("expected brush strokeStyle, got %#v", brushValue)
	}
}

func assertCachedTransformRoundTrip(t *testing.T, service *Service, paths artifactTestPaths) {
	t.Helper()

	transformID := "artifacts/transform.json"
	transformPath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(transformID))
	writeArtifactTestFile(t, transformPath, `{"transform":[1,0,0,1,3,4],"eraserStrokes":[]}`)
	loadSingleCachedTransform(t, service, transformID)
}

func assertImportedArtifactDelete(t *testing.T, service *Service, imported ImportFilesResponseItem, importedPath string) {
	t.Helper()

	deleted, err := service.Delete(context.Background(), DeleteRequest{
		Artifacts: []DeleteRequestItem{{ID: imported.ID, Type: ArtifactTypeFile}},
	})
	if err != nil {
		t.Fatalf("delete artifacts: %v", err)
	}
	if len(deleted) != 1 || deleted[0] != imported.ID {
		t.Fatalf("expected deleted id %q, got %#v", imported.ID, deleted)
	}
	if _, err := os.Stat(importedPath); !os.IsNotExist(err) {
		t.Fatalf("expected imported artifact to be removed, stat err=%v", err)
	}
}

func loadSingleCachedImage(t *testing.T, service *Service, path string) *ImageArtifact {
	t.Helper()

	images, err := service.LoadCachedImages(context.Background(), LoadCachedPathsRequest{Paths: []string{path}})
	if err != nil {
		t.Fatalf("load cached images: %v", err)
	}
	if len(images) != 1 {
		t.Fatalf("expected one cached image artifact, got %#v", images)
	}
	if images[0] == nil {
		t.Fatalf("expected cached image artifact, got nil")
	}
	return images[0]
}

func loadSingleCachedChart(t *testing.T, service *Service, path string) *ChartDataArtifact {
	t.Helper()

	charts, err := service.LoadCachedChartData(context.Background(), LoadCachedPathsRequest{Paths: []string{path}})
	if err != nil {
		t.Fatalf("load cached chart data: %v", err)
	}
	if len(charts) != 1 {
		t.Fatalf("expected one cached chart artifact, got %#v", charts)
	}
	if charts[0] == nil {
		t.Fatalf("expected cached chart artifact, got nil")
	}
	return charts[0]
}

func loadSingleCachedBrush(t *testing.T, service *Service, path string) *JSONArtifact {
	t.Helper()

	brushes, err := service.LoadCachedBrushStrokes(context.Background(), LoadCachedPathsRequest{Paths: []string{path}})
	if err != nil {
		t.Fatalf("load cached brushes: %v", err)
	}
	if len(brushes) != 1 {
		t.Fatalf("expected one cached brush artifact, got %#v", brushes)
	}
	if brushes[0] == nil {
		t.Fatalf("expected cached brush artifact, got nil")
	}
	return brushes[0]
}

func loadSingleCachedTransform(t *testing.T, service *Service, path string) *JSONArtifact {
	t.Helper()

	transforms, err := service.LoadCachedDrawAreaLayerItemTransforms(context.Background(), LoadCachedPathsRequest{Paths: []string{path}})
	if err != nil {
		t.Fatalf("load cached transforms: %v", err)
	}
	if len(transforms) != 1 {
		t.Fatalf("expected one cached transform artifact, got %#v", transforms)
	}
	if transforms[0] == nil {
		t.Fatalf("expected cached transform artifact, got nil")
	}
	return transforms[0]
}

func assertCachedArtifactID(t *testing.T, got string, expected string) {
	t.Helper()

	if got != expected {
		t.Fatalf("expected cached artifact id %q, got %q", expected, got)
	}
}

func assertCachedImagePayload(t *testing.T, paths artifactTestPaths, image *ImageArtifact, expected string) {
	t.Helper()

	imagePayload, err := paths.binaryStore.ReadBytes(image.Value.ContentID)
	if err != nil {
		t.Fatalf("read image payload from binary store: %v", err)
	}
	if string(imagePayload) != expected {
		t.Fatalf("expected image payload round-trip, got %q", string(imagePayload))
	}
}

func assertChartColumn(t *testing.T, values ChartDataValue, column string, expected []any) {
	t.Helper()

	if got := values[column]; !reflect.DeepEqual(got, expected) {
		t.Fatalf("unexpected chart column %s: %#v", column, got)
	}
}

func decodeJSONRawMessage(t *testing.T, payload json.RawMessage) map[string]any {
	t.Helper()

	var value map[string]any
	if err := json.Unmarshal(payload, &value); err != nil {
		t.Fatalf("decode json artifact: %v", err)
	}
	return value
}

func TestServiceLoadCachedArtifactsAcceptWorkspacePaths(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	assertCachedWorkspaceImage(t, service, paths)
	assertCachedWorkspaceChart(t, service, paths)
}

func assertCachedWorkspaceImage(t *testing.T, service *Service, paths artifactTestPaths) {
	t.Helper()

	imagePath := filepath.Join(paths.workspaceRoot, "workspace-image.png")
	writeArtifactTestFile(t, imagePath, "workspace-image")
	image := loadSingleCachedImage(t, service, imagePath)
	assertCachedArtifactID(t, image.ID, imagePath)
	assertCachedImagePayload(t, paths, image, "workspace-image")
}

func assertCachedWorkspaceChart(t *testing.T, service *Service, paths artifactTestPaths) {
	t.Helper()

	chartPath := filepath.Join(paths.workspaceRoot, "workspace-chart.csv")
	writeArtifactTestFile(t, chartPath, "x,y\n1,2\n3,4\n")
	chart := loadSingleCachedChart(t, service, chartPath)
	assertCachedArtifactID(t, chart.ID, chartPath)
	assertChartColumn(t, chart.Value, "x", []any{1.0, 3.0})
}

func TestServiceLoadCachedDrawArtifactsNormalizesNullCollections(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	assertCachedBrushPointsNormalized(t, service, paths)
	assertCachedTransformStrokePointsNormalized(t, service, paths)
}

func assertCachedBrushPointsNormalized(t *testing.T, service *Service, paths artifactTestPaths) {
	t.Helper()

	brushID := "artifacts/stroke-null.json"
	brushPath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(brushID))
	writeArtifactTestFile(t, brushPath, `{"strokeStyle":"#000000","lineWidth":2,"lineCap":"round","points":null,"globalCompositeOperation":"source-over"}`)
	brushValue := decodeJSONRawMessage(t, loadSingleCachedBrush(t, service, brushID).Value)
	assertEmptyJSONArray(t, brushValue["points"], "normalized brush points")
}

func assertCachedTransformStrokePointsNormalized(t *testing.T, service *Service, paths artifactTestPaths) {
	t.Helper()

	transformID := "artifacts/transform-null.json"
	transformPath := filepath.Join(paths.settaFilesRoot, filepath.FromSlash(transformID))
	writeArtifactTestFile(t, transformPath, `{"transform":[1,0,0,1,3,4],"eraserStrokes":[{"strokeStyle":"#000000","lineWidth":2,"lineCap":"round","points":null,"globalCompositeOperation":"destination-out","transform":[1,0,0,1,0,0]}]}`)
	transformValue := decodeJSONRawMessage(t, loadSingleCachedTransform(t, service, transformID).Value)
	storedStroke := assertSingleJSONObject(t, transformValue["eraserStrokes"], "normalized eraser stroke")
	assertEmptyJSONArray(t, storedStroke["points"], "normalized eraser stroke points")
}

func assertSingleJSONObject(t *testing.T, value any, label string) map[string]any {
	t.Helper()

	values, ok := value.([]any)
	if !ok {
		t.Fatalf("expected %s array, got %#v", label, value)
	}
	if len(values) != 1 {
		t.Fatalf("expected one %s, got %#v", label, value)
	}
	object, ok := values[0].(map[string]any)
	if !ok {
		t.Fatalf("expected %s object, got %#v", label, values[0])
	}
	return object
}

func assertEmptyJSONArray(t *testing.T, value any, label string) {
	t.Helper()

	values, ok := value.([]any)
	if !ok {
		t.Fatalf("expected %s array, got %#v", label, value)
	}
	if values == nil {
		t.Fatalf("expected %s array, got nil", label)
	}
	if len(values) != 0 {
		t.Fatalf("expected empty %s array, got %#v", label, value)
	}
}

func TestServiceCommitImageCacheReusesExistingContentForMatchingHash(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	imagePath := filepath.Join(paths.workspaceRoot, "workspace-image.png")
	payload := []byte("workspace-image")
	hash := hashBytes(payload)

	firstRef, err := paths.binaryStore.StoreBytes(payload, "image/png", true)
	if err != nil {
		t.Fatalf("store first image payload: %v", err)
	}
	firstArtifact := ImageArtifact{
		Type:  ArtifactTypeImage,
		ID:    imagePath,
		Value: firstRef,
	}
	committedFirst := service.commitImageCache(imagePath, firstArtifact, hash)
	if committedFirst.Value.ContentID != firstRef.ContentID {
		t.Fatalf("expected first cached content id %q, got %q", firstRef.ContentID, committedFirst.Value.ContentID)
	}

	secondRef, err := paths.binaryStore.StoreBytes(payload, "image/png", true)
	if err != nil {
		t.Fatalf("store second image payload: %v", err)
	}
	secondArtifact := ImageArtifact{
		Type:  ArtifactTypeImage,
		ID:    imagePath,
		Value: secondRef,
	}
	committedSecond := service.commitImageCache(imagePath, secondArtifact, hash)
	if committedSecond.Value.ContentID != firstRef.ContentID {
		t.Fatalf("expected matching-hash commit to reuse original content id %q, got %q", firstRef.ContentID, committedSecond.Value.ContentID)
	}
	if _, err := paths.binaryStore.ReadBytes(firstRef.ContentID); err != nil {
		t.Fatalf("read original cached image payload: %v", err)
	}
	if _, err := paths.binaryStore.ReadBytes(secondRef.ContentID); !errors.Is(err, binarypayload.ErrPayloadNotFound) {
		t.Fatalf("expected redundant payload %q to be deleted, got %v", secondRef.ContentID, err)
	}
}

func TestServiceImportFilesAllowsEmptyFilesAndCachesBinaryRef(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	emptyPath := filepath.Join(paths.workspaceRoot, "empty.bin")
	writeArtifactTestFile(t, emptyPath, "")

	_, importedPath := importEmptyWorkspaceFileForTest(t, service, paths, emptyPath)
	assertCachedEmptyFileArtifact(t, service, importedPath)
	assertEmptyFileMetadata(t, service, importedPath)
}

func importEmptyWorkspaceFileForTest(
	t *testing.T,
	service *Service,
	paths artifactTestPaths,
	emptyPath string,
) (ImportFilesResponseItem, string) {
	t.Helper()

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
	assertArtifactFilePayload(t, importedPath, "", "imported empty artifact payload")
	return imported[0], importedPath
}

func assertCachedEmptyFileArtifact(t *testing.T, service *Service, importedPath string) {
	t.Helper()

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
}

func assertEmptyFileMetadata(t *testing.T, service *Service, importedPath string) {
	t.Helper()

	metadata, ok := service.metadata[importedPath]
	if !ok {
		t.Fatalf("expected cache metadata for %q", importedPath)
	}
	if metadata.LastKnownHash != hashBytes(nil) {
		t.Fatalf("expected empty-file hash %q, got %#v", hashBytes(nil), metadata)
	}
}

func TestServiceUpdateHandlesConflictsAndUnsupportedTypes(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)
	filePath := assertArtifactFileSaveAndUnchanged(t, service, paths)
	nextValue := storeArtifactTestValue(t, paths, []byte("next"), "text/plain")

	assertArtifactConflictSkip(t, service, filePath, nextValue)
	assertArtifactConflictBackup(t, service, paths, filePath, nextValue)
	assertArtifactConflictOverwrite(t, service, paths, filePath)
	assertArtifactInvalidConflictStrategy(t, service, paths, filePath)
	assertArtifactJSONUpdates(t, service)
	assertArtifactImageUpdate(t, service, paths)
	assertArtifactChartUpdate(t, service)
	assertUnsupportedArtifactUpdate(t, service)
}

func assertArtifactFileSaveAndUnchanged(t *testing.T, service *Service, paths artifactTestPaths) string {
	t.Helper()

	fileValue := storeArtifactTestValue(t, paths, []byte("hello"), "text/plain")
	fileResults := updateSingleArtifactForTest(t, service, ArtifactTypeFile, "artifacts/notes.txt", fileValue, nil)
	assertSingleArtifactSaveStatus(t, fileResults, SaveStatusSaved, "saved file result")
	filePath := filepath.Join(paths.settaFilesRoot, "artifacts", "notes.txt")
	assertArtifactFilePayload(t, filePath, "hello", "file artifact bytes")

	unchangedResults := updateSingleArtifactForTest(t, service, ArtifactTypeFile, "artifacts/notes.txt", fileValue, nil)
	if unchangedResults[0].Status != SaveStatusUnchanged {
		t.Fatalf("expected unchanged result, got %#v", unchangedResults)
	}
	return filePath
}

func storeArtifactTestValue(t *testing.T, paths artifactTestPaths, payload []byte, mimeType string) json.RawMessage {
	t.Helper()

	ref, err := paths.binaryStore.StoreBytes(payload, mimeType, false)
	if err != nil {
		t.Fatalf("store artifact payload: %v", err)
	}
	return mustRawJSON(t, ref)
}

func updateSingleArtifactForTest(
	t *testing.T,
	service *Service,
	artifactType ArtifactType,
	id string,
	value json.RawMessage,
	strategy *SaveConflictStrategy,
) []ArtifactSaveResult {
	t.Helper()

	results, err := service.Update(context.Background(), UpdateRequest{
		Artifacts: []RawArtifact{{
			Type:  artifactType,
			ID:    id,
			Value: &value,
		}},
		ConflictStrategy: strategy,
		UploadScope:      UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("update artifact %q: %v", id, err)
	}
	return results
}

func assertSingleArtifactSaveStatus(t *testing.T, results []ArtifactSaveResult, status SaveStatus, label string) {
	t.Helper()

	if len(results) != 1 || results[0].Status != status {
		t.Fatalf("expected %s status %s, got %#v", label, status, results)
	}
}

func assertArtifactFilePayload(t *testing.T, path string, expected string, label string) {
	t.Helper()

	payload, err := os.ReadFile(path)
	if err != nil || string(payload) != expected {
		t.Fatalf("expected %s, got %q err=%v", label, string(payload), err)
	}
}

func assertArtifactConflictSkip(t *testing.T, service *Service, filePath string, nextValue json.RawMessage) {
	t.Helper()

	if err := os.WriteFile(filePath, []byte("external"), 0o644); err != nil {
		t.Fatalf("write external file contents: %v", err)
	}
	skip := SaveConflictStrategySkip
	skipped := updateSingleArtifactForTest(t, service, ArtifactTypeFile, "artifacts/notes.txt", nextValue, &skip)
	if skipped[0].Status != SaveStatusSkipped {
		t.Fatalf("expected skipped result, got %#v", skipped)
	}
	assertArtifactFilePayload(t, filePath, "external", "skipped write to preserve external contents")
}

func assertArtifactConflictBackup(
	t *testing.T,
	service *Service,
	paths artifactTestPaths,
	filePath string,
	nextValue json.RawMessage,
) {
	t.Helper()

	backup := SaveConflictStrategyBackup
	conflicted := updateSingleArtifactForTest(t, service, ArtifactTypeFile, "artifacts/notes.txt", nextValue, &backup)
	if conflicted[0].Status != SaveStatusConflict || conflicted[0].BackupPath == nil {
		t.Fatalf("expected conflict with backup path, got %#v", conflicted)
	}
	assertArtifactFilePayload(t, filePath, "next", "backup strategy to overwrite file")
	if _, err := os.Stat(filepath.Join(paths.settaFilesRoot, filepath.FromSlash(*conflicted[0].BackupPath))); err != nil {
		t.Fatalf("expected backup file to exist: %v", err)
	}
}

func assertArtifactConflictOverwrite(t *testing.T, service *Service, paths artifactTestPaths, filePath string) {
	t.Helper()

	if err := os.WriteFile(filePath, []byte("external-again"), 0o644); err != nil {
		t.Fatalf("write second external file contents: %v", err)
	}
	overwriteValue := storeArtifactTestValue(t, paths, []byte("overwrite"), "text/plain")
	overwrite := SaveConflictStrategyOverwrite
	overwritten := updateSingleArtifactForTest(t, service, ArtifactTypeFile, "artifacts/notes.txt", overwriteValue, &overwrite)
	if overwritten[0].Status != SaveStatusConflict || overwritten[0].Message == nil || !strings.Contains(*overwritten[0].Message, "Overwriting per requested strategy") {
		t.Fatalf("expected overwrite conflict result, got %#v", overwritten)
	}
	assertArtifactFilePayload(t, filePath, "overwrite", "overwrite strategy to replace file")
}

func assertArtifactInvalidConflictStrategy(t *testing.T, service *Service, paths artifactTestPaths, filePath string) {
	t.Helper()

	if err := os.WriteFile(filePath, []byte("external-invalid"), 0o644); err != nil {
		t.Fatalf("write third external file contents: %v", err)
	}
	invalidValue := storeArtifactTestValue(t, paths, []byte("invalid"), "text/plain")
	invalidStrategy := SaveConflictStrategy("invalid")
	if _, err := service.Update(context.Background(), UpdateRequest{
		Artifacts: []RawArtifact{{
			Type:  ArtifactTypeFile,
			ID:    "artifacts/notes.txt",
			Value: &invalidValue,
		}},
		ConflictStrategy: &invalidStrategy,
		UploadScope:      UploadScopeGeneric,
	}); err == nil {
		t.Fatalf("expected invalid conflict strategy error")
	} else {
		assertArtifactErrorKind(t, err, ErrorInvalidRequest)
	}
}

func assertArtifactJSONUpdates(t *testing.T, service *Service) {
	t.Helper()

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
}

func assertArtifactImageUpdate(t *testing.T, service *Service, paths artifactTestPaths) {
	t.Helper()

	imageValue := storeArtifactTestValue(t, paths, []byte("png-bytes"), "image/png")
	imageResults := updateSingleArtifactForTest(t, service, ArtifactTypeImage, "artifacts/image.png", imageValue, nil)
	assertSingleArtifactSaveStatus(t, imageResults, SaveStatusSaved, "saved image result")
	imagePath := filepath.Join(paths.settaFilesRoot, "artifacts", "image.png")
	assertArtifactFilePayload(t, imagePath, "png-bytes", "updated image artifact payload")
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
}

func assertArtifactChartUpdate(t *testing.T, service *Service) {
	t.Helper()

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
	assertChartColumn(t, loadedCharts[0].Value, "x", []any{1.0, 3.0})
	assertChartColumn(t, loadedCharts[0].Value, "y", []any{"alpha", ""})
}

func assertUnsupportedArtifactUpdate(t *testing.T, service *Service) {
	t.Helper()

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

func TestServiceUpdateDrawArtifactsNormalizesNullCollections(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	brushValue := json.RawMessage(`{"strokeStyle":"#ffffff","lineWidth":1,"lineCap":"round","points":null,"globalCompositeOperation":"source-over"}`)
	transformValue := json.RawMessage(`{"transform":[1,0,0,1,10,12],"eraserStrokes":null}`)
	results, err := service.Update(context.Background(), UpdateRequest{
		Artifacts: []RawArtifact{
			{Type: ArtifactTypeBrushStroke, ID: "artifacts/stroke.json", Value: &brushValue},
			{Type: ArtifactTypeDrawAreaLayerItemTransform, ID: "artifacts/transform.json", Value: &transformValue},
		},
		UploadScope: UploadScopeGeneric,
	})
	if err != nil {
		t.Fatalf("update draw artifacts: %v", err)
	}
	if len(results) != 2 || results[0].Status != SaveStatusSaved || results[1].Status != SaveStatusSaved {
		t.Fatalf("expected saved draw artifacts, got %#v", results)
	}

	brushArtifact := readJSONArtifactFile(t, filepath.Join(paths.settaFilesRoot, "artifacts", "stroke.json"))
	assertEmptyJSONArray(t, brushArtifact["points"], "normalized saved brush points")

	transformArtifact := readJSONArtifactFile(t, filepath.Join(paths.settaFilesRoot, "artifacts", "transform.json"))
	assertEmptyJSONArray(t, transformArtifact["eraserStrokes"], "normalized saved eraserStrokes")
}

func readJSONArtifactFile(t *testing.T, path string) map[string]any {
	t.Helper()

	payload, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read normalized artifact %q: %v", path, err)
	}
	return decodeJSONRawMessage(t, payload)
}

func TestServiceRejectsOversizedFileArtifactsAndOutsideRootDeletes(t *testing.T) {
	t.Parallel()

	service, paths := newArtifactTestService(t)

	oversizedPayload := make([]byte, DefaultMaxGenericFileBytes+1)
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
