package projectstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"path/filepath"
	"strings"
)

const (
	GeneratedPythonCodeFileName     = "setta_gen.py"
	GeneratedPythonMetadataFileName = "setta_gen_meta.py"
	DefaultPythonCodegenSuffix      = "state = SettaState()"
)

var (
	ErrProjectCodegenPythonTargetPayloadInvalid   = errors.New("project python codegen target payload is invalid")
	ErrProjectCodegenPythonTargetObjectRequired   = errors.New("project python codegen target payload must be a JSON object")
	ErrProjectCodegenPythonTargetFieldUnknown     = errors.New("project python codegen target field is unknown")
	ErrProjectCodegenPythonTargetFieldInvalid     = errors.New("project python codegen target field is invalid")
	ErrProjectCodegenPythonTargetLanguageMismatch = errors.New(
		"project python codegen target language does not match project state",
	)
)

type PythonCodegenTarget struct {
	GenCodePrefix      string
	GenCodeSuffix      string
	GenerateMetadata   bool
	SectionPolicy      RawJSON
	CodeObjValuePolicy RawJSON
}

func DecodePythonCodegenTarget(target ProjectCodegenTarget) (PythonCodegenTarget, error) {
	if strings.TrimSpace(target.Language) != string(CodeLanguagePython) {
		return PythonCodegenTarget{}, fmt.Errorf("%w: %s", ErrProjectCodegenPythonTargetLanguageMismatch, strings.TrimSpace(target.Language))
	}

	config := PythonCodegenTarget{
		GenCodeSuffix: DefaultPythonCodegenSuffix,
	}
	if len(target.Payload) == 0 {
		return config, nil
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(target.Payload, &fields); err != nil {
		return PythonCodegenTarget{}, fmt.Errorf("%w: decode target payload: %v", ErrProjectCodegenPythonTargetPayloadInvalid, err)
	}
	if fields == nil {
		return PythonCodegenTarget{}, ErrProjectCodegenPythonTargetObjectRequired
	}

	for key, raw := range fields {
		switch key {
		case "language":
			payloadLanguage, err := decodePythonCodegenTargetStringField(raw, key)
			if err != nil {
				return PythonCodegenTarget{}, err
			}
			if payloadLanguage != string(CodeLanguagePython) {
				return PythonCodegenTarget{}, fmt.Errorf("%w: %s", ErrProjectCodegenPythonTargetLanguageMismatch, payloadLanguage)
			}
		case "genCodePrefix":
			value, err := decodePythonCodegenTargetStringField(raw, key)
			if err != nil {
				return PythonCodegenTarget{}, err
			}
			config.GenCodePrefix = value
		case "genCodeSuffix":
			value, err := decodePythonCodegenTargetStringField(raw, key)
			if err != nil {
				return PythonCodegenTarget{}, err
			}
			config.GenCodeSuffix = value
		case "generateMetadata":
			value, err := decodePythonCodegenTargetBoolField(raw, key)
			if err != nil {
				return PythonCodegenTarget{}, err
			}
			config.GenerateMetadata = value
		case "sectionPolicy":
			normalized, err := normalizePythonCodegenTargetObjectField(raw, key)
			if err != nil {
				return PythonCodegenTarget{}, err
			}
			if _, err := DecodePythonSectionCodegenPolicy(normalized); err != nil {
				return PythonCodegenTarget{}, err
			}
			config.SectionPolicy = normalized
		case "codeObjValuePolicy":
			normalized, err := normalizePythonCodegenTargetObjectField(raw, key)
			if err != nil {
				return PythonCodegenTarget{}, err
			}
			if _, err := DecodePythonCodeObjValuePolicy(normalized); err != nil {
				return PythonCodegenTarget{}, err
			}
			config.CodeObjValuePolicy = normalized
		default:
			return PythonCodegenTarget{}, fmt.Errorf("%w: %s", ErrProjectCodegenPythonTargetFieldUnknown, key)
		}
	}

	return config, nil
}

func (p Project) PythonCodegenTarget() (PythonCodegenTarget, bool, error) {
	for _, target := range p.CodegenTargets {
		if strings.TrimSpace(target.Language) != string(CodeLanguagePython) {
			continue
		}
		config, err := DecodePythonCodegenTarget(target)
		if err != nil {
			return PythonCodegenTarget{}, false, err
		}
		return config, true, nil
	}
	return PythonCodegenTarget{}, false, nil
}

func (p *Project) ReconcilePythonGeneratedBindings() error {
	if p == nil {
		return ErrProjectNotFound
	}

	config, ok, err := p.PythonCodegenTarget()
	if err != nil {
		return err
	}
	if !ok {
		p.GeneratedCodeBinding = nil
		p.GeneratedMetadataBinding = nil
		return nil
	}

	p.GeneratedCodeBinding = &CodeFileBinding{
		Path:       GeneratedPythonCodeRelativePath(p.Name),
		AccessMode: CodeFileAccessModeWriteOnly,
	}
	if config.GenerateMetadata {
		p.GeneratedMetadataBinding = &CodeFileBinding{
			Path:       GeneratedPythonMetadataRelativePath(p.Name),
			AccessMode: CodeFileAccessModeWriteOnly,
		}
	} else {
		p.GeneratedMetadataBinding = nil
	}
	return nil
}

func ProjectCodeSectionsRelativeRoot(projectName string) string {
	return path.Join("code", "sections", sanitizeProjectSlug(projectName))
}

func ProjectCodeSectionsRoot(settaFilesRoot string, projectName string) string {
	return filepath.Join(settaFilesRoot, filepath.FromSlash(ProjectCodeSectionsRelativeRoot(projectName)))
}

func GeneratedPythonCodeRelativePath(projectName string) string {
	return path.Join(ProjectCodeSectionsRelativeRoot(projectName), GeneratedPythonCodeFileName)
}

func GeneratedPythonMetadataRelativePath(projectName string) string {
	return path.Join(ProjectCodeSectionsRelativeRoot(projectName), GeneratedPythonMetadataFileName)
}

func sanitizeProjectSlug(name string) string {
	sanitizedRunes := make([]rune, 0, len(name))
	for _, char := range name {
		switch char {
		case '[', ']', '"', '\'', ' ':
			sanitizedRunes = append(sanitizedRunes, '_')
		default:
			sanitizedRunes = append(sanitizedRunes, char)
		}
	}
	sanitized := string(sanitizedRunes)
	for strings.Contains(sanitized, "__") {
		sanitized = strings.ReplaceAll(sanitized, "__", "_")
	}
	sanitized = strings.Trim(sanitized, "_")
	return strings.ToLower(sanitized)
}

func decodePythonCodegenTargetStringField(raw json.RawMessage, field string) (string, error) {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", fmt.Errorf("%w: %s must be a string", ErrProjectCodegenPythonTargetFieldInvalid, field)
	}
	return value, nil
}

func decodePythonCodegenTargetBoolField(raw json.RawMessage, field string) (bool, error) {
	var value bool
	if err := json.Unmarshal(raw, &value); err != nil {
		return false, fmt.Errorf("%w: %s must be a boolean", ErrProjectCodegenPythonTargetFieldInvalid, field)
	}
	return value, nil
}

func normalizePythonCodegenTargetObjectField(raw json.RawMessage, field string) (RawJSON, error) {
	normalized, err := normalizeRawJSON(raw, fmt.Sprintf("project python codegen target %s", field))
	if err != nil {
		return nil, err
	}
	if len(normalized) == 0 {
		return nil, nil
	}

	var object map[string]json.RawMessage
	if err := json.Unmarshal(normalized, &object); err != nil {
		return nil, fmt.Errorf("%w: %s must be a JSON object", ErrProjectCodegenPythonTargetFieldInvalid, field)
	}
	if object == nil {
		return nil, fmt.Errorf("%w: %s must be a JSON object", ErrProjectCodegenPythonTargetFieldInvalid, field)
	}
	return normalized, nil
}
