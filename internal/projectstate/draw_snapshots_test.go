package projectstate

import (
	"path/filepath"
	"testing"
)

func TestBuildDrawSnapshotPath(t *testing.T) {
	t.Parallel()

	root := filepath.Join(t.TempDir(), "artifacts")
	path, err := BuildDrawSnapshotPath("draw-section", root)
	if err != nil {
		t.Fatalf("build draw snapshot path: %v", err)
	}

	expected := filepath.Join(root, DrawSnapshotFolderName, "draw-section.png")
	if path != expected {
		t.Fatalf("expected path %q, got %q", expected, path)
	}
}

func TestRuntimeSetDrawSectionRenderedImagePaths(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				TopLevelSectionIDs: []string{
					"draw-section",
				},
				SectionVariantMap: map[string]string{
					"draw-section": "draw-variant",
				},
				Sections: map[string]Section{
					"draw-section": {
						ID:               "draw-section",
						Name:             "Draw",
						VariantIDs:       []string{"draw-variant"},
						DefaultVariantID: "draw-variant",
					},
				},
				SectionVariants: map[string]SectionVariant{
					"draw-variant": {
						ID:     "draw-variant",
						ImplID: "draw-impl",
					},
				},
				SectionImpls: map[string]SectionImpl{
					"draw-impl": {
						ID:   "draw-impl",
						Kind: SectionKindDraw,
						Draw: &DrawSectionImpl{},
					},
				},
			},
		},
	})

	renderedPath := filepath.Join(t.TempDir(), "artifacts", DrawSnapshotFolderName, "draw-section.png")
	snapshot, err := runtime.SetDrawSectionRenderedImagePaths("project-alpha", map[string]string{
		"draw-section": renderedPath,
	})
	if err != nil {
		t.Fatalf("set draw rendered image path: %v", err)
	}
	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2, got %d", snapshot.Revision)
	}

	project := snapshot.Document.Projects["project-alpha"]
	_, _, impl, err := project.ResolveSection("draw-section")
	if err != nil {
		t.Fatalf("resolve draw section: %v", err)
	}
	if !impl.IsDraw() {
		t.Fatalf("expected draw impl, got %q", impl.Kind)
	}
	if impl.Draw.RenderedImagePath != renderedPath {
		t.Fatalf("expected rendered image path %q, got %q", renderedPath, impl.Draw.RenderedImagePath)
	}
}
