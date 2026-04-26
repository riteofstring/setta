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
	"setta/internal/watchcodecontracts"
)

var (
	errWatchCodeSettaFilesRootRequired = errors.New("settaFilesRoot is required")
	errWatchCodeWorkspaceRootRequired  = errors.New("workspaceRoot is required")
	errWatchCodePayloadInvalid         = errors.New("watch code local core payload is invalid")
)

type watchCodeCommandHandler func(
	pythonsdkcontracts.LocalCoreResultEnvelope,
	map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope

type watchCodeRequestBase struct {
	SettaFilesRoot  string  `json:"settaFilesRoot"`
	WorkspaceRoot   string  `json:"workspaceRoot,omitempty"`
	RuntimeRoot     string  `json:"runtimeRoot,omitempty"`
	PluginID        string  `json:"pluginId"`
	ProjectConfigID string  `json:"projectConfigId"`
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
}

type watchCodeSetInputsRequest struct {
	watchCodeRequestBase
	Folders []projectstate.WatchCodeFolder `json:"folders"`
	Files   []string                       `json:"files"`
}

type watchCodeSetFoldersRequest struct {
	watchCodeRequestBase
	Folders []projectstate.WatchCodeFolder `json:"folders"`
}

type watchCodeSetFilesRequest struct {
	watchCodeRequestBase
	Files []string `json:"files"`
}

var watchCodeCommandHandlers = map[string]watchCodeCommandHandler{
	CommandWatchCodeGetProjectData: executeWatchCodeGetProjectDataCommand,
	CommandWatchCodeSetInputs:      executeWatchCodeSetInputsCommand,
	CommandWatchCodeSetFolders:     executeWatchCodeSetFoldersCommand,
	CommandWatchCodeSetFiles:       executeWatchCodeSetFilesCommand,
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

func executeWatchCodeSetInputsCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	if err := requireWatchCodePayloadKeys(payload, "folders", "files"); err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
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
		request.Folders,
		request.Files,
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

func executeWatchCodeSetFoldersCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	if err := requireWatchCodePayloadKeys(payload, "folders"); err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	request, err := decodeWatchCodePayload[watchCodeSetFoldersRequest](payload)
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

	snapshot, err := runtime.SetWatchCodeFolders(
		watchCodeMutationContext(request.FrontendOpID),
		strings.TrimSpace(request.PluginID),
		strings.TrimSpace(request.ProjectConfigID),
		request.Folders,
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

func executeWatchCodeSetFilesCommand(
	result pythonsdkcontracts.LocalCoreResultEnvelope,
	payload map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	if err := requireWatchCodePayloadKeys(payload, "files"); err != nil {
		failWatchCodeLocalCoreResult(&result, err)
		return result
	}
	request, err := decodeWatchCodePayload[watchCodeSetFilesRequest](payload)
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

	snapshot, err := runtime.SetWatchCodeFiles(
		watchCodeMutationContext(request.FrontendOpID),
		strings.TrimSpace(request.PluginID),
		strings.TrimSpace(request.ProjectConfigID),
		request.Files,
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

func requireWatchCodePayloadKeys(payload map[string]any, requiredKeys ...string) error {
	for _, key := range requiredKeys {
		if _, ok := payload[key]; !ok {
			return fmt.Errorf("%w: %s is required", errWatchCodePayloadInvalid, key)
		}
	}
	return nil
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
	document, err := store.Load(context.Background())
	if err != nil {
		return projectstate.Document{}, err
	}
	return documentWithWatchCodeLocalCoreIgnoredRoots(document, request)
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
		projectstate.RuntimeOptions{
			WatchCodeIgnoredRoots: watchCodeLocalCoreIgnoredRoots(request),
		},
	)
	if err != nil {
		return nil, nil, err
	}
	return runtime, func() {
		_ = runtime.Close()
	}, nil
}

func documentWithWatchCodeLocalCoreIgnoredRoots(
	document projectstate.Document,
	request watchCodeRequestBase,
) (projectstate.Document, error) {
	runtime, err := projectstate.OpenOverlayRuntimeWithOptions(
		document,
		projectstate.RuntimeOptions{
			WatchCodeIgnoredRoots: watchCodeLocalCoreIgnoredRoots(request),
		},
	)
	if err != nil {
		return projectstate.Document{}, err
	}
	defer func() {
		_ = runtime.Close()
	}()
	return runtime.Snapshot().Document, nil
}

func watchCodeLocalCoreIgnoredRoots(request watchCodeRequestBase) []string {
	roots := []string{}
	if settaFilesRoot := strings.TrimSpace(request.SettaFilesRoot); settaFilesRoot != "" {
		roots = append(roots, settaFilesRoot)
	}
	if runtimeRoot := strings.TrimSpace(request.RuntimeRoot); runtimeRoot != "" {
		roots = append(roots, runtimeRoot)
	}
	return roots
}

func readWatchCodeProjectData(
	document projectstate.Document,
	request watchCodeRequestBase,
) (projectstate.WatchCodePluginProjectData, error) {
	if err := validateWatchCodeRequestBase(request, false); err != nil {
		return projectstate.WatchCodePluginProjectData{}, err
	}
	project, err := document.ProjectByID(strings.TrimSpace(request.ProjectConfigID))
	if err != nil {
		return projectstate.WatchCodePluginProjectData{}, err
	}
	projectData, _, err := document.WatchCodePluginProjectData(strings.TrimSpace(request.PluginID), project.ID)
	if err != nil {
		return projectstate.WatchCodePluginProjectData{}, err
	}
	return projectData.Normalized(), nil
}

func watchCodeMutationContext(frontendOpID *string) context.Context {
	ctx := context.Background()
	if frontendOpID == nil {
		return ctx
	}
	trimmed := strings.TrimSpace(*frontendOpID)
	if trimmed == "" {
		return ctx
	}
	return projectstate.ContextWithFrontendOpID(ctx, trimmed)
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
		return watchcodecontracts.BackendErrorProviderRequired, err.Error(), nil
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		return watchcodecontracts.BackendErrorProjectConfigIDRequired, "Project config id is required.", nil
	case errors.Is(err, projectstate.ErrProjectNotFound):
		return watchcodecontracts.BackendErrorProjectConfigNotFound, "Project config not found.", nil
	case errors.Is(err, errWatchCodeWorkspaceRootRequired),
		errors.Is(err, projectstate.ErrWatchCodeWorkspaceRootRequired),
		errors.Is(err, projectstate.ErrWatchCodeInputPathInvalid),
		errors.Is(err, errWatchCodePayloadInvalid):
		return watchcodecontracts.BackendErrorInvalidWatchCodeInput, err.Error(), nil
	case errors.Is(err, projectstate.ErrRuntimeClosed),
		errors.Is(err, projectstate.ErrPersistedStoreUnsupported):
		return watchcodecontracts.BackendErrorInternal, err.Error(), nil
	case errors.Is(err, errWatchCodeSettaFilesRootRequired):
		return backendruntime.ErrorCodeInvalidRequest, err.Error(), nil
	}
	return watchcodecontracts.BackendErrorInternal, err.Error(), nil
}
