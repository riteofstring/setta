package realtime

import (
	"encoding/json"
	"errors"
	"strings"

	binarypayload "setta/internal/binary"
)

type DependencyKeyType string

const (
	DependencyKeyTypeSection      DependencyKeyType = "Section"
	DependencyKeyTypeSectionParam DependencyKeyType = "SectionParam"
)

type SectionDependencyKey struct {
	Type      DependencyKeyType `json:"type"`
	SectionID string            `json:"sectionId"`
}

type SectionParamDependencyKey struct {
	Type      DependencyKeyType `json:"type"`
	SectionID string            `json:"sectionId"`
	CodeObjID string            `json:"codeObjId"`
}

type DependencyValueType string

const (
	DependencyValueTypeLiteral  DependencyValueType = "Literal"
	DependencyValueTypeBinary   DependencyValueType = "Binary"
	DependencyValueTypeFileRead DependencyValueType = "FileRead"
)

type LiteralDependencyValue struct {
	Type    DependencyValueType `json:"type"`
	Payload string              `json:"payload"`
}

type FileReadDependencyValue struct {
	Type    DependencyValueType `json:"type"`
	Payload string              `json:"payload"`
}

type BinaryDependencyValue struct {
	Type    DependencyValueType      `json:"type"`
	Payload binarypayload.ContentRef `json:"payload"`
}

var (
	ErrDependencyKeyTypeRequired      = errors.New("realtime: dependency key type is required")
	ErrDependencyKeySectionIDRequired = errors.New("realtime: dependency key section id is required")
	ErrDependencyKeyCodeObjIDRequired = errors.New("realtime: dependency key code object id is required")
	ErrUnsupportedDependencyKeyType   = errors.New("realtime: unsupported dependency key type")
	ErrDependencyValueTypeRequired    = errors.New("realtime: dependency value type is required")
	ErrDependencyValueNotObject       = errors.New("realtime: dependency value must be a JSON object")
)

type dependencyKey struct {
	Type      DependencyKeyType `json:"type"`
	SectionID string            `json:"sectionId"`
	CodeObjID string            `json:"codeObjId"`
}

type dependencyValue struct {
	Type DependencyValueType `json:"type"`
}

func CanonicalDependencyKey(raw json.RawMessage) (string, error) {
	var key dependencyKey
	if err := json.Unmarshal(raw, &key); err != nil {
		return "", err
	}

	key.Type = DependencyKeyType(strings.TrimSpace(string(key.Type)))
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

func canonicalDependencyKeyFromWire(raw json.RawMessage) (string, error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return "", ErrDependencyKeySectionIDRequired
	}
	if strings.HasPrefix(trimmed, "\"") {
		var canonical string
		if err := json.Unmarshal(raw, &canonical); err != nil {
			return "", err
		}
		canonical = strings.TrimSpace(canonical)
		if _, err := DecodeCanonicalDependencyKey(canonical); err != nil {
			return "", err
		}
		return canonical, nil
	}
	return CanonicalDependencyKey(raw)
}

func CanonicalDependencyKeyFromWire(raw json.RawMessage) (string, error) {
	return canonicalDependencyKeyFromWire(raw)
}

func DecodeCanonicalDependencyKey(value string) (dependencyKey, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return dependencyKey{}, ErrDependencyKeySectionIDRequired
	}
	sectionID, codeObjID, hasCodeObj := strings.Cut(value, ".")
	sectionID = strings.TrimSpace(sectionID)
	if sectionID == "" {
		return dependencyKey{}, ErrDependencyKeySectionIDRequired
	}
	if !hasCodeObj {
		return dependencyKey{
			Type:      DependencyKeyTypeSection,
			SectionID: sectionID,
		}, nil
	}

	codeObjID = strings.TrimSpace(codeObjID)
	if codeObjID == "" {
		return dependencyKey{}, ErrDependencyKeyCodeObjIDRequired
	}
	return dependencyKey{
		Type:      DependencyKeyTypeSectionParam,
		SectionID: sectionID,
		CodeObjID: codeObjID,
	}, nil
}

func structuredDependencyKeyJSON(value string) (json.RawMessage, error) {
	key, err := DecodeCanonicalDependencyKey(value)
	if err != nil {
		return nil, err
	}
	var payload []byte
	switch key.Type {
	case DependencyKeyTypeSection:
		payload, err = json.Marshal(SectionDependencyKey{
			Type:      key.Type,
			SectionID: key.SectionID,
		})
	case DependencyKeyTypeSectionParam:
		payload, err = json.Marshal(SectionParamDependencyKey{
			Type:      key.Type,
			SectionID: key.SectionID,
			CodeObjID: key.CodeObjID,
		})
	default:
		err = ErrUnsupportedDependencyKeyType
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(payload), nil
}

func structuredDependencyKeysJSON(values []string) ([]json.RawMessage, error) {
	if len(values) == 0 {
		return nil, nil
	}
	payloads := make([]json.RawMessage, 0, len(values))
	for _, value := range values {
		payload, err := structuredDependencyKeyJSON(value)
		if err != nil {
			return nil, err
		}
		payloads = append(payloads, payload)
	}
	return payloads, nil
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
	value.Type = DependencyValueType(strings.TrimSpace(string(value.Type)))
	if value.Type == "" {
		return false, ErrDependencyValueTypeRequired
	}
	return value.Type == DependencyValueTypeBinary, nil
}
