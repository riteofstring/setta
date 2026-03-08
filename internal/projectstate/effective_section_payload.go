package projectstate

import (
	"encoding/json"
	"fmt"
	"strings"
)

func effectiveSectionPayload(project Project, sectionID string, variantID string) (map[string]any, error) {
	section, ok := project.Sections[sectionID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
	}
	variant, ok := project.SectionVariants[variantID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrSectionVariantNotFound, variantID)
	}
	impl, ok := project.SectionImpls[variant.ImplID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrSectionImplNotFound, variant.ImplID)
	}

	base, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(impl))
	if err != nil {
		return nil, err
	}
	sharedModifier, err := rawObjectFromProjectPayload(section.SharedModifier)
	if err != nil {
		return nil, err
	}
	modifier, err := rawObjectFromProjectPayload(variant.Modifier)
	if err != nil {
		return nil, err
	}

	return mergeProjectObjects(mergeProjectObjects(base, sharedModifier), modifier), nil
}

func sectionImplPayloadUnchecked(impl SectionImpl) RawJSON {
	if len(impl.Payload) > 0 {
		return cloneRawJSON(impl.Payload)
	}

	payload := map[string]any{
		"id":   impl.ID,
		"type": fallbackSectionType(impl),
	}
	if impl.IsCode() {
		payload["codeLanguage"] = string(impl.Code.Language)
		if impl.Code.Binding != nil {
			payload["codeFileBinding"] = map[string]any{
				"canonical_path": impl.Code.Binding.Path,
				"access_mode":    string(impl.Code.Binding.AccessMode),
				"autoBinding":    false,
			}
		}
		if impl.Code.AttachedTerminalSectionID != "" {
			payload["attachedTerminalSectionId"] = impl.Code.AttachedTerminalSectionID
		}
		payload["children"] = append([]string(nil), impl.Code.Children...)
	}
	return mustMarshalProjectObject(payload)
}

func rawObjectFromProjectPayload(raw RawJSON) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return nil, ErrFrontendPayloadInvalid
	}
	return object, nil
}

func mergeProjectObjects(base map[string]any, modifier map[string]any) map[string]any {
	merged := cloneProjectObject(base)
	for key, value := range modifier {
		baseObject, baseIsObject := merged[key].(map[string]any)
		modifierObject, modifierIsObject := value.(map[string]any)
		if baseIsObject && modifierIsObject {
			merged[key] = mergeProjectObjects(baseObject, modifierObject)
			continue
		}
		merged[key] = cloneProjectValue(value)
	}
	return merged
}

func cloneProjectObject(source map[string]any) map[string]any {
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = cloneProjectValue(value)
	}
	return cloned
}

func cloneProjectValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneProjectObject(typed)
	case []any:
		cloned := make([]any, len(typed))
		for index, entry := range typed {
			cloned[index] = cloneProjectValue(entry)
		}
		return cloned
	default:
		return typed
	}
}

func payloadStringField(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok {
		return ""
	}
	output, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(output)
}

func payloadRawStringField(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok {
		return ""
	}
	output, ok := value.(string)
	if !ok {
		return ""
	}
	return output
}

func payloadRawStringFieldWithPresence(object map[string]any, key string) (string, bool) {
	value, ok := object[key]
	if !ok {
		return "", false
	}
	output, ok := value.(string)
	if !ok {
		return "", false
	}
	return output, true
}

func payloadStringArrayField(object map[string]any, key string) []string {
	value, ok := object[key]
	if !ok {
		return nil
	}
	rawEntries, ok := value.([]any)
	if !ok {
		return nil
	}
	output := make([]string, 0, len(rawEntries))
	for _, entry := range rawEntries {
		stringValue, ok := entry.(string)
		if ok && strings.TrimSpace(stringValue) != "" {
			output = append(output, strings.TrimSpace(stringValue))
		}
	}
	return output
}

func fallbackSectionType(impl SectionImpl) string {
	switch {
	case impl.IsCode():
		return "Code"
	case impl.IsTerminal():
		return "Terminal"
	case impl.IsDraw():
		return "Draw"
	case impl.IsGenerated():
		switch impl.Generated.Kind {
		case GeneratedSectionKindPythonCode:
			return "GenPythonCode"
		case GeneratedSectionKindPythonMetadata:
			return "GenPythonMetadata"
		case GeneratedSectionKindPlugin:
			return "Plugin"
		}
	}
	if impl.Kind == "" {
		return ""
	}
	return string(impl.Kind)
}

func mustMarshalProjectObject(value map[string]any) RawJSON {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return encoded
}
