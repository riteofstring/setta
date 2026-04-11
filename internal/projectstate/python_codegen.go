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
	GeneratedPythonCodeFileName        = "setta_gen.py"
	GeneratedPythonMetadataFileName    = "setta_gen_meta.py"
	DefaultPythonCodegenSuffix         = "state = SettaState()"
	GeneratedPythonCodeSectionID       = "gen-python-section"
	GeneratedPythonCodeVariantID       = "gen-python-variant"
	GeneratedPythonCodeImplID          = "gen-python-impl"
	GeneratedPythonCodeSectionName     = "Generated Python"
	GeneratedPythonMetadataSectionID   = "gen-python-metadata-section"
	GeneratedPythonMetadataVariantID   = "gen-python-metadata-variant"
	GeneratedPythonMetadataImplID      = "gen-python-metadata-impl"
	GeneratedPythonMetadataSectionName = "Generated Python Metadata"
)

var (
	ErrProjectCodegenPythonTargetPayloadInvalid   = errors.New("project python codegen target payload is invalid")
	ErrProjectCodegenPythonTargetObjectRequired   = errors.New("project python codegen target payload must be a JSON object")
	ErrProjectCodegenPythonTargetFieldUnknown     = errors.New("project python codegen target field is unknown")
	ErrProjectCodegenPythonTargetFieldInvalid     = errors.New("project python codegen target field is invalid")
	ErrProjectCodegenPythonTargetMissing          = errors.New("project python codegen target was not found")
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

type pythonCodegenTargetFieldDecoder func(*PythonCodegenTarget, json.RawMessage) error

var pythonCodegenTargetFieldDecoders = map[string]pythonCodegenTargetFieldDecoder{
	"language":           decodePythonCodegenTargetLanguageField,
	"genCodePrefix":      decodePythonCodegenTargetPrefixField,
	"genCodeSuffix":      decodePythonCodegenTargetSuffixField,
	"generateMetadata":   decodePythonCodegenTargetGenerateMetadataField,
	"sectionPolicy":      decodePythonCodegenTargetSectionPolicyField,
	"codeObjValuePolicy": decodePythonCodegenTargetCodeObjValuePolicyField,
}

func defaultProjectCodegenTargets() []ProjectCodegenTarget {
	return []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
		},
	}
}

func DecodePythonCodegenTarget(target ProjectCodegenTarget) (PythonCodegenTarget, error) {
	if err := validatePythonCodegenTargetLanguage(strings.TrimSpace(target.Language)); err != nil {
		return PythonCodegenTarget{}, err
	}

	config := defaultPythonCodegenTarget()
	if len(target.Payload) == 0 {
		return config, nil
	}

	fields, err := decodePythonCodegenTargetPayloadFields(target.Payload)
	if err != nil {
		return PythonCodegenTarget{}, err
	}
	for key, raw := range fields {
		if err := applyPythonCodegenTargetField(&config, key, raw); err != nil {
			return PythonCodegenTarget{}, err
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

func EncodePythonCodegenTarget(config PythonCodegenTarget) (RawJSON, error) {
	payload := map[string]any{
		"language": string(CodeLanguagePython),
	}
	if config.GenCodePrefix != "" {
		payload["genCodePrefix"] = config.GenCodePrefix
	}
	if config.GenCodeSuffix != "" && config.GenCodeSuffix != DefaultPythonCodegenSuffix {
		payload["genCodeSuffix"] = config.GenCodeSuffix
	}
	if config.GenerateMetadata {
		payload["generateMetadata"] = true
	}
	if len(config.SectionPolicy) > 0 {
		decoded, err := decodePythonCodegenTargetObjectValue(config.SectionPolicy, "sectionPolicy")
		if err != nil {
			return nil, err
		}
		payload["sectionPolicy"] = decoded
	}
	if len(config.CodeObjValuePolicy) > 0 {
		decoded, err := decodePythonCodegenTargetObjectValue(config.CodeObjValuePolicy, "codeObjValuePolicy")
		if err != nil {
			return nil, err
		}
		payload["codeObjValuePolicy"] = decoded
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("%w: encode target payload: %v", ErrProjectCodegenPythonTargetPayloadInvalid, err)
	}
	return normalizeRawJSON(encoded, "project python codegen target payload")
}

func (p *Project) SetPythonCodegenTarget(config PythonCodegenTarget) error {
	if p == nil {
		return ErrProjectNotFound
	}
	encoded, err := EncodePythonCodegenTarget(config)
	if err != nil {
		return err
	}
	for index, target := range p.CodegenTargets {
		if strings.TrimSpace(target.Language) != string(CodeLanguagePython) {
			continue
		}
		updated := target.Clone()
		updated.Payload = encoded
		p.CodegenTargets[index] = updated
		return nil
	}
	return ErrProjectCodegenPythonTargetMissing
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
	return sanitizeSimpleNameSlug(name)
}

func defaultPythonCodegenTarget() PythonCodegenTarget {
	return PythonCodegenTarget{
		GenCodeSuffix: DefaultPythonCodegenSuffix,
	}
}

func validatePythonCodegenTargetLanguage(language string) error {
	if language != string(CodeLanguagePython) {
		return fmt.Errorf("%w: %s", ErrProjectCodegenPythonTargetLanguageMismatch, language)
	}
	return nil
}

func decodePythonCodegenTargetPayloadFields(payload RawJSON) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return nil, fmt.Errorf("%w: decode target payload: %v", ErrProjectCodegenPythonTargetPayloadInvalid, err)
	}
	if fields == nil {
		return nil, ErrProjectCodegenPythonTargetObjectRequired
	}
	return fields, nil
}

func applyPythonCodegenTargetField(config *PythonCodegenTarget, field string, raw json.RawMessage) error {
	decoder, ok := pythonCodegenTargetFieldDecoders[field]
	if !ok {
		return fmt.Errorf("%w: %s", ErrProjectCodegenPythonTargetFieldUnknown, field)
	}
	return decoder(config, raw)
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

func decodePythonCodegenTargetLanguageField(_ *PythonCodegenTarget, raw json.RawMessage) error {
	payloadLanguage, err := decodePythonCodegenTargetStringField(raw, "language")
	if err != nil {
		return err
	}
	return validatePythonCodegenTargetLanguage(payloadLanguage)
}

func decodePythonCodegenTargetPrefixField(config *PythonCodegenTarget, raw json.RawMessage) error {
	value, err := decodePythonCodegenTargetStringField(raw, "genCodePrefix")
	if err != nil {
		return err
	}
	config.GenCodePrefix = value
	return nil
}

func decodePythonCodegenTargetSuffixField(config *PythonCodegenTarget, raw json.RawMessage) error {
	value, err := decodePythonCodegenTargetStringField(raw, "genCodeSuffix")
	if err != nil {
		return err
	}
	config.GenCodeSuffix = value
	return nil
}

func decodePythonCodegenTargetGenerateMetadataField(config *PythonCodegenTarget, raw json.RawMessage) error {
	value, err := decodePythonCodegenTargetBoolField(raw, "generateMetadata")
	if err != nil {
		return err
	}
	config.GenerateMetadata = value
	return nil
}

func decodePythonCodegenTargetSectionPolicyField(config *PythonCodegenTarget, raw json.RawMessage) error {
	normalized, err := normalizePythonCodegenTargetObjectField(raw, "sectionPolicy")
	if err != nil {
		return err
	}
	if _, err := DecodePythonSectionCodegenPolicy(normalized); err != nil {
		return err
	}
	config.SectionPolicy = normalized
	return nil
}

func decodePythonCodegenTargetCodeObjValuePolicyField(config *PythonCodegenTarget, raw json.RawMessage) error {
	normalized, err := normalizePythonCodegenTargetObjectField(raw, "codeObjValuePolicy")
	if err != nil {
		return err
	}
	if _, err := DecodePythonCodeObjValuePolicy(normalized); err != nil {
		return err
	}
	config.CodeObjValuePolicy = normalized
	return nil
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

func decodePythonCodegenTargetObjectValue(raw json.RawMessage, field string) (map[string]any, error) {
	normalized, err := normalizePythonCodegenTargetObjectField(raw, field)
	if err != nil {
		return nil, err
	}
	if len(normalized) == 0 {
		return nil, nil
	}
	value, err := rawObjectFromProjectPayload(normalized)
	if err != nil {
		return nil, fmt.Errorf("%w: decode %s: %v", ErrProjectCodegenPythonTargetPayloadInvalid, field, err)
	}
	return value, nil
}
