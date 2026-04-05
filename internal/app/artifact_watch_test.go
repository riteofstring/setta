package app

import (
	"path/filepath"
	"testing"

	"setta/internal/artifacts"
	"setta/internal/artifactwatch"
	"setta/internal/projectstate"
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
