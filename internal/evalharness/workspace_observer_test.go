package evalharness

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEvaluationWorkspaceObserverDetectsWritesAndReverts(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "service.ts")
	if err := os.WriteFile(path, []byte("export const route = '/ready'\n"), 0o600); err != nil {
		t.Fatalf("write baseline fixture: %v", err)
	}
	observer := newEvaluationWorkspaceObserver(root)
	baseline, err := observer.CaptureBaseline()
	if err != nil {
		t.Fatalf("capture baseline: %v", err)
	}
	if err := os.WriteFile(path, []byte("export const route = '/status'\n"), 0o600); err != nil {
		t.Fatalf("mutate fixture: %v", err)
	}
	mutated, err := observer.Observe()
	if err != nil {
		t.Fatalf("observe mutation: %v", err)
	}
	if mutated.Revision != 1 || mutated.Digest == baseline.Digest {
		t.Fatalf("mutation observation = %+v, baseline = %+v", mutated, baseline)
	}
	if err := os.WriteFile(path, []byte("export const route = '/ready'\n"), 0o600); err != nil {
		t.Fatalf("revert fixture: %v", err)
	}
	reverted, err := observer.Observe()
	if err != nil {
		t.Fatalf("observe revert: %v", err)
	}
	if reverted.Revision != 2 || reverted.Digest != baseline.Digest {
		t.Fatalf("revert observation = %+v, baseline = %+v", reverted, baseline)
	}
}
