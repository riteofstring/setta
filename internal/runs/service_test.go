package runs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	binarypayload "setta/internal/binary"
	"setta/internal/projectstate"
)

func TestServiceApplyDrawSnapshotsNoopsWhenNoRefs(t *testing.T) {
	t.Parallel()

	var service Service

	testCases := []struct {
		name string
		refs map[string]binarypayload.ContentRef
	}{
		{
			name: "nil map",
			refs: nil,
		},
		{
			name: "empty map",
			refs: map[string]binarypayload.ContentRef{},
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			err := service.applyDrawSnapshots(
				context.Background(),
				nil,
				t.TempDir(),
				"project-alpha",
				"",
				testCase.refs,
			)
			if err != nil {
				t.Fatalf("apply draw snapshots: %v", err)
			}
		})
	}
}

func TestServiceApplyDrawSnapshotsWritesGeneratedPathAndDeletesPayload(t *testing.T) {
	t.Parallel()

	runtime := openDrawSnapshotTestRuntime(t, "")
	binaryStore, ref := newDrawSnapshotBinaryPayload(t, []byte("generated-payload"))
	service := Service{binaryStore: binaryStore}
	artifactsRoot := filepath.Join(t.TempDir(), "artifacts")

	if err := service.applyDrawSnapshots(
		context.Background(),
		runtime,
		artifactsRoot,
		"project-alpha",
		"",
		map[string]binarypayload.ContentRef{
			"draw-section": ref,
		},
	); err != nil {
		t.Fatalf("apply draw snapshots: %v", err)
	}

	expectedPath := filepath.Join(artifactsRoot, projectstate.DrawSnapshotFolderName, "draw-section.png")
	assertDrawSnapshotFile(t, expectedPath, []byte("generated-payload"))
	if got := drawSectionRenderedImagePath(t, runtime); got != expectedPath {
		t.Fatalf("expected rendered image path %q, got %q", expectedPath, got)
	}
	if _, err := binaryStore.ReadBytes(ref.ContentID); !errors.Is(err, binarypayload.ErrPayloadNotFound) {
		t.Fatalf("expected payload cleanup, got %v", err)
	}
}

func TestServiceApplyDrawSnapshotsUsesExistingRenderedImagePath(t *testing.T) {
	t.Parallel()

	customPath := filepath.Join(t.TempDir(), "custom", "rendered.png")
	runtime := openDrawSnapshotTestRuntime(t, customPath)
	binaryStore, ref := newDrawSnapshotBinaryPayload(t, []byte("custom-payload"))
	service := Service{binaryStore: binaryStore}

	if err := service.applyDrawSnapshots(
		context.Background(),
		runtime,
		filepath.Join(t.TempDir(), "unused-artifacts"),
		"project-alpha",
		"",
		map[string]binarypayload.ContentRef{
			"draw-section": ref,
		},
	); err != nil {
		t.Fatalf("apply draw snapshots: %v", err)
	}

	assertDrawSnapshotFile(t, customPath, []byte("custom-payload"))
	if got := drawSectionRenderedImagePath(t, runtime); got != customPath {
		t.Fatalf("expected rendered image path %q, got %q", customPath, got)
	}
}

func openDrawSnapshotTestRuntime(t *testing.T, renderedImagePath string) *projectstate.Runtime {
	t.Helper()

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				TopLevelSectionIDs: []string{
					"draw-section",
				},
				SectionVariantMap: map[string]string{
					"draw-section": "draw-variant",
				},
				Sections: map[string]projectstate.Section{
					"draw-section": {
						ID:               "draw-section",
						Name:             "Draw",
						VariantIDs:       []string{"draw-variant"},
						DefaultVariantID: "draw-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"draw-variant": {
						ID:     "draw-variant",
						ImplID: "draw-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"draw-impl": {
						ID:   "draw-impl",
						Kind: projectstate.SectionKindDraw,
						Draw: &projectstate.DrawSectionImpl{
							RenderedImagePath: renderedImagePath,
						},
					},
				},
			},
		},
	}

	runtime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	return runtime
}

func newDrawSnapshotBinaryPayload(t *testing.T, payload []byte) (*binarypayload.Store, binarypayload.ContentRef) {
	t.Helper()

	store, err := binarypayload.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}
	ref, err := store.StoreBytes(payload, "image/png", false)
	if err != nil {
		t.Fatalf("store binary payload: %v", err)
	}
	return store, ref
}

func assertDrawSnapshotFile(t *testing.T, path string, expected []byte) {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read snapshot file: %v", err)
	}
	if string(content) != string(expected) {
		t.Fatalf("expected snapshot payload %q, got %q", string(expected), string(content))
	}
}

func drawSectionRenderedImagePath(t *testing.T, runtime *projectstate.Runtime) string {
	t.Helper()

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id: %v", err)
	}
	_, _, impl, err := project.ResolveSection("draw-section")
	if err != nil {
		t.Fatalf("resolve section: %v", err)
	}
	if !impl.IsDraw() || impl.Draw == nil {
		t.Fatalf("expected draw impl, got %#v", impl)
	}
	return impl.Draw.RenderedImagePath
}
