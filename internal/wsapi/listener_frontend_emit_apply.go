package wsapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/artifacts"
	"setta/internal/codegen"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

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
