package app

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"setta/internal/artifacts"
	"setta/internal/artifactwatch"
	binarypayload "setta/internal/binary"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

func TestArtifactWatchInputsSkipsEmptyImageAndChartPaths(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	document := projectstate.Document{
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID: "project-alpha",
				SectionVariantMap: map[string]string{
					"image-section": "image-variant",
					"chart-section": "chart-variant",
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"image-variant": {ID: "image-variant", ImplID: "image-impl"},
					"chart-variant": {ID: "chart-variant", ImplID: "chart-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"image-impl": {ID: "image-impl", Payload: projectstate.RawJSON(`{"type":"Image","imagePath":""}`)},
					"chart-impl": {ID: "chart-impl", Payload: projectstate.RawJSON(`{"type":"Chart","dataPath":""}`)},
				},
			},
		},
	}

	inputs, err := artifactWatchInputs(document, settaFilesRoot)
	if err != nil {
		t.Fatalf("build artifact watch inputs: %v", err)
	}
	if len(inputs) != 0 {
		t.Fatalf("expected blank image/chart paths to be skipped, got %#v", inputs)
	}
}

func TestArtifactWatchInputsIncludesValidArtifactPathsAndTypes(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	imagePath := filepath.Join(settaFilesRoot, "artifacts", "test.png")
	chartPath := filepath.Join(settaFilesRoot, "artifacts", "data.csv")
	document := projectstate.Document{
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID: "project-alpha",
				SectionVariantMap: map[string]string{
					"image-section": "image-variant",
					"chart-section": "chart-variant",
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"image-variant": {ID: "image-variant", ImplID: "image-impl"},
					"chart-variant": {ID: "chart-variant", ImplID: "chart-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"image-impl": {ID: "image-impl", Payload: projectstate.RawJSON(`{"type":"Image","imagePath":"` + imagePath + `"}`)},
					"chart-impl": {ID: "chart-impl", Payload: projectstate.RawJSON(`{"type":"Chart","dataPath":"` + chartPath + `"}`)},
				},
			},
		},
	}

	inputs, err := artifactWatchInputs(document, settaFilesRoot)
	if err != nil {
		t.Fatalf("build artifact watch inputs: %v", err)
	}
	if len(inputs) != 2 {
		t.Fatalf("expected image and chart watch inputs, got %#v", inputs)
	}

	byPath := map[string]artifactwatch.FileInput{}
	for _, input := range inputs {
		byPath[input.Path] = input
	}

	if got, ok := byPath[chartPath]; !ok {
		t.Fatalf("expected chart watch path %q in %#v", chartPath, inputs)
	} else if len(got.Types) != 1 || got.Types[0] != artifacts.ArtifactTypeChartData {
		t.Fatalf("expected chart watch input for %q, got %#v", chartPath, got)
	}

	if got, ok := byPath[imagePath]; !ok {
		t.Fatalf("expected image watch path %q in %#v", imagePath, inputs)
	} else {
		if len(got.Types) != 1 || got.Types[0] != artifacts.ArtifactTypeImage {
			t.Fatalf("expected image watch input for %q, got %#v", imagePath, got)
		}
		if len(got.ImageRefs) != 1 || got.ImageRefs[0].ProjectID != "project-alpha" || got.ImageRefs[0].SectionID != "image-section" {
			t.Fatalf("expected image watch ref for project-alpha/image-section, got %#v", got)
		}
	}
}

func TestCollectArtifactWatchUpdateOutputsBuildsImageBinaryDeltas(t *testing.T) {
	t.Parallel()

	artifactService, paths := newArtifactWatchTestArtifacts(t)
	imagePath := filepath.Join(paths.artifactsRoot, "watched-image.png")
	if err := os.WriteFile(imagePath, []byte("updated-image"), 0o644); err != nil {
		t.Fatalf("write watched image: %v", err)
	}

	outputs, err := collectArtifactWatchUpdateOutputs(
		context.Background(),
		artifactService,
		artifactwatch.FileUpdate{
			Path:  imagePath,
			Types: []artifacts.ArtifactType{artifacts.ArtifactTypeImage},
			ImageRefs: []artifactwatch.ImageRef{
				{ProjectID: "project-beta", SectionID: "section-beta"},
				{ProjectID: "project-alpha", SectionID: "section-alpha"},
				{ProjectID: "project-alpha", SectionID: "section-gamma"},
			},
		},
		true,
	)
	if err != nil {
		t.Fatalf("collect artifact watch outputs: %v", err)
	}
	if len(outputs.frontendArtifacts) != 1 {
		t.Fatalf("expected one frontend artifact, got %#v", outputs.frontendArtifacts)
	}
	if len(outputs.imageDeltasByProject) != 2 {
		t.Fatalf("expected two project delta groups, got %#v", outputs.imageDeltasByProject)
	}

	artifactJSON, err := json.Marshal(outputs.frontendArtifacts[0])
	if err != nil {
		t.Fatalf("marshal frontend artifact: %v", err)
	}
	var imageArtifact artifacts.ImageArtifact
	if err := json.Unmarshal(artifactJSON, &imageArtifact); err != nil {
		t.Fatalf("decode frontend image artifact: %v", err)
	}

	payload, err := artifactService.ReadBinaryContent(imageArtifact.Value.ContentID)
	if err != nil {
		t.Fatalf("read cached image payload: %v", err)
	}
	if string(payload) != "updated-image" {
		t.Fatalf("expected updated image bytes, got %q", string(payload))
	}

	assertArtifactWatchBinaryDeltas(t, outputs.imageDeltasByProject["project-alpha"], []string{"section-alpha", "section-gamma"}, imageArtifact.Value.ContentID, payload)
	assertArtifactWatchBinaryDeltas(t, outputs.imageDeltasByProject["project-beta"], []string{"section-beta"}, imageArtifact.Value.ContentID, payload)
}

type artifactWatchTestPaths struct {
	artifactsRoot string
}

func newArtifactWatchTestArtifacts(t *testing.T) (*artifacts.Service, artifactWatchTestPaths) {
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

	artifactService, err := artifacts.NewService(artifacts.ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		ArtifactsRoot:  artifactsRoot,
		BinaryStore:    binaryStore,
		TimeNow: func() time.Time {
			return time.Date(2026, time.April, 8, 10, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new artifact service: %v", err)
	}

	return artifactService, artifactWatchTestPaths{
		artifactsRoot: artifactsRoot,
	}
}

func assertArtifactWatchBinaryDeltas(
	t *testing.T,
	deltas []realtime.BinarySectionDelta,
	expectedSectionIDs []string,
	expectedContentID string,
	expectedPayload []byte,
) {
	t.Helper()

	if len(deltas) != len(expectedSectionIDs) {
		t.Fatalf("expected %d deltas, got %#v", len(expectedSectionIDs), deltas)
	}

	sectionIDs := make([]string, 0, len(deltas))
	for _, delta := range deltas {
		sectionIDs = append(sectionIDs, delta.SectionID)
		if delta.Value.ContentID != expectedContentID {
			t.Fatalf("expected content id %q, got %#v", expectedContentID, delta.Value)
		}
		if string(delta.BinaryPayload) != string(expectedPayload) {
			t.Fatalf("expected payload %q, got %q", string(expectedPayload), string(delta.BinaryPayload))
		}
	}
	sort.Strings(sectionIDs)
	sort.Strings(expectedSectionIDs)
	for index, sectionID := range expectedSectionIDs {
		if sectionIDs[index] != sectionID {
			t.Fatalf("expected section ids %v, got %v", expectedSectionIDs, sectionIDs)
		}
	}
}
