package evalharness

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/evalharness/workspaceevidence"
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

func TestEvaluationWorkspaceObserverUsesInjectedDigestReader(t *testing.T) {
	t.Parallel()

	digests := []workspaceevidence.Digest{
		{SHA256: strings.Repeat("0", 64)},
		{SHA256: strings.Repeat("1", 64)},
	}
	readIndex := 0
	observer := newEvaluationWorkspaceObserverWithReader(func() (workspaceevidence.Digest, error) {
		digest := digests[readIndex]
		readIndex++
		return digest, nil
	})
	baseline, err := observer.CaptureBaseline()
	if err != nil {
		t.Fatalf("capture injected baseline: %v", err)
	}
	mutated, err := observer.Observe()
	if err != nil {
		t.Fatalf("observe injected mutation: %v", err)
	}
	if baseline.Revision != 0 || baseline.Digest != digests[0].SHA256 ||
		mutated.Revision != 1 || mutated.Digest != digests[1].SHA256 {
		t.Fatalf("injected observations = baseline %+v mutated %+v", baseline, mutated)
	}
}
