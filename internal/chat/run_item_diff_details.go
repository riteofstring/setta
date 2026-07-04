package chat

import (
	"fmt"
	"strings"
)

func newRunItemDiffDetails(patch string) *RunItemDetails {
	paths := runItemDiffPathsFromPatch(patch)
	additions, deletions := runItemDiffPatchStats(patch)
	boundedPatch, truncated := boundedRunItemDiffPatch(patch)
	return NewRunItemDiffDetails(RunItemDiffDetails{
		Summary:        runItemDiffSummary(len(paths), additions, deletions),
		Paths:          paths,
		Additions:      additions,
		Deletions:      deletions,
		Patch:          boundedPatch,
		PatchTruncated: truncated,
	})
}

func cloneRunItemDiffDetails(details RunItemDiffDetails) RunItemDiffDetails {
	details.Paths = cloneRunItemDiffPaths(details.Paths)
	return details
}

func cloneRunItemDiffPaths(paths []RunItemDiffPath) []RunItemDiffPath {
	if paths == nil {
		return nil
	}
	cloned := make([]RunItemDiffPath, 0, len(paths))
	for _, path := range paths {
		path.Operation = cloneRunItemFileChangeOperation(path.Operation)
		cloned = append(cloned, path)
	}
	return cloned
}

func runItemDiffPaths(details *RunItemDiffDetails) []string {
	if details == nil {
		return nil
	}
	paths := make([]string, 0, len(details.Paths))
	for _, path := range details.Paths {
		paths = append(paths, path.Path)
	}
	return paths
}

func runItemDiffTitle(details *RunItemDiffDetails) string {
	if details == nil || details.Summary == "" {
		return "Diff updated"
	}
	return "Diff updated: " + details.Summary
}

func runItemDiffSummary(pathCount int, additions int, deletions int) string {
	parts := []string{}
	if pathCount == 1 {
		parts = append(parts, "1 file")
	} else if pathCount > 1 {
		parts = append(parts, fmt.Sprintf("%d files", pathCount))
	}
	if additions != 0 || deletions != 0 {
		parts = append(parts, fmt.Sprintf("+%d -%d", additions, deletions))
	}
	return strings.Join(parts, ", ")
}

func runItemDiffPatchStats(patch string) (int, int) {
	return runItemFileChangePatchStats(patch)
}

func boundedRunItemDiffPatch(patch string) (string, bool) {
	return boundedRunItemFileChangePatch(patch)
}

type runItemDiffPathAccumulator struct {
	oldPath   string
	newPath   string
	additions int
	deletions int
	hasHeader bool
}

func runItemDiffPathsFromPatch(patch string) []RunItemDiffPath {
	paths := []RunItemDiffPath{}
	var current *runItemDiffPathAccumulator
	flush := func() {
		if current == nil {
			return
		}
		if path, ok := current.path(); ok {
			paths = append(paths, path)
		}
		current = nil
	}

	lines := strings.Split(patch, "\n")
	for index := 0; index < len(lines); {
		if oldPath, newPath, ok := parseRunItemDiffGitLine(lines[index]); ok {
			flush()
			current = &runItemDiffPathAccumulator{oldPath: oldPath, newPath: newPath}
			index++
			continue
		}
		if oldPath, newPath, ok := runItemDiffHeaderPair(lines, index); ok {
			if current == nil || current.hasHeader {
				flush()
				current = &runItemDiffPathAccumulator{}
			}
			current.oldPath = oldPath
			current.newPath = newPath
			current.hasHeader = true
			index += 2
			continue
		}
		if current != nil {
			current.addLine(lines[index])
		}
		index++
	}
	flush()
	return paths
}

func parseRunItemDiffGitLine(line string) (string, string, bool) {
	if !strings.HasPrefix(line, "diff --git ") {
		return "", "", false
	}
	fields := strings.Fields(strings.TrimPrefix(line, "diff --git "))
	if len(fields) < 2 {
		return "", "", true
	}
	return normalizeRunItemDiffPath(fields[0]), normalizeRunItemDiffPath(fields[1]), true
}

func runItemDiffHeaderPair(lines []string, index int) (string, string, bool) {
	if index+1 >= len(lines) || !strings.HasPrefix(lines[index], "--- ") || !strings.HasPrefix(lines[index+1], "+++ ") {
		return "", "", false
	}
	return normalizeRunItemDiffPath(parseRunItemDiffHeaderPath(lines[index][4:])),
		normalizeRunItemDiffPath(parseRunItemDiffHeaderPath(lines[index+1][4:])),
		true
}

func parseRunItemDiffHeaderPath(value string) string {
	value = strings.TrimSpace(value)
	if before, _, ok := strings.Cut(value, "\t"); ok {
		value = before
	}
	return value
}

func normalizeRunItemDiffPath(path string) string {
	path = strings.TrimSpace(path)
	if path == "/dev/null" {
		return path
	}
	if strings.HasPrefix(path, "a/") || strings.HasPrefix(path, "b/") {
		return path[2:]
	}
	return path
}

func (accumulator *runItemDiffPathAccumulator) addLine(line string) {
	if strings.HasPrefix(line, "+") {
		accumulator.additions++
	} else if strings.HasPrefix(line, "-") {
		accumulator.deletions++
	}
}

func (accumulator runItemDiffPathAccumulator) path() (RunItemDiffPath, bool) {
	path := accumulator.effectivePath()
	if !presentRunItemDiffPath(path) {
		return RunItemDiffPath{}, false
	}
	operation := accumulator.operation()
	return RunItemDiffPath{
		Path:      path,
		Operation: &operation,
		MovePath:  accumulator.movePath(),
		Additions: accumulator.additions,
		Deletions: accumulator.deletions,
	}, true
}

func (accumulator runItemDiffPathAccumulator) effectivePath() string {
	if presentRunItemDiffPath(accumulator.newPath) {
		return accumulator.newPath
	}
	return accumulator.oldPath
}

func (accumulator runItemDiffPathAccumulator) operation() RunItemFileChangeOperation {
	if accumulator.oldPath == "/dev/null" {
		return RunItemFileChangeOperationAdd
	}
	if accumulator.newPath == "/dev/null" {
		return RunItemFileChangeOperationDelete
	}
	return RunItemFileChangeOperationUpdate
}

func (accumulator runItemDiffPathAccumulator) movePath() string {
	if !presentRunItemDiffPath(accumulator.oldPath) || !presentRunItemDiffPath(accumulator.newPath) {
		return ""
	}
	if accumulator.oldPath == accumulator.newPath {
		return ""
	}
	return accumulator.oldPath
}

func presentRunItemDiffPath(path string) bool {
	return path != "" && path != "/dev/null"
}
