package projectstate

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
)

var (
	ErrWindowSpaceIDRequired       = errors.New("window space id is required")
	ErrWindowSpaceNotFound         = errors.New("window space was not found in project")
	ErrProjectChatWindowIDRequired = errors.New("project chat window id is required")
	ErrProjectChatWindowNotFound   = errors.New("project chat window was not found in project")
)

type InvalidWindowSpaceNameError struct {
	Message string
}

func (e *InvalidWindowSpaceNameError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type InvalidWindowSpaceSortOrderError struct {
	Message string
}

func (e *InvalidWindowSpaceSortOrderError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type InvalidWindowSpaceStateError struct {
	Message string
}

func (e *InvalidWindowSpaceStateError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type InvalidProjectChatWindowingError struct {
	Message string
}

func (e *InvalidProjectChatWindowingError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type ProjectChatWindowNotFoundError struct {
	InstanceID string
}

func (e *ProjectChatWindowNotFoundError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("Project chat window %s not found.", e.InstanceID)
}

func (e *ProjectChatWindowNotFoundError) Is(target error) bool {
	return target == ErrProjectChatWindowNotFound
}

func (p *Project) SetProjectChatWindowingState(state ProjectChatWindowingState) error {
	current := ProjectChatWindowingOrDefault(p.ProjectChatWindowing)
	next := state.Clone()
	if err := validateProjectChatThreadBindingsUnchanged(current, next); err != nil {
		return err
	}

	normalized, err := normalizeProjectChatWindowingStateForWrite(next, p.Sections)
	if err != nil {
		return err
	}
	p.ProjectChatWindowing = &normalized
	return nil
}

func (d *Document) SetProjectChatWindowingState(
	projectID string,
	state ProjectChatWindowingState,
) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetProjectChatWindowingState(state); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetProjectChatWindowingState(
	ctx context.Context,
	projectID string,
	state ProjectChatWindowingState,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetProjectChatWindowingState(projectID, state); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetProjectChatWindowChatID(instanceID string, chatID *string) error {
	trimmedInstanceID := strings.TrimSpace(instanceID)
	if trimmedInstanceID == "" {
		return ErrProjectChatWindowIDRequired
	}

	windowing := ProjectChatWindowingOrDefault(p.ProjectChatWindowing)
	instance, ok := windowing.InstancesByID[trimmedInstanceID]
	if !ok {
		return &ProjectChatWindowNotFoundError{InstanceID: trimmedInstanceID}
	}
	if instance.Mode != ChatWindowModeProjectAI {
		return &InvalidProjectChatWindowingError{
			Message: fmt.Sprintf(
				"Project chat window %s must use project_ai_mode to bind chatId.",
				trimmedInstanceID,
			),
		}
	}

	instance.ChatID = trimOptionalString(chatID)
	windowing.InstancesByID[trimmedInstanceID] = instance

	normalized, err := normalizeProjectChatWindowingStateForWrite(windowing, p.Sections)
	if err != nil {
		return err
	}
	p.ProjectChatWindowing = &normalized
	return nil
}

func (d *Document) SetProjectChatWindowChatID(
	projectID string,
	instanceID string,
	chatID *string,
) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetProjectChatWindowChatID(instanceID, chatID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetProjectChatWindowChatID(
	ctx context.Context,
	projectID string,
	instanceID string,
	chatID *string,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetProjectChatWindowChatID(projectID, instanceID, chatID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) CreateWindowSpace(
	state WindowSpaceState,
	name *string,
) (WindowSpaceConfig, error) {
	normalizedState, err := normalizeWindowSpaceStateForWrite(state, p.Sections)
	if err != nil {
		return WindowSpaceConfig{}, err
	}

	windowSpaceName, err := p.resolveWindowSpaceCreateName(name)
	if err != nil {
		return WindowSpaceConfig{}, err
	}

	windowSpaceID, err := newProjectStateID()
	if err != nil {
		return WindowSpaceConfig{}, err
	}

	nextSortIndex := -1
	for _, windowSpace := range p.WindowSpaces {
		if windowSpace.SortIndex > nextSortIndex {
			nextSortIndex = windowSpace.SortIndex
		}
	}

	if p.WindowSpaces == nil {
		p.WindowSpaces = map[string]WindowSpaceConfig{}
	}

	windowSpace := WindowSpaceConfig{
		ID:          windowSpaceID,
		Name:        windowSpaceName,
		SortIndex:   nextSortIndex + 1,
		WindowsByID: normalizedState.WindowsByID,
		Order:       normalizedState.Order,
	}
	p.WindowSpaces[windowSpaceID] = windowSpace
	return windowSpace.Clone(), nil
}

func (d *Document) CreateWindowSpace(
	projectID string,
	state WindowSpaceState,
	name *string,
) (WindowSpaceConfig, error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return WindowSpaceConfig{}, err
	}
	windowSpace, err := project.CreateWindowSpace(state, name)
	if err != nil {
		return WindowSpaceConfig{}, err
	}
	d.Projects[project.ID] = project
	return windowSpace, nil
}

func (r *Runtime) CreateWindowSpace(
	ctx context.Context,
	projectID string,
	state WindowSpaceState,
	name *string,
) (Snapshot, WindowSpaceConfig, error) {
	var createdWindowSpaceID string
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		windowSpace, createErr := document.CreateWindowSpace(projectID, state, name)
		if createErr != nil {
			return Document{}, createErr
		}
		createdWindowSpaceID = windowSpace.ID
		return document, nil
	})
	if err != nil {
		return Snapshot{}, WindowSpaceConfig{}, err
	}
	project, err := snapshot.Document.ProjectByID(projectID)
	if err != nil {
		return Snapshot{}, WindowSpaceConfig{}, err
	}
	windowSpace, ok := project.WindowSpaces[createdWindowSpaceID]
	if !ok {
		return Snapshot{}, WindowSpaceConfig{}, fmt.Errorf(
			"%w: %q",
			ErrWindowSpaceNotFound,
			createdWindowSpaceID,
		)
	}
	return snapshot, windowSpace.Clone(), nil
}

func (p *Project) SetWindowSpaceName(windowSpaceID string, name string) error {
	trimmedWindowSpaceID := strings.TrimSpace(windowSpaceID)
	if trimmedWindowSpaceID == "" {
		return ErrWindowSpaceIDRequired
	}
	if _, ok := p.WindowSpaces[trimmedWindowSpaceID]; !ok {
		return fmt.Errorf("%w: %q", ErrWindowSpaceNotFound, trimmedWindowSpaceID)
	}

	normalized, err := validateWindowSpaceName(*p, trimmedWindowSpaceID, name)
	if err != nil {
		return err
	}
	windowSpace := p.WindowSpaces[trimmedWindowSpaceID]
	windowSpace.Name = normalized
	p.WindowSpaces[trimmedWindowSpaceID] = windowSpace
	return nil
}

func (d *Document) SetWindowSpaceName(
	projectID string,
	windowSpaceID string,
	name string,
) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetWindowSpaceName(windowSpaceID, name); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetWindowSpaceName(
	ctx context.Context,
	projectID string,
	windowSpaceID string,
	name string,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetWindowSpaceName(projectID, windowSpaceID, name); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetWindowSpaceSortOrder(orderedWindowSpaceIDs []string) error {
	if len(orderedWindowSpaceIDs) != len(p.WindowSpaces) {
		return &InvalidWindowSpaceSortOrderError{
			Message: "orderedWindowSpaceIds must contain every window space exactly once.",
		}
	}

	seen := make(map[string]struct{}, len(orderedWindowSpaceIDs))
	for _, rawID := range orderedWindowSpaceIDs {
		trimmedID := strings.TrimSpace(rawID)
		if _, ok := p.WindowSpaces[trimmedID]; !ok {
			return fmt.Errorf("%w: %q", ErrWindowSpaceNotFound, trimmedID)
		}
		if _, exists := seen[trimmedID]; exists {
			return &InvalidWindowSpaceSortOrderError{
				Message: "orderedWindowSpaceIds must not contain duplicate window space IDs.",
			}
		}
		seen[trimmedID] = struct{}{}
	}

	for index, rawID := range orderedWindowSpaceIDs {
		trimmedID := strings.TrimSpace(rawID)
		windowSpace := p.WindowSpaces[trimmedID]
		windowSpace.SortIndex = index
		p.WindowSpaces[trimmedID] = windowSpace
	}
	return nil
}

func (d *Document) SetWindowSpaceSortOrder(
	projectID string,
	orderedWindowSpaceIDs []string,
) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetWindowSpaceSortOrder(orderedWindowSpaceIDs); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetWindowSpaceSortOrder(
	ctx context.Context,
	projectID string,
	orderedWindowSpaceIDs []string,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetWindowSpaceSortOrder(projectID, orderedWindowSpaceIDs); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) DeleteWindowSpace(windowSpaceID string) error {
	trimmedWindowSpaceID := strings.TrimSpace(windowSpaceID)
	if trimmedWindowSpaceID == "" {
		return ErrWindowSpaceIDRequired
	}
	if _, ok := p.WindowSpaces[trimmedWindowSpaceID]; !ok {
		return fmt.Errorf("%w: %q", ErrWindowSpaceNotFound, trimmedWindowSpaceID)
	}

	delete(p.WindowSpaces, trimmedWindowSpaceID)
	sortedIDs := sortedWindowSpaceIDs(p.WindowSpaces)
	for index, id := range sortedIDs {
		windowSpace := p.WindowSpaces[id]
		windowSpace.SortIndex = index
		p.WindowSpaces[id] = windowSpace
	}
	return nil
}

func (d *Document) DeleteWindowSpace(projectID string, windowSpaceID string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.DeleteWindowSpace(windowSpaceID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) DeleteWindowSpace(
	ctx context.Context,
	projectID string,
	windowSpaceID string,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.DeleteWindowSpace(projectID, windowSpaceID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p Project) resolveWindowSpaceCreateName(name *string) (string, error) {
	if name != nil {
		return validateWindowSpaceName(p, "", *name)
	}

	return nextAvailableMemorableName(func(candidate string) (bool, error) {
		if _, err := validateWindowSpaceName(p, "", candidate); err == nil {
			return true, nil
		} else if IsInvalidWindowSpaceNameError(err) {
			return false, nil
		} else {
			return false, err
		}
	})
}

func validateProjectChatThreadBindingsUnchanged(
	currentWindowing ProjectChatWindowingState,
	nextWindowing ProjectChatWindowingState,
) error {
	for instanceID, currentInstance := range currentWindowing.InstancesByID {
		currentChatID := threadBoundProjectChatID(currentInstance)
		if currentChatID == nil {
			continue
		}
		nextInstance, ok := nextWindowing.InstancesByID[instanceID]
		if !ok {
			return &InvalidProjectChatWindowingError{
				Message: fmt.Sprintf(
					"Project chat window %s cannot be removed via layout updates while it still has a bound chatId.",
					instanceID,
				),
			}
		}
		nextChatID := threadBoundProjectChatID(nextInstance)
		if equalOptionalStringValues(currentChatID, nextChatID) {
			continue
		}
		return &InvalidProjectChatWindowingError{
			Message: fmt.Sprintf(
				"Project chat window %s cannot change chatId via layout updates.",
				instanceID,
			),
		}
	}
	for instanceID, nextInstance := range nextWindowing.InstancesByID {
		if _, ok := currentWindowing.InstancesByID[instanceID]; ok {
			continue
		}
		if threadBoundProjectChatID(nextInstance) == nil {
			continue
		}
		return &InvalidProjectChatWindowingError{
			Message: fmt.Sprintf(
				"Project chat window %s cannot change chatId via layout updates.",
				instanceID,
			),
		}
	}
	return nil
}

func normalizeProjectChatWindowingStateForWrite(
	state ProjectChatWindowingState,
	sections map[string]Section,
) (ProjectChatWindowingState, error) {
	normalized := DefaultProjectChatWindowingState()
	if state.NextInstanceNumber > 0 {
		normalized.NextInstanceNumber = state.NextInstanceNumber
	}

	candidatesByID := make(map[string]ProjectChatWindowInstance, len(state.InstancesByID))
	for instanceID, instance := range state.InstancesByID {
		trimmedInstanceID := strings.TrimSpace(instanceID)
		if trimmedInstanceID == "" {
			continue
		}
		nextInstance := instance.Clone()
		nextInstance.InstanceID = trimmedInstanceID
		nextInstance.SectionIDOrNull = trimOptionalString(nextInstance.SectionIDOrNull)
		nextInstance.Title = trimOptionalString(nextInstance.Title)
		nextInstance.ChatID = trimOptionalString(nextInstance.ChatID)
		nextInstance.Bounds = normalizeChatWindowBounds(nextInstance.Bounds)
		nextInstance.DockMetrics = normalizeChatWindowDockMetrics(nextInstance.DockMetrics)
		if nextInstance.Placement == "" {
			nextInstance.Placement = ChatWindowPlacementBottomDocked
		}
		if nextInstance.Mode == "" {
			nextInstance.Mode = ChatWindowModeProjectAI
		}
		if err := validateProjectChatWindowOwner(
			nextInstance.Mode,
			nextInstance.Placement,
			nextInstance.SectionIDOrNull,
		); err != nil {
			return ProjectChatWindowingState{}, err
		}
		if nextInstance.Mode != ChatWindowModeProjectAI {
			nextInstance.ChatID = nil
		}
		if nextInstance.SectionIDOrNull != nil {
			if _, ok := sections[*nextInstance.SectionIDOrNull]; !ok {
				continue
			}
			nextInstance.Title = nil
		}
		candidatesByID[trimmedInstanceID] = nextInstance
	}

	winningInstanceIDBySectionID := map[string]string{}
	orderedCandidateIDs := make([]string, 0, len(candidatesByID))
	for instanceID := range candidatesByID {
		orderedCandidateIDs = append(orderedCandidateIDs, instanceID)
	}
	sort.Strings(orderedCandidateIDs)
	for _, instanceID := range orderedCandidateIDs {
		instance := candidatesByID[instanceID]
		if instance.SectionIDOrNull == nil {
			continue
		}
		sectionID := *instance.SectionIDOrNull
		currentBestID, ok := winningInstanceIDBySectionID[sectionID]
		if !ok || shouldPreferProjectChatSectionBinding(
			instanceID,
			instance,
			currentBestID,
			candidatesByID[currentBestID],
		) {
			winningInstanceIDBySectionID[sectionID] = instanceID
		}
	}

	normalized.InstancesByID = make(map[string]ProjectChatWindowInstance, len(candidatesByID))
	for _, instanceID := range orderedCandidateIDs {
		instance := candidatesByID[instanceID]
		if instance.SectionIDOrNull != nil &&
			winningInstanceIDBySectionID[*instance.SectionIDOrNull] != instanceID {
			continue
		}
		normalized.InstancesByID[instanceID] = instance
	}
	normalized.Order = normalizeOrderedKeys(state.Order, normalized.InstancesByID)
	if normalized.NextInstanceNumber < 1 {
		normalized.NextInstanceNumber = 1
	}
	return normalized, nil
}

func normalizeWindowSpaceStateForWrite(
	state WindowSpaceState,
	sections map[string]Section,
) (WindowSpaceState, error) {
	normalized := WindowSpaceState{
		WindowsByID: map[string]WindowSpaceWindow{},
		Order:       []string{},
	}

	for instanceID, window := range state.WindowsByID {
		trimmedInstanceID := strings.TrimSpace(instanceID)
		if trimmedInstanceID == "" {
			continue
		}
		nextWindow := window.Clone()
		nextWindow.SectionIDOrNull = trimOptionalString(nextWindow.SectionIDOrNull)
		nextWindow.Title = trimOptionalString(nextWindow.Title)
		nextWindow.ChatID = trimOptionalString(nextWindow.ChatID)
		nextWindow.NormalizedBounds = normalizeNormalizedFloatingWindowBounds(
			nextWindow.NormalizedBounds,
		)
		if nextWindow.SurfaceKind == "" {
			nextWindow.SurfaceKind = WindowSpaceSurfaceKindProjectChat
		}
		if nextWindow.Mode == "" {
			nextWindow.Mode = ChatWindowModeProjectAI
		}
		if err := validateWindowSpaceWindowOwner(
			nextWindow.SurfaceKind,
			nextWindow.Mode,
			nextWindow.SectionIDOrNull,
			nextWindow.ChatID,
		); err != nil {
			return WindowSpaceState{}, err
		}
		if nextWindow.Mode != ChatWindowModeProjectAI {
			nextWindow.ChatID = nil
		}
		if nextWindow.SurfaceKind == WindowSpaceSurfaceKindSection {
			if _, ok := sections[*nextWindow.SectionIDOrNull]; !ok {
				continue
			}
		}
		normalized.WindowsByID[trimmedInstanceID] = nextWindow
	}
	normalized.Order = normalizeOrderedKeys(state.Order, normalized.WindowsByID)
	return normalized, nil
}

func validateProjectChatWindowOwner(
	mode ChatWindowMode,
	placement ChatWindowPlacement,
	sectionID *string,
) error {
	if mode == ChatWindowModeSection && sectionID == nil {
		return &InvalidProjectChatWindowingError{
			Message: "Project chat section_mode windows require sectionIdOrNull.",
		}
	}
	if mode == ChatWindowModeGitGraph && sectionID != nil {
		return &InvalidProjectChatWindowingError{
			Message: "Project chat git_graph_mode windows cannot carry sectionIdOrNull.",
		}
	}
	if mode == ChatWindowModeGitGraph && placement == ChatWindowPlacementCanvasSection {
		return &InvalidProjectChatWindowingError{
			Message: "Project chat git_graph_mode windows cannot use canvas_section placement.",
		}
	}
	return nil
}

func validateWindowSpaceWindowOwner(
	surfaceKind WindowSpaceSurfaceKind,
	mode ChatWindowMode,
	sectionID *string,
	chatID *string,
) error {
	if surfaceKind == WindowSpaceSurfaceKindSection && sectionID == nil {
		return &InvalidWindowSpaceStateError{
			Message: "Section window-space windows require sectionIdOrNull.",
		}
	}
	if surfaceKind == WindowSpaceSurfaceKindProjectChat && sectionID != nil {
		return &InvalidWindowSpaceStateError{
			Message: "Project-chat window-space windows cannot carry sectionIdOrNull.",
		}
	}
	if surfaceKind == WindowSpaceSurfaceKindSection && mode == ChatWindowModeGitGraph {
		return &InvalidWindowSpaceStateError{
			Message: "Section window-space windows cannot use git_graph_mode.",
		}
	}
	if surfaceKind == WindowSpaceSurfaceKindProjectChat && mode == ChatWindowModeSection {
		return &InvalidWindowSpaceStateError{
			Message: "Project-chat window-space windows cannot use section_mode.",
		}
	}
	if mode != ChatWindowModeProjectAI && chatID != nil {
		return &InvalidWindowSpaceStateError{
			Message: "Window-space windows must use project_ai_mode to bind chatId.",
		}
	}
	return nil
}

func validateWindowSpaceName(project Project, windowSpaceID string, name string) (string, error) {
	trimmedWindowSpaceID := strings.TrimSpace(windowSpaceID)
	normalized := strings.TrimSpace(name)
	if normalized == "" {
		return "", &InvalidWindowSpaceNameError{Message: "Window space name cannot be empty."}
	}
	if containsControlChars(normalized) {
		return "", &InvalidWindowSpaceNameError{Message: "Window space name cannot include control characters."}
	}
	if strings.Contains(normalized, "/") || strings.Contains(normalized, "\\") {
		return "", &InvalidWindowSpaceNameError{Message: "Window space name cannot include path separators."}
	}
	if strings.Contains(normalized, "..") {
		return "", &InvalidWindowSpaceNameError{Message: "Window space name cannot include '..' path segments."}
	}
	for _, char := range normalized {
		if !isAllowedSimpleNameChar(char) {
			return "", &InvalidWindowSpaceNameError{Message: "Window space name can only contain letters, numbers, spaces, '_' and '-'."}
		}
	}

	slug := sanitizeProjectSlug(normalized)
	if slug == "" {
		return "", &InvalidWindowSpaceNameError{Message: "Window space name is invalid after sanitization."}
	}

	for existingID, windowSpace := range project.WindowSpaces {
		if strings.TrimSpace(existingID) == trimmedWindowSpaceID {
			continue
		}
		if sanitizeProjectSlug(windowSpace.Name) != slug {
			continue
		}
		return "", &InvalidWindowSpaceNameError{
			Message: fmt.Sprintf(
				"Window space name '%s' conflicts with existing window space '%s'.",
				normalized,
				windowSpace.Name,
			),
		}
	}

	return normalized, nil
}

func sortedWindowSpaceIDs(windowSpaces map[string]WindowSpaceConfig) []string {
	ids := make([]string, 0, len(windowSpaces))
	for id := range windowSpaces {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i int, j int) bool {
		left := windowSpaces[ids[i]]
		right := windowSpaces[ids[j]]
		if left.SortIndex != right.SortIndex {
			return left.SortIndex < right.SortIndex
		}
		leftName := strings.ToLower(strings.TrimSpace(left.Name))
		rightName := strings.ToLower(strings.TrimSpace(right.Name))
		if leftName != rightName {
			return leftName < rightName
		}
		return ids[i] < ids[j]
	})
	return ids
}

func threadBoundProjectChatID(instance ProjectChatWindowInstance) *string {
	if instance.Mode != ChatWindowModeProjectAI {
		return nil
	}
	return trimOptionalString(instance.ChatID)
}

func equalOptionalStringValues(left *string, right *string) bool {
	switch {
	case left == nil && right == nil:
		return true
	case left == nil || right == nil:
		return false
	default:
		return *left == *right
	}
}

func shouldPreferProjectChatSectionBinding(
	candidateID string,
	candidate ProjectChatWindowInstance,
	currentBestID string,
	currentBest ProjectChatWindowInstance,
) bool {
	candidatePriority := projectChatSectionBindingPlacementPriority(candidate.Placement)
	currentBestPriority := projectChatSectionBindingPlacementPriority(currentBest.Placement)
	if candidatePriority != currentBestPriority {
		return candidatePriority > currentBestPriority
	}
	candidateVisible := !candidate.IsClosed && !candidate.IsMinimized
	currentBestVisible := !currentBest.IsClosed && !currentBest.IsMinimized
	if candidateVisible != currentBestVisible {
		return candidateVisible
	}
	if candidate.ZIndex != currentBest.ZIndex {
		return candidate.ZIndex > currentBest.ZIndex
	}
	if candidate.LastFocusedAt != currentBest.LastFocusedAt {
		return candidate.LastFocusedAt > currentBest.LastFocusedAt
	}
	return candidateID > currentBestID
}

func projectChatSectionBindingPlacementPriority(
	placement ChatWindowPlacement,
) int {
	switch placement {
	case ChatWindowPlacementCanvasSection:
		return 4
	case ChatWindowPlacementFloating:
		return 3
	case ChatWindowPlacementMaximized:
		return 2
	default:
		return 1
	}
}

func IsInvalidWindowSpaceNameError(err error) bool {
	var invalid *InvalidWindowSpaceNameError
	return errors.As(err, &invalid)
}

func IsInvalidWindowSpaceSortOrderError(err error) bool {
	var invalid *InvalidWindowSpaceSortOrderError
	return errors.As(err, &invalid)
}

func IsInvalidWindowSpaceStateError(err error) bool {
	var invalid *InvalidWindowSpaceStateError
	return errors.As(err, &invalid)
}

func IsInvalidProjectChatWindowingError(err error) bool {
	var invalid *InvalidProjectChatWindowingError
	return errors.As(err, &invalid)
}
