package lsp

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"

	"setta/internal/pythonenv"
	"setta/internal/statefs"
)

const (
	lspCommandEnv = "SETTA_LSP_COMMAND"
	lspArgsEnv    = "SETTA_LSP_ARGS"
)

const basedpyrightEntrypoint = "from basedpyright.langserver import main; main()"

func resolveCurrentProcessCommand(lookupEnv func(string) (string, bool)) (string, []string, error) {
	if explicitCommand, ok := lookupEnv(lspCommandEnv); ok && strings.TrimSpace(explicitCommand) != "" {
		command, err := resolveCurrentProcessBinary(strings.TrimSpace(explicitCommand))
		if err != nil {
			return "", nil, err
		}
		args := []string{}
		if rawArgs, ok := lookupEnv(lspArgsEnv); ok && strings.TrimSpace(rawArgs) != "" {
			args = strings.Fields(strings.TrimSpace(rawArgs))
		}
		return command, args, nil
	}

	pythonBinary, err := pythonenv.ResolveCurrentProcessInterpreter(lookupEnv)
	if err != nil {
		return "", nil, err
	}
	return pythonBinary, []string{"-c", basedpyrightEntrypoint, "--stdio"}, nil
}

func resolveCurrentProcessBinary(candidate string) (string, error) {
	if strings.Contains(candidate, string(filepath.Separator)) {
		return statefs.NormalizePath(candidate, "")
	}
	resolved, err := exec.LookPath(candidate)
	if err != nil {
		return "", fmt.Errorf("lsp: resolve command %q: %w", candidate, err)
	}
	return resolved, nil
}

func CurrentProcessPythonSettings(settings map[string]any, extraPaths []string) map[string]any {
	branch := cloneLanguageServerSettingsMap(currentProcessPythonSettingsBranch(settings))
	mergedExtraPaths := mergeCurrentProcessPythonExtraPaths(branch, extraPaths)
	if len(mergedExtraPaths) == 0 {
		if len(branch) == 0 {
			return nil
		}
		return map[string]any{"basedpyright": branch}
	}

	if branch == nil {
		branch = map[string]any{}
	}
	analysis := ensureLanguageServerSettingsMap(branch, []string{"analysis"})
	analysis["extraPaths"] = stringSliceToAnySlice(mergedExtraPaths)
	return map[string]any{"basedpyright": branch}
}

func currentProcessPythonSettingsBranch(settings map[string]any) map[string]any {
	if settings == nil {
		return nil
	}
	if direct, ok := settings["basedpyright"].(map[string]any); ok {
		return direct
	}
	return nestedLanguageServerSettingsMap(settings, []string{"languageServer", "basedpyright"})
}

func mergeCurrentProcessPythonExtraPaths(branch map[string]any, extraPaths []string) []string {
	merged := append([]string(nil), readCurrentProcessPythonExtraPaths(branch)...)
	seen := map[string]struct{}{}
	for _, path := range merged {
		seen[path] = struct{}{}
	}
	for _, rawPath := range extraPaths {
		normalizedPath := normalizeLanguageServerPath(rawPath)
		if normalizedPath == "" {
			continue
		}
		if _, ok := seen[normalizedPath]; ok {
			continue
		}
		merged = append(merged, normalizedPath)
		seen[normalizedPath] = struct{}{}
	}
	return merged
}

func readCurrentProcessPythonExtraPaths(branch map[string]any) []string {
	analysis := nestedLanguageServerSettingsMap(branch, []string{"analysis"})
	if analysis == nil {
		return nil
	}
	return normalizeLanguageServerPaths(analysis["extraPaths"])
}

func nestedLanguageServerSettingsMap(settings map[string]any, segments []string) map[string]any {
	current := settings
	for _, segment := range segments {
		if current == nil {
			return nil
		}
		next, ok := current[segment]
		if !ok {
			return nil
		}
		nextMap, ok := next.(map[string]any)
		if !ok {
			return nil
		}
		current = nextMap
	}
	return current
}

func ensureLanguageServerSettingsMap(settings map[string]any, segments []string) map[string]any {
	current := settings
	for _, segment := range segments {
		next, ok := current[segment]
		if !ok {
			nextMap := map[string]any{}
			current[segment] = nextMap
			current = nextMap
			continue
		}
		nextMap, ok := next.(map[string]any)
		if !ok {
			nextMap = map[string]any{}
			current[segment] = nextMap
		}
		current = nextMap
	}
	return current
}

func normalizeLanguageServerPaths(value any) []string {
	switch typed := value.(type) {
	case []any:
		paths := make([]string, 0, len(typed))
		for _, entry := range typed {
			path, ok := entry.(string)
			if !ok {
				continue
			}
			normalized := normalizeLanguageServerPath(path)
			if normalized != "" {
				paths = append(paths, normalized)
			}
		}
		return paths
	case []string:
		paths := make([]string, 0, len(typed))
		for _, entry := range typed {
			normalized := normalizeLanguageServerPath(entry)
			if normalized != "" {
				paths = append(paths, normalized)
			}
		}
		return paths
	default:
		return nil
	}
}

func normalizeLanguageServerPath(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return ""
	}
	return filepath.Clean(trimmed)
}

func stringSliceToAnySlice(values []string) []any {
	if len(values) == 0 {
		return nil
	}
	out := make([]any, len(values))
	for index, value := range values {
		out[index] = value
	}
	return out
}
