package pythonsdklocalcore

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	backendruntime "setta/internal/appsubsystem/backendruntime"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
)

const (
	watchCodeErrorCodeProjectConfigIDRequired = "project_config_id_required"
	watchCodeErrorCodeProjectConfigNotFound   = "project_config_not_found"
	watchCodeErrorCodeInvalidInput            = "invalid_watch_code_input"
	watchCodeErrorCodeProviderRequired        = "watch_code_provider_required"
	watchCodeErrorCodeInternal                = "internal_error"

	watchCodeSettingEnabled = "enabled"
	watchCodeSettingFolders = "folders"
	watchCodeSettingFiles   = "files"
)

var (
	errWatchCodeSettaFilesRootRequired = errors.New("settaFilesRoot is required")
	errWatchCodeWorkspaceRootRequired  = errors.New("workspaceRoot is required")
	errWatchCodeSettingIDRequired      = errors.New("watch code setting id is required")
	errWatchCodeSettingIDUnknown       = errors.New("unknown watch code setting id")
	errWatchCodeSettingValueRequired   = errors.New("watch code setting value is required")
	errWatchCodePayloadInvalid         = errors.New("watch code local core payload is invalid")
	errWatchCodeSettingValueInvalid    = errors.New("watch code setting value is invalid")
)

type watchCodeCommandHandler func(
	pythonsdkcontracts.LocalCoreResultEnvelope,
	map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope

type watchCodeRequestBase struct {
	SettaFilesRoot  string  `json:"settaFilesRoot"`
	WorkspaceRoot   string  `json:"workspaceRoot,omitempty"`
	PluginID        string  `json:"pluginId"`
	ProjectConfigID string  `json:"projectConfigId"`
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
}

type watchCodeSetEnabledRequest struct {
	watchCodeRequestBase
	Enabled bool `json:"enabled"`
}

type watchCodeSetInputsRequest struct {
	watchCodeRequestBase
	WatchCodeFolders []projectstate.WatchCodeFolder `json:"watchCodeFolders"`
	WatchCodeFiles   []string                       `json:"watchCodeFiles"`
}

type watchCodeReadSettingRequest struct {
	watchCodeRequestBase
	SettingID string `json:"settingId"`
}

type watchCodeWriteSettingRequest struct {
	watchCodeRequestBase
	SettingID string `json:"settingId"`
	Value     any    `json:"value"`
}

var watchCodeCommandHandlers = map[string]watchCodeCommandHandler{
	CommandWatchCodeGetProjectData: executeWatchCodeGetProjectDataCommand,
	CommandWatchCodeSetEnabled:     executeWatchCodeSetEnabledCommand,
	CommandWatchCodeSetInputs:      executeWatchCodeSetInputsCommand,
	CommandWatchCodeReadSetting:    executeWatchCodeReadSettingCommand,
	CommandWatchCodeWriteSetting:   executeWatchCodeWriteSettingCommand,
}

func executeWatchCodeGetProjectDataCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	request, err := decodeWatchCodePayload[watchCodeRequestBase](payload)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	document, err := loadWatchCodeDocument(request)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	projectData, err := readWatchCodeProjectData(document, request)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	result.OK = true
	result.Result = projectData
	return result
}

func executeWatchCodeSetEnabledCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	request, err := decodeWatchCodePayload[watchCodeSetEnabledRequest](payload)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	runtime, closeRuntime, err := openWatchCodeRuntime(request.watchCodeRequestBase)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	defer closeRuntime()

	snapshot, err := runtime.SetWatchCodeEnabled(
		watchCodeMutationContext(request.FrontendOpID),
		strings.TrimSpace(request.PluginID),
		strings.TrimSpace(request.ProjectConfigID),
		request.Enabled,
		strings.TrimSpace(request.WorkspaceRoot),
	)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	projectData, err := readWatchCodeProjectData(snapshot.Document, request.watchCodeRequestBase)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	result.OK = true
	result.Result = projectData
	return result
}

func executeWatchCodeSetInputsCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	request, err := decodeWatchCodePayload[watchCodeSetInputsRequest](payload)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	runtime, closeRuntime, err := openWatchCodeRuntime(request.watchCodeRequestBase)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	defer closeRuntime()

	snapshot, err := runtime.SetWatchCodeInputs(
		watchCodeMutationContext(request.FrontendOpID),
		strings.TrimSpace(request.PluginID),
		strings.TrimSpace(request.ProjectConfigID),
		request.WatchCodeFolders,
		request.WatchCodeFiles,
		strings.TrimSpace(request.WorkspaceRoot),
	)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	projectData, err := readWatchCodeProjectData(snapshot.Document, request.watchCodeRequestBase)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	result.OK = true
	result.Result = projectData
	return result
}

func executeWatchCodeReadSettingCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	request, err := decodeWatchCodePayload[watchCodeReadSettingRequest](payload)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	document, err := loadWatchCodeDocument(request.watchCodeRequestBase)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	projectData, err := readWatchCodeProjectData(document, request.watchCodeRequestBase)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	value, err := watchCodeSettingValue(projectData, request.SettingID)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	result.OK = true
	result.Result = value
	return result
}

func executeWatchCodeWriteSettingCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	request, err := decodeWatchCodePayload[watchCodeWriteSettingRequest](payload)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	runtime, closeRuntime, err := openWatchCodeRuntime(request.watchCodeRequestBase)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	defer closeRuntime()

	snapshot, value, err := writeWatchCodeSetting(runtime, request)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	projectData, readErr := readWatchCodeProjectData(snapshot.Document, request.watchCodeRequestBase)
	if readErr != nil {
		failWatchCodeLocalCoreResult(&result, readErr)
		return result
	}
	value, err = watchCodeSettingValue(projectData, request.SettingID)
	if err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	result.OK = true
	result.Result = value
	return result
}

func decodeWatchCodePayload[T any](payload map[string]any) (T, error) {
	var request T
	encoded, err := json.Marshal(payload)
	if err != nil {
		return request, fmt.Errorf("%w: encode local core payload: %v", errWatchCodePayloadInvalid, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return request, fmt.Errorf("%w: decode local core payload: %v", errWatchCodePayloadInvalid, err)
	}
	return request, nil
}

func validateWatchCodeRequestBase(request watchCodeRequestBase, requireWorkspaceRoot bool) error {
	if strings.TrimSpace(request.SettaFilesRoot) == "" {
		return errWatchCodeSettaFilesRootRequired
	}
	if strings.TrimSpace(request.PluginID) == "" {
		return projectstate.ErrWatchCodeProviderPluginIDRequired
	}
	if strings.TrimSpace(request.ProjectConfigID) == "" {
		return projectstate.ErrProjectIDRequired
	}
	if requireWorkspaceRoot && strings.TrimSpace(request.WorkspaceRoot) == "" {
		return errWatchCodeWorkspaceRootRequired
	}
	return nil
}

func loadWatchCodeDocument(request watchCodeRequestBase) (projectstate.Document, error) {
	if err := validateWatchCodeRequestBase(request, false); err != nil {
		return projectstate.Document{}, err
	}
	store, err := projectstate.NewStore(
		filepath.Join(strings.TrimSpace(request.SettaFilesRoot), projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		return projectstate.Document{}, err
	}
	return store.Load(context.Background())
}

func openWatchCodeRuntime(
	request watchCodeRequestBase,
) (*projectstate.Runtime, func(), error) {
	if err := validateWatchCodeRequestBase(request, true); err != nil {
		return nil, nil, err
	}
	store, err := projectstate.NewStore(
		filepath.Join(strings.TrimSpace(request.SettaFilesRoot), projectstate.MainFileName),
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
	return runtime, func() {
		_ = runtime.Close()
	}, nil
}

func readWatchCodeProjectData(
	document projectstate.Document,
	request watchCodeRequestBase,
) (projectstate.WatchCodePluginProjectData, error) {
	if err := validateWatchCodeRequestBase(request, false); err != nil {
		return projectstate.WatchCodePluginProjectData{}, err
	}
	project, err := document.ProjectByID(request.ProjectConfigID)
	if err != nil {
		return projectstate.WatchCodePluginProjectData{}, err
	}
	projectData, _, err := document.WatchCodePluginProjectData(request.PluginID, project.ID)
	if err != nil {
		return projectstate.WatchCodePluginProjectData{}, err
	}
	return projectData.Normalized(), nil
}

func writeWatchCodeSetting(
	runtime *projectstate.Runtime,
	request watchCodeWriteSettingRequest,
) (projectstate.Snapshot, any, error) {
	settingID, err := normalizeWatchCodeSettingID(request.SettingID)
	if err != nil {
		return projectstate.Snapshot{}, nil, err
	}
	if request.Value == nil {
		return projectstate.Snapshot{}, nil, errWatchCodeSettingValueRequired
	}

	ctx := watchCodeMutationContext(request.FrontendOpID)
	switch settingID {
	case watchCodeSettingEnabled:
		value, err := decodeRequiredWatchCodeSettingValue[bool](request.Value)
		if err != nil {
			return projectstate.Snapshot{}, nil, err
		}
		snapshot, err := runtime.SetWatchCodeEnabled(
			ctx,
			strings.TrimSpace(request.PluginID),
			strings.TrimSpace(request.ProjectConfigID),
			value,
			strings.TrimSpace(request.WorkspaceRoot),
		)
		return snapshot, value, err
	case watchCodeSettingFolders:
		value, err := decodeRequiredWatchCodeSettingValue[[]projectstate.WatchCodeFolder](request.Value)
		if err != nil {
			return projectstate.Snapshot{}, nil, err
		}
		projectData, err := readWatchCodeProjectData(runtime.Snapshot().Document, request.watchCodeRequestBase)
		if err != nil {
			return projectstate.Snapshot{}, nil, err
		}
		snapshot, err := runtime.SetWatchCodeInputs(
			ctx,
			strings.TrimSpace(request.PluginID),
			strings.TrimSpace(request.ProjectConfigID),
			value,
			projectData.Files,
			strings.TrimSpace(request.WorkspaceRoot),
		)
		return snapshot, value, err
	case watchCodeSettingFiles:
		value, err := decodeRequiredWatchCodeSettingValue[[]string](request.Value)
		if err != nil {
			return projectstate.Snapshot{}, nil, err
		}
		projectData, err := readWatchCodeProjectData(runtime.Snapshot().Document, request.watchCodeRequestBase)
		if err != nil {
			return projectstate.Snapshot{}, nil, err
		}
		snapshot, err := runtime.SetWatchCodeInputs(
			ctx,
			strings.TrimSpace(request.PluginID),
			strings.TrimSpace(request.ProjectConfigID),
			projectData.Folders,
			value,
			strings.TrimSpace(request.WorkspaceRoot),
		)
		return snapshot, value, err
	default:
		return projectstate.Snapshot{}, nil, errWatchCodeSettingIDUnknown
	}
}

func decodeRequiredWatchCodeSettingValue[T any](value any) (T, error) {
	var decoded T
	if value == nil {
		return decoded, errWatchCodeSettingValueRequired
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return decoded, fmt.Errorf("%w: encode watch code setting value: %v", errWatchCodeSettingValueInvalid, err)
	}
	if bytes.Equal(bytes.TrimSpace(encoded), []byte("null")) {
		return decoded, errWatchCodeSettingValueRequired
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decoded); err != nil {
		return decoded, fmt.Errorf("%w: decode watch code setting value: %v", errWatchCodeSettingValueInvalid, err)
	}
	return decoded, nil
}

func watchCodeSettingValue(projectData projectstate.WatchCodePluginProjectData, rawSettingID string) (any, error) {
	settingID, err := normalizeWatchCodeSettingID(rawSettingID)
	if err != nil {
		return nil, err
	}
	normalized := projectData.Normalized()
	switch settingID {
	case watchCodeSettingEnabled:
		return normalized.Enabled, nil
	case watchCodeSettingFolders:
		return normalized.Folders, nil
	case watchCodeSettingFiles:
		return normalized.Files, nil
	default:
		return nil, errWatchCodeSettingIDUnknown
	}
}

func normalizeWatchCodeSettingID(raw string) (string, error) {
	settingID := strings.TrimSpace(raw)
	if settingID == "" {
		return "", errWatchCodeSettingIDRequired
	}
	switch settingID {
	case watchCodeSettingEnabled, watchCodeSettingFolders, watchCodeSettingFiles:
		return settingID, nil
	default:
		return "", fmt.Errorf("%w: %s", errWatchCodeSettingIDUnknown, settingID)
	}
}

func watchCodeMutationContext(frontendOpID *string) context.Context {
	ctx := context.Background()
	if frontendOpID == nil {
		return ctx
	}
	return projectstate.ContextWithFrontendOpID(ctx, *frontendOpID)
}

func failWatchCodeLocalCoreResult(
	result *pythonsdkcontracts.LocalCoreResultEnvelope,
	err error,
) {
	code, message, details := watchCodeLocalCoreErrorInfo(err)
	failLocalCoreResult(result, code, message, details)
}

func watchCodeLocalCoreErrorInfo(err error) (string, string, map[string]any) {
	switch {
	case err == nil:
		return "", "", nil
	case errors.Is(err, projectstate.ErrWatchCodeProviderPluginIDRequired):
		return watchCodeErrorCodeProviderRequired, err.Error(), nil
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		return watchCodeErrorCodeProjectConfigIDRequired, "Project config id is required.", nil
	case errors.Is(err, projectstate.ErrProjectNotFound):
		return watchCodeErrorCodeProjectConfigNotFound, "Project config not found.", nil
	case errors.Is(err, errWatchCodeWorkspaceRootRequired),
		errors.Is(err, projectstate.ErrWatchCodeWorkspaceRootRequired),
		errors.Is(err, projectstate.ErrWatchCodeInputPathInvalid),
		errors.Is(err, errWatchCodeSettingValueRequired):
		return watchCodeErrorCodeInvalidInput, err.Error(), nil
	case errors.Is(err, projectstate.ErrRuntimeClosed),
		errors.Is(err, projectstate.ErrPersistedStoreUnsupported):
		return watchCodeErrorCodeInternal, err.Error(), nil
	case errors.Is(err, errWatchCodeSettaFilesRootRequired),
		errors.Is(err, errWatchCodeSettingIDRequired),
		errors.Is(err, errWatchCodeSettingIDUnknown),
		errors.Is(err, errWatchCodePayloadInvalid):
		return backendruntime.ErrorCodeInvalidRequest, err.Error(), nil
	case errors.Is(err, errWatchCodeSettingValueInvalid):
		return watchCodeErrorCodeInvalidInput, err.Error(), nil
	}
	return watchCodeErrorCodeInternal, err.Error(), nil
}
