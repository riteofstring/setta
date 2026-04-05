package pythonsharedtypes

import (
	"reflect"

	"setta/internal/frontendbindings"
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

func currentContractSpecs() ([]contractSpec, error) {
	routeSpec, err := buildRouteContractSpec()
	if err != nil {
		return nil, err
	}
	specs := []contractSpec{routeSpec}
	seenNames := map[string]struct{}{
		routeSpec.Name: {},
	}

	specs, err = appendDiscoveredContractSpecs(
		specs,
		seenNames,
		sharedtypes.DiscoveredTypes(),
	)
	if err != nil {
		return nil, err
	}
	return specs, nil
}

func appendDiscoveredContractSpecs(
	specs []contractSpec,
	seenNames map[string]struct{},
	discoveredTypes []reflect.Type,
) ([]contractSpec, error) {
	for _, discoveredType := range discoveredTypes {
		contractName := pythonSharedContractNameForType(discoveredType)
		if contractName == "" {
			continue
		}
		if _, alreadySeen := seenNames[contractName]; alreadySeen {
			continue
		}
		switch discoveredType.Kind() {
		case reflect.String:
			spec, ok, err := enumContractSpecIfConvertible(discoveredType)
			if err != nil {
				return nil, err
			}
			if !ok {
				continue
			}
			specs = append(specs, spec)
			seenNames[spec.Name] = struct{}{}
		case reflect.Struct:
			spec, ok := modelContractSpecIfConvertible(discoveredType)
			if !ok {
				continue
			}
			specs = append(specs, spec)
			seenNames[spec.Name] = struct{}{}
		}
	}
	return specs, nil
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
		EnumValues: discoveredEnumValues,
	}, true, nil
}

func modelContractSpecIfConvertible(t reflect.Type) (contractSpec, bool) {
	spec := contractSpec{
		Name: pythonSharedContractNameForType(t),
		Kind: contractKindModel,
		Type: t,
	}
	if _, err := buildModelSpec(spec, map[string]struct{}{spec.Name: {}}); err != nil {
		return contractSpec{}, false
	}
	return spec, true
}

func pythonSharedDefaultSourceForType(t reflect.Type) (reflect.Value, bool) {
	buildSource, ok := pythonSharedExplicitDefaultSourcesByType[t]
	if !ok {
		buildSource, ok = frontendbindings.DefaultValueProviderForType(t)
	}
	if !ok {
		return reflect.Value{}, false
	}
	value := reflect.ValueOf(buildSource())
	if !value.IsValid() {
		return reflect.Value{}, false
	}
	if value.Type() == t {
		return value, true
	}
	if value.Type().ConvertibleTo(t) {
		return value.Convert(t), true
	}
	return reflect.Value{}, false
}

func pythonSharedDefaultValueForField(
	ownerType reflect.Type,
	field reflect.StructField,
) (reflect.Value, bool) {
	if override, ok := pythonSharedDefaultFieldOverrides[pythonSharedDefaultFieldKey{
		OwnerType: ownerType,
		FieldName: field.Name,
	}]; ok {
		return reflect.ValueOf(override()), true
	}
	defaultSource, ok := pythonSharedDefaultSourceForType(ownerType)
	if !ok {
		return reflect.Value{}, false
	}
	return defaultSource.FieldByIndex(field.Index), true
}

func buildRouteContractSpec() (contractSpec, error) {
	routes, err := sharedtypes.DiscoveredRouteEntries()
	if err != nil {
		return contractSpec{}, err
	}
	values := make([]enumValueSpec, 0, len(routes))
	for _, route := range routes {
		values = append(values, enumValueSpec{
			Name:  route.Name,
			Value: route.Path,
		})
	}

	return contractSpec{
		Name:       "Route",
		Kind:       contractKindEnum,
		EnumValues: values,
	}, nil
}

func pythonSharedContractNameForType(t reflect.Type) string {
	return sharedtypes.ContractNameForType(t)
}
