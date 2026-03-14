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

func ResolveRestorePath(backupDir string, selection RestoreSelection) (string, error) {
	usageError := "Use exactly one of: --latest, --index, --path"
	trimmedPath := strings.TrimSpace(selection.BackupPath)

	switch {
	case trimmedPath != "":
		if selection.Latest || selection.Index >= 0 {
			return "", fmt.Errorf("%s", usageError)
		}
		resolvedPath, err := statefs.NormalizePath(trimmedPath, "")
		if err != nil {
			return "", fmt.Errorf("resolve --path: %w", err)
		}
		return validateRestorePath(resolvedPath)
	case selection.Latest:
		if selection.Index >= 0 {
			return "", fmt.Errorf("%s", usageError)
		}
		backups, err := ListFiles(backupDir)
		if err != nil {
			return "", err
		}
		if len(backups) == 0 {
			return "", fmt.Errorf("No backups found in %s", BackupDirPathForMessage(backupDir))
		}
		return backups[0].Path, nil
	case selection.Index >= 0:
		backups, err := ListFiles(backupDir)
		if err != nil {
			return "", err
		}
		if len(backups) == 0 {
			return "", fmt.Errorf("No backups found in %s", BackupDirPathForMessage(backupDir))
		}
		if selection.Index < 1 || selection.Index > len(backups) {
			return "", fmt.Errorf("--index must be between 1 and %d (got %d)", len(backups), selection.Index)
		}
		return backups[selection.Index-1].Path, nil
	default:
		return "", fmt.Errorf("%s", usageError)
	}
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
