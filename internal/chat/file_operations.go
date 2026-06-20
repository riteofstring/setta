package chat

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/codexapp"
)

type unifiedDiffStats struct {
	ChangedFiles int
	Additions    int
	Deletions    int
}

func runItemFileOperationsFromCodexChanges(changes []codexapp.FileUpdateChange) ([]string, []RunItemFileOp, RunItemDiffStats, error) {
	paths := make([]string, 0, len(changes))
	operations := make([]RunItemFileOp, 0, len(changes))
	total := unifiedDiffStats{ChangedFiles: len(changes)}
	for _, change := range changes {
		if change.Path == "" {
			return nil, nil, RunItemDiffStats{}, errors.New("codex file change path is required")
		}
		operation, err := runItemFileOperationFromPatchKind(change.Kind)
		if err != nil {
			return nil, nil, RunItemDiffStats{}, err
		}
		stats := countUnifiedDiffStats(change.Diff)
		total.Additions += stats.Additions
		total.Deletions += stats.Deletions
		paths = append(paths, change.Path)
		operations = append(operations, RunItemFileOp{
			Path:         change.Path,
			Operation:    operation,
			Additions:    stats.Additions,
			Deletions:    stats.Deletions,
			ChangedFiles: len(changes),
		})
	}
	return uniqueStrings(paths), operations, runItemDiffStatsFromUnifiedStats(total), nil
}

func runItemFileOperationsFromUnifiedDiff(diff string) ([]string, []RunItemFileOp, RunItemDiffStats) {
	stats := countUnifiedDiffStats(diff)
	paths := unifiedDiffPaths(diff)
	stats.ChangedFiles = len(paths)
	operations := make([]RunItemFileOp, 0, len(paths))
	for _, path := range paths {
		operations = append(operations, RunItemFileOp{
			Path:         path,
			Operation:    RunItemFileOperationDiff,
			Additions:    stats.Additions,
			Deletions:    stats.Deletions,
			ChangedFiles: len(paths),
		})
	}
	return paths, operations, runItemDiffStatsFromUnifiedStats(stats)
}

func runItemFileOperationFromPatchKind(raw json.RawMessage) (RunItemFileOperation, error) {
	var kind struct {
		Type     string  `json:"type"`
		MovePath *string `json:"move_path"`
	}
	if err := json.Unmarshal(raw, &kind); err != nil {
		return "", fmt.Errorf("decode codex file change kind: %w", err)
	}
	switch kind.Type {
	case "add":
		return RunItemFileOperationCreate, nil
	case "delete":
		return RunItemFileOperationDelete, nil
	case "update":
		if kind.MovePath != nil && *kind.MovePath != "" {
			return RunItemFileOperationRename, nil
		}
		return RunItemFileOperationWrite, nil
	default:
		return "", fmt.Errorf("unsupported codex file change kind: %s", kind.Type)
	}
}

func countUnifiedDiffStats(diff string) unifiedDiffStats {
	stats := unifiedDiffStats{}
	for _, line := range strings.Split(diff, "\n") {
		switch {
		case strings.HasPrefix(line, "+++") || strings.HasPrefix(line, "---"):
			continue
		case strings.HasPrefix(line, "+"):
			stats.Additions++
		case strings.HasPrefix(line, "-"):
			stats.Deletions++
		}
	}
	return stats
}

func unifiedDiffPaths(diff string) []string {
	paths := []string{}
	for _, line := range strings.Split(diff, "\n") {
		if !strings.HasPrefix(line, "+++ ") {
			continue
		}
		path := strings.TrimSpace(strings.TrimPrefix(line, "+++ "))
		if path == "" || path == "/dev/null" {
			continue
		}
		paths = append(paths, stripUnifiedDiffPrefix(path))
	}
	return uniqueStrings(paths)
}

func stripUnifiedDiffPrefix(path string) string {
	switch {
	case strings.HasPrefix(path, "a/"):
		return strings.TrimPrefix(path, "a/")
	case strings.HasPrefix(path, "b/"):
		return strings.TrimPrefix(path, "b/")
	default:
		return path
	}
}

func runItemDiffStatsFromUnifiedStats(stats unifiedDiffStats) RunItemDiffStats {
	return RunItemDiffStats{
		Summary:      structuredDiffSummary(stats.ChangedFiles, stats.Additions, stats.Deletions),
		ChangedFiles: stats.ChangedFiles,
		Additions:    stats.Additions,
		Deletions:    stats.Deletions,
		Structured:   true,
	}
}

func structuredDiffSummary(changedFiles int, additions int, deletions int) string {
	parts := []string{}
	if changedFiles > 0 {
		parts = append(parts, fmt.Sprintf("%d %s changed", changedFiles, plural(changedFiles, "file", "files")))
	}
	if additions > 0 {
		parts = append(parts, fmt.Sprintf("%d %s(+)", additions, plural(additions, "insertion", "insertions")))
	}
	if deletions > 0 {
		parts = append(parts, fmt.Sprintf("%d %s(-)", deletions, plural(deletions, "deletion", "deletions")))
	}
	if len(parts) == 0 {
		return "No line changes"
	}
	return strings.Join(parts, ", ")
}

func plural(count int, single string, multiple string) string {
	if count == 1 {
		return single
	}
	return multiple
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func runItemFileOperationFromAgentToolCall(call AgentToolCall, tool AgentTool, registered bool) ([]RunItemFileOp, RunItemDiffStats, error) {
	if !registered || tool.FileOperation == nil {
		return nil, RunItemDiffStats{}, nil
	}
	arguments, err := decodeToolArguments(call.Arguments, call.Tool)
	if err != nil {
		return nil, RunItemDiffStats{}, err
	}
	metadata := *tool.FileOperation
	operation, err := runItemFileOperationFromToolArguments(arguments, metadata, call.Tool)
	if err != nil {
		return nil, RunItemDiffStats{}, err
	}
	return []RunItemFileOp{operation}, runItemDiffStatsFromOperation(operation), nil
}

func runItemFileOperationFromToolArguments(arguments map[string]json.RawMessage, metadata AgentToolFileOperation, toolName string) (RunItemFileOp, error) {
	path, err := stringToolArgument(arguments, metadata.PathArgument, toolName)
	if err != nil {
		return RunItemFileOp{}, err
	}
	operation := RunItemFileOp{
		Path:      path,
		Operation: metadata.Operation,
	}
	if err := applyOptionalToolLineRange(arguments, metadata, toolName, &operation); err != nil {
		return RunItemFileOp{}, err
	}
	if err := applyOptionalToolDiffStats(arguments, metadata, toolName, &operation); err != nil {
		return RunItemFileOp{}, err
	}
	if err := applyOptionalToolContentHash(arguments, metadata, toolName, &operation); err != nil {
		return RunItemFileOp{}, err
	}
	return operation, nil
}

func applyOptionalToolContentHash(arguments map[string]json.RawMessage, metadata AgentToolFileOperation, toolName string, operation *RunItemFileOp) error {
	if metadata.ContentHashArgument == "" {
		return nil
	}
	hash, ok, err := optionalStringToolArgument(arguments, metadata.ContentHashArgument, toolName)
	if err != nil {
		return err
	}
	if ok {
		operation.ContentHash = hash
	}
	return nil
}

func runItemDiffStatsFromOperation(operation RunItemFileOp) RunItemDiffStats {
	if operation.Additions == 0 && operation.Deletions == 0 && operation.ChangedFiles == 0 {
		return RunItemDiffStats{}
	}
	changedFiles := operation.ChangedFiles
	if changedFiles == 0 {
		changedFiles = 1
	}
	return RunItemDiffStats{
		Summary:      structuredDiffSummary(changedFiles, operation.Additions, operation.Deletions),
		ChangedFiles: changedFiles,
		Additions:    operation.Additions,
		Deletions:    operation.Deletions,
		Structured:   true,
	}
}

func decodeToolArguments(raw json.RawMessage, toolName string) (map[string]json.RawMessage, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("%s arguments are required for file operation extraction", toolName)
	}
	var arguments map[string]json.RawMessage
	if err := json.Unmarshal(raw, &arguments); err != nil {
		return nil, fmt.Errorf("%s arguments must be a JSON object for file operation extraction: %w", toolName, err)
	}
	if arguments == nil {
		return nil, fmt.Errorf("%s arguments must be a JSON object for file operation extraction", toolName)
	}
	return arguments, nil
}

func applyOptionalToolLineRange(arguments map[string]json.RawMessage, metadata AgentToolFileOperation, toolName string, operation *RunItemFileOp) error {
	if metadata.RangeStartArgument == "" && metadata.RangeEndArgument == "" {
		return nil
	}
	start, startOK, err := optionalIntToolArgument(arguments, metadata.RangeStartArgument, toolName)
	if err != nil {
		return err
	}
	end, endOK, err := optionalIntToolArgument(arguments, metadata.RangeEndArgument, toolName)
	if err != nil {
		return err
	}
	if startOK != endOK {
		return fmt.Errorf("%s file operation line range requires both %s and %s arguments", toolName, metadata.RangeStartArgument, metadata.RangeEndArgument)
	}
	if startOK {
		operation.RangeStart = start
		operation.RangeEnd = end
	}
	return nil
}

func applyOptionalToolDiffStats(arguments map[string]json.RawMessage, metadata AgentToolFileOperation, toolName string, operation *RunItemFileOp) error {
	for _, target := range []struct {
		name  string
		value *int
	}{
		{name: metadata.AdditionsArgument, value: &operation.Additions},
		{name: metadata.DeletionsArgument, value: &operation.Deletions},
		{name: metadata.ChangedFilesArgument, value: &operation.ChangedFiles},
	} {
		if target.name == "" {
			continue
		}
		value, ok, err := optionalIntToolArgument(arguments, target.name, toolName)
		if err != nil {
			return err
		}
		if ok {
			*target.value = value
		}
	}
	return nil
}

func stringToolArgument(arguments map[string]json.RawMessage, name string, toolName string) (string, error) {
	value, ok, err := optionalStringToolArgument(arguments, name, toolName)
	if err != nil {
		return "", err
	}
	if !ok || value == "" {
		return "", fmt.Errorf("%s file operation argument %s is required", toolName, name)
	}
	return value, nil
}

func optionalStringToolArgument(arguments map[string]json.RawMessage, name string, toolName string) (string, bool, error) {
	raw, ok := arguments[name]
	if !ok || string(raw) == "null" {
		return "", false, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", false, fmt.Errorf("%s file operation argument %s must be a string: %w", toolName, name, err)
	}
	return value, true, nil
}

func optionalIntToolArgument(arguments map[string]json.RawMessage, name string, toolName string) (int, bool, error) {
	raw, ok := arguments[name]
	if !ok || string(raw) == "null" {
		return 0, false, nil
	}
	var value int
	if err := json.Unmarshal(raw, &value); err != nil {
		return 0, false, fmt.Errorf("%s file operation argument %s must be an integer: %w", toolName, name, err)
	}
	return value, true, nil
}
