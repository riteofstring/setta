package project

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/setta/review/backend/internal/contracts"
)

func TestCatalogAdmitsMultipleImmutableRequests(t *testing.T) {
	root := t.TempDir()
	writeJSON(t, filepath.Join(root, "review.json"), contracts.ProjectManifest{
		Version: 1,
		ID:      "checkout-review",
		Name:    "Checkout reliability",
		Requests: []string{
			"requests/checkout.json",
			"requests/inventory.json",
		},
	})
	first := completionRequest("checkout", "Make checkout retries idempotent")
	second := completionRequest("inventory", "Reserve inventory once")
	writeJSON(t, filepath.Join(root, "requests", "checkout.json"), first)
	writeJSON(t, filepath.Join(root, "requests", "inventory.json"), second)
	catalog, err := Open(root)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	requests, err := catalog.Requests()
	if err != nil {
		t.Fatalf("Requests() error = %v", err)
	}
	if len(requests) != 2 || requests[0].Document.ID != "checkout" || requests[1].Document.ID != "inventory" {
		t.Fatalf("Requests() = %#v", requests)
	}
	if len(requests[0].SHA256) != 64 || requests[0].Path != "requests/checkout.json" {
		t.Fatalf("first admitted request = %#v", requests[0])
	}
	writeJSON(t, filepath.Join(root, "requests", "checkout.json"), completionRequest("checkout", "Changed after admission"))
	retained, found, err := catalog.Request("checkout")
	if err != nil || !found || retained.Document.Title != first.Title {
		t.Fatalf("Request() = %#v, %t, %v", retained, found, err)
	}
	retained.Document.Title = "Mutated copy"
	again, _, _ := catalog.Request("checkout")
	if again.Document.Title != first.Title {
		t.Fatal("caller mutation changed admitted request")
	}
}

func TestCatalogRejectsDuplicateRequestIdentity(t *testing.T) {
	root := t.TempDir()
	writeJSON(t, filepath.Join(root, "review.json"), contracts.ProjectManifest{
		Version: 1, ID: "duplicate-review", Name: "Duplicate review", Requests: []string{"a.json", "b.json"},
	})
	writeJSON(t, filepath.Join(root, "a.json"), completionRequest("same", "First"))
	writeJSON(t, filepath.Join(root, "b.json"), completionRequest("same", "Second"))
	if _, err := Open(root); err == nil || !strings.Contains(err.Error(), "duplicated") {
		t.Fatalf("Open() error = %v", err)
	}
}

func TestCatalogRejectsSymlinkedRequest(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.json")
	writeJSON(t, outside, completionRequest("outside", "Outside"))
	writeJSON(t, filepath.Join(root, "review.json"), contracts.ProjectManifest{
		Version: 1, ID: "unsafe-review", Name: "Unsafe review", Requests: []string{"request.json"},
	})
	if err := os.Symlink(outside, filepath.Join(root, "request.json")); err != nil {
		if runtime.GOOS == "windows" {
			t.Skipf("Symlink unavailable: %v", err)
		}
		t.Fatalf("Symlink() error = %v", err)
	}
	if _, err := Open(root); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("Open() error = %v", err)
	}
}

func completionRequest(id string, title string) contracts.ReviewRequest {
	model := "GPT-5"
	harness := "Codex"
	return contracts.ReviewRequest{
		Version:           1,
		ID:                id,
		Type:              "completion",
		Title:             title,
		RequestedDecision: "Resolve the submitted completion claims.",
		Evidence:          []contracts.EvidenceReference{},
		Relations:         []contracts.EvidenceRelation{},
		Provenance: contracts.Provenance{
			Producer:  contracts.ProducerIdentity{Kind: "agent", Name: "Implementation agent", Model: &model, Harness: &harness},
			CreatedAt: "2026-09-19T12:00:00Z",
		},
		Completion: &contracts.CompletionRequest{Claims: []contracts.CompletionClaim{{ID: "claim", Text: "The requested work is complete."}}},
	}
}

func writeJSON(t *testing.T, path string, value any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent() error = %v", err)
	}
	if err := os.WriteFile(path, append(encoded, '\n'), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}
