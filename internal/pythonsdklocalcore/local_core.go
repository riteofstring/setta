package pythonsdklocalcore

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"setta/internal/appsubsystem/appdefinition"
	backendruntime "setta/internal/appsubsystem/backendruntime"
	"setta/internal/buildinfo"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
)

const ProtocolVersion = 1
const CommandListenerRenderRealtimeDependencyValues = "listener_render_realtime_dependency_values"
const CommandGetAppDefinition = "get_app_definition"
const CommandGetEffectiveAppDefinition = "get_effective_app_definition"
const CommandGetEffectiveAppSpecPath = "get_effective_app_spec_path"
const CommandGetEffectiveAppThemeMode = "get_effective_app_theme_mode"
const CommandValidateAppDefinition = "validate_app_definition"
const CommandSetAppDefinition = "set_app_definition"
const CommandStreamAppDefinition = "stream_app_definition"
const CommandUpdateAppDefinition = "update_app_definition"
const CommandCompareAndSetAppDefinitionCatalogID = "compare_and_set_app_definition_catalog_id"
const CommandCompareAndSetAppDefinitionSpecVersion = "compare_and_set_app_definition_spec_version"
const CommandCompareAndSetAppDefinitionSpecPath = "compare_and_set_app_definition_spec_path"
const CommandCompareAndSetAppDefinitionThemeMode = "compare_and_set_app_definition_theme_mode"

type AppSubsystemBackendListenerEndpointCommand struct {
	ListenerEndpointName string
	LocalCoreCommandName string
}

func AppSubsystemBackendListenerEndpointCommands() []AppSubsystemBackendListenerEndpointCommand {
	return []AppSubsystemBackendListenerEndpointCommand{
		{ListenerEndpointName: backendruntime.ListenerEndpointGetAppDefinition, LocalCoreCommandName: CommandGetAppDefinition},
		{ListenerEndpointName: backendruntime.ListenerEndpointGetEffectiveAppDefinition, LocalCoreCommandName: CommandGetEffectiveAppDefinition},
		{ListenerEndpointName: backendruntime.ListenerEndpointGetEffectiveAppSpecPath, LocalCoreCommandName: CommandGetEffectiveAppSpecPath},
		{ListenerEndpointName: backendruntime.ListenerEndpointGetEffectiveAppThemeMode, LocalCoreCommandName: CommandGetEffectiveAppThemeMode},
		{ListenerEndpointName: backendruntime.ListenerEndpointValidateAppDefinition, LocalCoreCommandName: CommandValidateAppDefinition},
		{ListenerEndpointName: backendruntime.ListenerEndpointSetAppDefinition, LocalCoreCommandName: CommandSetAppDefinition},
		{ListenerEndpointName: backendruntime.ListenerEndpointStreamAppDefinition, LocalCoreCommandName: CommandStreamAppDefinition},
		{ListenerEndpointName: backendruntime.ListenerEndpointUpdateAppDefinition, LocalCoreCommandName: CommandUpdateAppDefinition},
		{ListenerEndpointName: backendruntime.ListenerEndpointCompareAndSetCatalogID, LocalCoreCommandName: CommandCompareAndSetAppDefinitionCatalogID},
		{ListenerEndpointName: backendruntime.ListenerEndpointCompareAndSetSpecVersion, LocalCoreCommandName: CommandCompareAndSetAppDefinitionSpecVersion},
		{ListenerEndpointName: backendruntime.ListenerEndpointCompareAndSetSpecPath, LocalCoreCommandName: CommandCompareAndSetAppDefinitionSpecPath},
		{ListenerEndpointName: backendruntime.ListenerEndpointCompareAndSetThemeMode, LocalCoreCommandName: CommandCompareAndSetAppDefinitionThemeMode},
	}
}

type renderRealtimeDependencyValuesRequest struct {
	DependencyCatalog       realtime.ListenerDependencyCatalog        `json:"dependencyCatalog"`
	CurrentDependencyValues realtime.ListenerRenderedDependencyValues `json:"currentDependencyValues"`
	Deltas                  []localCoreRealtimeDeltaWire              `json:"deltas"`
}

type localCoreRealtimeDeltaWire struct {
	Dependency          json.RawMessage `json:"dependency"`
	Value               json.RawMessage `json:"value"`
	BinaryPayloadBase64 string          `json:"binaryPayloadBase64,omitempty"`
}

type renderRealtimeDependencyValuesResultWire struct {
	DependencyValues realtime.ListenerRenderedDependencyValues `json:"dependencyValues"`
}

type appDefinitionRequestBase struct {
	SettaFilesRoot       string                 `json:"settaFilesRoot"`
	PluginID             string                 `json:"pluginId"`
	ProjectStateDocument *projectstate.Document `json:"projectStateDocument,omitempty"`
}

type updateAppDefinitionRequest struct {
	appDefinitionRequestBase
	Patch any `json:"patch"`
}

type compareAndSetStringRequest struct {
	appDefinitionRequestBase
	Value            string  `json:"value"`
	ExpectedOldValue *string `json:"expectedOldValue,omitempty"`
}

type appDefinitionCommandHandler func(
	pythonsdkcontracts.LocalCoreResultEnvelope,
	map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope

var appDefinitionCommandHandlers = map[string]appDefinitionCommandHandler{
	CommandGetAppDefinition: buildAppDefinitionReadCommand(
		func(ctx context.Context, runtime appdefinition.Runtime) (any, error) {
			return runtime.GetAppDefinition(ctx)
		},
	),
	CommandGetEffectiveAppDefinition: buildAppDefinitionReadCommand(
		func(ctx context.Context, runtime appdefinition.Runtime) (any, error) {
			return runtime.GetEffectiveAppDefinition(ctx)
		},
	),
	CommandGetEffectiveAppSpecPath: buildAppDefinitionReadCommand(
		func(ctx context.Context, runtime appdefinition.Runtime) (any, error) {
			return runtime.GetEffectiveAppSpecPath(ctx)
		},
	),
	CommandGetEffectiveAppThemeMode: buildAppDefinitionReadCommand(
		func(ctx context.Context, runtime appdefinition.Runtime) (any, error) {
			return runtime.GetEffectiveAppThemeMode(ctx)
		},
	),
	CommandValidateAppDefinition: buildAppDefinitionPayloadCommand(
		func(ctx context.Context, runtime appdefinition.Runtime, input appdefinition.ValidateInput) (any, error) {
			return runtime.ValidateAppDefinition(ctx, input)
		},
	),
	CommandSetAppDefinition: buildAppDefinitionMutationPlanCommand(
		func(planner appdefinition.MutationPlanner, document projectstate.Document, projectRoot string, input appdefinition.SetInput) (any, error) {
			return planner.PlanSetAppDefinition(document, projectRoot, input)
		},
	),
	CommandStreamAppDefinition: buildAppDefinitionMutationPlanCommand(
		func(planner appdefinition.MutationPlanner, document projectstate.Document, projectRoot string, input appdefinition.StreamInput) (any, error) {
			return planner.PlanStreamAppDefinition(document, projectRoot, input)
		},
	),
	CommandUpdateAppDefinition: buildAppDefinitionMutationPlanCommand(
		func(planner appdefinition.MutationPlanner, document projectstate.Document, projectRoot string, request updateAppDefinitionRequest) (any, error) {
			return planner.PlanUpdateAppDefinition(document, projectRoot, request.Patch)
		},
	),
	CommandCompareAndSetAppDefinitionCatalogID: buildCompareAndSetStringPlanCommand(
		func(planner appdefinition.MutationPlanner, document projectstate.Document, projectRoot string, value string, expectedOldValue *string) (any, error) {
			return planner.PlanCompareAndSetCatalogID(document, projectRoot, value, expectedOldValue)
		},
	),
	CommandCompareAndSetAppDefinitionSpecVersion: buildCompareAndSetStringPlanCommand(
		func(planner appdefinition.MutationPlanner, document projectstate.Document, projectRoot string, value string, expectedOldValue *string) (any, error) {
			return planner.PlanCompareAndSetSpecVersion(document, projectRoot, value, expectedOldValue)
		},
	),
	CommandCompareAndSetAppDefinitionSpecPath: buildCompareAndSetStringPlanCommand(
		func(planner appdefinition.MutationPlanner, document projectstate.Document, projectRoot string, value string, expectedOldValue *string) (any, error) {
			return planner.PlanCompareAndSetSpecPath(document, projectRoot, value, expectedOldValue)
		},
	),
	CommandCompareAndSetAppDefinitionThemeMode: buildCompareAndSetStringPlanCommand(
		func(planner appdefinition.MutationPlanner, document projectstate.Document, projectRoot string, value string, expectedOldValue *string) (any, error) {
			return planner.PlanCompareAndSetThemeMode(document, projectRoot, value, expectedOldValue)
		},
	),
}

type RunOptions struct {
	Stdin  io.Reader
	Stdout io.Writer
}

func Run(options RunOptions) error {
	stdin := options.Stdin
	if stdin == nil {
		stdin = strings.NewReader("")
	}
	stdout := options.Stdout
	if stdout == nil {
		stdout = io.Discard
	}

	encoder := json.NewEncoder(stdout)
	if err := encoder.Encode(buildHandshake()); err != nil {
		return fmt.Errorf("write local core handshake: %w", err)
	}

	decoder := json.NewDecoder(stdin)
	for {
		var envelope pythonsdkcontracts.LocalCoreCommandEnvelope
		if err := decoder.Decode(&envelope); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return fmt.Errorf("decode local core command: %w", err)
		}
		if err := encoder.Encode(executeCommand(envelope)); err != nil {
			return fmt.Errorf("write local core result: %w", err)
		}
	}
}

func buildHandshake() pythonsdkcontracts.LocalCoreVersionHandshake {
	sdkVersion := buildinfo.HostPackageVersion()
	coreVersion := buildinfo.Version()
	return pythonsdkcontracts.LocalCoreVersionHandshake{
		ProtocolVersion:    ProtocolVersion,
		SDKVersion:         &sdkVersion,
		CoreVersion:        &coreVersion,
		SDKContractVersion: pythonsdkcontracts.SDKContractVersion,
	}
}

func executeCommand(
	envelope pythonsdkcontracts.LocalCoreCommandEnvelope,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	result := pythonsdkcontracts.LocalCoreResultEnvelope{
		CallID: envelope.CallID,
	}
	if envelope.CommandName == CommandListenerRenderRealtimeDependencyValues {
		return executeRenderRealtimeDependencyValuesCommand(result, envelope.Payload)
	}
	if handler, ok := appDefinitionCommandHandlers[envelope.CommandName]; ok {
		return handler(result, envelope.Payload)
	}
	failLocalCoreResult(
		&result,
		backendruntime.ErrorCodeInvalidRequest,
		fmt.Sprintf("unknown local core command %q", envelope.CommandName),
		nil,
	)
	return result
}

func executeRenderRealtimeDependencyValuesCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	request, err := decodeRenderRealtimeDependencyValuesRequest(payload)
	if err != nil {
		failLocalCoreResult(&result, backendruntime.ErrorCodeInvalidRequest, err.Error(), nil)
		return result
	}
	deltas, err := request.realtimeDeltas()
	if err != nil {
		failLocalCoreResult(&result, backendruntime.ErrorCodeInvalidRequest, err.Error(), nil)
		return result
	}
	values, err := realtime.BuildListenerRealtimeDependencyValuesFromCatalog(
		request.DependencyCatalog,
		request.CurrentDependencyValues,
		deltas,
	)
	if err != nil {
		failLocalCoreResult(&result, backendruntime.ErrorCodeInvalidRequest, err.Error(), nil)
		return result
	}
	result.OK = true
	result.Result = renderRealtimeDependencyValuesResultWire{
		DependencyValues: values,
	}
	return result
}

func buildAppDefinitionReadCommand(
	run func(context.Context, appdefinition.Runtime) (any, error),
) appDefinitionCommandHandler {
	return func(
		result pythonsdkcontracts.LocalCoreResultEnvelope,
		payload map[string]any,
	) pythonsdkcontracts.LocalCoreResultEnvelope {
		return executeAppDefinitionLocalCoreCommand(result, payload, run)
	}
}

func buildAppDefinitionPayloadCommand[T any](
	run func(context.Context, appdefinition.Runtime, T) (any, error),
) appDefinitionCommandHandler {
	return func(
		result pythonsdkcontracts.LocalCoreResultEnvelope,
		payload map[string]any,
	) pythonsdkcontracts.LocalCoreResultEnvelope {
		return executeAppDefinitionInputCommand(
			result,
			payload,
			func(ctx context.Context, runtime appdefinition.Runtime, rawPayload map[string]any) (any, error) {
				request, err := decodeAppDefinitionPayload[T](rawPayload)
				if err != nil {
					return nil, err
				}
				return run(ctx, runtime, request)
			},
		)
	}
}

func buildAppDefinitionMutationPlanCommand[T any](
	run func(appdefinition.MutationPlanner, projectstate.Document, string, T) (any, error),
) appDefinitionCommandHandler {
	return func(
		result pythonsdkcontracts.LocalCoreResultEnvelope,
		payload map[string]any,
	) pythonsdkcontracts.LocalCoreResultEnvelope {
		return executeAppDefinitionPlanningCommand(
			result,
			payload,
			func(planner appdefinition.MutationPlanner, document projectstate.Document, projectRoot string, rawPayload map[string]any) (any, error) {
				request, err := decodeAppDefinitionPayload[T](rawPayload)
				if err != nil {
					return nil, err
				}
				return run(planner, document, projectRoot, request)
			},
		)
	}
}

func buildCompareAndSetStringPlanCommand(
	run func(appdefinition.MutationPlanner, projectstate.Document, string, string, *string) (any, error),
) appDefinitionCommandHandler {
	return buildAppDefinitionMutationPlanCommand(
		func(planner appdefinition.MutationPlanner, document projectstate.Document, projectRoot string, request compareAndSetStringRequest) (any, error) {
			return run(planner, document, projectRoot, request.Value, request.ExpectedOldValue)
		},
	)
}

func decodeRenderRealtimeDependencyValuesRequest(
	payload map[string]any,
) (renderRealtimeDependencyValuesRequest, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return renderRealtimeDependencyValuesRequest{}, fmt.Errorf(
			"encode local core payload: %w",
			err,
		)
	}
	var request renderRealtimeDependencyValuesRequest
	if err := json.Unmarshal(encoded, &request); err != nil {
		return renderRealtimeDependencyValuesRequest{}, fmt.Errorf(
			"decode local core payload: %w",
			err,
		)
	}
	return request, nil
}

func (r renderRealtimeDependencyValuesRequest) realtimeDeltas() ([]realtime.ListenerRealtimeDelta, error) {
	deltas := make([]realtime.ListenerRealtimeDelta, 0, len(r.Deltas))
	for _, delta := range r.Deltas {
		dependency, err := realtime.CanonicalDependencyKeyFromWire(delta.Dependency)
		if err != nil {
			return nil, fmt.Errorf("decode local core dependency key: %w", err)
		}
		next := realtime.ListenerRealtimeDelta{
			Dependency: dependency,
			Value:      append(json.RawMessage(nil), delta.Value...),
		}
		if strings.TrimSpace(delta.BinaryPayloadBase64) != "" {
			payload, err := base64.StdEncoding.DecodeString(
				strings.TrimSpace(delta.BinaryPayloadBase64),
			)
			if err != nil {
				return nil, fmt.Errorf("decode local core binary payload: %w", err)
			}
			next.BinaryPayload = payload
		}
		deltas = append(deltas, next)
	}
	return deltas, nil
}

func stringPointer(value string) *string {
	return &value
}

func executeAppDefinitionLocalCoreCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
	run func(context.Context, appdefinition.Runtime) (any, error),
) pythonsdkcontracts.LocalCoreResultEnvelope {
	request, err := decodeAppDefinitionPayload[appDefinitionRequestBase](payload)
	if err != nil {
		failLocalCoreResult(&result, backendruntime.ErrorCodeInvalidRequest, err.Error(), nil)
		return result
	}
	runtime, closeRuntime, err := openAppDefinitionRuntime(request)
	if err != nil {
		code, message, details := localCoreErrorInfo(err)
		failLocalCoreResult(&result, code, message, details)
		return result
	}
	defer closeRuntime()

	response, err := run(context.Background(), runtime)
	if err != nil {
		code, message, details := localCoreErrorInfo(err)
		failLocalCoreResult(&result, code, message, details)
		return result
	}
	result.OK = true
	result.Result = response
	return result
}

func executeAppDefinitionInputCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
	run func(context.Context, appdefinition.Runtime, map[string]any) (any, error),
) pythonsdkcontracts.LocalCoreResultEnvelope {
	request, err := decodeAppDefinitionPayload[appDefinitionRequestBase](payload)
	if err != nil {
		failLocalCoreResult(&result, backendruntime.ErrorCodeInvalidRequest, err.Error(), nil)
		return result
	}
	runtime, closeRuntime, err := openAppDefinitionRuntime(request)
	if err != nil {
		code, message, details := localCoreErrorInfo(err)
		failLocalCoreResult(&result, code, message, details)
		return result
	}
	defer closeRuntime()

	response, err := run(context.Background(), runtime, payload)
	if err != nil {
		code, message, details := localCoreErrorInfo(err)
		failLocalCoreResult(&result, code, message, details)
		return result
	}
	result.OK = true
	result.Result = response
	return result
}

func executeAppDefinitionPlanningCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
	run func(appdefinition.MutationPlanner, projectstate.Document, string, map[string]any) (any, error),
) pythonsdkcontracts.LocalCoreResultEnvelope {
	request, err := decodeAppDefinitionPayload[appDefinitionRequestBase](payload)
	if err != nil {
		failLocalCoreResult(&result, backendruntime.ErrorCodeInvalidRequest, err.Error(), nil)
		return result
	}
	planner, document, projectRoot, err := loadAppDefinitionPlanningContext(request)
	if err != nil {
		code, message, details := localCoreErrorInfo(err)
		failLocalCoreResult(&result, code, message, details)
		return result
	}
	response, err := run(planner, document, projectRoot, payload)
	if err != nil {
		code, message, details := localCoreErrorInfo(err)
		failLocalCoreResult(&result, code, message, details)
		return result
	}
	result.OK = true
	result.Result = response
	return result
}

func decodeAppDefinitionPayload[T any](payload map[string]any) (T, error) {
	var request T
	encoded, err := json.Marshal(payload)
	if err != nil {
		return request, fmt.Errorf("encode local core payload: %w", err)
	}
	if err := json.Unmarshal(encoded, &request); err != nil {
		return request, fmt.Errorf("decode local core payload: %w", err)
	}
	return request, nil
}

func loadAppDefinitionPlanningContext(
	request appDefinitionRequestBase,
) (appdefinition.MutationPlanner, projectstate.Document, string, error) {
	settaFilesRoot := strings.TrimSpace(request.SettaFilesRoot)
	if settaFilesRoot == "" {
		return appdefinition.MutationPlanner{}, projectstate.Document{}, "", fmt.Errorf("settaFilesRoot is required")
	}
	pluginID := strings.TrimSpace(request.PluginID)
	if pluginID == "" {
		return appdefinition.MutationPlanner{}, projectstate.Document{}, "", appdefinition.ErrPluginIDRequired
	}
	planner, err := appdefinition.NewMutationPlanner(pluginID)
	if err != nil {
		return appdefinition.MutationPlanner{}, projectstate.Document{}, "", err
	}
	if request.ProjectStateDocument != nil {
		return planner, request.ProjectStateDocument.Clone(), settaFilesRoot, nil
	}
	store, err := projectstate.NewStore(
		filepath.Join(settaFilesRoot, projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		return appdefinition.MutationPlanner{}, projectstate.Document{}, "", err
	}
	document, err := store.Load(context.Background())
	if err != nil {
		return appdefinition.MutationPlanner{}, projectstate.Document{}, "", err
	}
	return planner, document, settaFilesRoot, nil
}

func openAppDefinitionRuntime(
	request appDefinitionRequestBase,
) (appdefinition.Runtime, func(), error) {
	settaFilesRoot := strings.TrimSpace(request.SettaFilesRoot)
	if settaFilesRoot == "" {
		return nil, nil, fmt.Errorf("settaFilesRoot is required")
	}
	pluginID := strings.TrimSpace(request.PluginID)
	if pluginID == "" {
		return nil, nil, appdefinition.ErrPluginIDRequired
	}
	store, err := projectstate.NewStore(
		filepath.Join(settaFilesRoot, projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		return nil, nil, err
	}
	runtime, err := projectstate.OpenRuntimeWithOptions(
		context.Background(),
		store,
		projectstate.RuntimeOptions{},
	)
	if err != nil {
		return nil, nil, err
	}
	return appdefinition.NewAppDefinitionService(runtime, pluginID), func() {
		_ = runtime.Close()
	}, nil
}

func failLocalCoreResult(
	result *pythonsdkcontracts.LocalCoreResultEnvelope,
	code string,
	message string,
	details map[string]any,
) {
	if result == nil {
		return
	}
	result.OK = false
	result.Error = stringPointer(strings.TrimSpace(message))
	if len(details) == 0 {
		if strings.TrimSpace(code) == "" {
			result.Details = nil
			return
		}
		details = map[string]any{}
	}
	if strings.TrimSpace(code) != "" {
		details["code"] = strings.TrimSpace(code)
	}
	result.Details = details
}

func localCoreErrorInfo(err error) (string, string, map[string]any) {
	switch {
	case err == nil:
		return "", "", nil
	case errors.Is(err, appdefinition.ErrPluginIDRequired):
		return backendruntime.ErrorCodeInvalidRequest, err.Error(), nil
	case errors.Is(err, projectstate.ErrRuntimeClosed),
		errors.Is(err, projectstate.ErrPersistedStoreUnsupported):
		return backendruntime.ErrorCodeRuntimeClosed, err.Error(), nil
	case errors.Is(err, appdefinition.ErrAppSpecPathUnconfigured):
		return backendruntime.ErrorCodeAppSpecPathUnconfigured, err.Error(), nil
	case errors.Is(err, appdefinition.ErrAppSpecNotFound):
		return backendruntime.ErrorCodeAppSpecNotFound, err.Error(), nil
	case errors.Is(err, appdefinition.ErrAppSpecPatchInvalid):
		return backendruntime.ErrorCodeAppSpecPatchInvalid, err.Error(), nil
	}

	var mismatchErr *projectstate.ExpectedOldValueMismatchError
	if errors.As(err, &mismatchErr) {
		details := map[string]any{}
		encoded, encodeErr := json.Marshal(
			backendruntime.DetailsFromExpectedOldValueMismatch(mismatchErr),
		)
		if encodeErr == nil {
			_ = json.Unmarshal(encoded, &details)
		}
		return backendruntime.ErrorCodeExpectedOldValueMismatch, mismatchErr.Error(), details
	}

	return backendruntime.ErrorCodeInvalidRequest, err.Error(), nil
}
