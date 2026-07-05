package chat

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindCodexSkillRootFromAncestor(t *testing.T) {
	root := t.TempDir()
	skillDir := filepath.Join(root, ".codex", "skills", codexWorkflowBuilderSkillName)
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatalf("mkdir skill dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, codexSkillFileName), []byte("name: workflow-builder\n"), 0o644); err != nil {
		t.Fatalf("write skill file: %v", err)
	}
	nested := filepath.Join(root, "internal", "chat")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatalf("mkdir nested dir: %v", err)
	}

	got, err := findCodexSkillRootFrom(nested)
	if err != nil {
		t.Fatalf("find skill root: %v", err)
	}
	want := filepath.Join(root, ".codex", "skills")
	if got != want {
		t.Fatalf("skill root = %s, want %s", got, want)
	}
}

func TestFindCodexSkillRootFromMissingSkillFails(t *testing.T) {
	_, err := findCodexSkillRootFrom(t.TempDir())
	if err == nil {
		t.Fatal("find skill root succeeded, want error")
	}
}
