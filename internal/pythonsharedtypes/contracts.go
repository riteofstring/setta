package pythonsharedtypes

import (
	"reflect"

	"setta/internal/frontendbindings"
	"setta/internal/httpapi"
	"setta/internal/projectstate"
	"setta/internal/runs"
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

func currentContractSpecs() ([]contractSpec, error) {
	routeSpec, err := buildRouteContractSpec()
	if err != nil {
		return nil, err
	}
	return []contractSpec{
		routeSpec,
		stringEnumContractSpec(reflect.TypeOf(projectstate.TextBlockDisplayMode(""))),
		stringEnumContractSpec(reflect.TypeOf(projectstate.TextBlockFormat(""))),
		stringEnumContractSpec(reflect.TypeOf(projectstate.ListRootViewMode(""))),
		stringEnumContractSpec(reflect.TypeOf(projectstate.BrowserAreaViewMode(""))),
		stringEnumContractSpec(reflect.TypeOf(projectstate.BrowserSearchScope(""))),
		stringEnumContractSpec(reflect.TypeOf(projectstate.SpreadsheetGridDensity(""))),
		stringEnumContractSpec(reflect.TypeOf(projectstate.TaskBoardViewMode(""))),
		stringEnumContractSpec(reflect.TypeOf(projectstate.ChatPermissionMode(""))),
		stringEnumContractSpec(reflect.TypeOf(projectstate.ChatDictationMode(""))),
		stringEnumContractSpec(reflect.TypeOf(projectstate.StateMachineGateType(""))),
		{
			Name: "LLMConfig",
			Kind: contractKindModel,
			Type: reflect.TypeOf(frontendbindings.LLMConfig{}),
			FieldDefaults: map[string]string{
				"temporary": "False",
			},
		},
		stringEnumContractSpec(reflect.TypeOf(projectstate.PromptFormat(""))),
		stringEnumContractSpec(reflect.TypeOf(runs.RunSnapshotMode(""))),
	}, nil
}

func stringEnumContractSpec(t reflect.Type) contractSpec {
	return contractSpec{
		Name: t.Name(),
		Kind: contractKindEnum,
		Type: t,
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
