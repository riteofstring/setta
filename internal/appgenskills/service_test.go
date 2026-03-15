package appgenskills

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

type testEnv map[string]string

func (e testEnv) lookup(key string) (string, bool) {
	value, ok := e[key]
	return value, ok
}

func TestServiceListDiscoversWorkspaceUserAndEnvRoots(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	agentsHome := filepath.Join(root, "agents-home")
	xdgConfigHome := filepath.Join(root, "xdg-config")
	for _, path := range []string{workspaceRoot, homeDir, agentsHome, xdgConfigHome} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	writeSkillDoc(t, filepath.Join(workspaceRoot, ".agents", "skills", "ui-layout", "SKILL.md"), "# UI Layout\n\nCreate dense dashboard layouts.\n")
	writeSkillDoc(t, filepath.Join(workspaceRoot, ".claude", "skills", "prompt-review", "SKILL.md"), "# Prompt Review\n\nAudit prompts.\n")
	writeSkillDoc(t, filepath.Join(agentsHome, "skills", "release-checklist", "SKILL.md"), "# Release Checklist\n\nShip safely.\n")
	writeSkillDoc(t, filepath.Join(xdgConfigHome, "opencode", "skills", "plan-generator", "SKILL.md"), "# Plan Generator\n\nGenerate plans.\n")
	writeSkillDoc(t, filepath.Join(root, "codex-home", "skills", "qa-review", "SKILL.md"), "# QA Review\n\nRun focused checks.\n")

	service := newTestService(t, workspaceRoot, homeDir, testEnv{
		"AGENTS_HOME":     agentsHome,
		"CODEX_HOME":      filepath.Join(root, "codex-home"),
		"XDG_CONFIG_HOME": xdgConfigHome,
	})

	// Listing should surface the discoverable roots the frontend skills browser uses.
	rows, err := service.List()
	if err != nil {
		t.Fatalf("list skills: %v", err)
	}

	rowByID := make(map[string]SkillEntry, len(rows))
	for _, row := range rows {
		rowByID[row.SkillID] = row
	}

	if rowByID["workspace_agents_skills::ui-layout"].Description != "Create dense dashboard layouts." {
		t.Fatalf("expected workspace description, got %#v", rowByID["workspace_agents_skills::ui-layout"])
	}
	if rowByID["workspace_agents_skills::ui-layout"].IsEditable != true {
		t.Fatalf("expected workspace skill to be editable, got %#v", rowByID["workspace_agents_skills::ui-layout"])
	}
	if rowByID["workspace_claude_skills::prompt-review"].RootLabel != "Workspace .claude/skills" {
		t.Fatalf("expected workspace claude root label, got %#v", rowByID["workspace_claude_skills::prompt-review"])
	}
	if rowByID["agents_home_skills::release-checklist"].RootPath != filepath.Join(agentsHome, "skills") {
		t.Fatalf("expected AGENTS_HOME skills path, got %#v", rowByID["agents_home_skills::release-checklist"])
	}
	if rowByID["user_opencode_skills::plan-generator"].RootPath != filepath.Join(xdgConfigHome, "opencode", "skills") {
		t.Fatalf("expected XDG opencode root path, got %#v", rowByID["user_opencode_skills::plan-generator"])
	}
	if rowByID["codex_home_skills::qa-review"].IsEditable {
		t.Fatalf("expected CODEX_HOME skill to be non-editable, got %#v", rowByID["codex_home_skills::qa-review"])
	}
	if reason := rowByID["codex_home_skills::qa-review"].EditabilityReason; reason == nil || *reason != "Only skills under AGENTS_HOME/skills, ~/.agents/skills, or workspace .agents/skills are editable." {
		t.Fatalf("expected CODEX_HOME editability reason, got %#v", rowByID["codex_home_skills::qa-review"])
	}
}

func TestServiceMarksRootLevelSkillNonEditable(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(homeDir, 0o755); err != nil {
		t.Fatalf("mkdir home: %v", err)
	}
	writeSkillDoc(t, filepath.Join(workspaceRoot, ".agents", "skills", "SKILL.md"), "# Root Skill\n\nTop-level instructions.\n")

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	// Root-level SKILL.md is visible but intentionally not editable.
	rows, err := service.List()
	if err != nil {
		t.Fatalf("list skills: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected one skill, got %#v", rows)
	}
	if rows[0].RelativePath != "." || rows[0].IsEditable {
		t.Fatalf("expected root-level skill to be non-editable, got %#v", rows[0])
	}
	if rows[0].EditabilityReason == nil || *rows[0].EditabilityReason != "Editing root-level SKILL.md is not supported." {
		t.Fatalf("expected root-level editability reason, got %#v", rows[0])
	}
}

func TestServiceResolveSkillsResponseReportsMissingCreateRootWithoutProbingWrites(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(homeDir, 0o755); err != nil {
		t.Fatalf("mkdir home: %v", err)
	}
	writeSkillDoc(t, filepath.Join(workspaceRoot, ".agents", "skills", "workspace-only", "SKILL.md"), "# workspace-only\n\nWorkspace custom skill.\n")

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	// The list response should advertise the authoritative create root without creating it eagerly.
	response, err := service.ResolveSkillsResponse()
	if err != nil {
		t.Fatalf("resolve skills response: %v", err)
	}

	expectedRoot := filepath.Join(homeDir, ".agents", "skills")
	if response.CustomSkillCreateRootPath == nil || *response.CustomSkillCreateRootPath != expectedRoot {
		t.Fatalf("expected missing user root path, got %#v", response.CustomSkillCreateRootPath)
	}
	if response.CustomSkillCreateRootActionable {
		t.Fatalf("expected missing user root to be non-actionable, got %#v", response)
	}
	if _, err := os.Stat(expectedRoot); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected skills root to remain missing, got err=%v", err)
	}
}

func TestServiceReadContentTruncatesPreviewWithMetadata(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(homeDir, 0o755); err != nil {
		t.Fatalf("mkdir home: %v", err)
	}
	oversized := repeatedString("A", MaxSkillContentPreviewBytes+5000)
	writeSkillDoc(t, filepath.Join(workspaceRoot, ".agents", "skills", "large-doc", "SKILL.md"), oversized)

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	// Large SKILL.md previews should be truncated with explicit size metadata.
	content, err := service.ReadContent("workspace_agents_skills::large-doc")
	if err != nil {
		t.Fatalf("read content: %v", err)
	}

	if !content.Truncated {
		t.Fatalf("expected truncated content, got %#v", content)
	}
	if content.OriginalSizeBytes != int64(len(oversized)) {
		t.Fatalf("expected original size %d, got %#v", len(oversized), content)
	}
	if len(content.Content) != MaxSkillContentPreviewBytes {
		t.Fatalf("expected preview length %d, got %d", MaxSkillContentPreviewBytes, len(content.Content))
	}
}

func TestServiceUpsertCreatesCustomSkillInUserAgentsRootWhenMissing(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	// Create should use the first writable custom-skill root and return the saved snapshot.
	response, err := service.UpsertCustomSkill("", "my-custom-skill", "# my-custom-skill\n\nBody.\n")
	if err != nil {
		t.Fatalf("create custom skill: %v", err)
	}

	expectedSkillDoc := filepath.Join(homeDir, ".agents", "skills", "my-custom-skill", "SKILL.md")
	if response.SkillID != "user_agents_skills::my-custom-skill" {
		t.Fatalf("expected user skill id, got %#v", response)
	}
	if !response.Created || response.SkillDocPath != expectedSkillDoc {
		t.Fatalf("expected created user skill doc, got %#v", response)
	}
	if response.SkillContent.Content != "# my-custom-skill\n\nBody.\n" {
		t.Fatalf("expected round-tripped content, got %#v", response.SkillContent)
	}
}

func TestServiceUpsertUsesDiscoverableRootIDWhenAgentsHomeAliasesWorkspace(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	agentsHome := filepath.Join(workspaceRoot, ".agents")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	service := newTestService(t, workspaceRoot, homeDir, testEnv{"AGENTS_HOME": agentsHome})

	// When AGENTS_HOME aliases the workspace root, creation should still return the discoverable workspace skill id.
	response, err := service.UpsertCustomSkill("", "priority-check", "# priority-check\n\nBody.\n")
	if err != nil {
		t.Fatalf("create aliased skill: %v", err)
	}

	expectedSkillDoc := filepath.Join(workspaceRoot, ".agents", "skills", "priority-check", "SKILL.md")
	if response.SkillID != "workspace_agents_skills::priority-check" {
		t.Fatalf("expected workspace skill id, got %#v", response)
	}
	if response.SkillDocPath != expectedSkillDoc {
		t.Fatalf("expected workspace skill doc path, got %#v", response)
	}
}

func TestServiceUpsertUpdatesExistingWorkspaceSkillWhenDocReadOnly(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	skillDoc := filepath.Join(workspaceRoot, ".agents", "skills", "editable", "SKILL.md")
	writeSkillDoc(t, skillDoc, "# editable\n\nInitial.\n")
	if err := os.Chmod(skillDoc, 0o444); err != nil {
		t.Fatalf("chmod skill doc: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(skillDoc, 0o644)
	})

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	// Update should depend on directory replaceability, not the current file mode on SKILL.md itself.
	response, err := service.UpsertCustomSkill("workspace_agents_skills::editable", "", "# editable\n\nUpdated.\n")
	if err != nil {
		t.Fatalf("update custom skill: %v", err)
	}

	if response.Created {
		t.Fatalf("expected update, got %#v", response)
	}
	if content := readFile(t, skillDoc); content != "# editable\n\nUpdated.\n" {
		t.Fatalf("expected updated content, got %q", content)
	}
}

func TestServiceUpsertRejectsCreateCollisionsWithoutOverwrite(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	existingSkillDoc := filepath.Join(homeDir, ".agents", "skills", "existing", "SKILL.md")
	writeSkillDoc(t, existingSkillDoc, "# existing\n\nOriginal content.\n")

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	// Create must not overwrite an existing custom skill with the same relative path.
	_, err := service.UpsertCustomSkill("", "existing", "# existing\n\nUnexpected overwrite.\n")
	if err == nil {
		t.Fatal("expected create collision error")
	}
	var invalidErr *InvalidError
	if !errors.As(err, &invalidErr) {
		t.Fatalf("expected invalid error, got %T", err)
	}
	if invalidErr.Error() != "Custom skill already exists for relativePath 'existing'." {
		t.Fatalf("unexpected collision error %q", invalidErr.Error())
	}
	if content := readFile(t, existingSkillDoc); content != "# existing\n\nOriginal content.\n" {
		t.Fatalf("expected original content to be preserved, got %q", content)
	}
}

func newTestService(t *testing.T, workspaceRoot string, homeDir string, env testEnv) *Service {
	t.Helper()

	service, err := NewService(ServiceOptions{
		WorkspaceRoot: workspaceRoot,
		HomeDir:       homeDir,
		LookupEnv:     env.lookup,
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

func writeSkillDoc(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir skill dir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write skill doc: %v", err)
	}
}

func readFile(t *testing.T, path string) string {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	return string(content)
}

func repeatedString(value string, count int) string {
	if count <= 0 {
		return ""
	}
	result := make([]byte, 0, len(value)*count)
	for range count {
		result = append(result, value...)
	}
	return string(result)
}
