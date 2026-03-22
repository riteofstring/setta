package pythonsharedtypes

import (
	"reflect"

	"setta/internal/frontendbindings"
	"setta/internal/httpapi"
	"setta/internal/stringenumvalues"
	"setta/internal/wsapi"
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
	Name          string
	Kind          contractKind
	Type          reflect.Type
	EnumValues    []enumValueSpec
	FieldDefaults map[string]string
}

type pythonRouteBinding struct {
	PythonName string
	Path       string
}

var pythonSharedEnumFallbackPackages = []string{
	"setta/internal/frontendbindings",
	"setta/internal/projectstate",
	"setta/internal/artifacts",
	"setta/internal/runs",
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
		discoveredSharedTypes(),
	)
	if err != nil {
		return nil, err
	}
	specs, err = appendDiscoveredContractSpecs(
		specs,
		seenNames,
		frontendbindings.DiscoveredConvertibleTypes(),
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
		if _, alreadySeen := seenNames[discoveredType.Name()]; alreadySeen {
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

func stringEnumContractSpec(t reflect.Type) contractSpec {
	return contractSpec{
		Name: t.Name(),
		Kind: contractKindEnum,
		Type: t,
	}
}

func enumContractSpecIfConvertible(t reflect.Type) (contractSpec, bool, error) {
	values, ok, err := stringenumvalues.Default().Values(t)
	if err != nil {
		return contractSpec{}, false, err
	}
	if ok && len(values) > 0 {
		return stringEnumContractSpec(t), true, nil
	}
	values, ok, err = stringenumvalues.Default().ValuesByTypeName(
		pythonSharedEnumFallbackPackages,
		t.Name(),
	)
	if err != nil {
		return contractSpec{}, false, err
	}
	if !ok || len(values) == 0 {
		enumValues, enumOK, enumErr := frontendbindings.EnumValuesForType(t)
		if enumErr != nil {
			return contractSpec{}, false, enumErr
		}
		if !enumOK || len(enumValues) == 0 {
			return contractSpec{}, false, nil
		}
		fallbackValues := make([]enumValueSpec, 0, len(enumValues))
		for _, value := range enumValues {
			fallbackValues = append(fallbackValues, enumValueSpec{
				Name:  value.Name,
				Value: value.Value,
			})
		}
		return contractSpec{
			Name:       t.Name(),
			Kind:       contractKindEnum,
			EnumValues: fallbackValues,
		}, true, nil
	}
	enumValues := make([]enumValueSpec, 0, len(values))
	for _, value := range values {
		enumValues = append(enumValues, enumValueSpec{
			Name:  value.Name,
			Value: value.Value,
		})
	}
	return contractSpec{
		Name:       t.Name(),
		Kind:       contractKindEnum,
		EnumValues: enumValues,
	}, true, nil
}

func modelContractSpecIfConvertible(t reflect.Type) (contractSpec, bool) {
	spec := contractSpec{
		Name:          t.Name(),
		Kind:          contractKindModel,
		Type:          t,
		FieldDefaults: pythonSharedFieldDefaultsForType(t),
	}
	if _, err := buildModelSpec(spec); err != nil {
		return contractSpec{}, false
	}
	return spec, true
}

func pythonSharedFieldDefaultsForType(t reflect.Type) map[string]string {
	switch t.Name() {
	case reflect.TypeOf(frontendbindings.Viewport{}).Name():
		return map[string]string{
			"x":    "0.0",
			"y":    "0.0",
			"zoom": "1.0",
		}
	case reflect.TypeOf(frontendbindings.LLMConfig{}).Name():
		return map[string]string{
			"temporary": "False",
		}
	case reflect.TypeOf(frontendbindings.TypeErrorIgnoreState{}).Name():
		return map[string]string{
			"callable": "False",
			"params":   "Field(default_factory=dict)",
		}
	case reflect.TypeOf(frontendbindings.BrowserSavedSearchTypeFilters{}).Name():
		return map[string]string{
			"image": "True",
			"video": "True",
			"audio": "True",
			"text":  "True",
			"data":  "True",
		}
	default:
		return nil
	}
}

func buildRouteContractSpec() (contractSpec, error) {
	bindings := []pythonRouteBinding{
		{PythonName: "PREFIX", Path: httpapi.RouteAPIPrefix},
		{PythonName: "BOOTSTRAP_CONSUME", Path: httpapi.RouteBootstrapConsume},
		{PythonName: "LOAD_ALL_PROJECT_METADATA", Path: httpapi.RouteLoadAllProjectMetadata},
		{PythonName: "WEBSOCKET_LISTENER", Path: wsapi.RouteListenerByID},
		{PythonName: "RUN_DETACHED", Path: httpapi.RouteRunDetached},
		{PythonName: "GET_RUN_STATUS", Path: httpapi.RouteGetRunStatus},
		{PythonName: "CANCEL_RUN", Path: httpapi.RouteCancelRun},
		{PythonName: "GET_RUNNER_SUMMARY", Path: httpapi.RouteGetRunnerSummary},
		{PythonName: "SDK_RUNTIME_HANDSHAKE", Path: httpapi.RouteSDKRuntimeHandshake},
		{PythonName: "GET_LATEST_PROJECT_STATE", Path: httpapi.RouteGetLatestProjectState},
	}

	values := make([]enumValueSpec, 0, len(bindings))
	for _, binding := range bindings {
		values = append(values, enumValueSpec{
			Name:  binding.PythonName,
			Value: binding.Path,
		})
	}

	return contractSpec{
		Name:       "Route",
		Kind:       contractKindEnum,
		EnumValues: values,
	}, nil
}
