package pythonsharedtypes

import (
	"fmt"
	"reflect"
	"strings"
	"sync"

	"setta/internal/sharedtypes"
)

const GeneratedPythonModulePath = "backend/setta/types/generated/go_shared_types.py"

type enumValueSpec struct {
	Name  string
	Value string
}

type contractSpec struct {
	Name       string
	Type       reflect.Type
	EnumValues []enumValueSpec
}

type generationContext struct {
	Sidecar              sharedtypes.SemanticSidecar
	DefaultSourcesByType map[reflect.Type]reflect.Value
}

var (
	pythonSharedEnumSpecsOnce sync.Once
	pythonSharedEnumSpecs     map[reflect.Type]contractSpec
	pythonSharedEnumSpecsErr  error
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

	return generationContext{
		Sidecar:              sidecar,
		DefaultSourcesByType: defaultSources,
	}, nil
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
			if strings.TrimSpace(entry.Kind) != "enum" {
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
