package deployments

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"setta/internal/projectstate"
)

func validateJSONValue(value any, path string) error {
	switch typed := value.(type) {
	case map[string]any:
		for key, item := range typed {
			if strings.TrimSpace(key) == "" && key != "" {
				return fmt.Errorf("%w: %s", ErrStructuredDataRootObjectRequired, path)
			}
			if err := validateJSONValue(item, path+"."+key); err != nil {
				return err
			}
		}
	case []any:
		for index, item := range typed {
			if err := validateJSONValue(item, fmt.Sprintf("%s[%d]", path, index)); err != nil {
				return err
			}
		}
	case nil, string, bool, float64, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
	default:
		return fmt.Errorf("%w: %s (%T)", ErrStructuredDataRootObjectRequired, path, value)
	}
	return nil
}

func stripPasswordValues(document *projectstate.Document) error {
	projectIDs := make([]string, 0, len(document.Projects))
	for projectID := range document.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	for _, projectID := range projectIDs {
		project := document.Projects[projectID]
		for implID, impl := range project.CodeObjImpls {
			if strings.TrimSpace(impl.Type) != "PasswordParam" {
				continue
			}
			payload := map[string]any{
				"id":   impl.ID,
				"type": impl.Type,
			}
			if len(impl.Payload) > 0 {
				if err := json.Unmarshal(impl.Payload, &payload); err != nil {
					return err
				}
			}
			payload["value"] = ""
			payload["defaultVal"] = ""
			payload["hasSecret"] = false
			raw, err := json.Marshal(payload)
			if err != nil {
				return err
			}
			impl.Payload = raw
			project.CodeObjImpls[implID] = impl
		}
		document.Projects[projectID] = project
	}

	return nil
}

func objectField(object map[string]any, key string) (map[string]any, bool) {
	value, ok := object[key]
	if !ok {
		return nil, false
	}
	typed, ok := value.(map[string]any)
	return typed, ok
}

func stringField(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok {
		return ""
	}
	typed, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(typed)
}

func rawStringField(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok {
		return ""
	}
	typed, ok := value.(string)
	if !ok {
		return ""
	}
	return typed
}

func boolField(object map[string]any, key string) bool {
	value, ok := object[key]
	if !ok {
		return false
	}
	typed, ok := value.(bool)
	return ok && typed
}

func stringSliceField(object map[string]any, key string) []string {
	value, ok := object[key]
	if !ok {
		return nil
	}
	rawValues, ok := value.([]any)
	if !ok {
		return nil
	}
	values := make([]string, 0, len(rawValues))
	for _, rawValue := range rawValues {
		typed, ok := rawValue.(string)
		if !ok {
			continue
		}
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			continue
		}
		values = append(values, trimmed)
	}
	return values
}

func stringMapField(object map[string]any, key string) map[string]string {
	value, ok := object[key]
	if !ok {
		return map[string]string{}
	}
	rawMap, ok := value.(map[string]any)
	if !ok {
		return map[string]string{}
	}
	output := make(map[string]string, len(rawMap))
	for rawKey, rawValue := range rawMap {
		typed, ok := rawValue.(string)
		if !ok {
			continue
		}
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			continue
		}
		output[rawKey] = trimmed
	}
	return output
}

func addKeyPath(root map[string]any, keyPath []string) {
	current := root
	for _, key := range keyPath {
		next, ok := current[key].(map[string]any)
		if !ok {
			next = map[string]any{}
			current[key] = next
		}
		current = next
	}
}

func setKeyPathValue(root map[string]any, keyPath []string, value any) {
	if len(keyPath) == 0 {
		return
	}
	current := root
	for _, key := range keyPath[:len(keyPath)-1] {
		next, ok := current[key].(map[string]any)
		if !ok {
			next = map[string]any{}
			current[key] = next
		}
		current = next
	}
	current[keyPath[len(keyPath)-1]] = cloneJSONValue(value)
}

func tryJSONValue(raw string) any {
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return raw
	}
	return value
}

func mergeJSONObject(base map[string]any, overlay map[string]any) map[string]any {
	if base == nil {
		return cloneJSONObject(overlay)
	}
	merged := cloneJSONObject(base)
	for key, value := range overlay {
		if baseObject, ok := merged[key].(map[string]any); ok {
			if overlayObject, ok := value.(map[string]any); ok {
				merged[key] = mergeJSONObject(baseObject, overlayObject)
				continue
			}
		}
		merged[key] = cloneJSONValue(value)
	}
	return merged
}

func cloneJSONObject(source map[string]any) map[string]any {
	if source == nil {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = cloneJSONValue(value)
	}
	return cloned
}

func cloneJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneJSONObject(typed)
	case []any:
		cloned := make([]any, len(typed))
		for index, entry := range typed {
			cloned[index] = cloneJSONValue(entry)
		}
		return cloned
	default:
		return typed
	}
}

func mustParseDeploymentVersion(value string) int {
	number, _ := parseDeploymentVersion(value)
	return number
}
