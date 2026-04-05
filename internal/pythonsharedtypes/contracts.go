package pythonsharedtypes

import (
	"fmt"
	"reflect"
	"strings"
	"sync"

	"setta/internal/sharedtypes"
)

const GeneratedPythonModulePath = "backend/setta/types/generated/go_shared_types.py"

type generationContext struct {
	SemanticSidecar      sharedtypes.SemanticSidecar
	DefaultSourcesByType map[reflect.Type]reflect.Value
}

var (
	pythonSharedEnumNamesOnce sync.Once
	pythonSharedEnumNames     map[reflect.Type]string
	pythonSharedEnumNamesErr  error
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
		SemanticSidecar:      sidecar,
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

func pythonSharedEnumContractName(t reflect.Type) (string, bool, error) {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil {
		return "", false, nil
	}
	names, err := pythonSharedEnumContractNames()
	if err != nil {
		return "", false, err
	}
	name, ok := names[t]
	if !ok {
		return "", false, nil
	}
	return name, true, nil
}

func pythonSharedEnumContractNames() (map[reflect.Type]string, error) {
	pythonSharedEnumNamesOnce.Do(func() {
		sidecar, err := sharedtypes.BuildSemanticSidecar()
		if err != nil {
			pythonSharedEnumNamesErr = err
			return
		}
		names := map[reflect.Type]string{}
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
				continue
			}
			names[typ] = name
		}
		pythonSharedEnumNames = names
	})
	if pythonSharedEnumNamesErr != nil {
		return nil, pythonSharedEnumNamesErr
	}
	return pythonSharedEnumNames, nil
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
