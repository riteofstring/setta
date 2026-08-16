package contracts

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// GenerateArtifacts writes, or checks, every V1 artifact from one validated
// snapshot. The two targets are always generated together.
func GenerateArtifacts(snapshot ProjectSnapshotV1, check bool) error {
	appRoot, err := findAppRoot()
	if err != nil {
		return err
	}
	return generateArtifacts(appRoot, snapshot, check)
}

func generateArtifacts(appRoot string, snapshot ProjectSnapshotV1, check bool) error {
	fixture, err := marshalProjectSnapshotV1(snapshot)
	if err != nil {
		return err
	}

	artifacts := []generatedArtifact{
		{
			path:    filepath.Join(appRoot, "src", "backend", "generatedContract.ts"),
			content: TypeScriptV1(),
		},
		{
			path:    filepath.Join(appRoot, "backend", "internal", "contracts", "testdata", "project-snapshot-v1.json"),
			content: fixture,
		},
	}
	return writeOrCheckArtifacts(artifacts, check)
}

func marshalProjectSnapshotV1(snapshot ProjectSnapshotV1) ([]byte, error) {
	if err := snapshot.Validate(); err != nil {
		return nil, fmt.Errorf("validate project snapshot: %w", err)
	}
	content, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal project snapshot: %w", err)
	}
	return append(content, '\n'), nil
}

type generatedArtifact struct {
	path    string
	content []byte
}

func writeOrCheckArtifacts(artifacts []generatedArtifact, check bool) error {
	if len(artifacts) == 0 {
		return errors.New("no generated artifacts")
	}

	existing := make([][]byte, len(artifacts))
	exists := make([]bool, len(artifacts))
	var problems []error
	for index, artifact := range artifacts {
		if artifact.path == "" {
			problems = append(problems, errors.New("generated artifact path is empty"))
			continue
		}
		if len(artifact.content) == 0 {
			problems = append(problems, fmt.Errorf("generated artifact content is empty: %s", artifact.path))
			continue
		}
		content, err := os.ReadFile(artifact.path)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			problems = append(problems, fmt.Errorf("read generated artifact %s: %w", artifact.path, err))
			continue
		}
		existing[index] = content
		exists[index] = err == nil
		if check && !exists[index] {
			problems = append(problems, fmt.Errorf("generated artifact is missing: %s", artifact.path))
			continue
		}
		if check && !bytes.Equal(content, artifact.content) {
			problems = append(problems, fmt.Errorf("generated artifact has drifted: %s", artifact.path))
		}
	}
	if len(problems) != 0 {
		return errors.Join(problems...)
	}
	if check {
		return nil
	}

	replacements := make([]artifactReplacement, 0, len(artifacts))
	for index, artifact := range artifacts {
		if exists[index] && bytes.Equal(existing[index], artifact.content) {
			continue
		}
		temporaryPath, err := stageArtifact(artifact.path, artifact.content)
		if err != nil {
			cleanupStagedArtifacts(replacements)
			return err
		}
		replacements = append(replacements, artifactReplacement{
			targetPath:    artifact.path,
			temporaryPath: temporaryPath,
			existed:       exists[index],
		})
	}
	return commitArtifactReplacements(replacements)
}

type artifactReplacement struct {
	targetPath    string
	temporaryPath string
	backupPath    string
	existed       bool
	movedOriginal bool
	installed     bool
}

func stageArtifact(path string, content []byte) (string, error) {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return "", fmt.Errorf("create generated artifact directory %s: %w", directory, err)
	}

	temporary, err := os.CreateTemp(directory, ".generated-contract-*")
	if err != nil {
		return "", fmt.Errorf("create generated artifact temporary file for %s: %w", path, err)
	}
	temporaryPath := temporary.Name()

	if _, err := temporary.Write(content); err != nil {
		temporary.Close()
		os.Remove(temporaryPath)
		return "", fmt.Errorf("write generated artifact temporary file for %s: %w", path, err)
	}
	if err := temporary.Chmod(0o644); err != nil {
		temporary.Close()
		os.Remove(temporaryPath)
		return "", fmt.Errorf("set generated artifact permissions for %s: %w", path, err)
	}
	if err := temporary.Close(); err != nil {
		os.Remove(temporaryPath)
		return "", fmt.Errorf("close generated artifact temporary file for %s: %w", path, err)
	}
	return temporaryPath, nil
}

func commitArtifactReplacements(replacements []artifactReplacement) error {
	for index := range replacements {
		replacement := &replacements[index]
		if replacement.existed {
			backupPath, err := reserveBackupPath(filepath.Dir(replacement.targetPath))
			if err != nil {
				return rollbackArtifactReplacements(replacements, fmt.Errorf("reserve generated artifact backup for %s: %w", replacement.targetPath, err))
			}
			replacement.backupPath = backupPath
			if err := os.Rename(replacement.targetPath, replacement.backupPath); err != nil {
				return rollbackArtifactReplacements(replacements, fmt.Errorf("back up generated artifact %s: %w", replacement.targetPath, err))
			}
			replacement.movedOriginal = true
		}
		if err := os.Rename(replacement.temporaryPath, replacement.targetPath); err != nil {
			return rollbackArtifactReplacements(replacements, fmt.Errorf("replace generated artifact %s: %w", replacement.targetPath, err))
		}
		replacement.installed = true
	}

	var problems []error
	for _, replacement := range replacements {
		if replacement.backupPath == "" {
			continue
		}
		if err := os.Remove(replacement.backupPath); err != nil && !errors.Is(err, os.ErrNotExist) {
			problems = append(problems, fmt.Errorf("remove generated artifact backup %s: %w", replacement.backupPath, err))
		}
	}
	if len(problems) != 0 {
		return errors.Join(problems...)
	}
	return nil
}

func reserveBackupPath(directory string) (string, error) {
	temporary, err := os.CreateTemp(directory, ".generated-contract-backup-*")
	if err != nil {
		return "", err
	}
	path := temporary.Name()
	if err := temporary.Close(); err != nil {
		os.Remove(path)
		return "", err
	}
	if err := os.Remove(path); err != nil {
		return "", err
	}
	return path, nil
}

func rollbackArtifactReplacements(replacements []artifactReplacement, cause error) error {
	var problems []error
	for index := len(replacements) - 1; index >= 0; index-- {
		replacement := replacements[index]
		if replacement.installed {
			if err := os.Remove(replacement.targetPath); err != nil && !errors.Is(err, os.ErrNotExist) {
				problems = append(problems, fmt.Errorf("remove incomplete generated artifact %s: %w", replacement.targetPath, err))
			}
		}
		if replacement.movedOriginal {
			if err := os.Rename(replacement.backupPath, replacement.targetPath); err != nil {
				problems = append(problems, fmt.Errorf("restore generated artifact %s: %w", replacement.targetPath, err))
			}
		}
		if replacement.temporaryPath != "" {
			if err := os.Remove(replacement.temporaryPath); err != nil && !errors.Is(err, os.ErrNotExist) {
				problems = append(problems, fmt.Errorf("remove generated artifact temporary file %s: %w", replacement.temporaryPath, err))
			}
		}
	}
	if len(problems) == 0 {
		return cause
	}
	return errors.Join(append([]error{cause}, problems...)...)
}

func cleanupStagedArtifacts(replacements []artifactReplacement) {
	for _, replacement := range replacements {
		_ = os.Remove(replacement.temporaryPath)
	}
}

func findAppRoot() (string, error) {
	workingDirectory, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get working directory: %w", err)
	}
	for directory := workingDirectory; ; directory = filepath.Dir(directory) {
		if isRegularFile(filepath.Join(directory, "backend", "go.mod")) {
			return directory, nil
		}
		if filepath.Base(directory) == "backend" && isRegularFile(filepath.Join(directory, "go.mod")) {
			return filepath.Dir(directory), nil
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			return "", fmt.Errorf("find Python Canvas app root from %s", workingDirectory)
		}
	}
}

func isRegularFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}
