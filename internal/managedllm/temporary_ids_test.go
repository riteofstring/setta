package managedllm

import (
	"testing"

	"setta/internal/agentruns"
)

type previewTestTemporaryIDs struct {
	mapping map[string]string
}

func (s previewTestTemporaryIDs) EnsureTemporaryID(canonicalID string) (string, error) {
	if value, ok := s.mapping[canonicalID]; ok {
		return value, nil
	}
	return canonicalID, nil
}

func (s previewTestTemporaryIDs) Snapshot() (map[string]string, error) {
	cloned := make(map[string]string, len(s.mapping))
	for canonicalID, temporaryID := range s.mapping {
		cloned[canonicalID] = temporaryID
	}
	return cloned, nil
}

func TestResolveTemporaryToCanonicalIncludesCanonicalFallback(t *testing.T) {
	t.Parallel()

	resolved, err := resolveTemporaryToCanonical(agentruns.ExecutionRequest{
		TemporaryIDs: previewTestTemporaryIDs{
			mapping: map[string]string{
				"project-alpha": "7",
				"section-main":  "14",
			},
		},
	})
	if err != nil {
		t.Fatalf("resolve temporary ids: %v", err)
	}

	expected := map[string]string{
		"project-alpha": "project-alpha",
		"section-main":  "section-main",
		"7":             "project-alpha",
		"14":            "section-main",
	}
	if len(resolved) != len(expected) {
		t.Fatalf("unexpected mapping size %#v", resolved)
	}
	for sourceID, canonicalID := range expected {
		if resolved[sourceID] != canonicalID {
			t.Fatalf("expected %q -> %q, got %#v", sourceID, canonicalID, resolved)
		}
	}
}
