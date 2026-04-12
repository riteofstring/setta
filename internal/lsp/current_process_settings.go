package lsp

import (
	"path/filepath"
	"strings"
)

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
