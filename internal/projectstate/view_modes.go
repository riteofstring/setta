package projectstate

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
)

var (
	projectReservedNames = map[string]struct{}{
		"home":     {},
		"settings": {},
	}
)

type InvalidViewModeNameError struct {
	Message string
}

func (e *InvalidViewModeNameError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type InvalidViewModeSortOrderError struct {
	Message string
}

func (e *InvalidViewModeSortOrderError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (d *Document) SetTopLevelSectionLayout(projectID string, topLevelSections map[string]TopLevelSectionLayout) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetTopLevelSectionLayout(topLevelSections); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetTopLevelSectionLayout(ctx context.Context, projectID string, topLevelSections map[string]TopLevelSectionLayout) (Snapshot, error) {
	return r.MutateAndPersistLater(ctx, func(document Document) (Document, error) {
		if err := document.SetTopLevelSectionLayout(projectID, topLevelSections); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetTopLevelSectionLayout(topLevelSections map[string]TopLevelSectionLayout) error {
	activeViewModeID, viewMode, err := p.activeViewMode()
	if err != nil {
		return err
	}

	validTopLevelSectionIDs := p.validTopLevelSectionIDs()
	mergedLayouts := make(map[string]TopLevelSectionLayout, len(viewMode.TopLevelSections)+len(topLevelSections))
	for sectionID, layout := range viewMode.TopLevelSections {
		if _, ok := validTopLevelSectionIDs[sectionID]; ok {
			mergedLayouts[sectionID] = layout.Clone()
		}
	}
	for sectionID, layout := range topLevelSections {
		if _, ok := validTopLevelSectionIDs[sectionID]; ok {
			mergedLayouts[sectionID] = layout.Clone()
		}
	}

	clonedLayouts := cloneTopLevelSectionsMap(mergedLayouts)
	p.TopLevelSections = cloneTopLevelSectionsMap(clonedLayouts)
	viewMode.TopLevelSections = clonedLayouts
	p.ViewModes[activeViewModeID] = viewMode
	return nil
}

func (d *Document) CreateViewMode(projectID string) (string, error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return "", err
	}
	viewModeID, err := project.CreateViewMode()
	if err != nil {
		return "", err
	}
	d.Projects[project.ID] = project
	return viewModeID, nil
}

func (r *Runtime) CreateViewMode(ctx context.Context, projectID string) (Snapshot, string, error) {
	var createdViewModeID string
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		viewModeID, err := document.CreateViewMode(projectID)
		if err != nil {
			return Document{}, err
		}
		createdViewModeID = viewModeID
		return document, nil
	})
	return snapshot, createdViewModeID, err
}

func (p *Project) CreateViewMode() (string, error) {
	viewModeID, err := newProjectStateID()
	if err != nil {
		return "", err
	}

	nextSortIndex := 0
	for _, viewMode := range p.ViewModes {
		if viewMode.SortIndex >= nextSortIndex {
			nextSortIndex = viewMode.SortIndex + 1
		}
	}

	viewMode := ViewMode{
		ID:                    viewModeID,
		SortIndex:             nextSortIndex,
		VisibilityBySectionID: map[string]bool{},
		TopLevelSections:      cloneTopLevelSectionsMap(p.TopLevelSections),
		Viewport:              cloneViewport(p.Viewport),
		ViewportInitialized:   p.ViewportInitialized,
	}
	viewMode.Name, err = nextAvailableViewModeName(*p)
	if err != nil {
		return "", err
	}
	for sectionID := range p.Sections {
		viewMode.VisibilityBySectionID[sectionID] = true
	}

	if p.ViewModes == nil {
		p.ViewModes = map[string]ViewMode{}
	}
	p.ViewModes[viewModeID] = viewMode
	p.ActiveViewModeID = viewModeID
	p.IsEditingViewMode = true
	p.TopLevelSections = cloneTopLevelSectionsMap(viewMode.TopLevelSections)
	p.Viewport = cloneViewport(viewMode.Viewport)
	p.ViewportInitialized = viewMode.ViewportInitialized
	return viewModeID, nil
}

func (d *Document) SetActiveViewMode(projectID string, activeViewModeID string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetActiveViewMode(activeViewModeID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetActiveViewMode(ctx context.Context, projectID string, activeViewModeID string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetActiveViewMode(projectID, activeViewModeID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetActiveViewMode(activeViewModeID string) error {
	targetViewModeID := strings.TrimSpace(activeViewModeID)
	if targetViewModeID == "" {
		return ErrViewModeIDRequired
	}

	currentViewModeID, currentViewMode, err := p.activeViewMode()
	if err != nil {
		return err
	}
	nextViewMode, ok := p.ViewModes[targetViewModeID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrViewModeNotFound, targetViewModeID)
	}

	currentViewMode.TopLevelSections = cloneTopLevelSectionsMap(p.TopLevelSections)
	currentViewMode.Viewport = cloneViewport(p.Viewport)
	currentViewMode.ViewportInitialized = p.ViewportInitialized
	p.ViewModes[currentViewModeID] = currentViewMode

	if len(nextViewMode.TopLevelSections) == 0 {
		nextViewMode.TopLevelSections = cloneTopLevelSectionsMap(p.TopLevelSections)
		p.ViewModes[targetViewModeID] = nextViewMode
	}

	p.TopLevelSections = cloneTopLevelSectionsMap(nextViewMode.TopLevelSections)
	p.Viewport = cloneViewport(nextViewMode.Viewport)
	p.ViewportInitialized = nextViewMode.ViewportInitialized
	p.ActiveViewModeID = targetViewModeID
	return nil
}

func (d *Document) ToggleIsEditingViewMode(projectID string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	project.IsEditingViewMode = !project.IsEditingViewMode
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) ToggleIsEditingViewMode(ctx context.Context, projectID string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.ToggleIsEditingViewMode(projectID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (d *Document) ToggleSectionVisibility(projectID string, sectionIDs []string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.ToggleSectionVisibility(sectionIDs); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) ToggleSectionVisibility(ctx context.Context, projectID string, sectionIDs []string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.ToggleSectionVisibility(projectID, sectionIDs); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) ToggleSectionVisibility(sectionIDs []string) error {
	trimmedSectionIDs := make([]string, 0, len(sectionIDs))
	for _, sectionID := range sectionIDs {
		trimmedSectionID := strings.TrimSpace(sectionID)
		if _, ok := p.Sections[trimmedSectionID]; !ok {
			return fmt.Errorf("%w: %q", ErrSectionNotFound, trimmedSectionID)
		}
		trimmedSectionIDs = append(trimmedSectionIDs, trimmedSectionID)
	}

	activeViewModeID, viewMode, err := p.activeViewMode()
	if err != nil {
		return err
	}

	allVisible := true
	for _, sectionID := range trimmedSectionIDs {
		visible, ok := viewMode.VisibilityBySectionID[sectionID]
		if !ok {
			return fmt.Errorf("missing visibility for section %q in view mode %q", sectionID, viewMode.ID)
		}
		if !visible {
			allVisible = false
			break
		}
	}

	nextVisibility := !allVisible
	if viewMode.VisibilityBySectionID == nil {
		viewMode.VisibilityBySectionID = map[string]bool{}
	}
	for _, sectionID := range trimmedSectionIDs {
		viewMode.VisibilityBySectionID[sectionID] = nextVisibility
	}
	p.ViewModes[activeViewModeID] = viewMode
	return nil
}

func (d *Document) ToggleViewModeUserFacing(projectID string, viewModeID string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.ToggleViewModeUserFacing(viewModeID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) ToggleViewModeUserFacing(ctx context.Context, projectID string, viewModeID string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.ToggleViewModeUserFacing(projectID, viewModeID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) ToggleViewModeUserFacing(viewModeID string) error {
	return p.toggleViewModeBoolField(viewModeID, func(viewMode *ViewMode) {
		viewMode.IsUserFacing = !viewMode.IsUserFacing
	})
}

func (d *Document) ToggleViewModeTab(projectID string, viewModeID string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.ToggleViewModeTab(viewModeID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) ToggleViewModeTab(ctx context.Context, projectID string, viewModeID string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.ToggleViewModeTab(projectID, viewModeID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) ToggleViewModeTab(viewModeID string) error {
	return p.toggleViewModeBoolField(viewModeID, func(viewMode *ViewMode) {
		viewMode.IsTab = !viewMode.IsTab
	})
}

func (d *Document) SetViewModeName(projectID string, viewModeID string, name string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetViewModeName(viewModeID, name); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetViewModeName(ctx context.Context, projectID string, viewModeID string, name string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetViewModeName(projectID, viewModeID, name); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetViewModeName(viewModeID string, name string) error {
	trimmedViewModeID := strings.TrimSpace(viewModeID)
	if trimmedViewModeID == "" {
		return ErrViewModeIDRequired
	}
	viewMode, ok := p.ViewModes[trimmedViewModeID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrViewModeNotFound, trimmedViewModeID)
	}

	normalizedName, err := validateViewModeName(*p, trimmedViewModeID, name)
	if err != nil {
		return err
	}
	viewMode.Name = normalizedName
	p.ViewModes[trimmedViewModeID] = viewMode
	return nil
}

func (d *Document) SetViewModeSortOrder(projectID string, orderedViewModeIDs []string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetViewModeSortOrder(orderedViewModeIDs); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetViewModeSortOrder(ctx context.Context, projectID string, orderedViewModeIDs []string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetViewModeSortOrder(projectID, orderedViewModeIDs); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetViewModeSortOrder(orderedViewModeIDs []string) error {
	if len(orderedViewModeIDs) != len(p.ViewModes) {
		return &InvalidViewModeSortOrderError{
			Message: "orderedViewModeIds must contain every view mode exactly once.",
		}
	}

	seen := make(map[string]struct{}, len(orderedViewModeIDs))
	for _, viewModeID := range orderedViewModeIDs {
		trimmedViewModeID := strings.TrimSpace(viewModeID)
		if _, ok := p.ViewModes[trimmedViewModeID]; !ok {
			return fmt.Errorf("%w: %q", ErrViewModeNotFound, trimmedViewModeID)
		}
		if _, duplicate := seen[trimmedViewModeID]; duplicate {
			return &InvalidViewModeSortOrderError{
				Message: "orderedViewModeIds must not contain duplicate view mode IDs.",
			}
		}
		seen[trimmedViewModeID] = struct{}{}
	}

	for index, viewModeID := range orderedViewModeIDs {
		trimmedViewModeID := strings.TrimSpace(viewModeID)
		viewMode := p.ViewModes[trimmedViewModeID]
		viewMode.SortIndex = index
		p.ViewModes[trimmedViewModeID] = viewMode
	}
	return nil
}

func (d *Document) DeleteViewMode(projectID string, viewModeID string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.DeleteViewMode(viewModeID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) DeleteViewMode(ctx context.Context, projectID string, viewModeID string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.DeleteViewMode(projectID, viewModeID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) DeleteViewMode(viewModeID string) error {
	trimmedViewModeID := strings.TrimSpace(viewModeID)
	if trimmedViewModeID == "" {
		return ErrViewModeIDRequired
	}
	if _, ok := p.ViewModes[trimmedViewModeID]; !ok {
		return fmt.Errorf("%w: %q", ErrViewModeNotFound, trimmedViewModeID)
	}
	if len(p.ViewModes) < 2 {
		return nil
	}

	delete(p.ViewModes, trimmedViewModeID)
	sortedIDs := sortedViewModeIDs(p.ViewModes)
	if p.ActiveViewModeID == trimmedViewModeID {
		nextViewModeID := sortedIDs[0]
		nextViewMode := p.ViewModes[nextViewModeID]
		if len(nextViewMode.TopLevelSections) == 0 {
			nextViewMode.TopLevelSections = cloneTopLevelSectionsMap(p.TopLevelSections)
			p.ViewModes[nextViewModeID] = nextViewMode
		}
		p.ActiveViewModeID = nextViewModeID
		p.TopLevelSections = cloneTopLevelSectionsMap(nextViewMode.TopLevelSections)
		p.Viewport = cloneViewport(nextViewMode.Viewport)
		p.ViewportInitialized = nextViewMode.ViewportInitialized
	}

	for index, sortedID := range sortedIDs {
		viewMode := p.ViewModes[sortedID]
		viewMode.SortIndex = index
		p.ViewModes[sortedID] = viewMode
	}
	return nil
}

func (p Project) activeViewMode() (string, ViewMode, error) {
	activeViewModeID := strings.TrimSpace(p.ActiveViewModeID)
	if activeViewModeID == "" {
		return "", ViewMode{}, ErrActiveViewModeRequired
	}

	viewMode, ok := p.ViewModes[activeViewModeID]
	if !ok {
		return "", ViewMode{}, fmt.Errorf("%w: %q", ErrViewModeNotFound, activeViewModeID)
	}
	return activeViewModeID, viewMode, nil
}

func (p Project) validTopLevelSectionIDs() map[string]struct{} {
	validIDs := make(map[string]struct{}, len(p.SectionVariantMap))
	for sectionID := range p.SectionVariantMap {
		section, ok := p.Sections[sectionID]
		if !ok {
			continue
		}
		if strings.TrimSpace(section.ParentSectionID) != "" {
			continue
		}
		validIDs[sectionID] = struct{}{}
	}
	return validIDs
}

func (p *Project) normalizeViewModesOnLoad() error {
	if p == nil {
		return ErrProjectNotFound
	}

	sectionIDs := make(map[string]struct{}, len(p.Sections))
	for sectionID := range p.Sections {
		sectionIDs[sectionID] = struct{}{}
	}

	for sectionID := range p.TopLevelSections {
		if _, ok := sectionIDs[sectionID]; !ok {
			delete(p.TopLevelSections, sectionID)
		}
	}

	if len(p.ViewModes) == 0 {
		viewModeID, err := newProjectStateID()
		if err != nil {
			return err
		}
		viewModeName, err := nextAvailableViewModeName(*p)
		if err != nil {
			return err
		}
		visibilityBySectionID := make(map[string]bool, len(p.Sections))
		for sectionID := range p.Sections {
			visibilityBySectionID[sectionID] = true
		}
		p.ViewModes = map[string]ViewMode{
			viewModeID: {
				ID:                    viewModeID,
				Name:                  viewModeName,
				VisibilityBySectionID: visibilityBySectionID,
				Viewport:              cloneViewport(p.Viewport),
				ViewportInitialized:   p.ViewportInitialized,
				TopLevelSections:      cloneTopLevelSectionsMap(p.TopLevelSections),
			},
		}
		p.ActiveViewModeID = viewModeID
		return nil
	}

	sortIndexCounts := make(map[int]int, len(p.ViewModes))
	for viewModeID, viewMode := range p.ViewModes {
		if viewMode.VisibilityBySectionID == nil {
			viewMode.VisibilityBySectionID = map[string]bool{}
		}
		for sectionID := range p.Sections {
			if _, ok := viewMode.VisibilityBySectionID[sectionID]; !ok {
				viewMode.VisibilityBySectionID[sectionID] = true
			}
		}
		for sectionID := range viewMode.VisibilityBySectionID {
			if _, ok := sectionIDs[sectionID]; !ok {
				delete(viewMode.VisibilityBySectionID, sectionID)
			}
		}

		if len(viewMode.TopLevelSections) == 0 {
			viewMode.TopLevelSections = cloneTopLevelSectionsMap(p.TopLevelSections)
		} else {
			for sectionID, layout := range p.TopLevelSections {
				if _, ok := viewMode.TopLevelSections[sectionID]; !ok {
					viewMode.TopLevelSections[sectionID] = layout.Clone()
				}
			}
			for sectionID := range viewMode.TopLevelSections {
				if _, ok := p.TopLevelSections[sectionID]; !ok {
					delete(viewMode.TopLevelSections, sectionID)
				}
			}
		}

		if viewMode.Viewport == nil {
			viewMode.ViewportInitialized = false
		}
		sortIndexCounts[viewMode.SortIndex]++
		p.ViewModes[viewModeID] = viewMode
	}

	for _, count := range sortIndexCounts {
		if count < 2 {
			continue
		}
		for index, viewModeID := range sortedViewModeIDs(p.ViewModes) {
			viewMode := p.ViewModes[viewModeID]
			viewMode.SortIndex = index
			p.ViewModes[viewModeID] = viewMode
		}
		break
	}

	if _, ok := p.ViewModes[p.ActiveViewModeID]; !ok {
		p.ActiveViewModeID = sortedViewModeIDs(p.ViewModes)[0]
	}
	activeViewMode := p.ViewModes[p.ActiveViewModeID]
	p.TopLevelSections = cloneTopLevelSectionsMap(activeViewMode.TopLevelSections)
	p.Viewport = cloneViewport(activeViewMode.Viewport)
	p.ViewportInitialized = activeViewMode.ViewportInitialized
	return nil
}

func (p Project) validateViewModesOnLoad() error {
	candidate := p.Clone()
	if err := candidate.normalizeViewModesOnLoad(); err != nil {
		return err
	}
	equal, err := persistedJSONEqual(
		persistedViewModeLoadState{
			TopLevelSections:    candidate.TopLevelSections,
			ViewModes:           candidate.ViewModes,
			ActiveViewModeID:    candidate.ActiveViewModeID,
			Viewport:            candidate.Viewport,
			ViewportInitialized: candidate.ViewportInitialized,
		},
		persistedViewModeLoadState{
			TopLevelSections:    p.TopLevelSections,
			ViewModes:           p.ViewModes,
			ActiveViewModeID:    p.ActiveViewModeID,
			Viewport:            p.Viewport,
			ViewportInitialized: p.ViewportInitialized,
		},
	)
	if err != nil {
		return err
	}
	if !equal {
		return ErrPersistedProjectViewModesRequireRepair
	}
	return nil
}

type persistedViewModeLoadState struct {
	TopLevelSections    map[string]TopLevelSectionLayout `json:"topLevelSections,omitempty"`
	ViewModes           map[string]ViewMode              `json:"viewModes,omitempty"`
	ActiveViewModeID    string                           `json:"activeViewModeId,omitempty"`
	Viewport            *Viewport                        `json:"viewport,omitempty"`
	ViewportInitialized bool                             `json:"viewportInitialized,omitempty"`
}

func (p *Project) toggleViewModeBoolField(viewModeID string, update func(*ViewMode)) error {
	trimmedViewModeID := strings.TrimSpace(viewModeID)
	if trimmedViewModeID == "" {
		return ErrViewModeIDRequired
	}
	viewMode, ok := p.ViewModes[trimmedViewModeID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrViewModeNotFound, trimmedViewModeID)
	}
	update(&viewMode)
	p.ViewModes[trimmedViewModeID] = viewMode
	return nil
}

func validateViewModeName(project Project, viewModeID string, name string) (string, error) {
	normalized := strings.TrimSpace(name)
	if normalized == "" {
		return "", &InvalidViewModeNameError{Message: "View mode name cannot be empty."}
	}
	if containsControlChars(normalized) {
		return "", &InvalidViewModeNameError{Message: "View mode name cannot include control characters."}
	}
	if strings.Contains(normalized, "/") || strings.Contains(normalized, "\\") {
		return "", &InvalidViewModeNameError{Message: "View mode name cannot include path separators."}
	}
	if strings.Contains(normalized, "..") {
		return "", &InvalidViewModeNameError{Message: "View mode name cannot include '..' path segments."}
	}
	for _, char := range normalized {
		if !isAllowedSimpleNameChar(char) {
			return "", &InvalidViewModeNameError{Message: "View mode name can only contain letters, numbers, spaces, '_' and '-'."}
		}
	}
	if _, reserved := projectReservedNames[strings.ToLower(normalized)]; reserved {
		return "", &InvalidViewModeNameError{
			Message: fmt.Sprintf("View mode name '%s' is reserved.", normalized),
		}
	}
	slug := sanitizeViewModeSlug(normalized)
	if slug == "" {
		return "", &InvalidViewModeNameError{Message: "View mode name is invalid after sanitization."}
	}
	for existingID, viewMode := range project.ViewModes {
		if strings.TrimSpace(existingID) == strings.TrimSpace(viewModeID) {
			continue
		}
		if sanitizeViewModeSlug(viewMode.Name) == slug {
			return "", &InvalidViewModeNameError{
				Message: fmt.Sprintf("View mode name '%s' conflicts with existing view mode '%s'.", normalized, viewMode.Name),
			}
		}
	}
	return normalized, nil
}

func nextAvailableViewModeName(project Project) (string, error) {
	return nextAvailableMemorableName(func(candidate string) (bool, error) {
		if _, err := validateViewModeName(project, "", candidate); err == nil {
			return true, nil
		} else if IsInvalidViewModeNameError(err) {
			return false, nil
		} else {
			return false, err
		}
	})
}

func sortedViewModeIDs(viewModes map[string]ViewMode) []string {
	ids := make([]string, 0, len(viewModes))
	for viewModeID := range viewModes {
		ids = append(ids, viewModeID)
	}
	sort.Slice(ids, func(i int, j int) bool {
		left := viewModes[ids[i]]
		right := viewModes[ids[j]]
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

func cloneTopLevelSectionsMap(source map[string]TopLevelSectionLayout) map[string]TopLevelSectionLayout {
	if source == nil {
		return map[string]TopLevelSectionLayout{}
	}
	cloned := make(map[string]TopLevelSectionLayout, len(source))
	for sectionID, layout := range source {
		cloned[sectionID] = layout.Clone()
	}
	return cloned
}

func containsControlChars(name string) bool {
	for _, char := range name {
		codepoint := int(char)
		if codepoint < 32 || codepoint == 127 {
			return true
		}
	}
	return false
}

func isAllowedSimpleNameChar(char rune) bool {
	switch {
	case char >= 'a' && char <= 'z':
		return true
	case char >= 'A' && char <= 'Z':
		return true
	case char >= '0' && char <= '9':
		return true
	case char == ' ' || char == '_' || char == '-':
		return true
	default:
		return false
	}
}

func sanitizeViewModeSlug(name string) string {
	replaced := strings.NewReplacer(
		"[", "_",
		"]", "_",
		"\"", "_",
		"'", "_",
		" ", "_",
	).Replace(name)
	for strings.Contains(replaced, "__") {
		replaced = strings.ReplaceAll(replaced, "__", "_")
	}
	return strings.Trim(strings.ToLower(replaced), "_")
}

func newProjectStateID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func IsInvalidViewModeNameError(err error) bool {
	var invalid *InvalidViewModeNameError
	return errors.As(err, &invalid)
}

func IsInvalidViewModeSortOrderError(err error) bool {
	var invalid *InvalidViewModeSortOrderError
	return errors.As(err, &invalid)
}
