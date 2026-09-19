package project

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/setta/experiment-lens/backend/internal/testsupport"
)

func TestOpenAdmitsExactManifestAndObservationBytes(t *testing.T) {
	fixture, err := testsupport.Write(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := Open(fixture.Root)
	if err != nil {
		t.Fatal(err)
	}
	if catalog.ManifestSHA256() != fixture.ManifestSHA256 || catalog.SourceSHA256() != fixture.SourceSHA256 {
		t.Fatal("catalog identities do not match exact fixture bytes")
	}
	source, err := catalog.Source()
	if err != nil || len(source.Observations) != 2 {
		t.Fatalf("unexpected observation source: %v %#v", err, source)
	}
}

func TestOpenRejectsChangedObservationSource(t *testing.T) {
	fixture, err := testsupport.Write(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(fixture.Root, "data", "observations.json")
	if err := os.WriteFile(path, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(fixture.Root); err == nil || !strings.Contains(err.Error(), "byte length") {
		t.Fatalf("expected changed source rejection, got %v", err)
	}
}

func TestOpenRejectsSymlinkedObservationSource(t *testing.T) {
	fixture, err := testsupport.Write(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(fixture.Root, "data", "observations.json")
	target := filepath.Join(fixture.Root, "data", "observations-target.json")
	if err := os.Rename(source, target); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, source); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, err := Open(fixture.Root); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("expected symlink rejection, got %v", err)
	}
}
