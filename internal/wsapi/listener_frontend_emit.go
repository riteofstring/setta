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

type listenerFrontendEmitContext struct {
	ProjectID string
}

type listenerPluginSectionTarget struct {
	SectionID string
	VariantID string
	Payload   map[string]any
}

type listenerPluginControlUpdate struct {
	Data                 map[string]any
	Kind                 *string
	SchemaVersionPresent bool
	SchemaVersionValue   any
}

type listenerEmitErrorResolver func(error) (realtime.ListenerErrorContent, bool)

var listenerEmitErrorResolvers = []listenerEmitErrorResolver{
	listenerEmitUnknownDependencyContent,
	listenerEmitUnsupportedDependencyContent,
	listenerEmitInvalidValueContent,
	listenerEmitInvalidArtifactUpdateContent,
	listenerEmitUnsupportedArtifactUpdateContent,
	listenerEmitArtifactUpdateFailedContent,
}

var listenerWritableSectionTypes = map[string]struct{}{
	"TextBlock": {},
	"Chat":      {},
	"Plugin":    {},
}

func handleListenerFrontendEmit(
	ctx context.Context,
	connectionID string,
	requestInfo modes.RequestInfo,
	content realtime.ListenerFrontendEmitContent,
	deps RouteDependencies,
) error {
	emitCtx, listenerErr, err := prepareListenerFrontendEmit(connectionID, requestInfo, content, deps)
	if listenerErr != nil {
		return sendListenerError(ctx, connectionID, *listenerErr, deps)
	}
	if err != nil {
		return err
	}

	artifactUpdates, err := validateListenerArtifactUpdates(requestInfo, content.ArtifactUpdates, deps)
	if err != nil {
		return sendResolvedListenerEmitError(ctx, connectionID, err, deps)
	}

	if len(content.DependencyValues) == 0 {
		return applyResolvedListenerArtifactUpdates(ctx, connectionID, requestInfo, artifactUpdates, deps)
	}

	return applyListenerFrontendEmitDependencyUpdates(
		ctx,
		connectionID,
		requestInfo,
		emitCtx.ProjectID,
		content.DependencyValues,
		artifactUpdates,
		deps,
	)
}

func prepareListenerFrontendEmit(
	connectionID string,
	requestInfo modes.RequestInfo,
	content realtime.ListenerFrontendEmitContent,
	deps RouteDependencies,
) (listenerFrontendEmitContext, *realtime.ListenerErrorContent, error) {
	registration, ok := deps.ListenerBroadcaster.Registry().Registration(connectionID)
	if !ok {
		return listenerFrontendEmitContext{}, listenerNotRegisteredContent(connectionID), nil
	}

	projectID, listenerErr, err := resolveListenerFrontendEmitProjectID(registration, content.ProjectConfigID, connectionID, deps)
	if listenerErr != nil || err != nil {
		return listenerFrontendEmitContext{}, listenerErr, err
	}
	if listenerErr := validateListenerFrontendEmitRequest(registration, requestInfo, content, deps); listenerErr != nil {
		return listenerFrontendEmitContext{}, listenerErr, nil
	}

	return listenerFrontendEmitContext{
		ProjectID: projectID,
	}, nil, nil
}

func resolveListenerFrontendEmitProjectID(
	registration realtime.ListenerRegistration,
	projectConfigID string,
	connectionID string,
	deps RouteDependencies,
) (string, *realtime.ListenerErrorContent, error) {
	projectID := registration.ProjectID
	receivedProjectID := strings.TrimSpace(projectConfigID)
	if listenerUsesTemporaryIDs(deps, connectionID) {
		resolvedProjectID, err := resolveListenerProjectIDFromTemporary(receivedProjectID, deps.TemporaryIDs)
		if err != nil {
			var temporaryIDError *listenerTemporaryIDError
			if errors.As(err, &temporaryIDError) {
				return "", listenerInvalidIDContent(temporaryIDError.Error()), nil
			}
			return "", nil, err
		}
		receivedProjectID = resolvedProjectID
	}
	if receivedProjectID != projectID {
		return "", projectConfigMismatchContent(projectID, receivedProjectID), nil
	}
	return projectID, nil, nil
}

func validateListenerFrontendEmitRequest(
	registration realtime.ListenerRegistration,
	requestInfo modes.RequestInfo,
	content realtime.ListenerFrontendEmitContent,
	deps RouteDependencies,
) *realtime.ListenerErrorContent {
	if requestInfo.Policy.IsDeployment() && strings.TrimSpace(registration.ShareSessionID) == "" {
		return shareSessionMissingContent(registration.ConnectionID)
	}
	if len(content.DependencyValues) == 0 && len(content.ArtifactUpdates) == 0 {
		return listenerEmitInvalidPayloadContent()
	}
	if requestInfo.Policy.IsDeployment() && deps.Deployment == nil {
		return listenerProjectStateUnavailableContent("deployment runtime is required")
	}
	if requestInfo.Policy.IsDeployment() && !deps.Deployment.Policy().AllowParamChanges {
		return listenerEmitFailedContent("Deployment policy disallows listener updates.")
	}
	return nil
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

func applyResolvedListenerArtifactUpdates(
	ctx context.Context,
	connectionID string,
	requestInfo modes.RequestInfo,
	artifactUpdates []listenerResolvedArtifactUpdate,
	deps RouteDependencies,
) error {
	if err := applyListenerArtifactUpdates(ctx, requestInfo, artifactUpdates, deps); err != nil {
		return sendResolvedListenerEmitError(ctx, connectionID, err, deps)
	}
	return nil
}

func applyListenerFrontendEmitDependencyUpdates(
	ctx context.Context,
	connectionID string,
	requestInfo modes.RequestInfo,
	projectID string,
	rawValues map[string]json.RawMessage,
	artifactUpdates []listenerResolvedArtifactUpdate,
	deps RouteDependencies,
) error {
	runtime, err := listenerMutationRuntime(requestInfo, deps)
	if err != nil {
		return sendListenerError(ctx, connectionID, *listenerProjectStateUnavailableContent(err.Error()), deps)
	}

	project, err := listenerEmitProjectForMutation(runtime, projectID)
	if err != nil {
		return sendListenerError(ctx, connectionID, *listenerProjectStateUnavailableContent(listenerProjectUnavailableMessage(projectID, err)), deps)
	}

	updates, err := resolveListenerFrontendDependencyUpdates(project, rawValues)
	if err != nil {
		return sendResolvedListenerEmitError(ctx, connectionID, err, deps)
	}

	updatedSnapshot, err := mutateListenerFrontendEmitProject(ctx, runtime, projectID, updates)
	if err != nil {
		return sendResolvedListenerEmitError(ctx, connectionID, &listenerEmitApplyError{Message: err.Error()}, deps)
	}
	if err := broadcastListenerProjectStateUpdate(ctx, updatedSnapshot, projectID, requestInfo.ShareSessionID, deps); err != nil {
		return err
	}
	return applyResolvedListenerArtifactUpdates(ctx, connectionID, requestInfo, artifactUpdates, deps)
}

func listenerEmitProjectForMutation(
	runtime *projectstate.Runtime,
	projectID string,
) (projectstate.Project, error) {
	snapshot := runtime.Snapshot()
	return snapshot.Document.ProjectByID(projectID)
}

func mutateListenerFrontendEmitProject(
	ctx context.Context,
	runtime *projectstate.Runtime,
	projectID string,
	updates []listenerResolvedDependencyUpdate,
) (projectstate.Snapshot, error) {
	return runtime.MutateAndSave(ctx, func(document projectstate.Document) (projectstate.Document, error) {
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
}

func listenerProjectUnavailableMessage(projectID string, err error) string {
	if errors.Is(err, projectstate.ErrProjectNotFound) {
		return fmt.Sprintf("'%s'", projectID)
	}
	return err.Error()
}

func resolveListenerFrontendDependencyUpdates(
	project projectstate.Project,
	rawValues map[string]json.RawMessage,
) ([]listenerResolvedDependencyUpdate, error) {
	graph, err := listenerFrontendDependencyGraph(project)
	if err != nil {
		return nil, err
	}
	updates := make([]listenerResolvedDependencyUpdate, 0, len(rawValues))
	for dependencyName, rawValue := range rawValues {
		update, err := resolveListenerFrontendDependencyUpdate(graph, dependencyName, rawValue)
		if err != nil {
			return nil, err
		}
		updates = append(updates, update)
	}

	return updates, nil
}

func listenerFrontendDependencyGraph(project projectstate.Project) (*codegen.PythonDependencyGraph, error) {
	exported, err := project.ListenerDependencyExport()
	if err != nil {
		return nil, err
	}
	return codegen.BuildPythonDependencyGraph(exported, codegen.PythonDependencyGraphOptions{})
}

func resolveListenerFrontendDependencyUpdate(
	graph *codegen.PythonDependencyGraph,
	dependencyName string,
	rawValue json.RawMessage,
) (listenerResolvedDependencyUpdate, error) {
	trimmedName, key, err := listenerFrontendDependencyKey(graph, dependencyName)
	if err != nil {
		return listenerResolvedDependencyUpdate{}, err
	}

	node, ok := graph.Node(key)
	if !ok {
		return listenerResolvedDependencyUpdate{}, &listenerEmitUnknownDependencyError{DependencyName: trimmedName}
	}
	return listenerResolvedDependencyUpdateForNode(trimmedName, key, node, rawValue)
}

func listenerFrontendDependencyKey(
	graph *codegen.PythonDependencyGraph,
	dependencyName string,
) (string, codegen.PythonDependencyKey, error) {
	trimmedName := strings.TrimSpace(dependencyName)
	if trimmedName == "" {
		return "", codegen.PythonDependencyKey{}, &listenerEmitUnknownDependencyError{DependencyName: dependencyName}
	}
	key, ok := graph.FullPathNameToKey[trimmedName]
	if !ok {
		return "", codegen.PythonDependencyKey{}, &listenerEmitUnknownDependencyError{DependencyName: trimmedName}
	}
	return trimmedName, key, nil
}

func listenerResolvedDependencyUpdateForNode(
	dependencyName string,
	key codegen.PythonDependencyKey,
	node codegen.PythonDependencyNode,
	rawValue json.RawMessage,
) (listenerResolvedDependencyUpdate, error) {
	switch typed := node.(type) {
	case *codegen.PythonParamNode:
		return listenerResolvedParamDependencyUpdate(dependencyName, key, rawValue)
	case *codegen.PythonSectionNode:
		return listenerResolvedSectionDependencyUpdate(dependencyName, key, typed.SectionType, rawValue)
	default:
		return listenerResolvedDependencyUpdate{}, &listenerEmitUnsupportedDependencyError{
			DependencyName: dependencyName,
			Reason:         "dependency does not expose a writable value",
		}
	}
}

func listenerResolvedParamDependencyUpdate(
	dependencyName string,
	key codegen.PythonDependencyKey,
	rawValue json.RawMessage,
) (listenerResolvedDependencyUpdate, error) {
	if _, err := decodeJSONString(rawValue); err != nil {
		return listenerResolvedDependencyUpdate{}, &listenerEmitInvalidValueError{
			DependencyName: dependencyName,
			ExpectedType:   "Literal",
		}
	}
	return listenerResolvedDependencyUpdate{
		DependencyName: dependencyName,
		SectionID:      key.SectionID,
		CodeObjectID:   key.CodeObjectID,
		RawValue:       cloneJSONRawMessage(rawValue),
	}, nil
}

func listenerResolvedSectionDependencyUpdate(
	dependencyName string,
	key codegen.PythonDependencyKey,
	sectionType string,
	rawValue json.RawMessage,
) (listenerResolvedDependencyUpdate, error) {
	if err := validateListenerFrontendSectionValue(dependencyName, sectionType, rawValue); err != nil {
		return listenerResolvedDependencyUpdate{}, err
	}
	if !listenerSectionTypeWritable(sectionType) {
		return listenerResolvedDependencyUpdate{}, &listenerEmitUnsupportedDependencyError{
			DependencyName: dependencyName,
			Reason:         "dependency does not expose a writable value",
		}
	}
	return listenerResolvedDependencyUpdate{
		DependencyName: dependencyName,
		SectionID:      key.SectionID,
		SectionType:    sectionType,
		RawValue:       cloneJSONRawMessage(rawValue),
	}, nil
}

func listenerSectionTypeWritable(sectionType string) bool {
	_, ok := listenerWritableSectionTypes[sectionType]
	return ok
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
		if err := applyListenerFrontendDependencyUpdate(project, update); err != nil {
			return err
		}
	}
	return nil
}

func applyListenerFrontendDependencyUpdate(
	project *projectstate.Project,
	update listenerResolvedDependencyUpdate,
) error {
	if strings.TrimSpace(update.CodeObjectID) != "" {
		return applyListenerCodeObjectDependencyUpdate(project, update)
	}
	return applyListenerSectionDependencyUpdate(project, update)
}

func applyListenerCodeObjectDependencyUpdate(
	project *projectstate.Project,
	update listenerResolvedDependencyUpdate,
) error {
	value, err := decodeJSONString(update.RawValue)
	if err != nil {
		return &listenerEmitApplyError{
			Message: fmt.Sprintf("listener emit expected literal payload for %s", update.DependencyName),
		}
	}
	if err := project.SetSectionCodeObjectValue(update.SectionID, update.CodeObjectID, value); err != nil {
		return &listenerEmitApplyError{Message: err.Error()}
	}
	return nil
}

func applyListenerSectionDependencyUpdate(
	project *projectstate.Project,
	update listenerResolvedDependencyUpdate,
) error {
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
	target, err := resolveListenerPluginSectionTarget(project, sectionID)
	if err != nil {
		return err
	}

	parsedPayload, err := decodeListenerPluginPayload(sectionID, rawValue)
	if err != nil {
		return err
	}

	currentData := listenerPluginCurrentData(target.Payload)
	controlUpdate, hasControlPayload, err := decodeListenerPluginControlUpdate(parsedPayload, currentData)
	if err != nil {
		return err
	}
	if hasControlPayload {
		return applyListenerPluginControlUpdate(project, target, controlUpdate)
	}

	nextData := mergeJSONObjects(currentData, parsedPayload)
	return project.SetSectionFieldForVariant(target.SectionID, target.VariantID, "data", nextData)
}

func resolveListenerPluginSectionTarget(
	project *projectstate.Project,
	sectionID string,
) (listenerPluginSectionTarget, error) {
	section, variant, impl, err := project.ResolveSection(sectionID)
	if err != nil {
		return listenerPluginSectionTarget{}, err
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		return listenerPluginSectionTarget{}, err
	}
	sectionType := sectionTypeForPayload(payload, impl)
	if sectionType != "Plugin" {
		return listenerPluginSectionTarget{}, fmt.Errorf(
			"listener emit targeted unsupported section type %s (section %s)",
			sectionType,
			sectionID,
		)
	}
	return listenerPluginSectionTarget{
		SectionID: section.ID,
		VariantID: variant.ID,
		Payload:   payload,
	}, nil
}

func listenerPluginCurrentData(payload map[string]any) map[string]any {
	if rawData, ok := payload["data"].(map[string]any); ok {
		return cloneJSONObject(rawData)
	}
	return map[string]any{}
}

func decodeListenerPluginControlUpdate(
	parsedPayload map[string]any,
	currentData map[string]any,
) (listenerPluginControlUpdate, bool, error) {
	if !isListenerPluginControlPayload(parsedPayload) {
		return listenerPluginControlUpdate{}, false, nil
	}

	nextData, err := listenerPluginControlData(parsedPayload)
	if err != nil {
		return listenerPluginControlUpdate{}, true, err
	}
	mergeValue, err := listenerPluginMergeValue(parsedPayload)
	if err != nil {
		return listenerPluginControlUpdate{}, true, err
	}
	if mergeValue {
		nextData = mergeJSONObjects(currentData, nextData)
	}

	kind, err := listenerPluginKindValue(parsedPayload)
	if err != nil {
		return listenerPluginControlUpdate{}, true, err
	}
	schemaPresent, schemaValue, err := listenerPluginSchemaVersionValue(parsedPayload)
	if err != nil {
		return listenerPluginControlUpdate{}, true, err
	}

	return listenerPluginControlUpdate{
		Data:                 nextData,
		Kind:                 kind,
		SchemaVersionPresent: schemaPresent,
		SchemaVersionValue:   schemaValue,
	}, true, nil
}

func isListenerPluginControlPayload(parsedPayload map[string]any) bool {
	if _, ok := parsedPayload["data"]; !ok {
		return false
	}
	for key := range parsedPayload {
		switch key {
		case "data", "kind", "schemaVersion", "merge":
		default:
			return false
		}
	}
	return true
}

func listenerPluginControlData(parsedPayload map[string]any) (map[string]any, error) {
	rawData, ok := parsedPayload["data"]
	if !ok {
		return map[string]any{}, nil
	}
	typedData, ok := rawData.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("listener emit plugin section data field must be an object")
	}
	return cloneJSONObject(typedData), nil
}

func listenerPluginMergeValue(parsedPayload map[string]any) (bool, error) {
	rawMerge, ok := parsedPayload["merge"]
	if !ok {
		return true, nil
	}
	typed, ok := rawMerge.(bool)
	if !ok {
		return false, fmt.Errorf("listener emit plugin section merge flag must be boolean")
	}
	return typed, nil
}

func listenerPluginKindValue(parsedPayload map[string]any) (*string, error) {
	rawKind, ok := parsedPayload["kind"]
	if !ok {
		return nil, nil
	}
	typedKind, ok := rawKind.(string)
	if !ok {
		return nil, fmt.Errorf("listener emit plugin section kind field must be a string")
	}
	return &typedKind, nil
}

func listenerPluginSchemaVersionValue(parsedPayload map[string]any) (bool, any, error) {
	rawSchemaVersion, ok := parsedPayload["schemaVersion"]
	if !ok {
		return false, nil, nil
	}
	switch typed := rawSchemaVersion.(type) {
	case nil:
		return true, nil, nil
	case float64:
		if typed != float64(int(typed)) {
			return false, nil, fmt.Errorf("listener emit plugin section schemaVersion must be int or null")
		}
		return true, int(typed), nil
	default:
		return false, nil, fmt.Errorf("listener emit plugin section schemaVersion must be int or null")
	}
}

func applyListenerPluginControlUpdate(
	project *projectstate.Project,
	target listenerPluginSectionTarget,
	update listenerPluginControlUpdate,
) error {
	if err := project.SetSectionFieldForVariant(target.SectionID, target.VariantID, "data", update.Data); err != nil {
		return err
	}
	if update.Kind != nil {
		if err := project.SetSectionFieldForVariant(target.SectionID, target.VariantID, "kind", *update.Kind); err != nil {
			return err
		}
	}
	if update.SchemaVersionPresent {
		if err := project.SetSectionFieldForVariant(target.SectionID, target.VariantID, "schemaVersion", update.SchemaVersionValue); err != nil {
			return err
		}
	}
	return nil
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

func listenerNotRegisteredContent(connectionID string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "listener_not_registered",
		Details: map[string]any{
			"websocketId": connectionID,
		},
	}
}

func listenerInvalidIDContent(message string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "listener_invalid_id",
		Details: map[string]any{
			"message": message,
		},
	}
}

func projectConfigMismatchContent(expectedProjectID string, receivedProjectID string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "project_config_mismatch",
		Details: map[string]any{
			"expectedProjectConfigId": expectedProjectID,
			"receivedProjectConfigId": receivedProjectID,
		},
	}
}

func shareSessionMissingContent(connectionID string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "share_session_missing",
		Details: map[string]any{
			"websocketId": connectionID,
		},
	}
}

func listenerEmitInvalidPayloadContent() *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "listener_emit_invalid_payload",
		Details: map[string]any{
			"message": "listener emits require dependencyValues or artifactUpdates",
		},
	}
}

func listenerProjectStateUnavailableContent(message string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "project_state_unavailable",
		Details: map[string]any{
			"message": message,
		},
	}
}

func listenerEmitFailedContent(message string) *realtime.ListenerErrorContent {
	return &realtime.ListenerErrorContent{
		Error: "listener_emit_failed",
		Details: map[string]any{
			"message": message,
		},
	}
}

func sendResolvedListenerEmitError(
	ctx context.Context,
	connectionID string,
	err error,
	deps RouteDependencies,
) error {
	for _, resolve := range listenerEmitErrorResolvers {
		if content, ok := resolve(err); ok {
			return sendListenerError(ctx, connectionID, content, deps)
		}
	}

	return sendListenerError(ctx, connectionID, *listenerEmitFailedContent(err.Error()), deps)
}

func listenerEmitUnknownDependencyContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitUnknownDependencyError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_unknown_dependency",
		Details: map[string]any{
			"dependencyName": typed.DependencyName,
		},
	}, true
}

func listenerEmitUnsupportedDependencyContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitUnsupportedDependencyError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_unsupported_dependency",
		Details: map[string]any{
			"dependencyName": typed.DependencyName,
			"reason":         typed.Reason,
		},
	}, true
}

func listenerEmitInvalidValueContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitInvalidValueError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_invalid_value",
		Details: map[string]any{
			"dependencyName": typed.DependencyName,
			"expectedType":   typed.ExpectedType,
		},
	}, true
}

func listenerEmitInvalidArtifactUpdateContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitInvalidArtifactUpdateError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_invalid_artifact_update",
		Details: map[string]any{
			"path":    typed.Path,
			"message": typed.Message,
		},
	}, true
}

func listenerEmitUnsupportedArtifactUpdateContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitUnsupportedArtifactUpdateError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_unsupported_artifact_update",
		Details: map[string]any{
			"path":   typed.Path,
			"reason": typed.Reason,
		},
	}, true
}

func listenerEmitArtifactUpdateFailedContent(err error) (realtime.ListenerErrorContent, bool) {
	var typed *listenerEmitArtifactUpdateFailedError
	if !errors.As(err, &typed) {
		return realtime.ListenerErrorContent{}, false
	}
	return realtime.ListenerErrorContent{
		Error: "listener_emit_artifact_update_failed",
		Details: map[string]any{
			"message": typed.Message,
		},
	}, true
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
	if sectionType := listenerPayloadSectionType(payload); sectionType != "" {
		return sectionType
	}
	return listenerFallbackSectionType(impl)
}

func listenerPayloadSectionType(payload map[string]any) string {
	if payload == nil {
		return ""
	}
	rawType, _ := payload["type"].(string)
	return strings.TrimSpace(rawType)
}

func listenerFallbackSectionType(impl projectstate.SectionImpl) string {
	switch {
	case impl.IsCode():
		return "Code"
	case impl.IsTerminal():
		return "Terminal"
	case impl.IsDraw():
		return "Draw"
	}
	if sectionType := listenerGeneratedSectionType(impl); sectionType != "" {
		return sectionType
	}
	return strings.TrimSpace(string(impl.Kind))
}

func listenerGeneratedSectionType(impl projectstate.SectionImpl) string {
	if !impl.IsGenerated() {
		return ""
	}
	switch impl.Generated.Kind {
	case projectstate.GeneratedSectionKindPythonCode:
		return "GenPythonCode"
	case projectstate.GeneratedSectionKindPythonMetadata:
		return "GenPythonMetadata"
	case projectstate.GeneratedSectionKindPlugin:
		return "Plugin"
	default:
		return ""
	}
}
