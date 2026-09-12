package cases

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/setta/bench/backend/internal/contracts"
)

func TestLoadPreservesOrderDefaultsOptionalFieldsAndRejectsDuplicateIDs(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	manifest := filepath.Join(root, "cases.jsonl")
	content := "{\"id\":\"first\",\"input\":{\"value\":1}}\n{\"id\":\"second\",\"name\":\"Second case\",\"input\":[2],\"expected\":2}\n"
	if err := os.WriteFile(manifest, []byte(content), 0o600); err != nil {
		t.Fatalf("write manifest = %v", err)
	}
	caseSet := contracts.CaseSetV1{ID: "cases", Name: "Cases", Manifest: "cases.jsonl"}
	values, err := Load(root, caseSet)
	if err != nil {
		t.Fatalf("Load() = %v", err)
	}
	if len(values) != 2 || values[0].ID != "first" || values[0].Name != "first" || string(values[0].Expected) != "null" || values[1].ID != "second" {
		t.Fatalf("Load() = %#v", values)
	}
	if err := os.WriteFile(manifest, []byte("{\"id\":\"same\",\"input\":1}\n{\"id\":\"same\",\"input\":2}\n"), 0o600); err != nil {
		t.Fatalf("rewrite manifest = %v", err)
	}
	if _, err := Load(root, caseSet); err == nil {
		t.Fatal("Load() accepted duplicate case IDs")
	}
}

func TestLoadRejectsManifestSymlink(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	target := filepath.Join(root, "target.jsonl")
	if err := os.WriteFile(target, []byte("{\"id\":\"one\",\"input\":1}\n"), 0o600); err != nil {
		t.Fatalf("write target = %v", err)
	}
	if err := os.Symlink(target, filepath.Join(root, "cases.jsonl")); err != nil {
		t.Skipf("symlinks are unavailable: %v", err)
	}
	_, err := Load(root, contracts.CaseSetV1{ID: "cases", Name: "Cases", Manifest: "cases.jsonl"})
	if err == nil {
		t.Fatal("Load() accepted a manifest symlink")
	}
}
