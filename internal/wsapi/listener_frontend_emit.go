package wsapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/artifacts"
	"setta/internal/codegen"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

var (
	errListenerEmitUnknownDependency         = errors.New("listener emit unknown dependency")
	errListenerEmitUnsupportedDependency     = errors.New("listener emit unsupported dependency")
	errListenerEmitInvalidValue              = errors.New("listener emit invalid value")
	errListenerEmitApplyFailed               = errors.New("listener emit apply failed")
	errListenerEmitInvalidArtifactUpdate     = errors.New("listener emit invalid artifact update")
	errListenerEmitUnsupportedArtifactUpdate = errors.New("listener emit unsupported artifact update")
	errListenerEmitArtifactUpdateFailed      = errors.New("listener emit artifact update failed")
)

type listenerEmitUnknownDependencyError struct {
	DependencyName string
}

func (e *listenerEmitUnknownDependencyError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("%s: %s", errListenerEmitUnknownDependency, e.DependencyName)
}

func (e *listenerEmitUnknownDependencyError) Unwrap() error {
	return errListenerEmitUnknownDependency
}

type listenerEmitUnsupportedDependencyError struct {
	DependencyName string
	Reason         string
}

func (e *listenerEmitUnsupportedDependencyError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("%s: %s: %s", errListenerEmitUnsupportedDependency, e.DependencyName, e.Reason)
}

func (e *listenerEmitUnsupportedDependencyError) Unwrap() error {
	return errListenerEmitUnsupportedDependency
}

type listenerEmitInvalidValueError struct {
	DependencyName string
	ExpectedType   string
}

func (e *listenerEmitInvalidValueError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("%s: %s expects %s", errListenerEmitInvalidValue, e.DependencyName, e.ExpectedType)
}

func (e *listenerEmitInvalidValueError) Unwrap() error {
	return errListenerEmitInvalidValue
}

type listenerEmitApplyError struct {
	Message string
}

func (e *listenerEmitApplyError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *listenerEmitApplyError) Unwrap() error {
	return errListenerEmitApplyFailed
}

type listenerEmitInvalidArtifactUpdateError struct {
	Path    string
	Message string
}

func (e *listenerEmitInvalidArtifactUpdateError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *listenerEmitInvalidArtifactUpdateError) Unwrap() error {
	return errListenerEmitInvalidArtifactUpdate
}

type listenerEmitUnsupportedArtifactUpdateError struct {
	Path   string
	Reason string
}

func (e *listenerEmitUnsupportedArtifactUpdateError) Error() string {
	if e == nil {
		return ""
	}
	return e.Reason
}

func (e *listenerEmitUnsupportedArtifactUpdateError) Unwrap() error {
	return errListenerEmitUnsupportedArtifactUpdate
}

type listenerEmitArtifactUpdateFailedError struct {
	Path    string
	Message string
}

func (e *listenerEmitArtifactUpdateFailedError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *listenerEmitArtifactUpdateFailedError) Unwrap() error {
	return errListenerEmitArtifactUpdateFailed
}

type listenerResolvedDependencyUpdate struct {
	DependencyName string
	SectionID      string
	CodeObjectID   string
	SectionType    string
	RawValue       json.RawMessage
}

type listenerResolvedArtifactUpdate struct {
	Artifact artifacts.RawArtifact
}

func handleListenerFrontendEmit(
	ctx context.Context,
	connectionID string,
	requestInfo modes.RequestInfo,
	content realtime.ListenerFrontendEmitContent,
	deps RouteDependencies,
) error {
	registration, ok := deps.ListenerBroadcaster.Registry().Registration(connectionID)
	if !ok {
		return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error: "listener_not_registered",
			Details: map[string]any{
				"websocketId": connectionID,
			},
		}, deps)
	}

	projectID := registration.ProjectID
	receivedProjectID := strings.TrimSpace(content.ProjectConfigID)
	if listenerUsesTemporaryIDs(deps, connectionID) {
		resolvedProjectID, err := resolveListenerProjectIDFromTemporary(receivedProjectID, deps.TemporaryIDs)
		if err != nil {
			var temporaryIDError *listenerTemporaryIDError
			if errors.As(err, &temporaryIDError) {
				return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
					Error: "listener_invalid_id",
					Details: map[string]any{
						"message": temporaryIDError.Error(),
					},
				}, deps)
			}
			return err
		}
		receivedProjectID = resolvedProjectID
	}
	if receivedProjectID != projectID {
		return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error: "project_config_mismatch",
			Details: map[string]any{
				"expectedProjectConfigId": projectID,
				"receivedProjectConfigId": receivedProjectID,
			},
		}, deps)
	}

	if requestInfo.Policy.IsDeployment() && strings.TrimSpace(registration.ShareSessionID) == "" {
		return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error: "share_session_missing",
			Details: map[string]any{
				"websocketId": connectionID,
			},
		}, deps)
	}

	if len(content.DependencyValues) == 0 && len(content.ArtifactUpdates) == 0 {
		return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error: "listener_emit_invalid_payload",
			Details: map[string]any{
				"message": "listener emits require dependencyValues or artifactUpdates",
			},
		}, deps)
	}

	if requestInfo.Policy.IsDeployment() {
		if deps.Deployment == nil {
			return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
				Error: "project_state_unavailable",
				Details: map[string]any{
					"message": "deployment runtime is required",
				},
			}, deps)
		}
		if !deps.Deployment.Policy().AllowParamChanges {
			return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
				Error: "listener_emit_failed",
				Details: map[string]any{
					"message": "Deployment policy disallows listener updates.",
				},
			}, deps)
		}
	}

	artifactUpdates, err := validateListenerArtifactUpdates(requestInfo, content.ArtifactUpdates, deps)
	if err != nil {
		return sendResolvedListenerEmitError(ctx, connectionID, err, deps)
	}

	if len(content.DependencyValues) == 0 {
		return applyListenerArtifactUpdates(ctx, requestInfo, artifactUpdates, deps)
	}

	runtime, err := listenerMutationRuntime(requestInfo, deps)
	if err != nil {
		return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error: "project_state_unavailable",
			Details: map[string]any{
				"message": err.Error(),
			},
		}, deps)
	}

	snapshot := runtime.Snapshot()
	project, err := snapshot.Document.ProjectByID(projectID)
	if err != nil {
		return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
			Error: "project_state_unavailable",
			Details: map[string]any{
				"message": err.Error(),
			},
		}, deps)
	}

	updates, err := resolveListenerFrontendDependencyUpdates(project, content.DependencyValues)
	if err != nil {
		return sendResolvedListenerEmitError(ctx, connectionID, err, deps)
	}

	updatedSnapshot, err := runtime.MutateAndSave(ctx, func(document projectstate.Document) (projectstate.Document, error) {
		project, err := document.ProjectByID(projectID)
		if err != nil {
			return projectstate.Document{}, err
		}
		if err := applyListenerFrontendDependencyUpdates(&project, updates); err != nil {
			return projectstate.Document{}, err
		}
		document.Projects[project.ID] = project
		return document, nil
	})
	if err != nil {
		return sendResolvedListenerEmitError(ctx, connectionID, &listenerEmitApplyError{
			Message: err.Error(),
		}, deps)
	}

	if err := broadcastListenerProjectStateUpdate(ctx, updatedSnapshot, projectID, requestInfo.ShareSessionID, deps); err != nil {
		return err
	}

	return applyListenerArtifactUpdates(ctx, requestInfo, artifactUpdates, deps)
}

func listenerMutationRuntime(
	requestInfo modes.RequestInfo,
	deps RouteDependencies,
) (*projectstate.Runtime, error) {
	if requestInfo.Policy.IsDeployment() {
		if deps.Deployment == nil {
			return nil, fmt.Errorf("deployment runtime is required")
		}
		return deps.Deployment.Overlay(requestInfo.ShareSessionID)
	}
	if deps.ProjectState == nil {
		return nil, fmt.Errorf("project runtime is required")
	}
	return deps.ProjectState, nil
}

func validateListenerArtifactUpdates(
	requestInfo modes.RequestInfo,
	rawUpdates []artifacts.RawArtifact,
	deps RouteDependencies,
) ([]listenerResolvedArtifactUpdate, error) {
	if len(rawUpdates) == 0 {
		return nil, nil
	}

	resolved := make([]listenerResolvedArtifactUpdate, 0, len(rawUpdates))
	for _, update := range rawUpdates {
		rawPath := strings.TrimSpace(update.ID)
		if rawPath == "" {
			rawPath = update.ID
		}

		normalizedID, err := validateListenerArtifactUpdate(requestInfo, update, deps)
		if err != nil {
			return nil, classifyListenerArtifactUpdateError(rawPath, err)
		}

		next := cloneRawArtifact(update)
		next.ID = normalizedID
		resolved = append(resolved, listenerResolvedArtifactUpdate{Artifact: next})
	}
	return resolved, nil
}

func validateListenerArtifactUpdate(
	requestInfo modes.RequestInfo,
	update artifacts.RawArtifact,
	deps RouteDependencies,
) (string, error) {
	const scope = artifacts.UploadScopeGeneric

	if requestInfo.Policy.IsDeployment() {
		if deps.ShareArtifacts == nil {
			return "", fmt.Errorf("share artifact service is required")
		}
		return deps.ShareArtifacts.ValidateListenerUpdate(update, scope)
	}
	if deps.Artifacts == nil {
		return "", fmt.Errorf("artifact service is required")
	}
	return deps.Artifacts.ValidateListenerUpdate(update, scope)
}

func applyListenerArtifactUpdates(
	ctx context.Context,
	requestInfo modes.RequestInfo,
	updates []listenerResolvedArtifactUpdate,
	deps RouteDependencies,
) error {
	if len(updates) == 0 {
		return nil
	}

	rawUpdates := make([]artifacts.RawArtifact, 0, len(updates))
	for _, update := range updates {
		rawUpdates = append(rawUpdates, cloneRawArtifact(update.Artifact))
	}
	request := artifacts.UpdateRequest{
		Artifacts:   rawUpdates,
		UploadScope: artifacts.UploadScopeGeneric,
	}

	if requestInfo.Policy.IsDeployment() {
		if deps.ShareArtifacts == nil {
			return &listenerEmitArtifactUpdateFailedError{
				Path:    rawUpdates[0].ID,
				Message: "share artifact service is required",
			}
		}
		if _, err := deps.ShareArtifacts.Update(ctx, requestInfo.ShareSessionID, request); err != nil {
			return classifyListenerArtifactUpdateError(rawUpdates[0].ID, err)
		}
		return nil
	}

	if deps.Artifacts == nil {
		return &listenerEmitArtifactUpdateFailedError{
			Path:    rawUpdates[0].ID,
			Message: "artifact service is required",
		}
	}
	if _, err := deps.Artifacts.Update(ctx, request); err != nil {
		return classifyListenerArtifactUpdateError(rawUpdates[0].ID, err)
	}
	return broadcastListenerArtifactUpdates(ctx, rawUpdates, requestInfo.ShareSessionID, deps)
}

func resolveListenerFrontendDependencyUpdates(
	project projectstate.Project,
	rawValues map[string]json.RawMessage,
) ([]listenerResolvedDependencyUpdate, error) {
	exported, err := project.ListenerDependencyExport()
	if err != nil {
		return nil, err
	}
	graph, err := codegen.BuildPythonDependencyGraph(exported, codegen.PythonDependencyGraphOptions{})
	if err != nil {
		return nil, err
	}

	updates := make([]listenerResolvedDependencyUpdate, 0, len(rawValues))
	for dependencyName, rawValue := range rawValues {
		trimmedName := strings.TrimSpace(dependencyName)
		if trimmedName == "" {
			return nil, &listenerEmitUnknownDependencyError{DependencyName: dependencyName}
		}
		key, ok := graph.FullPathNameToKey[trimmedName]
		if !ok {
			return nil, &listenerEmitUnknownDependencyError{DependencyName: trimmedName}
		}

		node, ok := graph.Node(key)
		if !ok {
			return nil, &listenerEmitUnknownDependencyError{DependencyName: trimmedName}
		}

		switch typed := node.(type) {
		case *codegen.PythonParamNode:
			if _, err := decodeJSONString(rawValue); err != nil {
				return nil, &listenerEmitInvalidValueError{
					DependencyName: trimmedName,
					ExpectedType:   "Literal",
				}
			}
			updates = append(updates, listenerResolvedDependencyUpdate{
				DependencyName: trimmedName,
				SectionID:      key.SectionID,
				CodeObjectID:   key.CodeObjectID,
				RawValue:       cloneJSONRawMessage(rawValue),
			})
		case *codegen.PythonSectionNode:
			if err := validateListenerFrontendSectionValue(trimmedName, typed.SectionType, rawValue); err != nil {
				return nil, err
			}
			switch typed.SectionType {
			case "TextBlock", "Chat", "Plugin":
				updates = append(updates, listenerResolvedDependencyUpdate{
					DependencyName: trimmedName,
					SectionID:      key.SectionID,
					SectionType:    typed.SectionType,
					RawValue:       cloneJSONRawMessage(rawValue),
				})
			default:
				return nil, &listenerEmitUnsupportedDependencyError{
					DependencyName: trimmedName,
					Reason:         "dependency does not expose a writable value",
				}
			}
		default:
			return nil, &listenerEmitUnsupportedDependencyError{
				DependencyName: trimmedName,
				Reason:         "dependency does not expose a writable value",
			}
		}
	}

	return updates, nil
}

func validateListenerFrontendSectionValue(
	dependencyName string,
	sectionType string,
	rawValue json.RawMessage,
) error {
	switch sectionType {
	case "TextBlock":
		if _, err := decodeJSONString(rawValue); err != nil {
			return &listenerEmitInvalidValueError{
				DependencyName: dependencyName,
				ExpectedType:   "Literal",
			}
		}
		return nil
	case "Chat", "Plugin":
		if isJSONObject(rawValue) {
			return nil
		}
		if _, err := decodeJSONString(rawValue); err == nil {
			return nil
		}
		return &listenerEmitInvalidValueError{
			DependencyName: dependencyName,
			ExpectedType:   "Literal",
		}
	default:
		if _, err := decodeJSONString(rawValue); err != nil {
			return &listenerEmitInvalidValueError{
				DependencyName: dependencyName,
				ExpectedType:   "Literal",
			}
		}
		return nil
	}
}

func applyListenerFrontendDependencyUpdates(
	project *projectstate.Project,
	updates []listenerResolvedDependencyUpdate,
) error {
	if project == nil {
		return projectstate.ErrProjectNotFound
	}
	for _, update := range updates {
		if strings.TrimSpace(update.CodeObjectID) != "" {
			value, err := decodeJSONString(update.RawValue)
			if err != nil {
				return &listenerEmitApplyError{
					Message: fmt.Sprintf("listener emit expected literal payload for %s", update.DependencyName),
				}
			}
			if err := project.SetSectionCodeObjectValue(update.SectionID, update.CodeObjectID, value); err != nil {
				return &listenerEmitApplyError{Message: err.Error()}
			}
			continue
		}

		switch update.SectionType {
		case "TextBlock":
			value, err := decodeJSONString(update.RawValue)
			if err != nil {
				return &listenerEmitApplyError{
					Message: fmt.Sprintf("listener emit expected literal payload for %s", update.DependencyName),
				}
			}
			if err := project.SetTextBlockText(update.SectionID, value); err != nil {
				return &listenerEmitApplyError{Message: err.Error()}
			}
		case "Chat":
			state, err := decodeListenerChatState(update.SectionID, update.RawValue)
			if err != nil {
				return &listenerEmitApplyError{Message: err.Error()}
			}
			if err := project.SetChatSectionState(update.SectionID, state); err != nil {
				return &listenerEmitApplyError{Message: err.Error()}
			}
		case "Plugin":
			if err := applyListenerPluginSectionUpdate(project, update.SectionID, update.RawValue); err != nil {
				return &listenerEmitApplyError{Message: err.Error()}
			}
		default:
			return &listenerEmitApplyError{
				Message: fmt.Sprintf(
					"listener emit targeted unsupported section type %s (section %s)",
					update.SectionType,
					update.SectionID,
				),
			}
		}
	}
	return nil
}

func decodeListenerChatState(sectionID string, rawValue json.RawMessage) (projectstate.ChatSectionState, error) {
	if isJSONObject(rawValue) {
		var state projectstate.ChatSectionState
		if err := json.Unmarshal(rawValue, &state); err != nil {
			return projectstate.ChatSectionState{}, fmt.Errorf(
				"listener emit chat section payload must be valid JSON for %s",
				sectionID,
			)
		}
		return state, nil
	}

	value, err := decodeJSONString(rawValue)
	if err != nil {
		return projectstate.ChatSectionState{}, fmt.Errorf(
			"listener emit expected literal payload for %s",
			sectionID,
		)
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return projectstate.ChatSectionState{}, fmt.Errorf(
			"listener emit chat section payload is empty for %s",
			sectionID,
		)
	}

	var state projectstate.ChatSectionState
	if err := json.Unmarshal([]byte(value), &state); err != nil {
		return projectstate.ChatSectionState{}, fmt.Errorf(
			"listener emit chat section payload must be valid JSON for %s",
			sectionID,
		)
	}
	return state, nil
}

func applyListenerPluginSectionUpdate(project *projectstate.Project, sectionID string, rawValue json.RawMessage) error {
	section, variant, impl, err := project.ResolveSection(sectionID)
	if err != nil {
		return err
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		return err
	}
	if sectionTypeForPayload(payload, impl) != "Plugin" {
		return fmt.Errorf("listener emit targeted unsupported section type %s (section %s)", sectionTypeForPayload(payload, impl), sectionID)
	}

	parsedPayload, err := decodeListenerPluginPayload(sectionID, rawValue)
	if err != nil {
		return err
	}

	currentData := map[string]any{}
	if rawData, ok := payload["data"].(map[string]any); ok {
		currentData = cloneJSONObject(rawData)
	}

	controlKeys := map[string]struct{}{
		"data":          {},
		"kind":          {},
		"schemaVersion": {},
		"merge":         {},
	}
	hasControlPayload := false
	if _, ok := parsedPayload["data"]; ok {
		hasControlPayload = true
		for key := range parsedPayload {
			if _, ok := controlKeys[key]; !ok {
				hasControlPayload = false
				break
			}
		}
	}

	nextData := map[string]any{}
	if hasControlPayload {
		mergeValue := true
		if rawMerge, ok := parsedPayload["merge"]; ok {
			typed, ok := rawMerge.(bool)
			if !ok {
				return fmt.Errorf("listener emit plugin section merge flag must be boolean")
			}
			mergeValue = typed
		}
		rawData, ok := parsedPayload["data"]
		if !ok {
			rawData = map[string]any{}
		}
		typedData, ok := rawData.(map[string]any)
		if !ok {
			return fmt.Errorf("listener emit plugin section data field must be an object")
		}
		nextData = cloneJSONObject(typedData)
		if mergeValue {
			nextData = mergeJSONObjects(currentData, nextData)
		}
		if err := project.SetSectionFieldForVariant(section.ID, variant.ID, "data", nextData); err != nil {
			return err
		}
		if rawKind, ok := parsedPayload["kind"]; ok {
			typedKind, ok := rawKind.(string)
			if !ok {
				return fmt.Errorf("listener emit plugin section kind field must be a string")
			}
			if err := project.SetSectionFieldForVariant(section.ID, variant.ID, "kind", typedKind); err != nil {
				return err
			}
		}
		if rawSchemaVersion, ok := parsedPayload["schemaVersion"]; ok {
			switch typed := rawSchemaVersion.(type) {
			case nil:
				if err := project.SetSectionFieldForVariant(section.ID, variant.ID, "schemaVersion", nil); err != nil {
					return err
				}
			case float64:
				if typed != float64(int(typed)) {
					return fmt.Errorf("listener emit plugin section schemaVersion must be int or null")
				}
				if err := project.SetSectionFieldForVariant(section.ID, variant.ID, "schemaVersion", int(typed)); err != nil {
					return err
				}
			default:
				return fmt.Errorf("listener emit plugin section schemaVersion must be int or null")
			}
		}
		return nil
	}

	nextData = mergeJSONObjects(currentData, parsedPayload)
	return project.SetSectionFieldForVariant(section.ID, variant.ID, "data", nextData)
}

func decodeListenerPluginPayload(sectionID string, rawValue json.RawMessage) (map[string]any, error) {
	if isJSONObject(rawValue) {
		var payload map[string]any
		if err := json.Unmarshal(rawValue, &payload); err != nil {
			return nil, fmt.Errorf("listener emit plugin section payload must be valid JSON for %s", sectionID)
		}
		return payload, nil
	}

	value, err := decodeJSONString(rawValue)
	if err != nil {
		return nil, fmt.Errorf("listener emit expected literal payload for %s", sectionID)
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, fmt.Errorf("listener emit plugin section payload is empty for %s", sectionID)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(value), &payload); err != nil {
		return nil, fmt.Errorf("listener emit plugin section payload must be valid JSON for %s", sectionID)
	}
	if payload == nil {
		return nil, fmt.Errorf("listener emit expected object payload for plugin section %s", sectionID)
	}
	return payload, nil
}

func broadcastListenerProjectStateUpdate(
	ctx context.Context,
	snapshot projectstate.Snapshot,
	projectID string,
	shareSessionID string,
	deps RouteDependencies,
) error {
	if deps.WebsocketHub == nil {
		return nil
	}

	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return err
	}

	status := projectstate.FrontendOpStatus{}
	if deps.Deployment != nil && strings.TrimSpace(shareSessionID) != "" {
		runtime, runtimeErr := deps.Deployment.Overlay(shareSessionID)
		if runtimeErr != nil && !errors.Is(runtimeErr, deployments.ErrUnknownSession) {
			return runtimeErr
		}
		if runtime != nil {
			status = runtime.FrontendOpStatus()
		}
	} else if deps.ProjectState != nil {
		status = deps.ProjectState.FrontendOpStatus()
	}

	_, err = deps.WebsocketHub.BroadcastJSON(
		ctx,
		realtime.NewProjectStateUpdateMessage(realtime.ProjectStateUpdateContent{
			ProjectState:   projectStateView,
			CompletedOpIDs: status.Completed,
			PendingOpIDs:   status.Pending,
		}),
		realtime.Selection{
			Type:           realtime.ConnectionTypeFrontend,
			ShareSessionID: strings.TrimSpace(shareSessionID),
		},
	)
	return err
}

func broadcastListenerArtifactUpdates(
	ctx context.Context,
	updates []artifacts.RawArtifact,
	shareSessionID string,
	deps RouteDependencies,
) error {
	if deps.WebsocketHub == nil || len(updates) == 0 {
		return nil
	}

	payloads := make([]any, 0, len(updates))
	for _, update := range updates {
		payloads = append(payloads, cloneRawArtifact(update))
	}
	_, err := deps.WebsocketHub.BroadcastJSON(
		ctx,
		realtime.NewUpdateArtifactsMessage(realtime.UpdateArtifactsContent{
			Artifacts:  payloads,
			UpdateType: "update",
		}),
		realtime.Selection{
			Type:           realtime.ConnectionTypeFrontend,
			ShareSessionID: strings.TrimSpace(shareSessionID),
		},
	)
	return err
}

func classifyListenerArtifactUpdateError(path string, err error) error {
	var artifactErr *artifacts.Error
	if !errors.As(err, &artifactErr) {
		return &listenerEmitArtifactUpdateFailedError{
			Path:    path,
			Message: err.Error(),
		}
	}

	switch artifactErr.Kind {
	case artifacts.ErrorArtifactTypeUnsupported:
		return &listenerEmitUnsupportedArtifactUpdateError{
			Path:   path,
			Reason: artifactErr.Message,
		}
	case artifacts.ErrorInvalidRequest,
		artifacts.ErrorPathForbidden,
		artifacts.ErrorBinaryPayloadInvalid,
		artifacts.ErrorBinaryPayloadNotFound,
		artifacts.ErrorTooLarge,
		artifacts.ErrorMimeNotAllowed:
		return &listenerEmitInvalidArtifactUpdateError{
			Path:    path,
			Message: artifactErr.Message,
		}
	default:
		return &listenerEmitArtifactUpdateFailedError{
			Path:    path,
			Message: artifactErr.Message,
		}
	}
}

func sendResolvedListenerEmitError(
	ctx context.Context,
	connectionID string,
	err error,
	deps RouteDependencies,
) error {
	switch {
	case errors.Is(err, errListenerEmitUnknownDependency):
		var typed *listenerEmitUnknownDependencyError
		if errors.As(err, &typed) {
			return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
				Error: "listener_emit_unknown_dependency",
				Details: map[string]any{
					"dependencyName": typed.DependencyName,
				},
			}, deps)
		}
	case errors.Is(err, errListenerEmitUnsupportedDependency):
		var typed *listenerEmitUnsupportedDependencyError
		if errors.As(err, &typed) {
			return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
				Error: "listener_emit_unsupported_dependency",
				Details: map[string]any{
					"dependencyName": typed.DependencyName,
					"reason":         typed.Reason,
				},
			}, deps)
		}
	case errors.Is(err, errListenerEmitInvalidValue):
		var typed *listenerEmitInvalidValueError
		if errors.As(err, &typed) {
			return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
				Error: "listener_emit_invalid_value",
				Details: map[string]any{
					"dependencyName": typed.DependencyName,
					"expectedType":   typed.ExpectedType,
				},
			}, deps)
		}
	case errors.Is(err, errListenerEmitInvalidArtifactUpdate):
		var typed *listenerEmitInvalidArtifactUpdateError
		if errors.As(err, &typed) {
			return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
				Error: "listener_emit_invalid_artifact_update",
				Details: map[string]any{
					"path":    typed.Path,
					"message": typed.Message,
				},
			}, deps)
		}
	case errors.Is(err, errListenerEmitUnsupportedArtifactUpdate):
		var typed *listenerEmitUnsupportedArtifactUpdateError
		if errors.As(err, &typed) {
			return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
				Error: "listener_emit_unsupported_artifact_update",
				Details: map[string]any{
					"path":   typed.Path,
					"reason": typed.Reason,
				},
			}, deps)
		}
	case errors.Is(err, errListenerEmitArtifactUpdateFailed):
		var typed *listenerEmitArtifactUpdateFailedError
		if errors.As(err, &typed) {
			return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
				Error: "listener_emit_artifact_update_failed",
				Details: map[string]any{
					"message": typed.Message,
				},
			}, deps)
		}
	}

	return sendListenerError(ctx, connectionID, realtime.ListenerErrorContent{
		Error: "listener_emit_failed",
		Details: map[string]any{
			"message": err.Error(),
		},
	}, deps)
}

func decodeJSONString(raw json.RawMessage) (string, error) {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", err
	}
	return value, nil
}

func isJSONObject(raw json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(raw))
	return strings.HasPrefix(trimmed, "{")
}

func cloneJSONRawMessage(raw json.RawMessage) json.RawMessage {
	if raw == nil {
		return nil
	}
	cloned := make(json.RawMessage, len(raw))
	copy(cloned, raw)
	return cloned
}

func cloneRawArtifact(artifact artifacts.RawArtifact) artifacts.RawArtifact {
	cloned := artifact
	cloned.ID = strings.TrimSpace(artifact.ID)
	if artifact.Value == nil {
		cloned.Value = nil
		return cloned
	}
	rawValue := cloneJSONRawMessage(*artifact.Value)
	cloned.Value = &rawValue
	return cloned
}

func cloneJSONObject(source map[string]any) map[string]any {
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = cloneJSONValue(value)
	}
	return cloned
}

func cloneJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneJSONObject(typed)
	case []any:
		cloned := make([]any, len(typed))
		for index, entry := range typed {
			cloned[index] = cloneJSONValue(entry)
		}
		return cloned
	default:
		return typed
	}
}

func mergeJSONObjects(base map[string]any, overlay map[string]any) map[string]any {
	merged := cloneJSONObject(base)
	for key, value := range overlay {
		merged[key] = cloneJSONValue(value)
	}
	return merged
}

func sectionTypeForPayload(payload map[string]any, impl projectstate.SectionImpl) string {
	if payload != nil {
		if rawType, ok := payload["type"].(string); ok && strings.TrimSpace(rawType) != "" {
			return strings.TrimSpace(rawType)
		}
	}
	switch {
	case impl.IsCode():
		return "Code"
	case impl.IsTerminal():
		return "Terminal"
	case impl.IsDraw():
		return "Draw"
	case impl.IsGenerated():
		switch impl.Generated.Kind {
		case projectstate.GeneratedSectionKindPythonCode:
			return "GenPythonCode"
		case projectstate.GeneratedSectionKindPythonMetadata:
			return "GenPythonMetadata"
		case projectstate.GeneratedSectionKindPlugin:
			return "Plugin"
		}
	}
	if strings.TrimSpace(string(impl.Kind)) == "" {
		return ""
	}
	return string(impl.Kind)
}
