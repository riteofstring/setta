package pythonsharedtypes

import (
	"fmt"
	"reflect"
	"strings"
	"sync"

	"setta/internal/frontendbindingmeta"
	"setta/internal/sharedtypes"
)

const GeneratedPythonModulePath = "backend/setta/types/generated/go_shared_types.py"

type contractKind string

const (
	contractKindEnum  contractKind = "enum"
	contractKindModel contractKind = "model"
)

type enumValueSpec struct {
	Name  string
	Value string
}

type contractSpec struct {
	Name       string
	Kind       contractKind
	Type       reflect.Type
	EnumValues []enumValueSpec
}

type generationContext struct {
	ContractSpecs        []contractSpec
	AliasSpecs           []aliasSpec
	DefaultSourcesByType map[reflect.Type]reflect.Value
}

var (
	pythonSharedEnumSpecsOnce sync.Once
	pythonSharedEnumSpecs     map[reflect.Type]contractSpec
	pythonSharedEnumSpecsErr  error

	pythonSharedExternalContractsOnce sync.Once
	pythonSharedExternalContracts     map[string]struct{}
)

func buildGenerationContext() (generationContext, error) {
	sidecar, err := sharedtypes.BuildSemanticSidecar()
	if err != nil {
		return generationContext{}, err
	}

	defaultSources, err := defaultSourcesFromSidecar(
		sidecar,
		sharedtypes.DefaultProfilePythonShared,
		sharedtypes.DefaultProfileFrontend,
	)
	if err != nil {
		return generationContext{}, err
	}
	specs, err := contractSpecsFromSidecar(sidecar, defaultSources)
	if err != nil {
		return generationContext{}, err
	}
	aliases, err := aliasSpecsFromSharedSchema(sidecar)
	if err != nil {
		return generationContext{}, err
	}

	return generationContext{
		ContractSpecs:        specs,
		AliasSpecs:           aliases,
		DefaultSourcesByType: defaultSources,
	}, nil
}

func contractSpecsFromSidecar(
	sidecar sharedtypes.SemanticSidecar,
	defaultSourcesByType map[reflect.Type]reflect.Value,
) ([]contractSpec, error) {
	specs := []contractSpec{}
	seenNames := map[string]struct{}{}

	for _, entry := range sidecar.Contracts {
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			continue
		}
		if _, alreadySeen := seenNames[name]; alreadySeen {
			continue
		}

		typ, ok := sharedtypes.TypeByContractName(name)
		if !ok && !(contractKind(strings.TrimSpace(entry.Kind)) == contractKindEnum &&
			strings.TrimSpace(entry.SchemaRef) == "") {
			return nil, fmt.Errorf("python shared types: missing discovered type for sidecar contract %s", name)
		}

		switch contractKind(strings.TrimSpace(entry.Kind)) {
		case contractKindEnum:
			spec, err := enumContractSpecFromSidecarEntry(name, typ, entry.EnumValues)
			if err != nil {
				return nil, err
			}
			specs = append(specs, spec)
		case contractKindModel:
			spec, ok, err := modelContractSpecIfConvertible(typ, defaultSourcesByType)
			if err != nil {
				return nil, err
			}
			if !ok {
				continue
			}
			spec.Name = name
			spec.Type = typ
			specs = append(specs, spec)
		default:
			continue
		}
		seenNames[name] = struct{}{}
	}

	return specs, nil
}

func defaultSourcesFromSidecar(
	sidecar sharedtypes.SemanticSidecar,
	profiles ...string,
) (map[reflect.Type]reflect.Value, error) {
	profileRank := map[string]int{}
	for index, profile := range profiles {
		profile = strings.TrimSpace(profile)
		if profile == "" {
			continue
		}
		if _, exists := profileRank[profile]; exists {
			continue
		}
		profileRank[profile] = index
	}
	defaultSources := map[reflect.Type]reflect.Value{}
	selectedProfileByType := map[reflect.Type]string{}
	for _, entry := range sidecar.Defaults {
		entryProfile := strings.TrimSpace(entry.Profile)
		rank, ok := profileRank[entryProfile]
		if !ok {
			continue
		}
		typ, ok := sharedtypes.TypeByContractName(entry.Type)
		if !ok {
			return nil, fmt.Errorf("python shared types: missing discovered type for sidecar default %s", entry.Type)
		}
		if existingProfile, exists := selectedProfileByType[typ]; exists {
			existingRank := profileRank[existingProfile]
			if existingRank < rank {
				continue
			}
			if existingRank == rank {
				return nil, fmt.Errorf(
					"python shared types: duplicate sidecar default %s for profile %s",
					entry.Type,
					entryProfile,
				)
			}
		}
		value, ok, err := coerceDefaultSourceValue(typ, entry.Value)
		if err != nil {
			return nil, fmt.Errorf("python shared types: sidecar default %s: %w", entry.Type, err)
		}
		if ok {
			defaultSources[typ] = value
			selectedProfileByType[typ] = entryProfile
		}
	}
	return defaultSources, nil
}

func coerceDefaultSourceValue(
	targetType reflect.Type,
	value any,
) (reflect.Value, bool, error) {
	reflectValue := reflect.ValueOf(value)
	if !reflectValue.IsValid() {
		return reflect.Value{}, false, nil
	}
	if reflectValue.Type() == targetType {
		return reflectValue, true, nil
	}
	if reflectValue.Type().ConvertibleTo(targetType) {
		return reflectValue.Convert(targetType), true, nil
	}
	return reflect.Value{}, false, fmt.Errorf(
		"default value type %s is not assignable to %s",
		reflectValue.Type(),
		targetType,
	)
}

func enumContractSpecFromSidecarEntry(
	name string,
	typ reflect.Type,
	enumValues []sharedtypes.EnumValueEntry,
) (contractSpec, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return contractSpec{}, fmt.Errorf("python shared types: sidecar enum has empty name")
	}
	resolvedEnumValues := make([]enumValueSpec, 0, len(enumValues))
	for _, value := range enumValues {
		resolvedEnumValues = append(resolvedEnumValues, enumValueSpec{
			Name:  value.Name,
			Value: value.Value,
		})
	}
	if len(resolvedEnumValues) == 0 {
		return contractSpec{}, fmt.Errorf("python shared types: sidecar enum %s has no enum values", name)
	}
	return contractSpec{
		Name:       name,
		Kind:       contractKindEnum,
		Type:       typ,
		EnumValues: resolvedEnumValues,
	}, nil
}

func enumContractSpecIfConvertible(t reflect.Type) (contractSpec, bool, error) {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil {
		return contractSpec{}, false, nil
	}
	specs, err := pythonSharedEnumContractSpecs()
	if err != nil {
		return contractSpec{}, false, err
	}
	spec, ok := specs[t]
	if !ok {
		return contractSpec{}, false, nil
	}
	return spec, true, nil
}

func pythonSharedEnumContractSpecs() (map[reflect.Type]contractSpec, error) {
	pythonSharedEnumSpecsOnce.Do(func() {
		sidecar, err := sharedtypes.BuildSemanticSidecar()
		if err != nil {
			pythonSharedEnumSpecsErr = err
			return
		}
		specs := map[reflect.Type]contractSpec{}
		for _, entry := range sidecar.Contracts {
			if contractKind(strings.TrimSpace(entry.Kind)) != contractKindEnum {
				continue
			}
			name := strings.TrimSpace(entry.Name)
			if name == "" {
				continue
			}
			typ, ok := sharedtypes.TypeByContractName(name)
			if !ok {
				if strings.TrimSpace(entry.SchemaRef) == "" {
					continue
				}
				pythonSharedEnumSpecsErr = fmt.Errorf("python shared types: missing discovered type for sidecar enum %s", name)
				return
			}
			spec, err := enumContractSpecFromSidecarEntry(name, typ, entry.EnumValues)
			if err != nil {
				pythonSharedEnumSpecsErr = err
				return
			}
			specs[typ] = spec
		}
		pythonSharedEnumSpecs = specs
	})
	if pythonSharedEnumSpecsErr != nil {
		return nil, pythonSharedEnumSpecsErr
	}
	return pythonSharedEnumSpecs, nil
}

func modelContractSpecIfConvertible(
	t reflect.Type,
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (contractSpec, bool, error) {
	spec := contractSpec{
		Name: pythonSharedContractNameForType(t),
		Kind: contractKindModel,
		Type: t,
	}
	if _, ok := pythonExternalTypeModules[t.PkgPath()]; ok {
		return contractSpec{}, false, nil
	}
	hasSchemaAlias, err := pythonSharedTypeHasSchemaAlias(t)
	if err != nil {
		return contractSpec{}, false, err
	}
	if hasSchemaAlias {
		return contractSpec{}, false, nil
	}
	if _, ok := pythonSharedExternalContractNames()[spec.Name]; ok {
		return contractSpec{}, false, nil
	}
	if modelReferencesExternalPythonModule(t) {
		return contractSpec{}, false, nil
	}
	if modelReferencesSyntheticUnionType(t) {
		return contractSpec{}, false, nil
	}
	if modelReferencesExternalSharedContract(t) {
		return contractSpec{}, false, nil
	}
	if _, err := buildModelSpecWithDefaultSources(
		spec,
		map[string]struct{}{spec.Name: {}},
		defaultSourcesByType,
	); err != nil {
		return contractSpec{}, false, nil
	}
	return spec, true, nil
}

func pythonSharedDefaultValueForField(
	ownerType reflect.Type,
	field reflect.StructField,
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (reflect.Value, bool) {
	defaultSource, ok := defaultSourcesByType[ownerType]
	if !ok {
		return reflect.Value{}, false
	}
	return defaultSource.FieldByIndex(field.Index), true
}

func pythonSharedContractNameForType(t reflect.Type) string {
	return sharedtypes.ContractNameForType(t)
}

func modelReferencesExternalSharedContract(t reflect.Type) bool {
	if t == nil || t.Kind() != reflect.Struct {
		return false
	}
	for _, field := range visibleFields(t) {
		if strings.TrimSpace(field.Tag.Get("py_type")) != "" {
			continue
		}
		if len(externalPythonImportContractNames(field.Tag.Get("py_import"))) > 0 {
			return true
		}
	}
	return false
}

func modelReferencesExternalPythonModule(t reflect.Type) bool {
	if t == nil || t.Kind() != reflect.Struct {
		return false
	}
	for _, field := range visibleFields(t) {
		if strings.TrimSpace(field.Tag.Get("py_type")) != "" {
			continue
		}
		if typeUsesExternalPythonModule(field.Type) {
			return true
		}
	}
	return false
}

func modelReferencesSyntheticUnionType(t reflect.Type) bool {
	if t == nil || t.Kind() != reflect.Struct {
		return false
	}
	for _, field := range visibleFields(t) {
		if strings.TrimSpace(field.Tag.Get("py_type")) != "" {
			continue
		}
		if typeUsesSyntheticUnion(field.Type) {
			return true
		}
	}
	return false
}

func typeUsesExternalPythonModule(t reflect.Type) bool {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil {
		return false
	}
	if _, ok := pythonExternalTypeModules[t.PkgPath()]; ok && t.Name() != "" {
		return true
	}
	switch t.Kind() {
	case reflect.Slice, reflect.Array, reflect.Chan:
		return typeUsesExternalPythonModule(t.Elem())
	case reflect.Map:
		return typeUsesExternalPythonModule(t.Key()) || typeUsesExternalPythonModule(t.Elem())
	default:
		return false
	}
}

func typeUsesSyntheticUnion(t reflect.Type) bool {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil {
		return false
	}
	if _, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.UnionTypesProvider](t); ok {
		hasSchemaAlias, err := pythonSharedTypeHasSchemaAlias(t)
		return err != nil || !hasSchemaAlias
	}
	switch t.Kind() {
	case reflect.Slice, reflect.Array, reflect.Chan:
		return typeUsesSyntheticUnion(t.Elem())
	case reflect.Map:
		return typeUsesSyntheticUnion(t.Key()) || typeUsesSyntheticUnion(t.Elem())
	default:
		return false
	}
}

func pythonSharedExternalContractNames() map[string]struct{} {
	pythonSharedExternalContractsOnce.Do(func() {
		names := map[string]struct{}{}
		for _, t := range sharedtypes.DiscoveredTypes() {
			if t == nil || t.Kind() != reflect.Struct {
				continue
			}
			for _, field := range visibleFields(t) {
				importTag := strings.TrimSpace(field.Tag.Get("py_import"))
				if importTag == "" {
					continue
				}
				for _, name := range externalPythonImportContractNames(importTag) {
					if _, ok := sharedtypes.TypeByContractName(name); ok {
						names[name] = struct{}{}
					}
				}
			}
		}
		pythonSharedExternalContracts = names
	})
	return pythonSharedExternalContracts
}

func pythonImportedNames(importTag string) []string {
	names := []string{}
	seen := map[string]struct{}{}
	for _, line := range strings.Split(importTag, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "from ") {
			continue
		}
		_, imported, ok := strings.Cut(strings.TrimPrefix(line, "from "), " import ")
		if !ok {
			continue
		}
		for _, part := range strings.Split(imported, ",") {
			name := strings.TrimSpace(part)
			if before, _, ok := strings.Cut(name, " as "); ok {
				name = strings.TrimSpace(before)
			}
			if name == "" {
				continue
			}
			if _, duplicate := seen[name]; duplicate {
				continue
			}
			seen[name] = struct{}{}
			names = append(names, name)
		}
	}
	return names
}

func externalPythonImportContractNames(importTag string) []string {
	names := []string{}
	seen := map[string]struct{}{}
	for _, line := range strings.Split(importTag, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "from ") {
			continue
		}
		moduleAndNames := strings.TrimPrefix(line, "from ")
		module, imported, ok := strings.Cut(moduleAndNames, " import ")
		if !ok {
			continue
		}
		if strings.TrimSpace(module) == "setta.types.generated.go_shared_types" {
			continue
		}
		for _, name := range pythonImportedNames("from x import " + imported) {
			if !pythonImportedContractShouldRemainExternal(name) {
				continue
			}
			if _, duplicate := seen[name]; duplicate {
				continue
			}
			seen[name] = struct{}{}
			names = append(names, name)
		}
	}
	return names
}

func pythonImportedContractShouldRemainExternal(name string) bool {
	typ, ok := sharedtypes.TypeByContractName(name)
	if !ok {
		return false
	}
	if typeUsesExternalPythonModule(typ) || typeUsesSyntheticUnion(typ) {
		return true
	}
	return typ.Kind() == reflect.Struct
}
