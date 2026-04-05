package pythonsharedtypes

import (
	"fmt"
	"reflect"
	"strings"

	"setta/internal/projectview"
	"setta/internal/sharedtypes"
	"setta/internal/stringenumvalues"
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
	DefaultSourcesByType map[reflect.Type]reflect.Value
}

var pythonSharedEnumFallbackPackages = []string{
	"setta/internal/projectstate",
	"setta/internal/artifacts",
	"setta/internal/runs",
}

type pythonSharedDefaultFieldKey struct {
	OwnerType reflect.Type
	FieldName string
}

var pythonSharedExplicitDefaultSourcesByType = map[reflect.Type]func() any{
	reflect.TypeOf(projectview.ProjectConfig{}): func() any {
		return projectview.PythonSharedDefaultProjectConfig()
	},
}

var pythonSharedDefaultFieldOverrides = map[pythonSharedDefaultFieldKey]func() any{
	{
		OwnerType: reflect.TypeOf(projectview.ProjectConfig{}),
		FieldName: "CodegenTargets",
	}: func() any {
		return []projectview.ProjectCodegenPythonTarget{
			projectview.FrontendDefaultProjectCodegenPythonTarget(),
		}
	},
}

func buildGenerationContext() (generationContext, error) {
	sidecar, err := sharedtypes.BuildSemanticSidecar()
	if err != nil {
		return generationContext{}, err
	}

	defaultSources, err := defaultSourcesFromSidecar(sidecar)
	if err != nil {
		return generationContext{}, err
	}
	specs, err := contractSpecsFromSidecar(sidecar, defaultSources)
	if err != nil {
		return generationContext{}, err
	}
	for t, buildSource := range pythonSharedExplicitDefaultSourcesByType {
		value, ok, err := coerceDefaultSourceValue(t, buildSource())
		if err != nil {
			return generationContext{}, fmt.Errorf(
				"python shared types: explicit default %s: %w",
				pythonSharedContractNameForType(t),
				err,
			)
		}
		if ok {
			defaultSources[t] = value
		}
	}

	return generationContext{
		ContractSpecs:        specs,
		DefaultSourcesByType: defaultSources,
	}, nil
}

func contractSpecsFromSidecar(
	sidecar sharedtypes.SemanticSidecar,
	defaultSourcesByType map[reflect.Type]reflect.Value,
) ([]contractSpec, error) {
	routeSpec := routeContractSpecFromSidecar(sidecar)
	specs := []contractSpec{routeSpec}
	seenNames := map[string]struct{}{
		routeSpec.Name: {},
	}

	for _, entry := range sidecar.Contracts {
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			continue
		}
		if _, alreadySeen := seenNames[name]; alreadySeen {
			continue
		}

		typ, ok := sharedtypes.TypeByContractName(name)
		if !ok {
			return nil, fmt.Errorf("python shared types: missing discovered type for sidecar contract %s", name)
		}

		switch contractKind(strings.TrimSpace(entry.Kind)) {
		case contractKindEnum:
			spec, ok, err := enumContractSpecIfConvertible(typ)
			if err != nil {
				return nil, err
			}
			if !ok {
				return nil, fmt.Errorf("python shared types: sidecar enum %s has no discovered enum values", name)
			}
			spec.Name = name
			spec.Type = typ
			specs = append(specs, spec)
		case contractKindModel:
			spec, ok := modelContractSpecIfConvertible(typ, defaultSourcesByType)
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

func routeContractSpecFromSidecar(sidecar sharedtypes.SemanticSidecar) contractSpec {
	values := make([]enumValueSpec, 0, len(sidecar.Routes))
	for _, route := range sidecar.Routes {
		values = append(values, enumValueSpec{
			Name:  route.Name,
			Value: route.Path,
		})
	}
	return contractSpec{
		Name:       "Route",
		Kind:       contractKindEnum,
		EnumValues: values,
	}
}

func defaultSourcesFromSidecar(
	sidecar sharedtypes.SemanticSidecar,
) (map[reflect.Type]reflect.Value, error) {
	defaultSources := map[reflect.Type]reflect.Value{}
	for _, entry := range sidecar.Defaults {
		typ, ok := sharedtypes.TypeByContractName(entry.Type)
		if !ok {
			return nil, fmt.Errorf("python shared types: missing discovered type for sidecar default %s", entry.Type)
		}
		value, ok, err := coerceDefaultSourceValue(typ, entry.Value)
		if err != nil {
			return nil, fmt.Errorf("python shared types: sidecar default %s: %w", entry.Type, err)
		}
		if ok {
			defaultSources[typ] = value
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

func enumContractSpecIfConvertible(t reflect.Type) (contractSpec, bool, error) {
	values, ok, err := stringenumvalues.Default().Values(t)
	if err != nil {
		return contractSpec{}, false, err
	}
	if ok && len(values) > 0 {
		discoveredEnumValues := make([]enumValueSpec, 0, len(values))
		for _, value := range values {
			discoveredEnumValues = append(discoveredEnumValues, enumValueSpec{
				Name:  value.Name,
				Value: value.Value,
			})
		}
		return contractSpec{
			Name:       pythonSharedContractNameForType(t),
			Kind:       contractKindEnum,
			Type:       t,
			EnumValues: discoveredEnumValues,
		}, true, nil
	}
	values, ok, err = stringenumvalues.Default().ValuesByTypeName(
		pythonSharedEnumFallbackPackages,
		t.Name(),
	)
	if err != nil {
		return contractSpec{}, false, err
	}
	if !ok || len(values) == 0 {
		return contractSpec{}, false, nil
	}
	discoveredEnumValues := make([]enumValueSpec, 0, len(values))
	for _, value := range values {
		discoveredEnumValues = append(discoveredEnumValues, enumValueSpec{
			Name:  value.Name,
			Value: value.Value,
		})
	}
	return contractSpec{
		Name:       pythonSharedContractNameForType(t),
		Kind:       contractKindEnum,
		Type:       t,
		EnumValues: discoveredEnumValues,
	}, true, nil
}

func modelContractSpecIfConvertible(
	t reflect.Type,
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (contractSpec, bool) {
	spec := contractSpec{
		Name: pythonSharedContractNameForType(t),
		Kind: contractKindModel,
		Type: t,
	}
	if _, err := buildModelSpecWithDefaultSources(
		spec,
		map[string]struct{}{spec.Name: {}},
		defaultSourcesByType,
	); err != nil {
		return contractSpec{}, false
	}
	return spec, true
}

func pythonSharedDefaultValueForField(
	ownerType reflect.Type,
	field reflect.StructField,
	defaultSourcesByType map[reflect.Type]reflect.Value,
) (reflect.Value, bool) {
	if override, ok := pythonSharedDefaultFieldOverrides[pythonSharedDefaultFieldKey{
		OwnerType: ownerType,
		FieldName: field.Name,
	}]; ok {
		return reflect.ValueOf(override()), true
	}

	defaultSource, ok := defaultSourcesByType[ownerType]
	if !ok {
		return reflect.Value{}, false
	}
	return defaultSource.FieldByIndex(field.Index), true
}

func pythonSharedContractNameForType(t reflect.Type) string {
	return sharedtypes.ContractNameForType(t)
}
