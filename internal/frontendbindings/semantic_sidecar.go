package frontendbindings

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"sync"
)

const semanticSidecarRelativePath = "frontend/generation/non_http_shared/sidecar.json"

type semanticSidecarManifest struct {
	Contracts             []semanticContractEntry       `json:"contracts"`
	Defaults              []semanticDefaultEntry        `json:"defaults"`
	ExportedValues        []semanticExportedValueEntry  `json:"exportedValues"`
	DiscriminatedFamilies []semanticDiscriminatedFamily `json:"discriminatedFamilies"`
}

type semanticContractEntry struct {
	Name       string          `json:"name"`
	Kind       string          `json:"kind"`
	EnumValues []TypeEnumValue `json:"enumValues"`
}

type semanticDefaultEntry struct {
	Profile string          `json:"profile,omitempty"`
	Type    string          `json:"type"`
	Value   json.RawMessage `json:"value"`
}

type semanticExportedValueEntry struct {
	Name  string          `json:"name"`
	Type  string          `json:"type"`
	Value json.RawMessage `json:"value"`
}

type semanticDiscriminatedFamily struct {
	BaseType                     string                           `json:"baseType"`
	EnumType                     string                           `json:"enumType"`
	Members                      []semanticDiscriminatedMember    `json:"members"`
	Traits                       []semanticDiscriminatedTraitSpec `json:"traits"`
	DefaultValuesByDiscriminator map[string]json.RawMessage       `json:"defaultValuesByDiscriminator"`
}

type semanticDiscriminatedMember struct {
	Name               string `json:"name"`
	DiscriminatorValue string `json:"discriminatorValue"`
}

type semanticDiscriminatedTraitSpec struct {
	UnionName   string   `json:"unionName"`
	LocalUnion  bool     `json:"localUnion"`
	IncludeBase bool     `json:"includeBase"`
	MemberTypes []string `json:"memberTypes"`
}

var (
	semanticSidecarManifestOnce sync.Once
	cachedSemanticSidecar       semanticSidecarManifest
	cachedSemanticSidecarErr    error
)

const semanticDefaultProfileFrontend = "frontend"

func semanticContractDeclarations(converter *typeConverter) ([]TypeDeclaration, error) {
	manifest, err := loadSemanticSidecarManifest()
	if err != nil {
		return nil, err
	}

	typesByName := frontendBindingTypesByName()
	familyDefaultsByMemberName, err := semanticFamilyDefaultsByMemberName(manifest)
	if err != nil {
		return nil, err
	}

	declarations := []TypeDeclaration{}
	for _, contract := range manifest.Contracts {
		name := strings.TrimSpace(contract.Name)
		if name == "" {
			continue
		}
		if strings.TrimSpace(contract.Kind) == "enum" {
			continue
		}
		declarations = append(declarations, aliasDeclaration(name, "gt."+name))

		typ, ok := typesByName[name]
		if !ok {
			continue
		}
		typ = canonicalFrontendBindingType(typ)
		if typ == nil || typ.Kind() != reflect.Struct {
			continue
		}

		createDeclaration, err := semanticCreateFunctionDeclaration(
			converter,
			name,
			typ,
			familyDefaultsByMemberName[name],
		)
		if err != nil {
			return nil, err
		}
		declarations = append(declarations, createDeclaration)
	}
	return declarations, nil
}

func semanticCreateFunctionDeclaration(
	converter *typeConverter,
	typeName string,
	typ reflect.Type,
	familyDefault json.RawMessage,
) (TypeDeclaration, error) {
	defaultValue, ok, err := semanticDefaultValueForType(typ, semanticDefaultProfileFrontend)
	if err != nil {
		return TypeDeclaration{}, err
	}
	if ok {
		return converter.goBackedCreateFunctionDeclaration(typ, defaultValue)
	}
	if len(familyDefault) > 0 {
		defaultValue, err := decodeSemanticDefaultValue(typ, familyDefault)
		if err != nil {
			return TypeDeclaration{}, fmt.Errorf(
				"frontend semantic sidecar family default %s: %w",
				typeName,
				err,
			)
		}
		return converter.goBackedCreateFunctionDeclaration(typ, defaultValue)
	}
	return exportedFunctionDeclaration(
		"create"+typeName,
		typeName,
		"  return options as "+typeName+";",
		TypeProperty{
			Name:         "options",
			TypeExpr:     "Partial<" + typeName + ">",
			DefaultValue: "{}",
		},
	), nil
}

func semanticFamilyDefaultsByMemberName(
	manifest semanticSidecarManifest,
) (map[string]json.RawMessage, error) {
	defaults := map[string]json.RawMessage{}
	for _, family := range manifest.DiscriminatedFamilies {
		baseType := strings.TrimSpace(family.BaseType)
		for discriminatorValue, rawDefault := range family.DefaultValuesByDiscriminator {
			memberTypeName, ok := memberTypeNameForDiscriminator(family.Members, discriminatorValue)
			if !ok {
				return nil, fmt.Errorf(
					"frontend semantic sidecar family %s discriminator %q has no matching member",
					baseType,
					discriminatorValue,
				)
			}
			if _, exists := defaults[memberTypeName]; exists {
				continue
			}
			defaults[memberTypeName] = rawDefault
		}
	}
	return defaults, nil
}

func semanticEnumDeclarations() ([]TypeDeclaration, error) {
	manifest, err := loadSemanticSidecarManifest()
	if err != nil {
		return nil, err
	}

	declarations := []TypeDeclaration{}
	for _, contract := range manifest.Contracts {
		name := strings.TrimSpace(contract.Name)
		if name == "" || strings.TrimSpace(contract.Kind) != "enum" {
			continue
		}
		declarations = append(declarations, TypeDeclaration{
			Name:       name,
			Kind:       "enum",
			EnumValues: append([]TypeEnumValue(nil), contract.EnumValues...),
		})
	}
	return declarations, nil
}

func semanticExportedValueDeclarations() ([]TypeDeclaration, error) {
	manifest, err := loadSemanticSidecarManifest()
	if err != nil {
		return nil, err
	}

	declarations := make([]TypeDeclaration, 0, len(manifest.ExportedValues))
	for _, export := range manifest.ExportedValues {
		name := strings.TrimSpace(export.Name)
		if name == "" {
			return nil, fmt.Errorf("frontend semantic sidecar export has empty name")
		}
		typeName := strings.TrimSpace(export.Type)
		if typeName == "" {
			return nil, fmt.Errorf("frontend semantic sidecar export %s is missing type", name)
		}
		value, err := decodeSemanticJSONValue(export.Value)
		if err != nil {
			return nil, fmt.Errorf("frontend semantic sidecar export %s: %w", name, err)
		}
		declarations = append(declarations, constDeclaration(
			name,
			true,
			renderTSLiteralValue(value, "")+" satisfies gt."+typeName,
		))
	}
	return declarations, nil
}

func semanticDefaultValueForType(
	t reflect.Type,
	profile string,
) (any, bool, error) {
	manifest, err := loadSemanticSidecarManifest()
	if err != nil {
		return nil, false, err
	}

	typeName := strings.TrimSpace(frontendBindingTypeName(t))
	profile = strings.TrimSpace(profile)
	if typeName == "" || profile == "" {
		return nil, false, nil
	}

	var matched *semanticDefaultEntry
	for index := range manifest.Defaults {
		entry := &manifest.Defaults[index]
		if strings.TrimSpace(entry.Type) != typeName || strings.TrimSpace(entry.Profile) != profile {
			continue
		}
		if matched != nil {
			return nil, false, fmt.Errorf(
				"frontend semantic sidecar has duplicate default %s for profile %s",
				typeName,
				profile,
			)
		}
		matched = entry
	}
	if matched == nil {
		return nil, false, nil
	}

	value, err := decodeSemanticDefaultValue(canonicalFrontendBindingType(t), matched.Value)
	if err != nil {
		return nil, false, fmt.Errorf(
			"frontend semantic sidecar default %s for profile %s: %w",
			typeName,
			profile,
			err,
		)
	}
	return value, true, nil
}

func semanticDiscriminatedFamilyDeclarations() ([]TypeDeclaration, error) {
	manifest, err := loadSemanticSidecarManifest()
	if err != nil {
		return nil, err
	}

	declarations := make([]TypeDeclaration, 0, len(manifest.DiscriminatedFamilies)*4)
	for _, family := range manifest.DiscriminatedFamilies {
		baseType := strings.TrimSpace(family.BaseType)
		enumType := strings.TrimSpace(family.EnumType)
		if baseType == "" {
			return nil, fmt.Errorf("frontend semantic sidecar family is missing baseType")
		}
		if enumType == "" {
			return nil, fmt.Errorf("frontend semantic sidecar family %s is missing enumType", baseType)
		}

		declarations = append(declarations, aliasDeclaration(baseType+"Union", "gt."+baseType+"Union"))

		memberValuesByName := make(map[string]string, len(family.Members))
		for _, member := range family.Members {
			name := strings.TrimSpace(member.Name)
			value := strings.TrimSpace(member.DiscriminatorValue)
			if name == "" {
				return nil, fmt.Errorf("frontend semantic sidecar family %s has a member with empty name", baseType)
			}
			if value == "" {
				return nil, fmt.Errorf("frontend semantic sidecar family %s member %s has empty discriminatorValue", baseType, name)
			}
			memberValuesByName[name] = value
		}

		for _, trait := range family.Traits {
			unionName := strings.TrimSpace(trait.UnionName)
			if unionName == "" {
				continue
			}
			memberTypeNames, memberValues, err := orderedTraitMembers(family.Members, trait.MemberTypes, memberValuesByName)
			if err != nil {
				return nil, fmt.Errorf("frontend semantic sidecar family %s trait %s: %w", baseType, unionName, err)
			}
			if len(memberTypeNames) == 0 {
				continue
			}

			returnTypeMembers := append([]string(nil), memberTypeNames...)
			if trait.IncludeBase {
				returnTypeMembers = append([]string{baseType}, returnTypeMembers...)
			}
			returnType := unionAliasExpr(returnTypeMembers...)
			if !trait.LocalUnion {
				declarations = append(declarations, aliasDeclaration(unionName, "gt."+unionName))
				returnType = unionName
			}

			traitTypeName := strings.TrimSuffix(unionName, "Union")
			traitSetName := traitTypeName + "TypeSet"
			declarations = append(declarations,
				setDeclaration(traitSetName, enumType, memberValues...),
				typeGuardDeclaration("is"+traitTypeName, baseType+"Union", returnType, traitSetName),
			)
		}

	}
	return declarations, nil
}

func frontendBindingTypesByName() map[string]reflect.Type {
	typesByName := make(map[string]reflect.Type, len(frontendBindingPublicTypeNames()))
	for t, name := range frontendBindingPublicTypeNames() {
		trimmedName := strings.TrimSpace(name)
		if trimmedName == "" {
			continue
		}
		typesByName[trimmedName] = t
	}
	return typesByName
}

func memberTypeNameForDiscriminator(members []semanticDiscriminatedMember, discriminatorValue string) (string, bool) {
	for _, member := range members {
		if member.DiscriminatorValue == discriminatorValue {
			return strings.TrimSpace(member.Name), true
		}
	}
	return "", false
}

func decodeSemanticDefaultValue(t reflect.Type, rawDefault json.RawMessage) (any, error) {
	valuePtr := reflect.New(t)
	if err := json.Unmarshal(rawDefault, valuePtr.Interface()); err != nil {
		return nil, err
	}
	return valuePtr.Elem().Interface(), nil
}

func decodeSemanticJSONValue(rawValue json.RawMessage) (any, error) {
	var value any
	if err := json.Unmarshal(rawValue, &value); err != nil {
		return nil, err
	}
	return value, nil
}

func orderedTraitMembers(
	members []semanticDiscriminatedMember,
	traitMemberTypes []string,
	memberValuesByName map[string]string,
) ([]string, []string, error) {
	if len(traitMemberTypes) == 0 {
		return nil, nil, nil
	}

	allowed := make(map[string]struct{}, len(traitMemberTypes))
	for _, memberType := range traitMemberTypes {
		name := strings.TrimSpace(memberType)
		if name == "" {
			continue
		}
		allowed[name] = struct{}{}
	}

	memberTypeNames := make([]string, 0, len(allowed))
	memberValues := make([]string, 0, len(allowed))
	for _, member := range members {
		name := strings.TrimSpace(member.Name)
		if _, ok := allowed[name]; !ok {
			continue
		}
		value, ok := memberValuesByName[name]
		if !ok {
			return nil, nil, fmt.Errorf("missing discriminator value for member %s", name)
		}
		memberTypeNames = append(memberTypeNames, name)
		memberValues = append(memberValues, fmt.Sprintf("%q", value))
		delete(allowed, name)
	}
	if len(allowed) > 0 {
		missing := make([]string, 0, len(allowed))
		for name := range allowed {
			missing = append(missing, name)
		}
		sort.Strings(missing)
		return nil, nil, fmt.Errorf("missing members in sidecar family: %s", strings.Join(missing, ", "))
	}
	return memberTypeNames, memberValues, nil
}

func loadSemanticSidecarManifest() (semanticSidecarManifest, error) {
	semanticSidecarManifestOnce.Do(func() {
		path, err := semanticSidecarManifestPath()
		if err != nil {
			cachedSemanticSidecarErr = err
			return
		}
		payload, err := os.ReadFile(path)
		if err != nil {
			cachedSemanticSidecarErr = fmt.Errorf("read frontend semantic sidecar %s: %w", path, err)
			return
		}
		if err := json.Unmarshal(payload, &cachedSemanticSidecar); err != nil {
			cachedSemanticSidecarErr = fmt.Errorf("decode frontend semantic sidecar %s: %w", path, err)
		}
	})
	if cachedSemanticSidecarErr != nil {
		return semanticSidecarManifest{}, cachedSemanticSidecarErr
	}
	return cachedSemanticSidecar, nil
}

func semanticSidecarManifestPath() (string, error) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("resolve frontend semantic sidecar path: runtime caller lookup failed")
	}
	repoRoot := filepath.Dir(filepath.Dir(filepath.Dir(currentFile)))
	return filepath.Join(repoRoot, semanticSidecarRelativePath), nil
}
