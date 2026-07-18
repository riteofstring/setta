package chat

import (
	"fmt"
	"path/filepath"
	"strings"
)

const runItemFileChangePatchLimit = 4000

func newRunItemFileChangeDetails(patchStatus string, paths []RunItemFileChangePath) *RunItemDetails {
	additions := 0
	deletions := 0
	cloned := make([]RunItemFileChangePath, 0, len(paths))
	for _, path := range paths {
		additions += path.Additions
		deletions += path.Deletions
		cloned = append(cloned, cloneRunItemFileChangePath(path))
	}
	return NewRunItemFileChangeDetails(RunItemFileChangeDetails{
		PatchStatus: patchStatus,
		Paths:       cloned,
		Additions:   additions,
		Deletions:   deletions,
	})
}

func newRunItemFileChangePath(path string, operation *RunItemFileChangeOperation, movePath string, patch string) RunItemFileChangePath {
	additions, deletions := runItemFileChangePatchStats(patch)
	boundedPatch, truncated := boundedRunItemFileChangePatch(patch)
	return RunItemFileChangePath{
		Path:           path,
		Operation:      cloneRunItemFileChangeOperation(operation),
		MovePath:       movePath,
		Additions:      additions,
		Deletions:      deletions,
		Patch:          boundedPatch,
		PatchTruncated: truncated,
	}
}

func cloneRunItemFileChangeDetails(details RunItemFileChangeDetails) RunItemFileChangeDetails {
	details.Paths = cloneRunItemFileChangePaths(details.Paths)
	return details
}

func cloneRunItemFileChangePaths(paths []RunItemFileChangePath) []RunItemFileChangePath {
	if paths == nil {
		return nil
	}
	cloned := make([]RunItemFileChangePath, 0, len(paths))
	for _, path := range paths {
		cloned = append(cloned, cloneRunItemFileChangePath(path))
	}
	return cloned
}

func cloneRunItemFileChangePath(path RunItemFileChangePath) RunItemFileChangePath {
	path.Operation = cloneRunItemFileChangeOperation(path.Operation)
	return path
}

func cloneRunItemFileChangeOperation(operation *RunItemFileChangeOperation) *RunItemFileChangeOperation {
	if operation == nil {
		return nil
	}
	cloned := *operation
	return &cloned
}

func runItemFileChangeOperationPtr(operation RunItemFileChangeOperation) *RunItemFileChangeOperation {
	return &operation
}

func runItemFileChangePaths(details *RunItemFileChangeDetails) []string {
	if details == nil {
		return nil
	}
	paths := make([]string, 0, len(details.Paths))
	for _, path := range details.Paths {
		paths = append(paths, path.Path)
	}
	return paths
}

func runItemFileChangeTitle(details *RunItemFileChangeDetails) string {
	if details == nil || len(details.Paths) == 0 {
		return "file change"
	}
	if len(details.Paths) == 1 {
		path := details.Paths[0]
		action := "Changed"
		if path.Operation != nil {
			action = runItemFileChangeOperationVerb(*path.Operation)
		}
		return fmt.Sprintf("%s %s", action, filepath.Base(path.Path))
	}
	action := "Changed"
	if operation, ok := commonRunItemFileChangeOperation(details.Paths); ok {
		action = runItemFileChangeOperationVerb(operation)
	}
	return fmt.Sprintf("%s %d files", action, len(details.Paths))
}

func runItemFileChangeOperationVerb(operation RunItemFileChangeOperation) string {
	switch operation {
	case RunItemFileChangeOperationAdd:
		return "Added"
	case RunItemFileChangeOperationDelete:
		return "Deleted"
	case RunItemFileChangeOperationUpdate:
		return "Updated"
	default:
		return "Changed"
	}
}

func commonRunItemFileChangeOperation(paths []RunItemFileChangePath) (RunItemFileChangeOperation, bool) {
	if len(paths) == 0 || paths[0].Operation == nil {
		return "", false
	}
	operation := *paths[0].Operation
	for _, path := range paths[1:] {
		if path.Operation == nil || *path.Operation != operation {
			return "", false
		}
	}
	return operation, true
}

func runItemFileChangePatchStats(patch string) (int, int) {
	additions := 0
	deletions := 0
	for _, line := range strings.Split(patch, "\n") {
		if strings.HasPrefix(line, "+++") || strings.HasPrefix(line, "---") {
			continue
		}
		if strings.HasPrefix(line, "+") {
			additions++
		} else if strings.HasPrefix(line, "-") {
			deletions++
		}
	}
	return additions, deletions
}

func boundedRunItemFileChangePatch(patch string) (string, bool) {
	if len(patch) <= runItemFileChangePatchLimit {
		return patch, false
	}
	runes := []rune(patch)
	if len(runes) <= runItemFileChangePatchLimit {
		return patch, false
	}
	return string(runes[:runItemFileChangePatchLimit]), true
}
