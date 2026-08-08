package watchcode

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
)

type TrackedFileSnapshot struct {
	Files map[string]TrackedFile
}

type TrackedFile struct {
	Path        string
	IdentityKey string
	ContentHash string
}

type SnapshotEvent struct {
	Type            EventType
	Path            string
	DestinationPath string
}

func BuildTrackedFileSnapshot(configs map[string]ConfigSnapshot) (TrackedFileSnapshot, error) {
	trackedPaths, err := trackedPythonFiles(configs)
	if err != nil {
		return TrackedFileSnapshot{}, err
	}

	files := make(map[string]TrackedFile, len(trackedPaths))
	for _, path := range trackedPaths {
		info, err := os.Stat(path)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return TrackedFileSnapshot{}, err
		}
		if !info.Mode().IsRegular() {
			continue
		}

		identityKey, err := fileIdentityKey(path, info)
		if err != nil {
			return TrackedFileSnapshot{}, err
		}
		contentHash, err := fileContentHash(path)
		if err != nil {
			return TrackedFileSnapshot{}, err
		}
		files[path] = TrackedFile{
			Path:        path,
			IdentityKey: identityKey,
			ContentHash: contentHash,
		}
	}

	return TrackedFileSnapshot{Files: files}, nil
}

func DiffTrackedFileSnapshots(previous TrackedFileSnapshot, current TrackedFileSnapshot) []SnapshotEvent {
	previousByIdentity := make(map[string]TrackedFile, len(previous.Files))
	for _, file := range previous.Files {
		previousByIdentity[file.IdentityKey] = file
	}
	currentByIdentity := make(map[string]TrackedFile, len(current.Files))
	for _, file := range current.Files {
		currentByIdentity[file.IdentityKey] = file
	}

	moves := make([]SnapshotEvent, 0)
	modifies := make([]SnapshotEvent, 0)
	deletes := make([]SnapshotEvent, 0)
	creates := make([]SnapshotEvent, 0)

	consumedPreviousPaths := make(map[string]struct{}, len(previous.Files))
	consumedCurrentPaths := make(map[string]struct{}, len(current.Files))
	for identityKey, previousFile := range previousByIdentity {
		currentFile, ok := currentByIdentity[identityKey]
		if !ok {
			continue
		}
		consumedPreviousPaths[previousFile.Path] = struct{}{}
		consumedCurrentPaths[currentFile.Path] = struct{}{}
		switch {
		case previousFile.Path != currentFile.Path:
			moves = append(moves, SnapshotEvent{
				Type:            EventTypeMoved,
				Path:            previousFile.Path,
				DestinationPath: currentFile.Path,
			})
		case previousFile.ContentHash != currentFile.ContentHash:
			modifies = append(modifies, SnapshotEvent{
				Type: EventTypeModified,
				Path: currentFile.Path,
			})
		}
	}

	for path := range previous.Files {
		if _, consumed := consumedPreviousPaths[path]; consumed {
			continue
		}
		deletes = append(deletes, SnapshotEvent{
			Type: EventTypeDeleted,
			Path: path,
		})
	}
	for path := range current.Files {
		if _, consumed := consumedCurrentPaths[path]; consumed {
			continue
		}
		creates = append(creates, SnapshotEvent{
			Type: EventTypeCreated,
			Path: path,
		})
	}

	sortSnapshotEvents(moves)
	sortSnapshotEvents(modifies)
	sortSnapshotEvents(deletes)
	sortSnapshotEvents(creates)

	output := make([]SnapshotEvent, 0, len(moves)+len(modifies)+len(deletes)+len(creates))
	output = append(output, moves...)
	output = append(output, modifies...)
	output = append(output, deletes...)
	output = append(output, creates...)
	return output
}

func trackedPythonFiles(configs map[string]ConfigSnapshot) ([]string, error) {
	trackedPaths := make(map[string]struct{})
	for _, snapshot := range configs {
		for _, filePath := range snapshot.Files {
			if !isPythonSourcePath(filePath) || shouldIgnorePath(filePath, snapshot.IgnoredRoots) {
				continue
			}
			trackedPaths[filePath] = struct{}{}
		}
		for _, folder := range snapshot.Folders {
			paths, err := pythonFilesInFolder(folder.Path, folder.Recursive, snapshot.IgnoredRoots)
			if err != nil {
				return nil, err
			}
			for _, path := range paths {
				trackedPaths[path] = struct{}{}
			}
		}
	}

	output := make([]string, 0, len(trackedPaths))
	for path := range trackedPaths {
		output = append(output, path)
	}
	sort.Strings(output)
	return output, nil
}

func pythonFilesInFolder(root string, recursive bool, ignoredRoots []string) ([]string, error) {
	tracked, err := trackablePythonFolderRoot(root, ignoredRoots)
	if err != nil || !tracked {
		return nil, err
	}
	if recursive {
		return recursivePythonFilesInFolder(root, ignoredRoots)
	}
	return directPythonFilesInFolder(root, ignoredRoots)
}

func trackablePythonFolderRoot(root string, ignoredRoots []string) (bool, error) {
	info, err := os.Stat(root)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	if !info.IsDir() || shouldIgnorePath(root, ignoredRoots) {
		return false, nil
	}
	return true, nil
}

func directPythonFilesInFolder(root string, ignoredRoots []string) ([]string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	output := make([]string, 0, len(entries))
	for _, entry := range entries {
		path, ok := directTrackedPythonFilePath(root, entry, ignoredRoots)
		if !ok {
			continue
		}
		output = append(output, path)
	}
	sort.Strings(output)
	return output, nil
}

func directTrackedPythonFilePath(root string, entry os.DirEntry, ignoredRoots []string) (string, bool) {
	if entry.IsDir() {
		return "", false
	}
	path := filepath.Join(root, entry.Name())
	if !trackablePythonFilePath(path, ignoredRoots) {
		return "", false
	}
	return path, true
}

func recursivePythonFilesInFolder(root string, ignoredRoots []string) ([]string, error) {
	output := make([]string, 0)
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		return appendRecursiveTrackedPythonFile(root, path, entry, walkErr, ignoredRoots, &output)
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(output)
	return output, nil
}

func appendRecursiveTrackedPythonFile(root string, path string, entry fs.DirEntry, walkErr error, ignoredRoots []string, output *[]string) error {
	if walkErr != nil {
		if os.IsNotExist(walkErr) {
			return nil
		}
		return walkErr
	}
	if entry.IsDir() {
		if path != root && shouldIgnorePath(path, ignoredRoots) {
			return filepath.SkipDir
		}
		return nil
	}
	if !trackablePythonFilePath(path, ignoredRoots) {
		return nil
	}
	*output = append(*output, path)
	return nil
}

func trackablePythonFilePath(path string, ignoredRoots []string) bool {
	return isPythonSourcePath(path) && !shouldIgnorePath(path, ignoredRoots)
}

func fileContentHash(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}

func sortSnapshotEvents(events []SnapshotEvent) {
	sort.Slice(events, func(i int, j int) bool {
		if events[i].Path == events[j].Path {
			return events[i].DestinationPath < events[j].DestinationPath
		}
		return events[i].Path < events[j].Path
	})
}

func unsupportedFileIdentityError(path string) error {
	return fmt.Errorf("watchcode: stable file identity unsupported for %q on this platform", path)
}
