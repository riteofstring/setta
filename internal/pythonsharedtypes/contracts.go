package pythonsharedtypes

import (
	"fmt"
	"reflect"
	"sort"
	"strings"

	"setta/internal/frontendbindings"
	"setta/internal/httpapi"
	"setta/internal/projectstate"
	"setta/internal/projectview"
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

var pythonWrapperTypeOverrides = frontendbindings.DiscoveredWrapperTypeOverrides()

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
	if _, err := buildModelSpec(spec, map[string]struct{}{spec.Name: {}}); err != nil {
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
	case reflect.TypeOf(projectview.ProjectConfig{}).Name():
		return map[string]string{
			"showParamDisplayNames":   "False",
			"allowJsonSourceKeyEdits": "True",
			"previewImgColor":         fmt.Sprintf("%q", "bg-blue-500/60 dark:bg-blue-600/30"),
			"viewport":                "Field(default_factory=Viewport)",
			"viewportInitialized":     "False",
			"viewModes":               "Field(default_factory=dict)",
			"windowSpaces":            "Field(default_factory=dict)",
			"isEditingViewMode":       "False",
			"codegenTargets":          pythonProjectConfigDefaultCodegenTargetsExpr(),
			"watchCodeEnabled":        "False",
			"watchCodeFolders":        "Field(default_factory=list)",
			"watchCodeFiles":          "Field(default_factory=list)",
			"watchCodeRegistry":       "Field(default_factory=dict)",
			"watchCodeBaselineByPath": "Field(default_factory=dict)",
			"topLevelSections":        "Field(default_factory=dict)",
			"sectionVariantMap":       "Field(default_factory=dict)",
			"activeIds":               "Field(default_factory=list)",
			"edges":                   "Field(default_factory=list)",
			"agenticEdges":            "Field(default_factory=list)",
			"stateMachineEdges":       "Field(default_factory=list)",
		}
	default:
		return nil
	}
}

func pythonProjectConfigDefaultCodegenTargetsExpr() string {
	return "Field(default_factory=lambda: [" + pythonDefaultPythonCodegenTargetExpr() + "])"
}

func pythonDefaultPythonCodegenTargetExpr() string {
	sectionPolicy := projectstate.DefaultPythonSectionCodegenPolicy()
	codeObjValuePolicy := projectstate.DefaultPythonCodeObjValuePolicy()
	return strings.Join(
		[]string{
			"ProjectCodegenPythonTarget(",
			"language=ProjectCodegenLanguage.python, ",
			"genCodePrefix=\"\", ",
			"genCodeSuffix=" + fmt.Sprintf("%q", projectstate.DefaultPythonCodegenSuffix) + ", ",
			"generateMetadata=False, ",
			"sectionPolicy=" + pythonSectionCodegenPolicyExpr(sectionPolicy) + ", ",
			"codeObjValuePolicy=" + pythonCodeObjValuePolicyExpr(codeObjValuePolicy),
			")",
		},
		"",
	)
}

func pythonSectionCodegenPolicyExpr(policy projectstate.PythonSectionCodegenPolicy) string {
	return strings.Join(
		[]string{
			"SectionCodegenPolicy(",
			"allowlist=" + pythonStringListExpr(defaultOrderedPolicyList(policy.Allowlist, false)) + ", ",
			"metaControlAllowlist=" + pythonStringListExpr(defaultOrderedPolicyList(policy.MetaControlAllowlist, false)) + ", ",
			"exclude=" + pythonStringListExpr(sortedPolicyKeys(policy.Exclude)) + ", ",
			"typePolicies=" + pythonSectionTypePoliciesExpr(policy.TypePolicies) + ", ",
			"sectionOverrides={}",
			")",
		},
		"",
	)
}

func pythonCodeObjValuePolicyExpr(policy projectstate.PythonCodeObjValuePolicy) string {
	return strings.Join(
		[]string{
			"CodeObjValuePolicy(",
			"typePolicies=" + pythonCodeObjTypePoliciesExpr(policy.TypePolicies) + ", ",
			"codeObjOverrides={}",
			")",
		},
		"",
	)
}

func pythonSectionTypePoliciesExpr(
	policies map[string]projectstate.PythonSectionTypeCodegenPolicy,
) string {
	keys := make([]string, 0, len(policies))
	for key := range policies {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		policy := policies[key]
		parts = append(
			parts,
			fmt.Sprintf(
				"%q: SectionTypeCodegenPolicy(mode=SectionCodegenMode.%s, representation=SectionRepresentationMode.%s)",
				key,
				string(policy.Mode),
				string(policy.Representation),
			),
		)
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

func pythonCodeObjTypePoliciesExpr(
	policies map[string]projectstate.PythonCodeObjTypeValuePolicy,
) string {
	keys := make([]string, 0, len(policies))
	for key := range policies {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		policy := policies[key]
		parts = append(
			parts,
			fmt.Sprintf(
				"%q: CodeObjTypeValuePolicy(representation=CodeObjValueRepresentationMode.%s)",
				key,
				string(policy.Representation),
			),
		)
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

func defaultOrderedPolicyList(values map[string]struct{}, allowAll bool) []string {
	if allowAll {
		return []string{"*"}
	}
	return sortedPolicyKeys(values)
}

func sortedPolicyKeys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func pythonStringListExpr(values []string) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, fmt.Sprintf("%q", value))
	}
	return "[" + strings.Join(parts, ", ") + "]"
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
