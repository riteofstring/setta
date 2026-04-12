package pythonsharedtypes

import (
	"fmt"
	"reflect"
	"strings"

	"setta/internal/sharedtypes"
)

const GeneratedPythonModulePath = "backend/setta/types/generated/go_shared_types.py"

func defaultSourcesFromSidecar(
	sidecar sharedtypes.SemanticSidecar,
	profiles ...string,
) (map[reflect.Type]reflect.Value, error) {
	profileRank := defaultSourceProfileRank(profiles)

	defaultSources := map[reflect.Type]reflect.Value{}
	selectedRankByType := map[reflect.Type]int{}
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
		applyEntry, err := shouldApplyDefaultSourceRank(selectedRankByType, typ, rank, entry.Type, entryProfile)
		if err != nil {
			return nil, err
		}
		if !applyEntry {
			continue
		}
		value, ok, err := coerceDefaultSourceValue(typ, entry.Value)
		if err != nil {
			return nil, fmt.Errorf("python shared types: sidecar default %s: %w", entry.Type, err)
		}
		if !ok {
			continue
		}
		defaultSources[typ] = value
		selectedRankByType[typ] = rank
	}
	return defaultSources, nil
}

func defaultSourceProfileRank(profiles []string) map[string]int {
	profileRank := map[string]int{}
	for index, profile := range profiles {
		trimmedProfile := strings.TrimSpace(profile)
		if trimmedProfile == "" {
			continue
		}
		if _, exists := profileRank[trimmedProfile]; exists {
			continue
		}
		profileRank[trimmedProfile] = index
	}
	return profileRank
}

func shouldApplyDefaultSourceRank(
	selectedRankByType map[reflect.Type]int,
	typ reflect.Type,
	rank int,
	entryType string,
	entryProfile string,
) (bool, error) {
	existingRank, exists := selectedRankByType[typ]
	if !exists {
		return true, nil
	}
	if existingRank < rank {
		return false, nil
	}
	if existingRank == rank {
		return false, fmt.Errorf(
			"python shared types: duplicate sidecar default %s for profile %s",
			entryType,
			entryProfile,
		)
	}
	return true, nil
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
