package lsp

import (
	"path/filepath"
	"strings"
)

func BuildBasedpyrightSettingsRoot(document map[string]any, extraPaths []string) map[string]any {
	branch := cloneLanguageServerSettingsMap(basedpyrightSettingsBranch(document))
	mergedExtraPaths := mergeBasedpyrightExtraPaths(branch, extraPaths)
	if len(mergedExtraPaths) == 0 {
		if len(branch) == 0 {
			return nil
		}
		return map[string]any{"basedpyright": branch}
	}

	if branch == nil {
		branch = map[string]any{}
	}
	analysis := ensureNestedSettingsMap(branch, []string{"analysis"})
	analysis["extraPaths"] = stringSliceToSettingsArray(mergedExtraPaths)
	return map[string]any{"basedpyright": branch}
}

func basedpyrightSettingsBranch(document map[string]any) map[string]any {
	if document == nil {
		return nil
	}
	if direct, ok := document["basedpyright"].(map[string]any); ok {
		return direct
	}
	return nestedSettingsMap(document, []string{"languageServer", "basedpyright"})
}

func mergeBasedpyrightExtraPaths(branch map[string]any, extraPaths []string) []string {
	merged := append([]string(nil), readBasedpyrightExtraPaths(branch)...)
	seen := make(map[string]struct{}, len(merged))
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

func readBasedpyrightExtraPaths(branch map[string]any) []string {
	analysis := nestedSettingsMap(branch, []string{"analysis"})
	if analysis == nil {
		return nil
	}
	return normalizeLanguageServerPaths(analysis["extraPaths"])
}

func nestedSettingsMap(settings map[string]any, segments []string) map[string]any {
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

func ensureNestedSettingsMap(settings map[string]any, segments []string) map[string]any {
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

func stringSliceToSettingsArray(values []string) []any {
	if len(values) == 0 {
		return nil
	}
	out := make([]any, len(values))
	for index, value := range values {
		out[index] = value
	}
	return out
}
