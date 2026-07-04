package codexapp

import (
	"bytes"
	"encoding/json"
	"fmt"
)

type codexRequiredField struct {
	name      string
	allowNull bool
}

func decodeCodexObject(raw json.RawMessage, name string, validate func(json.RawMessage, string) error, target any) error {
	if validate != nil {
		if err := validate(raw, name); err != nil {
			return err
		}
	}
	if err := json.Unmarshal(raw, target); err != nil {
		return fmt.Errorf("%s has invalid shape: %w", name, err)
	}
	return nil
}

func codexObjectFields(raw json.RawMessage, name string) (map[string]json.RawMessage, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil, fmt.Errorf("%s is required", name)
	}
	fields := map[string]json.RawMessage{}
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, fmt.Errorf("%s must be an object: %w", name, err)
	}
	if fields == nil {
		return nil, fmt.Errorf("%s must be an object", name)
	}
	return fields, nil
}

func requireCodexFields(fields map[string]json.RawMessage, name string, required []codexRequiredField) error {
	for _, field := range required {
		value, ok := fields[field.name]
		if !ok || (!field.allowNull && codexJSONNull(value)) {
			return fmt.Errorf("%s.%s is required", name, field.name)
		}
	}
	return nil
}

func validateCodexObjectField(fields map[string]json.RawMessage, field string, name string, allowNull bool, validate func(json.RawMessage, string) error) error {
	value, ok := fields[field]
	if !ok {
		return nil
	}
	if codexJSONNull(value) {
		if allowNull {
			return nil
		}
		return fmt.Errorf("%s is required", name)
	}
	return validate(value, name)
}

func validateCodexObjectArrayField(fields map[string]json.RawMessage, field string, name string, allowNull bool, itemAllowNull bool, validate func(json.RawMessage, string) error) error {
	value, ok := fields[field]
	if !ok {
		return nil
	}
	if codexJSONNull(value) {
		if allowNull {
			return nil
		}
		return fmt.Errorf("%s is required", name)
	}
	items := []json.RawMessage{}
	if err := json.Unmarshal(value, &items); err != nil {
		return fmt.Errorf("%s must be an array: %w", name, err)
	}
	for index, item := range items {
		if itemAllowNull && codexJSONNull(item) {
			continue
		}
		if err := validate(item, fmt.Sprintf("%s[%d]", name, index)); err != nil {
			return err
		}
	}
	return nil
}

func codexJSONNull(raw json.RawMessage) bool {
	return bytes.Equal(bytes.TrimSpace(raw), []byte("null"))
}
