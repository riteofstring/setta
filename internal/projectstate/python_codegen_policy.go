package projectstate

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrPythonSectionCodegenPolicyInvalid             = errors.New("project python section policy is invalid")
	ErrPythonSectionCodegenPolicyFieldUnknown        = errors.New("project python section policy field is unknown")
	ErrPythonSectionCodegenPolicyFieldInvalid        = errors.New("project python section policy field is invalid")
	ErrPythonCodeObjValuePolicyInvalid               = errors.New("project python code object value policy is invalid")
	ErrPythonCodeObjValuePolicyFieldUnknown          = errors.New("project python code object value policy field is unknown")
	ErrPythonCodeObjValuePolicyFieldInvalid          = errors.New("project python code object value policy field is invalid")
	ErrPythonSectionCodegenRepresentationUnsupported = errors.New("project python section representation is unsupported")
	ErrPythonCodeObjValueRepresentationUnsupported   = errors.New("project python code object value representation is unsupported")
)

type PythonSectionCodegenMode string

const (
	PythonSectionCodegenModeInherit PythonSectionCodegenMode = "inherit"
	PythonSectionCodegenModeInclude PythonSectionCodegenMode = "include"
	PythonSectionCodegenModeExclude PythonSectionCodegenMode = "exclude"
)

type PythonSectionRepresentationMode string

const (
	PythonSectionRepresentationExpression PythonSectionRepresentationMode = "expression"
	PythonSectionRepresentationFilePath   PythonSectionRepresentationMode = "file_path"
	PythonSectionRepresentationFileRead   PythonSectionRepresentationMode = "file_read"
)

type PythonSectionTypeCodegenPolicy struct {
	Mode           PythonSectionCodegenMode
	Representation PythonSectionRepresentationMode
}

type PythonSectionCodegenOverride struct {
	Mode           PythonSectionCodegenMode
	Representation PythonSectionRepresentationMode
}

type PythonSectionCodegenPolicy struct {
	AllowlistAllowAll            bool
	Allowlist                    map[string]struct{}
	MetaControlAllowlistAllowAll bool
	MetaControlAllowlist         map[string]struct{}
	Exclude                      map[string]struct{}
	TypePolicies                 map[string]PythonSectionTypeCodegenPolicy
	SectionOverrides             map[string]PythonSectionCodegenOverride
}

type ResolvedPythonSectionCodegenPolicy struct {
	IncludeInCodegen bool
	Representation   PythonSectionRepresentationMode
}

type PythonCodeObjValueRepresentationMode string

const (
	PythonCodeObjValueRepresentationExpression PythonCodeObjValueRepresentationMode = "expression"
	PythonCodeObjValueRepresentationJSONParsed PythonCodeObjValueRepresentationMode = "json_parsed"
	PythonCodeObjValueRepresentationString     PythonCodeObjValueRepresentationMode = "string"
	PythonCodeObjValueRepresentationFilePath   PythonCodeObjValueRepresentationMode = "file_path"
	PythonCodeObjValueRepresentationFileRead   PythonCodeObjValueRepresentationMode = "file_read"
)

type PythonCodeObjTypeValuePolicy struct {
	Representation PythonCodeObjValueRepresentationMode
}

type PythonCodeObjValueOverride struct {
	Representation PythonCodeObjValueRepresentationMode
}

type PythonCodeObjValuePolicy struct {
	TypePolicies     map[string]PythonCodeObjTypeValuePolicy
	CodeObjOverrides map[string]PythonCodeObjValueOverride
}

type ResolvedPythonCodeObjValuePolicy struct {
	Representation PythonCodeObjValueRepresentationMode
}

var (
	allPythonSectionTypes = []string{
		"Callable",
		"Dict",
		"ListRoot",
		"Group",
		"Image",
		"Chart",
		"Draw",
		"TextBlock",
		"Prompt",
		"MetaControl",
		"Social",
		"GlobalVariables",
		"Code",
		"GenPythonCode",
		"GenPythonMetadata",
		"Terminal",
		"IFrame",
		"Chat",
		"Browser",
		"Plugin",
		"TaskBoard",
		"Spreadsheet",
		"StateMachineStart",
		"StateMachineGate",
		"StateMachineEnd",
	}
	allPythonCodeObjTypes = []string{
		"CodeCallable",
		"CodeParam",
		"TextParam",
		"DateParam",
		"TimeParam",
		"ButtonParam",
		"SliderParam",
		"RotaryParam",
		"SwitchParam",
		"ColorPickerParam",
		"DropdownParam",
		"PasswordParam",
		"TextAreaParam",
		"DropzoneParam",
		"NestedParam",
	}
	defaultPythonSectionAllowlist = []string{
		"Callable",
		"Dict",
		"ListRoot",
		"Group",
		"GlobalVariables",
		"TextBlock",
		"Draw",
		"MetaControl",
		"TaskBoard",
		"Spreadsheet",
	}
	defaultPythonMetaControlAllowlist = []string{
		"CodeParam",
		"TextParam",
		"DateParam",
		"TimeParam",
		"TextAreaParam",
		"SliderParam",
		"RotaryParam",
		"SwitchParam",
		"ColorPickerParam",
		"DropdownParam",
		"PasswordParam",
		"ButtonParam",
		"DropzoneParam",
	}
	knownPythonSectionTypes = stringSliceToSet(allPythonSectionTypes)
	knownPythonCodeObjTypes = stringSliceToSet(allPythonCodeObjTypes)
)

func (target PythonCodegenTarget) DecodedSectionPolicy() (PythonSectionCodegenPolicy, error) {
	return DecodePythonSectionCodegenPolicy(target.SectionPolicy)
}

func (target PythonCodegenTarget) DecodedCodeObjValuePolicy() (PythonCodeObjValuePolicy, error) {
	return DecodePythonCodeObjValuePolicy(target.CodeObjValuePolicy)
}

func DefaultPythonSectionCodegenPolicy() PythonSectionCodegenPolicy {
	return PythonSectionCodegenPolicy{
		Allowlist:            stringSliceToSet(defaultPythonSectionAllowlist),
		MetaControlAllowlist: stringSliceToSet(defaultPythonMetaControlAllowlist),
		Exclude:              map[string]struct{}{},
		TypePolicies:         defaultPythonSectionTypePolicies(),
		SectionOverrides:     map[string]PythonSectionCodegenOverride{},
	}
}

func DefaultPythonCodeObjValuePolicy() PythonCodeObjValuePolicy {
	return PythonCodeObjValuePolicy{
		TypePolicies:     defaultPythonCodeObjTypePolicies(),
		CodeObjOverrides: map[string]PythonCodeObjValueOverride{},
	}
}

func DefaultPythonSectionTypeCodegenPolicy() PythonSectionTypeCodegenPolicy {
	return PythonSectionTypeCodegenPolicy{
		Mode:           PythonSectionCodegenModeInherit,
		Representation: PythonSectionRepresentationExpression,
	}
}

func DefaultPythonSectionCodegenOverride() PythonSectionCodegenOverride {
	return PythonSectionCodegenOverride{
		Mode:           PythonSectionCodegenModeInherit,
		Representation: PythonSectionRepresentationExpression,
	}
}

func DefaultPythonCodeObjTypeValuePolicy() PythonCodeObjTypeValuePolicy {
	return PythonCodeObjTypeValuePolicy{
		Representation: PythonCodeObjValueRepresentationExpression,
	}
}

func DefaultPythonCodeObjValueOverride() PythonCodeObjValueOverride {
	return PythonCodeObjValueOverride{
		Representation: PythonCodeObjValueRepresentationExpression,
	}
}

func DecodePythonSectionCodegenPolicy(raw RawJSON) (PythonSectionCodegenPolicy, error) {
	policy := DefaultPythonSectionCodegenPolicy()
	if len(raw) == 0 {
		return policy, nil
	}

	fields, err := decodePythonCodegenPolicyObject(raw, "section policy", ErrPythonSectionCodegenPolicyInvalid)
	if err != nil {
		return PythonSectionCodegenPolicy{}, err
	}
	for key, value := range fields {
		decoder, ok := pythonSectionCodegenPolicyFieldDecoders[key]
		if !ok {
			return PythonSectionCodegenPolicy{}, fmt.Errorf("%w: %s", ErrPythonSectionCodegenPolicyFieldUnknown, key)
		}
		if err := decoder(&policy, value); err != nil {
			return PythonSectionCodegenPolicy{}, err
		}
	}

	return policy, nil
}

func DecodePythonCodeObjValuePolicy(raw RawJSON) (PythonCodeObjValuePolicy, error) {
	policy := DefaultPythonCodeObjValuePolicy()
	if len(raw) == 0 {
		return policy, nil
	}

	fields, err := decodePythonCodegenPolicyObject(raw, "code object value policy", ErrPythonCodeObjValuePolicyInvalid)
	if err != nil {
		return PythonCodeObjValuePolicy{}, err
	}
	for key, value := range fields {
		switch key {
		case "typePolicies":
			decoded, err := decodePythonCodeObjTypePoliciesField(value)
			if err != nil {
				return PythonCodeObjValuePolicy{}, err
			}
			policy.TypePolicies = decoded
		case "codeObjOverrides":
			decoded, err := decodePythonCodeObjOverridesField(value)
			if err != nil {
				return PythonCodeObjValuePolicy{}, err
			}
			policy.CodeObjOverrides = decoded
		default:
			return PythonCodeObjValuePolicy{}, fmt.Errorf("%w: %s", ErrPythonCodeObjValuePolicyFieldUnknown, key)
		}
	}

	return policy, nil
}

func ResolvePythonSectionCodegenPolicy(
	policy PythonSectionCodegenPolicy,
	sectionID string,
	sectionType string,
	controlCodeObjType string,
) (ResolvedPythonSectionCodegenPolicy, error) {
	if _, ok := knownPythonSectionTypes[sectionType]; !ok {
		return ResolvedPythonSectionCodegenPolicy{}, fmt.Errorf("%w: unknown section type %q", ErrPythonSectionCodegenPolicyFieldInvalid, sectionType)
	}

	includeInCodegen := policy.AllowlistAllowAll
	if !policy.AllowlistAllowAll {
		_, includeInCodegen = policy.Allowlist[sectionType]
	}
	typePolicy, ok := policy.TypePolicies[sectionType]
	if !ok {
		typePolicy = PythonSectionTypeCodegenPolicy{
			Mode:           PythonSectionCodegenModeInherit,
			Representation: defaultPythonSectionRepresentation(sectionType),
		}
	}
	includeInCodegen = applyPythonSectionCodegenMode(includeInCodegen, typePolicy.Mode)
	representation := typePolicy.Representation
	if _, excluded := policy.Exclude[sectionID]; excluded {
		includeInCodegen = false
	}
	if override, ok := policy.SectionOverrides[sectionID]; ok {
		includeInCodegen = applyPythonSectionCodegenMode(includeInCodegen, override.Mode)
		representation = override.Representation
	}
	if sectionType == "MetaControl" && !policy.MetaControlAllowlistAllowAll {
		if _, ok := policy.MetaControlAllowlist[controlCodeObjType]; !ok {
			includeInCodegen = false
		}
	}
	if !isPythonSectionRepresentationSupported(sectionType, representation) {
		return ResolvedPythonSectionCodegenPolicy{}, fmt.Errorf(
			"%w: %s does not support %s",
			ErrPythonSectionCodegenRepresentationUnsupported,
			sectionType,
			representation,
		)
	}
	return ResolvedPythonSectionCodegenPolicy{
		IncludeInCodegen: includeInCodegen,
		Representation:   representation,
	}, nil
}

func ResolvePythonCodeObjValuePolicy(
	policy PythonCodeObjValuePolicy,
	codeObjID string,
	codeObjType string,
) (ResolvedPythonCodeObjValuePolicy, error) {
	if _, ok := knownPythonCodeObjTypes[codeObjType]; !ok {
		return ResolvedPythonCodeObjValuePolicy{}, fmt.Errorf("%w: unknown code object type %q", ErrPythonCodeObjValuePolicyFieldInvalid, codeObjType)
	}

	typePolicy, ok := policy.TypePolicies[codeObjType]
	if !ok {
		typePolicy = PythonCodeObjTypeValuePolicy{
			Representation: defaultPythonCodeObjValueRepresentation(codeObjType),
		}
	}
	representation := typePolicy.Representation
	if override, ok := policy.CodeObjOverrides[codeObjID]; ok {
		representation = override.Representation
	}
	if !isPythonCodeObjRepresentationSupported(codeObjType, representation) {
		return ResolvedPythonCodeObjValuePolicy{}, fmt.Errorf(
			"%w: %s does not support %s",
			ErrPythonCodeObjValueRepresentationUnsupported,
			codeObjType,
			representation,
		)
	}
	return ResolvedPythonCodeObjValuePolicy{
		Representation: representation,
	}, nil
}

func pythonSectionCodegenPoliciesEqual(left PythonSectionCodegenPolicy, right PythonSectionCodegenPolicy) bool {
	if left.AllowlistAllowAll != right.AllowlistAllowAll {
		return false
	}
	if !stringSetEqual(left.Allowlist, right.Allowlist) {
		return false
	}
	if left.MetaControlAllowlistAllowAll != right.MetaControlAllowlistAllowAll {
		return false
	}
	if !stringSetEqual(left.MetaControlAllowlist, right.MetaControlAllowlist) {
		return false
	}
	if !stringSetEqual(left.Exclude, right.Exclude) {
		return false
	}
	if !pythonSectionTypePolicyMapEqual(left.TypePolicies, right.TypePolicies) {
		return false
	}
	return pythonSectionOverrideMapEqual(left.SectionOverrides, right.SectionOverrides)
}

func pythonCodeObjValuePoliciesEqual(left PythonCodeObjValuePolicy, right PythonCodeObjValuePolicy) bool {
	if !pythonCodeObjTypePolicyMapEqual(left.TypePolicies, right.TypePolicies) {
		return false
	}
	return pythonCodeObjOverrideMapEqual(left.CodeObjOverrides, right.CodeObjOverrides)
}

func defaultPythonSectionTypePolicies() map[string]PythonSectionTypeCodegenPolicy {
	policies := make(map[string]PythonSectionTypeCodegenPolicy, len(allPythonSectionTypes))
	for _, sectionType := range allPythonSectionTypes {
		policy := DefaultPythonSectionTypeCodegenPolicy()
		policy.Representation = defaultPythonSectionRepresentation(sectionType)
		policies[sectionType] = policy
	}
	return policies
}

func defaultPythonCodeObjTypePolicies() map[string]PythonCodeObjTypeValuePolicy {
	policies := make(map[string]PythonCodeObjTypeValuePolicy, len(allPythonCodeObjTypes))
	for _, codeObjType := range allPythonCodeObjTypes {
		policy := DefaultPythonCodeObjTypeValuePolicy()
		policy.Representation = defaultPythonCodeObjValueRepresentation(codeObjType)
		policies[codeObjType] = policy
	}
	return policies
}

func defaultPythonSectionRepresentation(sectionType string) PythonSectionRepresentationMode {
	switch sectionType {
	case "Chat", "Draw", "Image":
		return PythonSectionRepresentationFileRead
	default:
		return PythonSectionRepresentationExpression
	}
}

func defaultPythonCodeObjValueRepresentation(codeObjType string) PythonCodeObjValueRepresentationMode {
	switch codeObjType {
	case "TextParam", "DateParam", "TimeParam", "TextAreaParam", "PasswordParam", "ColorPickerParam":
		return PythonCodeObjValueRepresentationString
	case "DropzoneParam":
		return PythonCodeObjValueRepresentationFilePath
	default:
		return PythonCodeObjValueRepresentationExpression
	}
}

type pythonSectionCodegenPolicyFieldDecoder func(policy *PythonSectionCodegenPolicy, raw json.RawMessage) error

var pythonSectionCodegenPolicyFieldDecoders = map[string]pythonSectionCodegenPolicyFieldDecoder{
	"allowlist":            decodePythonSectionAllowlistField,
	"metaControlAllowlist": decodePythonSectionMetaControlAllowlistField,
	"exclude":              decodePythonSectionExcludeField,
	"typePolicies":         decodePythonSectionTypePoliciesAssignment,
	"sectionOverrides":     decodePythonSectionOverridesAssignment,
}

func decodePythonSectionAllowlistField(policy *PythonSectionCodegenPolicy, raw json.RawMessage) error {
	decoded, allowAll, err := decodePythonCodegenStringSetField(
		raw,
		"allowlist",
		knownPythonSectionTypes,
		true,
		ErrPythonSectionCodegenPolicyFieldInvalid,
	)
	if err != nil {
		return err
	}
	policy.Allowlist = decoded
	policy.AllowlistAllowAll = allowAll
	return nil
}

func decodePythonSectionMetaControlAllowlistField(policy *PythonSectionCodegenPolicy, raw json.RawMessage) error {
	decoded, allowAll, err := decodePythonCodegenStringSetField(
		raw,
		"metaControlAllowlist",
		knownPythonCodeObjTypes,
		true,
		ErrPythonSectionCodegenPolicyFieldInvalid,
	)
	if err != nil {
		return err
	}
	policy.MetaControlAllowlist = decoded
	policy.MetaControlAllowlistAllowAll = allowAll
	return nil
}

func decodePythonSectionExcludeField(policy *PythonSectionCodegenPolicy, raw json.RawMessage) error {
	decoded, _, err := decodePythonCodegenStringSetField(
		raw,
		"exclude",
		nil,
		false,
		ErrPythonSectionCodegenPolicyFieldInvalid,
	)
	if err != nil {
		return err
	}
	policy.Exclude = decoded
	return nil
}

func decodePythonSectionTypePoliciesAssignment(policy *PythonSectionCodegenPolicy, raw json.RawMessage) error {
	decoded, err := decodePythonSectionTypePoliciesField(raw)
	if err != nil {
		return err
	}
	policy.TypePolicies = decoded
	return nil
}

func decodePythonSectionOverridesAssignment(policy *PythonSectionCodegenPolicy, raw json.RawMessage) error {
	decoded, err := decodePythonSectionOverridesField(raw)
	if err != nil {
		return err
	}
	policy.SectionOverrides = decoded
	return nil
}

func decodePythonSectionTypePoliciesField(raw json.RawMessage) (map[string]PythonSectionTypeCodegenPolicy, error) {
	policies := defaultPythonSectionTypePolicies()
	fields, err := decodePythonCodegenPolicyObject(raw, "section typePolicies", ErrPythonSectionCodegenPolicyFieldInvalid)
	if err != nil {
		return nil, err
	}
	for sectionType, value := range fields {
		if _, ok := knownPythonSectionTypes[sectionType]; !ok {
			return nil, fmt.Errorf("%w: typePolicies contains unknown section type %q", ErrPythonSectionCodegenPolicyFieldInvalid, sectionType)
		}
		decoded, err := decodePythonSectionTypePolicyValue(value)
		if err != nil {
			return nil, err
		}
		policies[sectionType] = decoded
	}
	return policies, nil
}

func decodePythonSectionOverridesField(raw json.RawMessage) (map[string]PythonSectionCodegenOverride, error) {
	fields, err := decodePythonCodegenPolicyObject(raw, "sectionOverrides", ErrPythonSectionCodegenPolicyFieldInvalid)
	if err != nil {
		return nil, err
	}
	overrides := make(map[string]PythonSectionCodegenOverride, len(fields))
	for sectionID, value := range fields {
		if strings.TrimSpace(sectionID) == "" {
			return nil, fmt.Errorf("%w: sectionOverrides contains an empty section id", ErrPythonSectionCodegenPolicyFieldInvalid)
		}
		decoded, err := decodePythonSectionOverrideValue(value)
		if err != nil {
			return nil, err
		}
		overrides[sectionID] = decoded
	}
	return overrides, nil
}

func decodePythonCodeObjTypePoliciesField(raw json.RawMessage) (map[string]PythonCodeObjTypeValuePolicy, error) {
	policies := defaultPythonCodeObjTypePolicies()
	fields, err := decodePythonCodegenPolicyObject(raw, "code object typePolicies", ErrPythonCodeObjValuePolicyFieldInvalid)
	if err != nil {
		return nil, err
	}
	for codeObjType, value := range fields {
		if _, ok := knownPythonCodeObjTypes[codeObjType]; !ok {
			return nil, fmt.Errorf("%w: typePolicies contains unknown code object type %q", ErrPythonCodeObjValuePolicyFieldInvalid, codeObjType)
		}
		decoded, err := decodePythonCodeObjTypePolicyValue(value)
		if err != nil {
			return nil, err
		}
		policies[codeObjType] = decoded
	}
	return policies, nil
}

func decodePythonCodeObjOverridesField(raw json.RawMessage) (map[string]PythonCodeObjValueOverride, error) {
	fields, err := decodePythonCodegenPolicyObject(raw, "codeObjOverrides", ErrPythonCodeObjValuePolicyFieldInvalid)
	if err != nil {
		return nil, err
	}
	overrides := make(map[string]PythonCodeObjValueOverride, len(fields))
	for codeObjID, value := range fields {
		if strings.TrimSpace(codeObjID) == "" {
			return nil, fmt.Errorf("%w: codeObjOverrides contains an empty code object id", ErrPythonCodeObjValuePolicyFieldInvalid)
		}
		decoded, err := decodePythonCodeObjOverrideValue(value)
		if err != nil {
			return nil, err
		}
		overrides[codeObjID] = decoded
	}
	return overrides, nil
}

func decodePythonSectionTypePolicyValue(raw json.RawMessage) (PythonSectionTypeCodegenPolicy, error) {
	fields, err := decodePythonCodegenPolicyObject(raw, "section type policy", ErrPythonSectionCodegenPolicyFieldInvalid)
	if err != nil {
		return PythonSectionTypeCodegenPolicy{}, err
	}
	policy := DefaultPythonSectionTypeCodegenPolicy()
	for key, value := range fields {
		switch key {
		case "mode":
			mode, err := decodePythonSectionCodegenModeValue(value, key, ErrPythonSectionCodegenPolicyFieldInvalid)
			if err != nil {
				return PythonSectionTypeCodegenPolicy{}, err
			}
			policy.Mode = mode
		case "representation":
			representation, err := decodePythonSectionRepresentationValue(value, key, ErrPythonSectionCodegenPolicyFieldInvalid)
			if err != nil {
				return PythonSectionTypeCodegenPolicy{}, err
			}
			policy.Representation = representation
		default:
			return PythonSectionTypeCodegenPolicy{}, fmt.Errorf("%w: unknown section type policy field %q", ErrPythonSectionCodegenPolicyFieldUnknown, key)
		}
	}
	return policy, nil
}

func decodePythonSectionOverrideValue(raw json.RawMessage) (PythonSectionCodegenOverride, error) {
	fields, err := decodePythonCodegenPolicyObject(raw, "section override", ErrPythonSectionCodegenPolicyFieldInvalid)
	if err != nil {
		return PythonSectionCodegenOverride{}, err
	}
	override := DefaultPythonSectionCodegenOverride()
	for key, value := range fields {
		switch key {
		case "mode":
			mode, err := decodePythonSectionCodegenModeValue(value, key, ErrPythonSectionCodegenPolicyFieldInvalid)
			if err != nil {
				return PythonSectionCodegenOverride{}, err
			}
			override.Mode = mode
		case "representation":
			representation, err := decodePythonSectionRepresentationValue(value, key, ErrPythonSectionCodegenPolicyFieldInvalid)
			if err != nil {
				return PythonSectionCodegenOverride{}, err
			}
			override.Representation = representation
		default:
			return PythonSectionCodegenOverride{}, fmt.Errorf("%w: unknown section override field %q", ErrPythonSectionCodegenPolicyFieldUnknown, key)
		}
	}
	return override, nil
}

func decodePythonCodeObjTypePolicyValue(raw json.RawMessage) (PythonCodeObjTypeValuePolicy, error) {
	fields, err := decodePythonCodegenPolicyObject(raw, "code object type policy", ErrPythonCodeObjValuePolicyFieldInvalid)
	if err != nil {
		return PythonCodeObjTypeValuePolicy{}, err
	}
	policy := DefaultPythonCodeObjTypeValuePolicy()
	for key, value := range fields {
		switch key {
		case "representation":
			representation, err := decodePythonCodeObjRepresentationValue(value, key, ErrPythonCodeObjValuePolicyFieldInvalid)
			if err != nil {
				return PythonCodeObjTypeValuePolicy{}, err
			}
			policy.Representation = representation
		default:
			return PythonCodeObjTypeValuePolicy{}, fmt.Errorf("%w: unknown code object type policy field %q", ErrPythonCodeObjValuePolicyFieldUnknown, key)
		}
	}
	return policy, nil
}

func decodePythonCodeObjOverrideValue(raw json.RawMessage) (PythonCodeObjValueOverride, error) {
	fields, err := decodePythonCodegenPolicyObject(raw, "code object override", ErrPythonCodeObjValuePolicyFieldInvalid)
	if err != nil {
		return PythonCodeObjValueOverride{}, err
	}
	override := DefaultPythonCodeObjValueOverride()
	for key, value := range fields {
		switch key {
		case "representation":
			representation, err := decodePythonCodeObjRepresentationValue(value, key, ErrPythonCodeObjValuePolicyFieldInvalid)
			if err != nil {
				return PythonCodeObjValueOverride{}, err
			}
			override.Representation = representation
		default:
			return PythonCodeObjValueOverride{}, fmt.Errorf("%w: unknown code object override field %q", ErrPythonCodeObjValuePolicyFieldUnknown, key)
		}
	}
	return override, nil
}

func decodePythonCodegenPolicyObject(raw RawJSON, label string, invalid error) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, fmt.Errorf("%w: decode %s: %v", invalid, label, err)
	}
	if fields == nil {
		return nil, fmt.Errorf("%w: %s must be a JSON object", invalid, label)
	}
	return fields, nil
}

func decodePythonCodegenStringSetField(
	raw json.RawMessage,
	field string,
	known map[string]struct{},
	allowNull bool,
	invalid error,
) (map[string]struct{}, bool, error) {
	trimmed := bytes.TrimSpace(raw)
	if allowNull && bytes.Equal(trimmed, []byte("null")) {
		return map[string]struct{}{}, true, nil
	}

	var values []string
	if err := json.Unmarshal(raw, &values); err != nil {
		if allowNull {
			return nil, false, fmt.Errorf("%w: %s must be an array of strings or null", invalid, field)
		}
		return nil, false, fmt.Errorf("%w: %s must be an array of strings", invalid, field)
	}

	decoded := make(map[string]struct{}, len(values))
	for _, value := range values {
		normalized := strings.TrimSpace(value)
		if normalized == "" {
			return nil, false, fmt.Errorf("%w: %s contains an empty string", invalid, field)
		}
		if known != nil {
			if _, ok := known[normalized]; !ok {
				return nil, false, fmt.Errorf("%w: %s contains unsupported value %q", invalid, field, normalized)
			}
		}
		decoded[normalized] = struct{}{}
	}
	return decoded, false, nil
}

func decodePythonSectionCodegenModeValue(
	raw json.RawMessage,
	field string,
	invalid error,
) (PythonSectionCodegenMode, error) {
	value, err := decodePythonPolicyStringValue(raw, field, invalid)
	if err != nil {
		return "", err
	}
	switch PythonSectionCodegenMode(value) {
	case PythonSectionCodegenModeInherit, PythonSectionCodegenModeInclude, PythonSectionCodegenModeExclude:
		return PythonSectionCodegenMode(value), nil
	default:
		return "", fmt.Errorf("%w: %s has unsupported mode %q", invalid, field, value)
	}
}

func decodePythonSectionRepresentationValue(
	raw json.RawMessage,
	field string,
	invalid error,
) (PythonSectionRepresentationMode, error) {
	value, err := decodePythonPolicyStringValue(raw, field, invalid)
	if err != nil {
		return "", err
	}
	switch PythonSectionRepresentationMode(value) {
	case PythonSectionRepresentationExpression, PythonSectionRepresentationFilePath, PythonSectionRepresentationFileRead:
		return PythonSectionRepresentationMode(value), nil
	default:
		return "", fmt.Errorf("%w: %s has unsupported representation %q", invalid, field, value)
	}
}

func decodePythonCodeObjRepresentationValue(
	raw json.RawMessage,
	field string,
	invalid error,
) (PythonCodeObjValueRepresentationMode, error) {
	value, err := decodePythonPolicyStringValue(raw, field, invalid)
	if err != nil {
		return "", err
	}
	switch PythonCodeObjValueRepresentationMode(value) {
	case PythonCodeObjValueRepresentationExpression,
		PythonCodeObjValueRepresentationJSONParsed,
		PythonCodeObjValueRepresentationString,
		PythonCodeObjValueRepresentationFilePath,
		PythonCodeObjValueRepresentationFileRead:
		return PythonCodeObjValueRepresentationMode(value), nil
	default:
		return "", fmt.Errorf("%w: %s has unsupported representation %q", invalid, field, value)
	}
}

func decodePythonPolicyStringValue(raw json.RawMessage, field string, invalid error) (string, error) {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", fmt.Errorf("%w: %s must be a string", invalid, field)
	}
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		return "", fmt.Errorf("%w: %s must not be empty", invalid, field)
	}
	return normalized, nil
}

func applyPythonSectionCodegenMode(current bool, mode PythonSectionCodegenMode) bool {
	switch mode {
	case PythonSectionCodegenModeInclude:
		return true
	case PythonSectionCodegenModeExclude:
		return false
	default:
		return current
	}
}

func isPythonSectionRepresentationSupported(sectionType string, representation PythonSectionRepresentationMode) bool {
	switch sectionType {
	case "Chat":
		return representation == PythonSectionRepresentationExpression ||
			representation == PythonSectionRepresentationFilePath ||
			representation == PythonSectionRepresentationFileRead
	case "Draw", "Image":
		return representation == PythonSectionRepresentationFilePath ||
			representation == PythonSectionRepresentationFileRead
	case "Chart":
		return representation == PythonSectionRepresentationExpression ||
			representation == PythonSectionRepresentationFilePath
	default:
		return representation == PythonSectionRepresentationExpression
	}
}

func isPythonCodeObjRepresentationSupported(codeObjType string, representation PythonCodeObjValueRepresentationMode) bool {
	switch codeObjType {
	case "ButtonParam", "CodeCallable", "NestedParam":
		return representation == PythonCodeObjValueRepresentationExpression
	case "DropzoneParam":
		return representation == PythonCodeObjValueRepresentationFilePath ||
			representation == PythonCodeObjValueRepresentationFileRead
	case "TextParam", "DateParam", "TimeParam", "TextAreaParam", "PasswordParam", "ColorPickerParam":
		return representation == PythonCodeObjValueRepresentationString
	case "CodeParam", "RotaryParam", "SwitchParam", "DropdownParam":
		return representation == PythonCodeObjValueRepresentationExpression ||
			representation == PythonCodeObjValueRepresentationString
	case "SliderParam":
		return representation == PythonCodeObjValueRepresentationExpression ||
			representation == PythonCodeObjValueRepresentationJSONParsed ||
			representation == PythonCodeObjValueRepresentationString
	default:
		return representation == PythonCodeObjValueRepresentationExpression
	}
}

func stringSliceToSet(values []string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		set[value] = struct{}{}
	}
	return set
}

func stringSetEqual(left map[string]struct{}, right map[string]struct{}) bool {
	if len(left) != len(right) {
		return false
	}
	for key := range left {
		if _, ok := right[key]; !ok {
			return false
		}
	}
	return true
}

func pythonSectionTypePolicyMapEqual(
	left map[string]PythonSectionTypeCodegenPolicy,
	right map[string]PythonSectionTypeCodegenPolicy,
) bool {
	if len(left) != len(right) {
		return false
	}
	for key, leftValue := range left {
		rightValue, ok := right[key]
		if !ok || leftValue != rightValue {
			return false
		}
	}
	return true
}

func pythonSectionOverrideMapEqual(
	left map[string]PythonSectionCodegenOverride,
	right map[string]PythonSectionCodegenOverride,
) bool {
	if len(left) != len(right) {
		return false
	}
	for key, leftValue := range left {
		rightValue, ok := right[key]
		if !ok || leftValue != rightValue {
			return false
		}
	}
	return true
}

func pythonCodeObjTypePolicyMapEqual(
	left map[string]PythonCodeObjTypeValuePolicy,
	right map[string]PythonCodeObjTypeValuePolicy,
) bool {
	if len(left) != len(right) {
		return false
	}
	for key, leftValue := range left {
		rightValue, ok := right[key]
		if !ok || leftValue != rightValue {
			return false
		}
	}
	return true
}

func pythonCodeObjOverrideMapEqual(
	left map[string]PythonCodeObjValueOverride,
	right map[string]PythonCodeObjValueOverride,
) bool {
	if len(left) != len(right) {
		return false
	}
	for key, leftValue := range left {
		rightValue, ok := right[key]
		if !ok || leftValue != rightValue {
			return false
		}
	}
	return true
}
