package appgenskills

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
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

func TestServiceListDedupsAliasedSkillRootsByNormalizedPath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	writeSkillDoc(t, filepath.Join(workspaceRoot, ".agents", "skills", "aliased-skill", "SKILL.md"), "# Aliased Skill\n\nShared root.\n")

	service := newTestService(t, workspaceRoot, homeDir, testEnv{
		"AGENTS_HOME": filepath.Join(workspaceRoot, ".", ".agents"),
	})

	// AGENTS_HOME can alias the workspace .agents root; list should walk that
	// normalized skills path once and keep the first authoritative root identity.
	rows, err := service.List()
	if err != nil {
		t.Fatalf("list skills: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected one deduped skill row, got %#v", rows)
	}
	if rows[0].SkillID != "workspace_agents_skills::aliased-skill" {
		t.Fatalf("expected workspace root to win dedup order, got %#v", rows[0])
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

func TestServiceListSkipsIgnoredAndUnreadableRoots(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("unreadable directory permissions are not stable on windows")
	}

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	agentsHome := filepath.Join(root, "agents-home")
	for _, path := range []string{workspaceRoot, homeDir, agentsHome} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	writeSkillDoc(t, filepath.Join(workspaceRoot, ".agents", "skills", "visible", "SKILL.md"), "# Visible\n\nVisible description.\n")
	writeSkillDoc(t, filepath.Join(workspaceRoot, ".agents", "skills", "node_modules", "ignored", "SKILL.md"), "# Ignored\n\nShould stay hidden.\n")
	writeSkillDoc(t, filepath.Join(workspaceRoot, ".agents", "skills", ".git", "ignored", "SKILL.md"), "# Ignored\n\nShould stay hidden.\n")
	writeSkillDoc(t, filepath.Join(workspaceRoot, ".agents", "skills", "setta_files", "ignored", "SKILL.md"), "# Ignored\n\nShould stay hidden.\n")
	unreadableRoot := filepath.Join(agentsHome, "skills")
	writeSkillDoc(t, filepath.Join(unreadableRoot, "private-skill", "SKILL.md"), "# Private\n\nShould be skipped.\n")
	if err := os.Chmod(unreadableRoot, 0o000); err != nil {
		t.Fatalf("chmod unreadable root: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(unreadableRoot, 0o755)
	})

	service := newTestService(t, workspaceRoot, homeDir, testEnv{
		"AGENTS_HOME": agentsHome,
	})

	rows, err := service.List()
	if err != nil {
		t.Fatalf("list skills: %v", err)
	}
	if len(rows) != 1 || rows[0].SkillID != "workspace_agents_skills::visible" {
		t.Fatalf("expected only visible workspace skill, got %#v", rows)
	}
}

func TestServiceListReturnsEmptyDescriptionForInvalidUTF8AndNonWritableSkill(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	invalidUTF8SkillDoc := filepath.Join(workspaceRoot, ".claude", "skills", "bad-utf8", "SKILL.md")
	writeSkillDocBytes(t, invalidUTF8SkillDoc, []byte("# Bad UTF8\n\n\xff\xfe\n"))
	lockedSkillDoc := filepath.Join(workspaceRoot, ".agents", "skills", "locked-skill", "SKILL.md")
	writeSkillDoc(t, lockedSkillDoc, "# locked-skill\n\nLocked.\n")
	lockedSkillDir := filepath.Dir(lockedSkillDoc)
	if err := os.Chmod(lockedSkillDir, 0o555); err != nil {
		t.Fatalf("chmod locked skill dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(lockedSkillDir, 0o755)
	})

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	rows, err := service.List()
	if err != nil {
		t.Fatalf("list skills: %v", err)
	}

	rowByID := make(map[string]SkillEntry, len(rows))
	for _, row := range rows {
		rowByID[row.SkillID] = row
	}
	if rowByID["workspace_claude_skills::bad-utf8"].Description != "" {
		t.Fatalf("expected empty description for invalid UTF-8 skill, got %#v", rowByID["workspace_claude_skills::bad-utf8"])
	}
	lockedRow := rowByID["workspace_agents_skills::locked-skill"]
	if lockedRow.IsEditable {
		t.Fatalf("expected locked skill to be non-editable, got %#v", lockedRow)
	}
	if lockedRow.EditabilityReason == nil || *lockedRow.EditabilityReason != "Skill directory is not writable." {
		t.Fatalf("expected locked skill editability reason, got %#v", lockedRow)
	}
}

func TestServiceListMarksReadOnlySkillDocEditableWhenDirectoryReplaceable(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	skillDoc := filepath.Join(workspaceRoot, ".agents", "skills", "read-only", "SKILL.md")
	writeSkillDoc(t, skillDoc, "# Read Only\n\nLocked.\n")
	if err := os.Chmod(skillDoc, 0o444); err != nil {
		t.Fatalf("chmod skill doc: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(skillDoc, 0o644)
	})

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	rows, err := service.List()
	if err != nil {
		t.Fatalf("list skills: %v", err)
	}

	rowByID := make(map[string]SkillEntry, len(rows))
	for _, row := range rows {
		rowByID[row.SkillID] = row
	}
	row := rowByID["workspace_agents_skills::read-only"]
	if !row.IsEditable || row.EditabilityReason != nil {
		t.Fatalf("expected read-only doc to stay editable when directory is replaceable, got %#v", row)
	}
}

func TestServiceListUsesFirstUsefulDescriptionLine(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	writeSkillDoc(t, filepath.Join(workspaceRoot, ".agents", "skills", "streamed-description", "SKILL.md"), "# Streamed Description\n\nRead only first useful line.\nMore content.\n")

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	rows, err := service.List()
	if err != nil {
		t.Fatalf("list skills: %v", err)
	}

	rowByID := make(map[string]SkillEntry, len(rows))
	for _, row := range rows {
		rowByID[row.SkillID] = row
	}
	if rowByID["workspace_agents_skills::streamed-description"].Description != "Read only first useful line." {
		t.Fatalf("expected first useful description line, got %#v", rowByID["workspace_agents_skills::streamed-description"])
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

func TestServiceResolveSkillsResponseFallsBackToNextWritableRoot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	agentsHome := filepath.Join(root, "agents-home")
	for _, path := range []string{workspaceRoot, homeDir, agentsHome} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	agentsHomeSkills := filepath.Join(agentsHome, "skills")
	userSkills := filepath.Join(homeDir, ".agents", "skills")
	if err := os.MkdirAll(agentsHomeSkills, 0o555); err != nil {
		t.Fatalf("mkdir agents home skills: %v", err)
	}
	if err := os.MkdirAll(userSkills, 0o755); err != nil {
		t.Fatalf("mkdir user skills: %v", err)
	}

	service := newTestService(t, workspaceRoot, homeDir, testEnv{
		"AGENTS_HOME": agentsHome,
	})

	response, err := service.ResolveSkillsResponse()
	if err != nil {
		t.Fatalf("resolve skills response: %v", err)
	}
	if response.CustomSkillCreateRootPath == nil || *response.CustomSkillCreateRootPath != userSkills {
		t.Fatalf("expected fallback to next writable user root, got %#v", response.CustomSkillCreateRootPath)
	}
	if !response.CustomSkillCreateRootActionable {
		t.Fatalf("expected writable fallback root to be actionable, got %#v", response)
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

func TestServiceReadContentRejectsTraversalAndInvalidUTF8(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	writeSkillDocBytes(t, filepath.Join(workspaceRoot, ".agents", "skills", "bad-content", "SKILL.md"), []byte("# bad-content\n\n\xff\xfe\n"))

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	_, err := service.ReadContent("workspace_agents_skills::../../outside")
	if err == nil {
		t.Fatal("expected traversal error")
	}
	var invalidErr *InvalidError
	if !errors.As(err, &invalidErr) || invalidErr.Error() != "Invalid skill path." {
		t.Fatalf("expected invalid skill path error, got %v", err)
	}

	_, err = service.ReadContent("workspace_agents_skills::bad-content")
	if err == nil {
		t.Fatal("expected invalid UTF-8 error")
	}
	if !errors.As(err, &invalidErr) || invalidErr.Error() != "invalid UTF-8" {
		t.Fatalf("expected invalid UTF-8 error, got %v", err)
	}
}

func TestServiceReadContentReturnsInvalidWhenStatDenied(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("directory permission semantics are not stable on windows")
	}

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	skillDir := filepath.Join(workspaceRoot, ".agents", "skills", "permission-denied")
	writeSkillDoc(t, filepath.Join(skillDir, "SKILL.md"), "# Permission Denied\n\nBody.\n")
	if err := os.Chmod(skillDir, 0o000); err != nil {
		t.Fatalf("chmod skill dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(skillDir, 0o755)
	})

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	_, err := service.ReadContent("workspace_agents_skills::permission-denied")
	if err == nil {
		t.Fatal("expected permission-denied error")
	}
	var invalidErr *InvalidError
	if !errors.As(err, &invalidErr) {
		t.Fatalf("expected invalid error, got %T", err)
	}
	if !strings.Contains(strings.ToLower(invalidErr.Error()), "permission denied") {
		t.Fatalf("expected permission denied detail, got %q", invalidErr.Error())
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

func TestServiceUpsertUpdatesSelectedSkillWhenAgentsHomeUnwritable(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("directory permission semantics are not stable on windows")
	}

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	agentsHome := filepath.Join(root, "agents-home")
	for _, path := range []string{workspaceRoot, homeDir, agentsHome} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	skillDoc := filepath.Join(workspaceRoot, ".agents", "skills", "editable", "SKILL.md")
	writeSkillDoc(t, skillDoc, "# editable\n\nInitial.\n")
	agentsHomeSkills := filepath.Join(agentsHome, "skills")
	if err := os.MkdirAll(agentsHomeSkills, 0o500); err != nil {
		t.Fatalf("mkdir agents home skills: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(agentsHomeSkills, 0o700)
	})

	service := newTestService(t, workspaceRoot, homeDir, testEnv{
		"AGENTS_HOME": agentsHome,
	})

	response, err := service.UpsertCustomSkill("workspace_agents_skills::editable", "", "# editable\n\nUpdated.\n")
	if err != nil {
		t.Fatalf("update selected skill: %v", err)
	}

	if response.Created || response.SkillID != "workspace_agents_skills::editable" {
		t.Fatalf("expected workspace skill update, got %#v", response)
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

func TestServiceUpsertCreatesSkillInNextWritableRoot(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("directory permission semantics are not stable on windows")
	}

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	agentsHome := filepath.Join(root, "agents-home")
	for _, path := range []string{workspaceRoot, homeDir, agentsHome} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	agentsHomeSkills := filepath.Join(agentsHome, "skills")
	if err := os.MkdirAll(agentsHomeSkills, 0o555); err != nil {
		t.Fatalf("mkdir agents home skills: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(homeDir, ".agents", "skills"), 0o755); err != nil {
		t.Fatalf("mkdir user skills: %v", err)
	}

	service := newTestService(t, workspaceRoot, homeDir, testEnv{
		"AGENTS_HOME": agentsHome,
	})

	response, err := service.UpsertCustomSkill("", "fallback-root", "# fallback-root\n\nBody.\n")
	if err != nil {
		t.Fatalf("create custom skill: %v", err)
	}
	expectedSkillDoc := filepath.Join(homeDir, ".agents", "skills", "fallback-root", "SKILL.md")
	if response.SkillID != "user_agents_skills::fallback-root" || response.SkillDocPath != expectedSkillDoc {
		t.Fatalf("expected fallback create in user root, got %#v", response)
	}
	if content := readFile(t, expectedSkillDoc); content != "# fallback-root\n\nBody.\n" {
		t.Fatalf("expected created skill content, got %q", content)
	}
}

func TestServiceUpsertRejectsNonDiscoverableAndNonEditableTargets(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("directory permission semantics are not stable on windows")
	}

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	for _, path := range []string{workspaceRoot, homeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	writeSkillDoc(t, filepath.Join(workspaceRoot, ".claude", "skills", "read-only", "SKILL.md"), "# read-only\n\nBody.\n")
	lockedSkillDoc := filepath.Join(workspaceRoot, ".agents", "skills", "locked", "SKILL.md")
	writeSkillDoc(t, lockedSkillDoc, "# locked\n\nBody.\n")
	lockedSkillDir := filepath.Dir(lockedSkillDoc)
	if err := os.Chmod(lockedSkillDir, 0o555); err != nil {
		t.Fatalf("chmod locked skill dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(lockedSkillDir, 0o755)
	})
	writeSkillDoc(t, filepath.Join(workspaceRoot, ".agents", "skills", "node_modules", "hidden", "SKILL.md"), "# hidden\n\nBody.\n")

	service := newTestService(t, workspaceRoot, homeDir, testEnv{})

	for _, testCase := range []struct {
		skillID  string
		notFound bool
		message  string
	}{
		{
			skillID:  "workspace_claude_skills::read-only",
			message:  "Only skills under AGENTS_HOME/skills, ~/.agents/skills, or workspace .agents/skills are editable.",
			notFound: false,
		},
		{
			skillID:  "workspace_agents_skills::locked",
			message:  "Skill directory is not writable.",
			notFound: false,
		},
		{
			skillID:  "workspace_agents_skills::node_modules/hidden",
			message:  "Unknown or non-discoverable skillId: workspace_agents_skills::node_modules/hidden",
			notFound: true,
		},
	} {
		_, err := service.UpsertCustomSkill(testCase.skillID, "", "# updated\n\nBody.\n")
		if err == nil {
			t.Fatalf("expected upsert to fail for %s", testCase.skillID)
		}
		if testCase.notFound {
			var notFoundErr *NotFoundError
			if !errors.As(err, &notFoundErr) || notFoundErr.Error() != testCase.message {
				t.Fatalf("expected not-found error %q, got %v", testCase.message, err)
			}
			continue
		}
		var invalidErr *InvalidError
		if !errors.As(err, &invalidErr) || invalidErr.Error() != testCase.message {
			t.Fatalf("expected invalid error %q, got %v", testCase.message, err)
		}
	}
}

func TestServiceUpsertRejectsCreateWhenNoWritableRootsExist(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("directory permission semantics are not stable on windows")
	}

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	homeDir := filepath.Join(root, "home")
	agentsHome := filepath.Join(root, "agents-home")
	for _, path := range []string{workspaceRoot, homeDir, agentsHome} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	if err := os.MkdirAll(filepath.Join(agentsHome, "skills"), 0o555); err != nil {
		t.Fatalf("mkdir agents home skills: %v", err)
	}
	if err := os.Chmod(homeDir, 0o555); err != nil {
		t.Fatalf("chmod home dir: %v", err)
	}
	if err := os.Chmod(workspaceRoot, 0o555); err != nil {
		t.Fatalf("chmod workspace root: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(homeDir, 0o755)
		_ = os.Chmod(workspaceRoot, 0o755)
	})

	service := newTestService(t, workspaceRoot, homeDir, testEnv{
		"AGENTS_HOME": agentsHome,
	})

	_, err := service.UpsertCustomSkill("", "blocked", "# blocked\n\nBody.\n")
	if err == nil {
		t.Fatal("expected create to fail without writable roots")
	}
	var invalidErr *InvalidError
	if !errors.As(err, &invalidErr) || !strings.Contains(invalidErr.Error(), "No writable custom skill root available.") {
		t.Fatalf("expected no-writable-root error, got %v", err)
	}
}

func TestWriteNewCustomSkillDocRejectsLateCollisionAndLeavesExistingContent(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	skillDocPath := filepath.Join(root, "late-collision", "SKILL.md")
	skillDir := filepath.Dir(skillDocPath)
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatalf("mkdir skill dir: %v", err)
	}
	contentToPreserve := "# late-collision\n\nOriginal.\n"
	mutationDone := waitForSkillTempFile(t, skillDir, func() error {
		return os.WriteFile(skillDocPath, []byte(contentToPreserve), 0o644)
	})

	err := writeNewCustomSkillDoc(skillDocPath, "late-collision", repeatedString("A", 8<<20))
	if mutationErr := <-mutationDone; mutationErr != nil {
		t.Fatalf("prepare collision: %v", mutationErr)
	}
	if err == nil {
		t.Fatal("expected late collision error")
	}
	var invalidErr *InvalidError
	if !errors.As(err, &invalidErr) || invalidErr.Error() != "Custom skill already exists for relativePath 'late-collision'." {
		t.Fatalf("expected late collision error, got %v", err)
	}
	if content := readFile(t, skillDocPath); content != contentToPreserve {
		t.Fatalf("expected colliding content to be preserved, got %q", content)
	}
}

func TestWriteNewCustomSkillDocLeavesNoSkillDocWhenTempWriteFails(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("directory permission semantics are not stable on windows")
	}

	root := t.TempDir()
	skillDocPath := filepath.Join(root, "stuck-skill", "SKILL.md")
	skillDir := filepath.Dir(skillDocPath)
	if err := os.MkdirAll(skillDir, 0o555); err != nil {
		t.Fatalf("mkdir locked skill dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(skillDir, 0o755)
	})

	err := writeNewCustomSkillDoc(skillDocPath, "stuck-skill", "# stuck-skill\n\nBody.\n")
	if err == nil {
		t.Fatal("expected temp write failure")
	}
	var invalidErr *InvalidError
	if !errors.As(err, &invalidErr) {
		t.Fatalf("expected invalid error, got %T", err)
	}
	if _, statErr := os.Stat(skillDocPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("expected no skill doc after temp write failure, got %v", statErr)
	}
}

func TestWriteExistingCustomSkillDocPreservesExistingContentWhenTempWriteFails(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("directory permission semantics are not stable on windows")
	}

	root := t.TempDir()
	skillDocPath := filepath.Join(root, "editable", "SKILL.md")
	writeSkillDoc(t, skillDocPath, "# editable\n\nOriginal.\n")
	skillDir := filepath.Dir(skillDocPath)
	if err := os.Chmod(skillDir, 0o555); err != nil {
		t.Fatalf("chmod skill dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(skillDir, 0o755)
	})

	err := writeExistingCustomSkillDoc(skillDocPath, "workspace_agents_skills::editable", "# editable\n\nUpdated.\n")
	if err == nil {
		t.Fatal("expected temp write failure")
	}
	var invalidErr *InvalidError
	if !errors.As(err, &invalidErr) {
		t.Fatalf("expected invalid error, got %T", err)
	}
	if content := readFile(t, skillDocPath); content != "# editable\n\nOriginal.\n" {
		t.Fatalf("expected original content to be preserved, got %q", content)
	}
}

func TestWriteExistingCustomSkillDocReturnsMissingWhenTargetDisappearsBeforeOpen(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	skillDocPath := filepath.Join(root, "editable", "SKILL.md")
	writeSkillDoc(t, skillDocPath, "# editable\n\nOriginal.\n")
	skillDir := filepath.Dir(skillDocPath)
	mutationDone := waitForSkillTempFile(t, skillDir, func() error {
		return os.Remove(skillDocPath)
	})

	err := writeExistingCustomSkillDoc(skillDocPath, "workspace_agents_skills::editable", repeatedString("A", 64<<20))
	if mutationErr := <-mutationDone; mutationErr != nil {
		t.Fatalf("remove disappearing target: %v", mutationErr)
	}
	if err == nil {
		t.Fatal("expected missing target error")
	}
	var notFoundErr *NotFoundError
	if !errors.As(err, &notFoundErr) || notFoundErr.Error() != "Missing SKILL.md for workspace_agents_skills::editable" {
		t.Fatalf("expected missing-skill error, got %v", err)
	}
	if _, statErr := os.Stat(skillDocPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("expected missing skill doc after disappearance race, got %v", statErr)
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

func writeSkillDocBytes(t *testing.T, path string, content []byte) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir skill dir: %v", err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write raw skill doc: %v", err)
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

func waitForSkillTempFile(t *testing.T, skillDir string, mutate func() error) <-chan error {
	t.Helper()

	done := make(chan error, 1)
	go func() {
		pattern := filepath.Join(skillDir, ".setta-skill-*.tmp")
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			matches, err := filepath.Glob(pattern)
			if err != nil {
				done <- err
				return
			}
			if len(matches) > 0 {
				done <- mutate()
				return
			}
			runtime.Gosched()
		}
		done <- errors.New("timed out waiting for temp skill file")
	}()
	return done
}
