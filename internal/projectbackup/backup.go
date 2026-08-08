package projectbackup

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"setta/internal/statefs"
)

const (
	backupDirName              = "backups"
	projectFileName            = "project.json"
	backupFilenamePrefixLayout = "20060102_150405"
)

var backupFilenamePattern = regexp.MustCompile(`^backup_([0-9]{8}_[0-9]{6}_[0-9]{6})\.json$`)

const restoreSelectionUsageError = "Use exactly one of: --latest, --index, --path"

type File struct {
	Path      string
	Timestamp time.Time
}

type RestoreSelection struct {
	Latest     bool
	Index      int
	BackupPath string
}

type RestoreResult struct {
	ProjectPath string
	BackupPath  string
	StashPath   string
}

type resolvedRestoreSelection struct {
	backupPath string
	latest     bool
	index      int
}

type AutoBackupOptions struct {
	Enabled          bool
	FrequencySeconds int
	KeepLastN        int
	Now              time.Time
}

func BackupDir(settaFilesRoot string) string {
	return filepath.Join(strings.TrimSpace(settaFilesRoot), backupDirName)
}

func ProjectPath(settaFilesRoot string) string {
	return filepath.Join(strings.TrimSpace(settaFilesRoot), projectFileName)
}

func ListFiles(backupDir string) ([]File, error) {
	resolvedBackupDir, err := statefs.NormalizePath(backupDir, "")
	if err != nil {
		return nil, fmt.Errorf("resolve backup dir: %w", err)
	}
	entries, err := os.ReadDir(resolvedBackupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []File{}, nil
		}
		return nil, fmt.Errorf("read backup dir: %w", err)
	}

	files := make([]File, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		timestamp, ok := parseBackupFilename(entry.Name())
		if !ok {
			continue
		}
		files = append(files, File{
			Path:      filepath.Join(resolvedBackupDir, entry.Name()),
			Timestamp: timestamp,
		})
	}

	sort.Slice(files, func(i int, j int) bool {
		return filepath.Base(files[i].Path) > filepath.Base(files[j].Path)
	})
	return files, nil
}

func normalizeRestoreSelection(selection RestoreSelection) (resolvedRestoreSelection, error) {
	resolved := resolvedRestoreSelection{
		backupPath: strings.TrimSpace(selection.BackupPath),
		latest:     selection.Latest,
		index:      selection.Index,
	}
	selectedModes := 0
	if resolved.backupPath != "" {
		selectedModes++
	}
	if resolved.latest {
		selectedModes++
	}
	if resolved.index >= 0 {
		selectedModes++
	}
	if selectedModes != 1 {
		return resolvedRestoreSelection{}, fmt.Errorf("%s", restoreSelectionUsageError)
	}
	return resolved, nil
}

func resolveRestorePathArgument(backupPath string) (string, error) {
	resolvedPath, err := statefs.NormalizePath(backupPath, "")
	if err != nil {
		return "", fmt.Errorf("resolve --path: %w", err)
	}
	return validateRestorePath(resolvedPath)
}

func listRestoreBackups(backupDir string) ([]File, error) {
	backups, err := ListFiles(backupDir)
	if err != nil {
		return nil, err
	}
	if len(backups) == 0 {
		return nil, fmt.Errorf("No backups found in %s", BackupDirPathForMessage(backupDir))
	}
	return backups, nil
}

func selectRestoreBackupByIndex(backups []File, index int) string {
	return backups[index-1].Path
}

func validateRestoreBackupIndex(index int, backupCount int) error {
	if index < 1 || index > backupCount {
		return fmt.Errorf("--index must be between 1 and %d (got %d)", backupCount, index)
	}
	return nil
}

func selectRestoreBackupPath(backups []File, selection resolvedRestoreSelection) (string, error) {
	if selection.latest {
		return backups[0].Path, nil
	}
	if err := validateRestoreBackupIndex(selection.index, len(backups)); err != nil {
		return "", err
	}
	return selectRestoreBackupByIndex(backups, selection.index), nil
}

func ResolveRestorePath(backupDir string, selection RestoreSelection) (string, error) {
	resolvedSelection, err := normalizeRestoreSelection(selection)
	if err != nil {
		return "", err
	}
	if resolvedSelection.backupPath != "" {
		return resolveRestorePathArgument(resolvedSelection.backupPath)
	}

	backups, err := listRestoreBackups(backupDir)
	if err != nil {
		return "", err
	}
	return selectRestoreBackupPath(backups, resolvedSelection)
}

// MaybeCreateBackup snapshots the current on-disk project file before a save overwrites it.
func MaybeCreateBackup(projectPath string, backupDir string, options AutoBackupOptions) (string, bool, error) {
	resolvedProjectPath, err := statefs.NormalizePath(projectPath, "")
	if err != nil {
		return "", false, fmt.Errorf("resolve project path: %w", err)
	}
	resolvedBackupDir, err := statefs.NormalizePath(backupDir, "")
	if err != nil {
		return "", false, fmt.Errorf("resolve backup dir: %w", err)
	}
	if _, err := os.Stat(resolvedProjectPath); err != nil {
		if os.IsNotExist(err) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("stat project file: %w", err)
	}
	if !options.Enabled {
		return "", false, nil
	}

	now := options.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}
	shouldCreate, err := shouldCreateBackup(resolvedBackupDir, options.FrequencySeconds, now.UTC())
	if err != nil {
		return "", false, err
	}
	if !shouldCreate {
		return "", false, nil
	}

	createdPath, err := createBackup(resolvedProjectPath, resolvedBackupDir, options.KeepLastN, now.UTC())
	if err != nil {
		return "", false, err
	}
	return createdPath, true, nil
}

func RestoreProject(backupPath string, projectPath string, backupDir string, now time.Time) (RestoreResult, error) {
	resolvedBackupPath, err := statefs.NormalizePath(backupPath, "")
	if err != nil {
		return RestoreResult{}, fmt.Errorf("resolve backup path: %w", err)
	}
	resolvedProjectPath, err := statefs.NormalizePath(projectPath, "")
	if err != nil {
		return RestoreResult{}, fmt.Errorf("resolve project path: %w", err)
	}
	resolvedBackupDir, err := statefs.NormalizePath(backupDir, "")
	if err != nil {
		return RestoreResult{}, fmt.Errorf("resolve backup dir: %w", err)
	}

	result := RestoreResult{
		ProjectPath: resolvedProjectPath,
		BackupPath:  resolvedBackupPath,
	}

	if _, err := validateRestorePath(resolvedBackupPath); err != nil {
		return RestoreResult{}, err
	}

	if _, err := os.Stat(resolvedProjectPath); err == nil {
		stashPath, err := CreateRestoreStash(resolvedProjectPath, resolvedBackupDir, now)
		if err != nil {
			return RestoreResult{}, err
		}
		result.StashPath = stashPath
	} else if !os.IsNotExist(err) {
		return RestoreResult{}, fmt.Errorf("stat project file: %w", err)
	}

	if err := copyFile(resolvedBackupPath, resolvedProjectPath); err != nil {
		return RestoreResult{}, err
	}
	return result, nil
}

func CreateRestoreStash(projectPath string, backupDir string, now time.Time) (string, error) {
	resolvedProjectPath, err := statefs.NormalizePath(projectPath, "")
	if err != nil {
		return "", fmt.Errorf("resolve project path: %w", err)
	}
	resolvedBackupDir, err := statefs.NormalizePath(backupDir, "")
	if err != nil {
		return "", fmt.Errorf("resolve backup dir: %w", err)
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if err := os.MkdirAll(resolvedBackupDir, 0o755); err != nil {
		return "", fmt.Errorf("create backup dir: %w", err)
	}
	stashPath := filepath.Join(resolvedBackupDir, fmt.Sprintf("restore_stash_%s.json", formatFilenameTimestamp(now.UTC())))
	if err := copyFile(resolvedProjectPath, stashPath); err != nil {
		return "", err
	}
	return stashPath, nil
}

func FormatTimestamp(timestamp time.Time) string {
	return timestamp.UTC().Format("2006-01-02T15:04:05.999999-07:00")
}

func BackupDirPathForMessage(backupDir string) string {
	resolvedBackupDir, err := statefs.NormalizePath(backupDir, "")
	if err != nil {
		return strings.TrimSpace(backupDir)
	}
	return resolvedBackupDir
}

func parseBackupFilename(name string) (time.Time, bool) {
	match := backupFilenamePattern.FindStringSubmatch(name)
	if match == nil {
		return time.Time{}, false
	}
	if len(match[1]) != 22 {
		return time.Time{}, false
	}
	prefix := match[1][:15]
	microsecondsRaw := match[1][16:]
	timestamp, err := time.Parse(backupFilenamePrefixLayout, prefix)
	if err != nil {
		return time.Time{}, false
	}
	microseconds, err := strconv.Atoi(microsecondsRaw)
	if err != nil {
		return time.Time{}, false
	}
	return timestamp.UTC().Add(time.Duration(microseconds) * time.Microsecond), true
}

func validateRestorePath(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("Backup file not found: %s", path)
		}
		return "", fmt.Errorf("stat backup file: %w", err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("Backup path is not a file: %s", path)
	}
	return path, nil
}

func shouldCreateBackup(backupDir string, frequencySeconds int, now time.Time) (bool, error) {
	backups, err := ListFiles(backupDir)
	if err != nil {
		return false, err
	}
	if len(backups) == 0 {
		return true, nil
	}
	return now.Sub(backups[0].Timestamp) >= time.Duration(frequencySeconds)*time.Second, nil
}

func createBackup(projectPath string, backupDir string, keepLastN int, now time.Time) (string, error) {
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return "", fmt.Errorf("create backup dir: %w", err)
	}
	backupPath := filepath.Join(backupDir, fmt.Sprintf("backup_%s.json", formatFilenameTimestamp(now.UTC())))
	if err := copyFile(projectPath, backupPath); err != nil {
		return "", err
	}
	if err := cleanupOldBackups(backupDir, keepLastN); err != nil {
		return "", err
	}
	return backupPath, nil
}

func cleanupOldBackups(backupDir string, keepLastN int) error {
	backups, err := ListFiles(backupDir)
	if err != nil {
		return err
	}

	start := keepLastN
	if start < 0 {
		start = len(backups) + start
	}
	if start < 0 {
		start = 0
	}
	if start > len(backups) {
		start = len(backups)
	}

	for _, backup := range backups[start:] {
		if err := os.Remove(backup.Path); err != nil {
			return fmt.Errorf("remove backup %s: %w", backup.Path, err)
		}
	}
	return nil
}

func copyFile(sourcePath string, targetPath string) error {
	sourceData, err := os.ReadFile(sourcePath)
	if err != nil {
		return fmt.Errorf("read %s: %w", sourcePath, err)
	}
	sourceInfo, err := os.Stat(sourcePath)
	if err != nil {
		return fmt.Errorf("stat %s: %w", sourcePath, err)
	}
	if err := statefs.AtomicWriteFile(targetPath, sourceData, sourceInfo.Mode().Perm()); err != nil {
		return fmt.Errorf("write %s: %w", targetPath, err)
	}
	return nil
}

func formatFilenameTimestamp(timestamp time.Time) string {
	return fmt.Sprintf("%s_%06d", timestamp.UTC().Format(backupFilenamePrefixLayout), timestamp.UTC().Nanosecond()/1000)
}
