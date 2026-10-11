package artifact

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/project"
	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/testsupport"
)

func TestResolveParsesSeriesAndKeepsSVGPassive(t *testing.T) {
	fixture, err := testsupport.Write(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := project.Open(fixture.Root)
	if err != nil {
		t.Fatal(err)
	}
	resolver, err := New(catalog.Root())
	if err != nil {
		t.Fatal(err)
	}
	series, _, err := catalog.Artifact("series-a")
	if err != nil {
		t.Fatal(err)
	}
	resolved := resolver.Resolve(series)
	if resolved.Status != "resolved" || resolved.Content == nil || resolved.Content.Kind != "series" || resolved.Content.Series == nil || len(resolved.Content.Series.Samples) != 2 {
		t.Fatalf("unexpected series resolution %#v", resolved)
	}
	image, _, err := catalog.Artifact("thermal-b")
	if err != nil {
		t.Fatal(err)
	}
	resolved = resolver.Resolve(image)
	if resolved.Content == nil || resolved.Content.Kind != "artifact" || resolved.Content.Inline == nil || !*resolved.Content.Inline {
		t.Fatalf("unexpected image resolution %#v", resolved)
	}
}

func TestOpenRevalidatesArtifactIdentity(t *testing.T) {
	fixture, err := testsupport.Write(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := project.Open(fixture.Root)
	if err != nil {
		t.Fatal(err)
	}
	reference, _, err := catalog.Artifact("series-a")
	if err != nil {
		t.Fatal(err)
	}
	resolver, err := New(catalog.Root())
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(fixture.Root, reference.Path), []byte("changed"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := resolver.Open(reference); !errors.Is(err, ErrArtifactChanged) {
		t.Fatalf("expected changed artifact error, got %v", err)
	}
	resolved := resolver.Resolve(reference)
	if resolved.Status != "failed" || resolved.Error == nil || resolved.Error.Code != "artifact_changed" {
		t.Fatalf("unexpected failed resolution %#v", resolved)
	}
}
