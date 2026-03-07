package mcpx

import (
	"strings"

	"setta/internal/tools"
)

func extractIDsByType(payload map[string]any, pathsByType map[tools.IDType][]string, allowDictKeys bool) map[tools.IDType]map[string]struct{} {
	if len(pathsByType) == 0 || payload == nil {
		return map[tools.IDType]map[string]struct{}{}
	}

	idsByType := make(map[tools.IDType]map[string]struct{}, len(pathsByType))
	for idType, paths := range pathsByType {
		for _, path := range paths {
			values := selectValuesByPath(payload, path)
			for _, value := range values {
				ids := coerceIDList(value)
				if ids == nil && allowDictKeys {
					if rawMap, ok := value.(map[string]any); ok {
						keys := make([]string, 0, len(rawMap))
						for key := range rawMap {
							keys = append(keys, key)
						}
						ids = coerceIDList(keys)
					}
				}
				if ids == nil {
					continue
				}
				targets := idsByType[idType]
				if targets == nil {
					targets = map[string]struct{}{}
					idsByType[idType] = targets
				}
				for _, id := range ids {
					targets[id] = struct{}{}
				}
			}
		}
	}
	return idsByType
}

func selectValuesByPath(payload any, path string) []any {
	if path == "$" {
		return []any{payload}
	}

	segments := pathSegments(path)
	current := []any{payload}
	for _, segment := range segments {
		nextValues := make([]any, 0, len(current))
		for _, item := range current {
			object, ok := item.(map[string]any)
			if !ok {
				continue
			}
			value, ok := object[segment]
			if !ok {
				continue
			}
			nextValues = append(nextValues, value)
		}
		current = nextValues
		if len(current) == 0 {
			break
		}
	}
	return current
}

func translateIDsAtPaths(payload map[string]any, paths []string, transform func(string) (string, error)) error {
	if payload == nil {
		return nil
	}
	for _, path := range paths {
		if _, err := rewriteIDsAtPath(payload, pathSegments(path), transform); err != nil {
			return err
		}
	}
	return nil
}

func rewriteIDsAtPath(current any, segments []string, transform func(string) (string, error)) (any, error) {
	if len(segments) == 0 {
		return rewriteIDCarrier(current, transform)
	}

	object, ok := current.(map[string]any)
	if !ok {
		return current, nil
	}
	child, ok := object[segments[0]]
	if !ok {
		return current, nil
	}
	rewritten, err := rewriteIDsAtPath(child, segments[1:], transform)
	if err != nil {
		return nil, err
	}
	object[segments[0]] = rewritten
	return current, nil
}

func rewriteIDCarrier(value any, transform func(string) (string, error)) (any, error) {
	switch typed := value.(type) {
	case string:
		return transform(typed)
	case []string:
		rewritten := make([]string, len(typed))
		for index, entry := range typed {
			next, err := transform(entry)
			if err != nil {
				return nil, err
			}
			rewritten[index] = next
		}
		return rewritten, nil
	case []any:
		rewritten := make([]any, len(typed))
		copy(rewritten, typed)
		for index, entry := range rewritten {
			rawString, ok := entry.(string)
			if !ok {
				continue
			}
			next, err := transform(rawString)
			if err != nil {
				return nil, err
			}
			rewritten[index] = next
		}
		return rewritten, nil
	default:
		return value, nil
	}
}

func coerceIDList(value any) []string {
	switch typed := value.(type) {
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return []string{}
		}
		return []string{trimmed}
	case []string:
		ids := make([]string, 0, len(typed))
		for _, entry := range typed {
			trimmed := strings.TrimSpace(entry)
			if trimmed == "" {
				continue
			}
			ids = append(ids, trimmed)
		}
		return ids
	case []any:
		ids := make([]string, 0, len(typed))
		for _, entry := range typed {
			rawString, ok := entry.(string)
			if !ok {
				continue
			}
			trimmed := strings.TrimSpace(rawString)
			if trimmed == "" {
				continue
			}
			ids = append(ids, trimmed)
		}
		return ids
	default:
		return nil
	}
}

func pathSegments(path string) []string {
	if path == "$" {
		return nil
	}
	rawSegments := strings.Split(path, ".")
	segments := make([]string, 0, len(rawSegments))
	for _, segment := range rawSegments {
		trimmed := strings.TrimSpace(segment)
		if trimmed == "" {
			continue
		}
		segments = append(segments, trimmed)
	}
	return segments
}
