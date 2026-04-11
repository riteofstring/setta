package projectstate

import "strings"

func CodeObjectImplPayload(impl CodeObjectImpl) (RawJSON, error) {
	payload, err := normalizedCodeObjImplPayloadObject(impl)
	if err != nil {
		return nil, err
	}
	return marshalProjectObject(payload)
}

func normalizedCodeObjImplPayloadObject(impl CodeObjectImpl) (map[string]any, error) {
	payload, err := rawCodeObjImplPayloadObject(impl)
	if err != nil {
		return nil, err
	}
	defaults := codeObjImplPayloadDefaults(payload, impl)
	merged := mergeProjectObjects(defaults, payload)
	normalizeCodeObjImplPayloadCollections(merged, strings.TrimSpace(impl.Type))
	return merged, nil
}

func rawCodeObjImplPayloadObject(impl CodeObjectImpl) (map[string]any, error) {
	if len(impl.Payload) > 0 {
		return rawObjectFromProjectPayload(cloneRawJSON(impl.Payload))
	}
	return map[string]any{
		"id":   impl.ID,
		"type": impl.Type,
	}, nil
}

func codeObjImplPayloadDefaults(payload map[string]any, impl CodeObjectImpl) map[string]any {
	codeObjType := effectiveCodeObjPayloadType(payload, strings.TrimSpace(impl.Type))
	defaults := map[string]any{}
	switch codeObjType {
	case "CodeCallable", "NestedParam":
		defaults["children"] = []any{}
	}
	return defaults
}

func normalizeCodeObjImplPayloadCollections(payload map[string]any, fallbackType string) {
	switch effectiveCodeObjPayloadType(payload, fallbackType) {
	case "CodeCallable", "NestedParam":
		children, ok := payload["children"].([]any)
		if !ok || children == nil {
			payload["children"] = []any{}
		}
	}
}

func effectiveCodeObjPayloadType(payload map[string]any, fallbackType string) string {
	codeObjType := payloadStringField(payload, "type")
	if codeObjType != "" {
		return codeObjType
	}
	return strings.TrimSpace(fallbackType)
}
