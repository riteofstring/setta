package realtime

import (
	"encoding/json"
	"errors"
	"strings"
)

const (
	DependencyKeyTypeSection      = "Section"
	DependencyKeyTypeSectionParam = "SectionParam"
	DependencyValueTypeBinary     = "Binary"
)

var (
	ErrDependencyKeyTypeRequired      = errors.New("realtime: dependency key type is required")
	ErrDependencyKeySectionIDRequired = errors.New("realtime: dependency key section id is required")
	ErrDependencyKeyCodeObjIDRequired = errors.New("realtime: dependency key code object id is required")
	ErrUnsupportedDependencyKeyType   = errors.New("realtime: unsupported dependency key type")
	ErrDependencyValueTypeRequired    = errors.New("realtime: dependency value type is required")
	ErrDependencyValueNotObject       = errors.New("realtime: dependency value must be a JSON object")
)

type dependencyKey struct {
	Type      string `json:"type"`
	SectionID string `json:"sectionId"`
	CodeObjID string `json:"codeObjId"`
}

type dependencyValue struct {
	Type string `json:"type"`
}

func CanonicalDependencyKey(raw json.RawMessage) (string, error) {
	var key dependencyKey
	if err := json.Unmarshal(raw, &key); err != nil {
		return "", err
	}

	key.Type = strings.TrimSpace(key.Type)
	key.SectionID = strings.TrimSpace(key.SectionID)
	key.CodeObjID = strings.TrimSpace(key.CodeObjID)

	if key.Type == "" {
		return "", ErrDependencyKeyTypeRequired
	}
	if key.SectionID == "" {
		return "", ErrDependencyKeySectionIDRequired
	}

	switch key.Type {
	case DependencyKeyTypeSection:
		return key.SectionID, nil
	case DependencyKeyTypeSectionParam:
		if key.CodeObjID == "" {
			return "", ErrDependencyKeyCodeObjIDRequired
		}
		return key.SectionID + "." + key.CodeObjID, nil
	default:
		return "", ErrUnsupportedDependencyKeyType
	}
}

func DependencyValueIsBinary(raw json.RawMessage) (bool, error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return false, nil
	}

	var value dependencyValue
	if err := json.Unmarshal(raw, &value); err != nil {
		return false, err
	}
	value.Type = strings.TrimSpace(value.Type)
	if value.Type == "" {
		return false, ErrDependencyValueTypeRequired
	}
	return value.Type == DependencyValueTypeBinary, nil
}
