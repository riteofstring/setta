package settingsstate

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"setta/internal/projectstate"
)

func ApplySettingsProjectDocument(base Document, projectDocument projectstate.Document) (Document, error) {
	output, err := base.Normalized()
	if err != nil {
		return nil, err
	}

	project, ok, err := settingsProjectForDocument(projectDocument)
	if err != nil {
		return nil, err
	}
	if !ok {
		return output, nil
	}

	sectionIDs := make([]string, 0, len(project.SectionVariantMap))
	for sectionID := range project.SectionVariantMap {
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)

	for _, sectionID := range sectionIDs {
		variantID := strings.TrimSpace(project.SectionVariantMap[sectionID])
		if variantID == "" {
			return nil, fmt.Errorf("settings project section %q is missing an active variant", sectionID)
		}

		payload, err := project.EffectiveSectionPayload(sectionID, variantID)
		if err != nil {
			return nil, err
		}
		isJSONSource, _ := payload["isJsonSource"].(bool)
		if !isJSONSource {
			continue
		}

		jsonSourceKeys, err := stringPathField(payload, "jsonSourceKeys")
		if err != nil {
			return nil, err
		}
		codeObjVariantMap, err := stringMapField(payload, "codeObjVariantMap")
		if err != nil {
			return nil, err
		}
		topLevelParamID, ok := payload["topLevelParamId"].(string)
		if !ok || strings.TrimSpace(topLevelParamID) == "" {
			return nil, fmt.Errorf("settings project section %q is missing topLevelParamId", sectionID)
		}

		rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
		if err != nil {
			return nil, err
		}
		topLevelIDs, err := stringArrayField(rootPayload, "children")
		if err != nil {
			return nil, err
		}

		for _, topLevelID := range topLevelIDs {
			if err := applySettingsProjectCodeObjectValue(output, project, codeObjVariantMap, topLevelID, jsonSourceKeys); err != nil {
				return nil, err
			}
		}
	}

	return output.Normalized()
}

func applySettingsProjectCodeObjectValue(
	output Document,
	project projectstate.Project,
	codeObjVariantMap map[string]string,
	codeObjID string,
	namePath []string,
) error {
	payload, codeObj, _, impl, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, codeObjID)
	if err != nil {
		return err
	}

	nextPath := append(append([]string(nil), namePath...), strings.TrimSpace(codeObj.Name))
	if settingsProjectCodeObjectIsParent(payload, impl) {
		setNestedValue(output, nextPath, map[string]any{})
		children, err := stringArrayField(payload, "children")
		if err != nil {
			return err
		}
		for _, childID := range children {
			if err := applySettingsProjectCodeObjectValue(output, project, codeObjVariantMap, childID, nextPath); err != nil {
				return err
			}
		}
		return nil
	}

	nextValue := settingsProjectCodeObjectValue(payload)
	if !settingsProjectValueMatchesAllowedValues(nextPath, nextValue) {
		return nil
	}
	setNestedValue(output, nextPath, nextValue)
	return nil
}

func settingsProjectValueMatchesAllowedValues(path []string, value any) bool {
	allowedValues := allowedValuesForPath("settings." + strings.Join(path, "."))
	if len(allowedValues) == 0 {
		return true
	}
	typed, ok := value.(string)
	if !ok {
		return false
	}
	for _, allowed := range allowedValues {
		if typed == allowed {
			return true
		}
	}
	return false
}

func settingsProjectCodeObjectIsParent(payload map[string]any, impl projectstate.CodeObjectImpl) bool {
	switch strings.TrimSpace(stringFieldOrEmpty(payload, "type")) {
	case "NestedParam", "CodeCallable":
		return true
	}

	children, err := stringArrayField(payload, "children")
	if err == nil && len(children) > 0 {
		return true
	}
	return impl.Type == "NestedParam" || impl.Type == "CodeCallable"
}

func settingsProjectCodeObjectValue(payload map[string]any) any {
	rawValue, ok := payload["value"]
	if !ok {
		return nil
	}

	typedString, ok := rawValue.(string)
	if !ok {
		return cloneValue(rawValue)
	}
	if stringFieldOrEmpty(payload, "settingsValueEncoding") == "raw_string" {
		return typedString
	}

	var decoded any
	if err := json.Unmarshal([]byte(typedString), &decoded); err == nil {
		return cloneValue(decoded)
	}
	return typedString
}

func setNestedValue(root map[string]any, path []string, value any) {
	if len(path) == 0 {
		return
	}

	current := root
	for _, key := range path[:len(path)-1] {
		next, ok := current[key].(map[string]any)
		if !ok {
			next = map[string]any{}
			current[key] = next
		}
		current = next
	}
	current[path[len(path)-1]] = cloneValue(value)
}

func settingsProjectForDocument(document projectstate.Document) (projectstate.Project, bool, error) {
	if len(document.Projects) == 0 {
		return projectstate.Project{}, false, nil
	}

	if strings.TrimSpace(document.DefaultProjectID) != "" {
		project, err := document.ProjectByID(document.DefaultProjectID)
		return project, true, err
	}

	if len(document.Projects) == 1 {
		for _, project := range document.Projects {
			return project, true, nil
		}
	}

	return projectstate.Project{}, false, projectstate.ErrSettingsProjectAmbiguous
}

func stringFieldOrEmpty(object map[string]any, field string) string {
	value, ok := object[field]
	if !ok {
		return ""
	}

	typed, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(typed)
}

func stringPathField(object map[string]any, field string) ([]string, error) {
	rawValue, ok := object[field]
	if !ok {
		return nil, nil
	}

	entries, ok := rawValue.([]any)
	if !ok {
		return nil, fmt.Errorf("settings project field %q must be an array", field)
	}

	output := make([]string, 0, len(entries))
	for _, entry := range entries {
		typed, ok := entry.(string)
		if !ok {
			return nil, fmt.Errorf("settings project field %q must contain strings", field)
		}
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil, fmt.Errorf("settings project field %q must not contain blank keys", field)
		}
		output = append(output, trimmed)
	}
	return output, nil
}

func stringArrayField(object map[string]any, field string) ([]string, error) {
	rawValue, ok := object[field]
	if !ok {
		return nil, nil
	}

	entries, ok := rawValue.([]any)
	if !ok {
		return nil, fmt.Errorf("settings project field %q must be an array", field)
	}

	output := make([]string, 0, len(entries))
	for _, entry := range entries {
		typed, ok := entry.(string)
		if !ok {
			return nil, fmt.Errorf("settings project field %q must contain strings", field)
		}
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil, fmt.Errorf("settings project field %q must not contain blank values", field)
		}
		output = append(output, trimmed)
	}
	return output, nil
}

func stringMapField(object map[string]any, field string) (map[string]string, error) {
	rawValue, ok := object[field]
	if !ok {
		return map[string]string{}, nil
	}

	entries, ok := rawValue.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("settings project field %q must be an object", field)
	}

	output := make(map[string]string, len(entries))
	for key, entry := range entries {
		typed, ok := entry.(string)
		if !ok {
			return nil, fmt.Errorf("settings project field %q must contain string values", field)
		}
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil, fmt.Errorf("settings project field %q must not contain blank values", field)
		}
		output[key] = trimmed
	}
	return output, nil
}
