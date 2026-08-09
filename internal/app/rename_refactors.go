package app

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"setta/internal/codegen"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
)

type pendingRenameRefactor struct {
	ProjectID     string
	ChangedValues []codegen.PythonRenameReferenceChangedValue
}

type renameRefactorService struct {
	projectState *projectstate.Runtime
	settings     *settingsstate.Runtime
	websocketHub *realtime.WebsocketHub

	mu            sync.Mutex
	pendingByOpID map[string]pendingRenameRefactor
}

type renameRefactorServiceOptions struct {
	ProjectState *projectstate.Runtime
	Settings     *settingsstate.Runtime
	WebsocketHub *realtime.WebsocketHub
}

type setSectionNameResult struct {
	snapshot      projectstate.Snapshot
	changedValues []codegen.PythonRenameReferenceChangedValue
}

func newRenameRefactorService(options renameRefactorServiceOptions) (*renameRefactorService, error) {
	if options.ProjectState == nil {
		return nil, fmt.Errorf("project runtime is required")
	}
	if options.Settings == nil {
		return nil, fmt.Errorf("settings runtime is required")
	}
	return &renameRefactorService{
		projectState:  options.ProjectState,
		settings:      options.Settings,
		websocketHub:  options.WebsocketHub,
		pendingByOpID: map[string]pendingRenameRefactor{},
	}, nil
}

func (s *renameRefactorService) SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error {
	if s == nil {
		return projectstate.ErrRuntimeClosed
	}

	renameMode, err := settingsstate.RenameRefactorModeForDocument(s.settings.Snapshot().Document)
	if err != nil {
		return err
	}
	frontendOpID := projectstate.FrontendOpIDFromContext(ctx)

	result, err := s.setSectionName(ctx, projectID, sectionID, name, renameMode)
	if err != nil {
		return err
	}

	s.updatePendingRename(frontendOpID, projectID, renameMode, result.changedValues)
	if err := s.broadcastProjectStateUpdate(ctx, result.snapshot, projectID); err != nil {
		return err
	}
	return s.broadcastRenamePromptIfNeeded(ctx, projectID, frontendOpID, renameMode, result.changedValues)
}

func (s *renameRefactorService) AcceptRenameRefactor(ctx context.Context, projectID string, frontendOpID string) error {
	if s == nil {
		return projectstate.ErrRuntimeClosed
	}

	pending, err := s.pending(frontendOpID, projectID)
	if err != nil {
		return err
	}

	snapshot, err := s.projectState.MutateAndSave(ctx, func(document projectstate.Document) (projectstate.Document, error) {
		project, err := document.ProjectByID(projectID)
		if err != nil {
			return document, err
		}
		if err := applyRenameChangedValues(&project, pending.ChangedValues); err != nil {
			return document, err
		}
		document.Projects[project.ID] = project
		return document, nil
	})
	if err != nil {
		return err
	}

	s.clearPending(frontendOpID)
	return s.broadcastProjectStateUpdate(ctx, snapshot, projectID)
}

func (s *renameRefactorService) DeclineRenameRefactor(_ context.Context, projectID string, frontendOpID string) error {
	if s == nil {
		return projectstate.ErrRuntimeClosed
	}
	if _, err := s.pending(frontendOpID, projectID); err != nil {
		return err
	}
	s.clearPending(frontendOpID)
	return nil
}

func (s *renameRefactorService) setSectionName(
	ctx context.Context,
	projectID string,
	sectionID string,
	name string,
	renameMode projectstate.RenameRefactorMode,
) (setSectionNameResult, error) {
	var result setSectionNameResult
	snapshot, err := s.projectState.MutateAndSave(ctx, func(document projectstate.Document) (projectstate.Document, error) {
		project, err := document.ProjectByID(projectID)
		if err != nil {
			return document, err
		}

		nextProject, changedValues, err := renameProjectForMode(project, sectionID, name, renameMode)
		if err != nil {
			return document, err
		}
		result.changedValues = changedValues
		document.Projects[nextProject.ID] = nextProject
		return document, nil
	})
	if err != nil {
		return setSectionNameResult{}, err
	}
	result.snapshot = snapshot
	return result, nil
}

func planSectionRename(
	project projectstate.Project,
	sectionID string,
	name string,
) (projectstate.Project, []codegen.PythonRenameReferenceChangedValue, error) {
	nextProject := project.Clone()
	if err := nextProject.SetSectionName(sectionID, name); err != nil {
		return projectstate.Project{}, nil, err
	}

	oldExport, oldOK, err := project.PythonCodegenExport()
	if err != nil {
		return projectstate.Project{}, nil, err
	}
	newExport, newOK, err := nextProject.PythonCodegenExport()
	if err != nil {
		return projectstate.Project{}, nil, err
	}
	if !oldOK || !newOK {
		return nextProject, nil, nil
	}

	oldGraph, err := codegen.BuildPythonDependencyGraph(oldExport, codegen.PythonDependencyGraphOptions{})
	if err != nil {
		return projectstate.Project{}, nil, err
	}
	newGraph, err := codegen.BuildPythonDependencyGraph(newExport, codegen.PythonDependencyGraphOptions{})
	if err != nil {
		return projectstate.Project{}, nil, err
	}

	changedValues, err := codegen.PlanPythonRenameReferenceChangedValues(oldGraph, newGraph)
	if err != nil {
		return projectstate.Project{}, nil, err
	}
	return nextProject, changedValues, nil
}

func renameProjectForMode(
	project projectstate.Project,
	sectionID string,
	name string,
	renameMode projectstate.RenameRefactorMode,
) (projectstate.Project, []codegen.PythonRenameReferenceChangedValue, error) {
	nextProject, changedValues, err := planSectionRename(project, sectionID, name)
	if err != nil {
		return projectstate.Project{}, nil, err
	}
	if err := applyRenameMode(&nextProject, renameMode, changedValues); err != nil {
		return projectstate.Project{}, nil, err
	}
	return nextProject, changedValues, nil
}

func applyRenameMode(
	project *projectstate.Project,
	renameMode projectstate.RenameRefactorMode,
	changedValues []codegen.PythonRenameReferenceChangedValue,
) error {
	switch renameMode {
	case projectstate.RenameRefactorModeAlwaysRename:
		return applyRenameChangedValues(project, changedValues)
	case projectstate.RenameRefactorModeNeverRename, projectstate.RenameRefactorModeAlwaysAsk:
		return nil
	default:
		return fmt.Errorf("unsupported rename refactor mode %q", renameMode)
	}
}

func applyRenameChangedValues(project *projectstate.Project, changedValues []codegen.PythonRenameReferenceChangedValue) error {
	for _, changedValue := range changedValues {
		if changedValue.DepKey.IsSection() {
			if err := project.SetCallableName(changedValue.DepKey.SectionID, changedValue.NewValue); err != nil {
				return err
			}
			continue
		}
		if err := project.SetSectionCodeObjectValue(
			changedValue.DepKey.SectionID,
			changedValue.DepKey.CodeObjectID,
			changedValue.NewValue,
		); err != nil {
			return err
		}
	}
	return nil
}

func (s *renameRefactorService) broadcastProjectStateUpdate(ctx context.Context, snapshot projectstate.Snapshot, projectID string) error {
	if s.websocketHub == nil {
		return nil
	}

	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return err
	}
	status := s.projectState.FrontendOpStatus()
	_, err = s.websocketHub.BroadcastJSON(
		ctx,
		realtime.NewProjectStateUpdateMessage(realtime.ProjectStateUpdateContent{
			ProjectState:   projectStateView,
			CompletedOpIDs: status.Completed,
			PendingOpIDs:   status.Pending,
		}),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
}

func (s *renameRefactorService) updatePendingRename(
	frontendOpID string,
	projectID string,
	renameMode projectstate.RenameRefactorMode,
	changedValues []codegen.PythonRenameReferenceChangedValue,
) {
	if frontendOpID == "" {
		return
	}

	switch renameMode {
	case projectstate.RenameRefactorModeAlwaysAsk:
		if len(changedValues) == 0 {
			return
		}
		s.setPending(frontendOpID, pendingRenameRefactor{
			ProjectID:     strings.TrimSpace(projectID),
			ChangedValues: append([]codegen.PythonRenameReferenceChangedValue(nil), changedValues...),
		})
	case projectstate.RenameRefactorModeAlwaysRename:
		s.clearPending(frontendOpID)
	}
}

func (s *renameRefactorService) broadcastRenamePromptIfNeeded(
	ctx context.Context,
	projectID string,
	frontendOpID string,
	renameMode projectstate.RenameRefactorMode,
	changedValues []codegen.PythonRenameReferenceChangedValue,
) error {
	if renameMode != projectstate.RenameRefactorModeAlwaysAsk || frontendOpID == "" || len(changedValues) == 0 {
		return nil
	}
	return s.broadcastRenamePrompt(ctx, projectID, frontendOpID, renameMode, changedValues)
}

func (s *renameRefactorService) broadcastRenamePrompt(
	ctx context.Context,
	projectID string,
	frontendOpID string,
	renameMode projectstate.RenameRefactorMode,
	changedValues []codegen.PythonRenameReferenceChangedValue,
) error {
	if s.websocketHub == nil {
		return nil
	}

	transportValues := make([]realtime.RenameReferenceChangedValue, 0, len(changedValues))
	for _, changedValue := range changedValues {
		transportValues = append(transportValues, realtime.RenameReferenceChangedValue{
			DepKey: realtime.NewRenameReferenceDependencyKey(
				changedValue.DepKey.SectionID,
				changedValue.DepKey.CodeObjectID,
			),
			NewValue: changedValue.NewValue,
		})
	}

	_, err := s.websocketHub.BroadcastJSON(
		ctx,
		realtime.NewRenameRefactorResultsMessage(realtime.RenameRefactorBroadcastContent{
			ProjectConfigID:   projectID,
			FrontendOpID:      frontendOpID,
			RenameMode:        renameMode,
			ChangedNodeValues: transportValues,
		}),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
}

func (s *renameRefactorService) setPending(frontendOpID string, pending pendingRenameRefactor) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pendingByOpID[strings.TrimSpace(frontendOpID)] = pending
}

func (s *renameRefactorService) clearPending(frontendOpID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.pendingByOpID, strings.TrimSpace(frontendOpID))
}

func (s *renameRefactorService) pending(frontendOpID string, projectID string) (pendingRenameRefactor, error) {
	trimmedFrontendOpID := strings.TrimSpace(frontendOpID)
	if trimmedFrontendOpID == "" {
		return pendingRenameRefactor{}, projectstate.ErrRenameRefactorFrontendOpRequired
	}
	trimmedProjectID := strings.TrimSpace(projectID)

	s.mu.Lock()
	defer s.mu.Unlock()

	pending, ok := s.pendingByOpID[trimmedFrontendOpID]
	if !ok {
		return pendingRenameRefactor{}, fmt.Errorf("%w: %s", projectstate.ErrRenameRefactorPendingNotFound, trimmedFrontendOpID)
	}
	if pending.ProjectID != trimmedProjectID {
		return pendingRenameRefactor{}, fmt.Errorf(
			"%w: expected %s got %s",
			projectstate.ErrRenameRefactorProjectMismatch,
			pending.ProjectID,
			trimmedProjectID,
		)
	}
	return pending, nil
}
