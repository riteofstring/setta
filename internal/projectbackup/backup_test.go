package projectbackup

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestListFilesFiltersAndSorts(t *testing.T) {
	t.Parallel()

	backupDir := filepath.Join(t.TempDir(), "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatalf("mkdir backup dir: %v", err)
	}

	validOld := filepath.Join(backupDir, "backup_20260101_000000_000001.json")
	validNew := filepath.Join(backupDir, "backup_20260101_000000_000002.json")
	invalid := filepath.Join(backupDir, "backup_latest.json")
	invalidMissingToken := filepath.Join(backupDir, "backup_20260101_000000.json")
	for path, content := range map[string]string{
		validOld:            "OLD",
		validNew:            "NEW",
		invalid:             "INVALID",
		invalidMissingToken: "INVALID2",
	} {
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	files, err := ListFiles(backupDir)
	if err != nil {
		t.Fatalf("list files: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 valid backups, got %d", len(files))
	}
	if files[0].Path != validNew || files[1].Path != validOld {
		t.Fatalf("unexpected backup order: %#v", files)
	}
}

func TestResolveRestorePathLatestAndIndex(t *testing.T) {
	t.Parallel()

	backupDir := filepath.Join(t.TempDir(), "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatalf("mkdir backup dir: %v", err)
	}
	backupOld := filepath.Join(backupDir, "backup_20260101_000000_000001.json")
	backupNew := filepath.Join(backupDir, "backup_20260101_000000_000002.json")
	for path, content := range map[string]string{
		backupOld: "OLD",
		backupNew: "NEW",
	} {
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	latestPath, err := ResolveRestorePath(backupDir, RestoreSelection{Latest: true, Index: -1})
	if err != nil {
		t.Fatalf("resolve latest: %v", err)
	}
	if latestPath != backupNew {
		t.Fatalf("expected latest path %q, got %q", backupNew, latestPath)
	}

	indexPath, err := ResolveRestorePath(backupDir, RestoreSelection{Index: 2})
	if err != nil {
		t.Fatalf("resolve index: %v", err)
	}
	if indexPath != backupOld {
		t.Fatalf("expected second path %q, got %q", backupOld, indexPath)
	}
}

func TestResolveRestorePathRejectsConflictingSelectors(t *testing.T) {
	t.Parallel()

	backupDir := filepath.Join(t.TempDir(), "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatalf("mkdir backup dir: %v", err)
	}

	_, err := ResolveRestorePath(
		backupDir,
		RestoreSelection{
			Latest:     true,
			Index:      -1,
			BackupPath: filepath.Join(backupDir, "backup_20260101_000000_000001.json"),
		},
	)
	if err == nil {
		t.Fatal("expected conflicting restore selectors to fail")
	}
	if err.Error() != restoreSelectionUsageError {
		t.Fatalf("expected usage error %q, got %q", restoreSelectionUsageError, err.Error())
	}
}

func TestMaybeCreateBackupNoopWhenProjectMissing(t *testing.T) {
	t.Parallel()

	backupDir := filepath.Join(t.TempDir(), "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatalf("mkdir backup dir: %v", err)
	}

	createdPath, created, err := MaybeCreateBackup(
		filepath.Join(t.TempDir(), "project.json"),
		backupDir,
		AutoBackupOptions{
			Enabled:          true,
			FrequencySeconds: 0,
			KeepLastN:        10,
		},
	)
	if err != nil {
		t.Fatalf("maybe create backup: %v", err)
	}
	if created {
		t.Fatalf("expected missing project file to skip backup creation, got created path %q", createdPath)
	}
	files, err := ListFiles(backupDir)
	if err != nil {
		t.Fatalf("list backups: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("expected no backups, got %#v", files)
	}
}

func TestMaybeCreateBackupCreatesBackup(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	backupDir := filepath.Join(tempDir, "backups")
	projectPath := filepath.Join(tempDir, "project.json")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatalf("mkdir backup dir: %v", err)
	}
	if err := os.WriteFile(projectPath, []byte("PAYLOAD"), 0o644); err != nil {
		t.Fatalf("write project: %v", err)
	}

	createdPath, created, err := MaybeCreateBackup(
		projectPath,
		backupDir,
		AutoBackupOptions{
			Enabled:          true,
			FrequencySeconds: 0,
			KeepLastN:        10,
			Now:              time.Date(2026, time.March, 20, 12, 30, 0, 123000000, time.UTC),
		},
	)
	if err != nil {
		t.Fatalf("maybe create backup: %v", err)
	}
	if !created {
		t.Fatal("expected backup to be created")
	}
	if filepath.Base(createdPath) != "backup_20260320_123000_123000.json" {
		t.Fatalf("unexpected created backup path %q", createdPath)
	}
	files, err := ListFiles(backupDir)
	if err != nil {
		t.Fatalf("list backups: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("expected one backup, got %#v", files)
	}
	payload, err := os.ReadFile(files[0].Path)
	if err != nil {
		t.Fatalf("read created backup: %v", err)
	}
	if string(payload) != "PAYLOAD" {
		t.Fatalf("expected backup payload PAYLOAD, got %q", string(payload))
	}
}

func TestRestoreProjectCreatesStashAndOverwritesProject(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	backupDir := filepath.Join(tempDir, "backups")
	projectPath := filepath.Join(tempDir, "project.json")
	backupPath := filepath.Join(backupDir, "backup_20260101_000000_000000.json")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatalf("mkdir backup dir: %v", err)
	}
	if err := os.WriteFile(projectPath, []byte("OLD"), 0o644); err != nil {
		t.Fatalf("write project: %v", err)
	}
	if err := os.WriteFile(backupPath, []byte("NEW"), 0o644); err != nil {
		t.Fatalf("write backup: %v", err)
	}

	result, err := RestoreProject(
		backupPath,
		projectPath,
		backupDir,
		time.Date(2026, time.March, 8, 12, 30, 0, 123000000, time.UTC),
	)
	if err != nil {
		t.Fatalf("restore project: %v", err)
	}
	if result.ProjectPath != projectPath {
		t.Fatalf("expected project path %q, got %q", projectPath, result.ProjectPath)
	}
	if result.BackupPath != backupPath {
		t.Fatalf("expected backup path %q, got %q", backupPath, result.BackupPath)
	}
	if filepath.Base(result.StashPath) != "restore_stash_20260308_123000_123000.json" {
		t.Fatalf("unexpected stash path %q", result.StashPath)
	}
	projectBytes, err := os.ReadFile(projectPath)
	if err != nil {
		t.Fatalf("read project: %v", err)
	}
	if string(projectBytes) != "NEW" {
		t.Fatalf("expected restored project content, got %q", string(projectBytes))
	}
	stashBytes, err := os.ReadFile(result.StashPath)
	if err != nil {
		t.Fatalf("read stash: %v", err)
	}
	if string(stashBytes) != "OLD" {
		t.Fatalf("expected stash content OLD, got %q", string(stashBytes))
	}
}
