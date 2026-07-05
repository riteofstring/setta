package codexapp

import (
	"bytes"
	"encoding/json"
)

type CodexNullableString struct {
	value *string
}

func CodexString(value string) *CodexNullableString {
	copied := value
	return &CodexNullableString{value: &copied}
}

func CodexNullString() *CodexNullableString {
	return &CodexNullableString{}
}

func (value *CodexNullableString) Value() (string, bool) {
	if value == nil || value.value == nil {
		return "", false
	}
	return *value.value, true
}

func (value CodexNullableString) MarshalJSON() ([]byte, error) {
	if value.value == nil {
		return []byte("null"), nil
	}
	return json.Marshal(*value.value)
}

func (value *CodexNullableString) UnmarshalJSON(raw []byte) error {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		value.value = nil
		return nil
	}
	var decoded string
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return err
	}
	value.value = &decoded
	return nil
}
