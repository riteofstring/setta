package mcpx

import (
	"strings"

	"setta/internal/tools"
)

func ExtractIDsByType(payload any, pathsByType map[tools.IDType][]string, allowDictKeys bool) map[tools.IDType]map[string]struct{} {
	if len(pathsByType) == 0 || payload == nil {
		return map[tools.IDType]map[string]struct{}{}
	}

	idsByType := make(map[tools.IDType]map[string]struct{}, len(pathsByType))
	for idType, paths := range pathsByType {
		targets := collectIDsAtPaths(payload, paths, allowDictKeys)
		if targets != nil {
			idsByType[idType] = targets
		}
	}
	return idsByType
}

func extractIDsByType(payload any, pathsByType map[tools.IDType][]string, allowDictKeys bool) map[tools.IDType]map[string]struct{} {
	return ExtractIDsByType(payload, pathsByType, allowDictKeys)
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
			nextValues = append(nextValues, selectSegmentValues(item, segment)...)
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
	_, err := rewriteIDsAtPaths(payload, paths, transform)
	return err
}

func rewriteIDsAtPaths(payload any, paths []string, transform func(string) (string, error)) (any, error) {
	current := payload
	for _, path := range paths {
		rewritten, err := rewriteIDsAtPath(current, pathSegments(path), transform)
		if err != nil {
			return nil, err
		}
		current = rewritten
	}
	return current, nil
}

func rewriteIDsAtPath(current any, segments []string, transform func(string) (string, error)) (any, error) {
	if len(segments) == 0 {
		return rewriteIDCarrier(current, transform)
	}

	switch typed := current.(type) {
	case map[string]any:
		child, ok := typed[segments[0]]
		if !ok {
			return current, nil
		}
		rewritten, err := rewriteIDsAtPath(child, segments[1:], transform)
		if err != nil {
			return nil, err
		}
		typed[segments[0]] = rewritten
		return current, nil
	case []any:
		for index, entry := range typed {
			rewritten, err := rewriteIDsAtPath(entry, segments, transform)
			if err != nil {
				return nil, err
			}
			typed[index] = rewritten
		}
		return current, nil
	default:
		return current, nil
	}
}

func rewriteIDCarrier(value any, transform func(string) (string, error)) (any, error) {
	switch typed := value.(type) {
	case string:
		return transform(typed)
	case map[string]any:
		return rewriteIDCarrierMap(typed, transform)
	case []string:
		return rewriteStringCarrier(typed, transform)
	case []any:
		return rewriteAnyStringCarrier(typed, transform)
	default:
		return value, nil
	}
}

func collectIDsAtPaths(payload any, paths []string, allowDictKeys bool) map[string]struct{} {
	var targets map[string]struct{}
	for _, path := range paths {
		targets = addIDsFromValues(targets, selectValuesByPath(payload, path), allowDictKeys)
	}
	return targets
}

func addIDsFromValues(targets map[string]struct{}, values []any, allowDictKeys bool) map[string]struct{} {
	for _, value := range values {
		ids := idListFromValue(value, allowDictKeys)
		if ids == nil {
			continue
		}
		targets = ensureIDSet(targets)
		addIDs(targets, ids)
	}
	return targets
}

func idListFromValue(value any, allowDictKeys bool) []string {
	ids := coerceIDList(value)
	if ids != nil || !allowDictKeys {
		return ids
	}
	rawMap, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	return coerceIDList(mapKeys(rawMap))
}

func mapKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}

func ensureIDSet(targets map[string]struct{}) map[string]struct{} {
	if targets != nil {
		return targets
	}
	return map[string]struct{}{}
}

func addIDs(targets map[string]struct{}, ids []string) {
	for _, id := range ids {
		targets[id] = struct{}{}
	}
}

func rewriteIDCarrierMap(values map[string]any, transform func(string) (string, error)) (map[string]any, error) {
	rewritten := make(map[string]any, len(values))
	for key, entry := range values {
		nextKey, err := transform(key)
		if err != nil {
			return nil, err
		}
		if err := ensureUniqueRewrittenKey(rewritten, key, nextKey); err != nil {
			return nil, err
		}
		rewritten[nextKey] = entry
	}
	return rewritten, nil
}

func ensureUniqueRewrittenKey(rewritten map[string]any, originalKey, nextKey string) error {
	if _, exists := rewritten[nextKey]; exists && nextKey != originalKey {
		return newToolError("invalid_arguments", "rewriting id carrier produced duplicate key %q", nextKey)
	}
	return nil
}

func rewriteStringCarrier(values []string, transform func(string) (string, error)) ([]string, error) {
	rewritten := make([]string, len(values))
	for index, entry := range values {
		next, err := transform(entry)
		if err != nil {
			return nil, err
		}
		rewritten[index] = next
	}
	return rewritten, nil
}

func rewriteAnyStringCarrier(values []any, transform func(string) (string, error)) ([]any, error) {
	rewritten := make([]any, len(values))
	copy(rewritten, values)
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

func selectSegmentValues(value any, segment string) []any {
	switch typed := value.(type) {
	case map[string]any:
		next, ok := typed[segment]
		if !ok {
			return nil
		}
		return []any{next}
	case []any:
		values := make([]any, 0, len(typed))
		for _, entry := range typed {
			values = append(values, selectSegmentValues(entry, segment)...)
		}
		return values
	default:
		return nil
	}
}
