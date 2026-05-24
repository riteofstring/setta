package wsapi

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/projectstate"
)

func decodeListenerChatState(sectionID string, rawValue json.RawMessage) (projectstate.ChatSectionState, error) {
	if isJSONObject(rawValue) {
		var state projectstate.ChatSectionState
		if err := json.Unmarshal(rawValue, &state); err != nil {
			return projectstate.ChatSectionState{}, fmt.Errorf(
				"listener emit chat section payload must be valid JSON for %s",
				sectionID,
			)
		}
		return state, nil
	}

	value, err := decodeJSONString(rawValue)
	if err != nil {
		return projectstate.ChatSectionState{}, fmt.Errorf(
			"listener emit expected literal payload for %s",
			sectionID,
		)
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return projectstate.ChatSectionState{}, fmt.Errorf(
			"listener emit chat section payload is empty for %s",
			sectionID,
		)
	}

	var state projectstate.ChatSectionState
	if err := json.Unmarshal([]byte(value), &state); err != nil {
		return projectstate.ChatSectionState{}, fmt.Errorf(
			"listener emit chat section payload must be valid JSON for %s",
			sectionID,
		)
	}
	return state, nil
}

func applyListenerPluginSectionUpdate(project *projectstate.Project, sectionID string, rawValue json.RawMessage) error {
	target, err := resolveListenerPluginSectionTarget(project, sectionID)
	if err != nil {
		return err
	}

	parsedPayload, err := decodeListenerPluginPayload(sectionID, rawValue)
	if err != nil {
		return err
	}

	currentData := listenerPluginCurrentData(target.Payload)
	controlUpdate, hasControlPayload, err := decodeListenerPluginControlUpdate(parsedPayload, currentData)
	if err != nil {
		return err
	}
	if hasControlPayload {
		return applyListenerPluginControlUpdate(project, target, controlUpdate)
	}

	nextData := mergeJSONObjects(currentData, parsedPayload)
	return project.SetSectionFieldForVariant(target.SectionID, target.VariantID, "data", nextData)
}

func resolveListenerPluginSectionTarget(
	project *projectstate.Project,
	sectionID string,
) (listenerPluginSectionTarget, error) {
	section, variant, impl, err := project.ResolveSection(sectionID)
	if err != nil {
		return listenerPluginSectionTarget{}, err
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		return listenerPluginSectionTarget{}, err
	}
	sectionType := sectionTypeForPayload(payload, impl)
	if sectionType != "Plugin" {
		return listenerPluginSectionTarget{}, fmt.Errorf(
			"listener emit targeted unsupported section type %s (section %s)",
			sectionType,
			sectionID,
		)
	}
	return listenerPluginSectionTarget{
		SectionID: section.ID,
		VariantID: variant.ID,
		Payload:   payload,
	}, nil
}

func listenerPluginCurrentData(payload map[string]any) map[string]any {
	if rawData, ok := payload["data"].(map[string]any); ok {
		return cloneJSONObject(rawData)
	}
	return map[string]any{}
}

func decodeListenerPluginControlUpdate(
	parsedPayload map[string]any,
	currentData map[string]any,
) (listenerPluginControlUpdate, bool, error) {
	if !isListenerPluginControlPayload(parsedPayload) {
		return listenerPluginControlUpdate{}, false, nil
	}

	nextData, err := listenerPluginControlData(parsedPayload)
	if err != nil {
		return listenerPluginControlUpdate{}, true, err
	}
	mergeValue, err := listenerPluginMergeValue(parsedPayload)
	if err != nil {
		return listenerPluginControlUpdate{}, true, err
	}
	if mergeValue {
		nextData = mergeJSONObjects(currentData, nextData)
	}

	kind, err := listenerPluginKindValue(parsedPayload)
	if err != nil {
		return listenerPluginControlUpdate{}, true, err
	}
	schemaPresent, schemaValue, err := listenerPluginSchemaVersionValue(parsedPayload)
	if err != nil {
		return listenerPluginControlUpdate{}, true, err
	}

	return listenerPluginControlUpdate{
		Data:                 nextData,
		Kind:                 kind,
		SchemaVersionPresent: schemaPresent,
		SchemaVersionValue:   schemaValue,
	}, true, nil
}

func isListenerPluginControlPayload(parsedPayload map[string]any) bool {
	if _, ok := parsedPayload["data"]; !ok {
		return false
	}
	for key := range parsedPayload {
		switch key {
		case "data", "kind", "schemaVersion", "merge":
		default:
			return false
		}
	}
	return true
}

func listenerPluginControlData(parsedPayload map[string]any) (map[string]any, error) {
	rawData, ok := parsedPayload["data"]
	if !ok {
		return map[string]any{}, nil
	}
	typedData, ok := rawData.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("listener emit plugin section data field must be an object")
	}
	return cloneJSONObject(typedData), nil
}

func listenerPluginMergeValue(parsedPayload map[string]any) (bool, error) {
	rawMerge, ok := parsedPayload["merge"]
	if !ok {
		return true, nil
	}
	typed, ok := rawMerge.(bool)
	if !ok {
		return false, fmt.Errorf("listener emit plugin section merge flag must be boolean")
	}
	return typed, nil
}

func listenerPluginKindValue(parsedPayload map[string]any) (*string, error) {
	rawKind, ok := parsedPayload["kind"]
	if !ok {
		return nil, nil
	}
	typedKind, ok := rawKind.(string)
	if !ok {
		return nil, fmt.Errorf("listener emit plugin section kind field must be a string")
	}
	return &typedKind, nil
}

func listenerPluginSchemaVersionValue(parsedPayload map[string]any) (bool, any, error) {
	rawSchemaVersion, ok := parsedPayload["schemaVersion"]
	if !ok {
		return false, nil, nil
	}
	switch typed := rawSchemaVersion.(type) {
	case nil:
		return true, nil, nil
	case float64:
		if typed != float64(int(typed)) {
			return false, nil, fmt.Errorf("listener emit plugin section schemaVersion must be int or null")
		}
		return true, int(typed), nil
	default:
		return false, nil, fmt.Errorf("listener emit plugin section schemaVersion must be int or null")
	}
}

func applyListenerPluginControlUpdate(
	project *projectstate.Project,
	target listenerPluginSectionTarget,
	update listenerPluginControlUpdate,
) error {
	if err := project.SetSectionFieldForVariant(target.SectionID, target.VariantID, "data", update.Data); err != nil {
		return err
	}
	if update.Kind != nil {
		if err := project.SetSectionFieldForVariant(target.SectionID, target.VariantID, "kind", *update.Kind); err != nil {
			return err
		}
	}
	if update.SchemaVersionPresent {
		if err := project.SetSectionFieldForVariant(target.SectionID, target.VariantID, "schemaVersion", update.SchemaVersionValue); err != nil {
			return err
		}
	}
	return nil
}

func decodeListenerPluginPayload(sectionID string, rawValue json.RawMessage) (map[string]any, error) {
	if isJSONObject(rawValue) {
		var payload map[string]any
		if err := json.Unmarshal(rawValue, &payload); err != nil {
			return nil, fmt.Errorf("listener emit plugin section payload must be valid JSON for %s", sectionID)
		}
		return payload, nil
	}

	value, err := decodeJSONString(rawValue)
	if err != nil {
		return nil, fmt.Errorf("listener emit expected literal payload for %s", sectionID)
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, fmt.Errorf("listener emit plugin section payload is empty for %s", sectionID)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(value), &payload); err != nil {
		return nil, fmt.Errorf("listener emit plugin section payload must be valid JSON for %s", sectionID)
	}
	if payload == nil {
		return nil, fmt.Errorf("listener emit expected object payload for plugin section %s", sectionID)
	}
	return payload, nil
}
