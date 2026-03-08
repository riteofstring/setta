package settingsstate

import (
	"errors"
	"fmt"
)

var (
	ErrSettingsPayloadNotObject = errors.New("settings payload must be a JSON object")
	ErrSettingsValueInvalid     = errors.New("settings value is invalid")
)

type Document map[string]any

func NewDocument() (Document, error) {
	return DefaultDocument()
}

func NormalizeRaw(raw any) (Document, error) {
	object, ok := raw.(map[string]any)
	if !ok {
		return nil, ErrSettingsPayloadNotObject
	}
	return normalizeDocument(Document(object))
}

func (d Document) Clone() Document {
	if d == nil {
		return nil
	}
	return Document(cloneMap(map[string]any(d)))
}

func (d Document) Normalized() (Document, error) {
	if d == nil {
		return DefaultDocument()
	}
	return normalizeDocument(d)
}

func normalizeDocument(raw Document) (Document, error) {
	defaults, err := DefaultDocument()
	if err != nil {
		return nil, err
	}
	current := raw.Clone()
	if current == nil {
		current = Document{}
	}
	mergeMissingDefaults(current, defaults)
	return current, nil
}

func mergeMissingDefaults(current map[string]any, defaults map[string]any) {
	for key, defaultValue := range defaults {
		existing, ok := current[key]
		if !ok {
			current[key] = cloneValue(defaultValue)
			continue
		}
		existingMap, existingOK := existing.(map[string]any)
		defaultMap, defaultOK := defaultValue.(map[string]any)
		if existingOK && defaultOK {
			mergeMissingDefaults(existingMap, defaultMap)
		}
	}
}

func cloneMap(source map[string]any) map[string]any {
	if source == nil {
		return nil
	}
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = cloneValue(value)
	}
	return cloned
}

func cloneValue(value any) any {
	switch typed := value.(type) {
	case Document:
		return cloneMap(map[string]any(typed))
	case map[string]any:
		return cloneMap(typed)
	case []any:
		cloned := make([]any, len(typed))
		for i := range typed {
			cloned[i] = cloneValue(typed[i])
		}
		return cloned
	default:
		return typed
	}
}

func objectField(object map[string]any, field string) (map[string]any, bool, error) {
	value, ok := object[field]
	if !ok {
		return nil, false, nil
	}
	nested, ok := asObject(value)
	if !ok {
		return nil, false, fmt.Errorf("%w: %s is not an object", ErrSettingsValueInvalid, field)
	}
	return nested, true, nil
}

func boolField(object map[string]any, field string) (bool, bool, error) {
	value, ok := object[field]
	if !ok {
		return false, false, nil
	}
	parsed, ok := value.(bool)
	if !ok {
		return false, false, fmt.Errorf("%w: %s is not a boolean", ErrSettingsValueInvalid, field)
	}
	return parsed, true, nil
}

func stringField(object map[string]any, field string) (string, bool, error) {
	value, ok := object[field]
	if !ok {
		return "", false, nil
	}
	parsed, ok := value.(string)
	if !ok {
		return "", false, fmt.Errorf("%w: %s is not a string", ErrSettingsValueInvalid, field)
	}
	return parsed, true, nil
}

func floatField(object map[string]any, field string) (float64, bool, error) {
	value, ok := object[field]
	if !ok {
		return 0, false, nil
	}
	parsed, ok := asFloat(value)
	if !ok {
		return 0, false, fmt.Errorf("%w: %s is not a number", ErrSettingsValueInvalid, field)
	}
	return parsed, true, nil
}

func asObject(value any) (map[string]any, bool) {
	switch typed := value.(type) {
	case Document:
		return map[string]any(typed), true
	case map[string]any:
		return typed, true
	default:
		return nil, false
	}
}

func asFloat(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int8:
		return float64(typed), true
	case int16:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case uint:
		return float64(typed), true
	case uint8:
		return float64(typed), true
	case uint16:
		return float64(typed), true
	case uint32:
		return float64(typed), true
	case uint64:
		return float64(typed), true
	default:
		return 0, false
	}
}
