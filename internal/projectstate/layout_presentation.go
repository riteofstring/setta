package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var ErrActiveViewModeRequired = errors.New("active view mode id is required")
var ErrSectionParamColumnWidthUnsupported = errors.New("section does not support param column width")

func (d *Document) SetShowParamDisplayNames(projectID string, show bool) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	project.ShowParamDisplayNames = show
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetShowParamDisplayNames(ctx context.Context, projectID string, show bool) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetShowParamDisplayNames(projectID, show); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetActiveIDs(activeIDs []string) {
	p.ActiveIDs = append([]string(nil), activeIDs...)
}

func (d *Document) SetActiveIDs(projectID string, activeIDs []string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	project.SetActiveIDs(activeIDs)
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetActiveIDs(ctx context.Context, projectID string, activeIDs []string) (Snapshot, error) {
	return r.mutateAndPersistLaterWithHistoryMode(ctx, func(document Document) (Document, error) {
		if err := document.SetActiveIDs(projectID, activeIDs); err != nil {
			return Document{}, err
		}
		return document, nil
	}, runtimeHistoryModeReplaceCurrent)
}

func (p *Project) SetViewport(viewport *Viewport) error {
	activeViewModeID := strings.TrimSpace(p.ActiveViewModeID)
	if activeViewModeID == "" {
		return ErrActiveViewModeRequired
	}

	viewMode, ok := p.ViewModes[activeViewModeID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrViewModeNotFound, activeViewModeID)
	}

	p.Viewport = cloneViewport(viewport)
	p.ViewportInitialized = viewport != nil
	viewMode.Viewport = cloneViewport(viewport)
	viewMode.ViewportInitialized = viewport != nil
	p.ViewModes[activeViewModeID] = viewMode
	return nil
}

func (d *Document) SetViewport(projectID string, viewport *Viewport) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetViewport(viewport); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetViewport(ctx context.Context, projectID string, viewport *Viewport) (Snapshot, error) {
	return r.mutateAndSaveWithHistoryMode(ctx, func(document Document) (Document, error) {
		if err := document.SetViewport(projectID, viewport); err != nil {
			return Document{}, err
		}
		return document, nil
	}, runtimeHistoryModeReplaceCurrent)
}

func (p *Project) TogglePositionLocks(sectionIDs []string) error {
	resolvedSectionIDs := make([]string, 0, len(sectionIDs))
	for _, sectionID := range sectionIDs {
		trimmedSectionID := strings.TrimSpace(sectionID)
		if _, _, _, err := p.ResolveSection(trimmedSectionID); err != nil {
			return err
		}
		resolvedSectionIDs = append(resolvedSectionIDs, trimmedSectionID)
	}

	for _, sectionID := range resolvedSectionIDs {
		if err := p.toggleCurrentSectionBoolField(sectionID, "positionAndSizeLocked"); err != nil {
			return err
		}
	}
	return nil
}

func (d *Document) TogglePositionLocks(projectID string, sectionIDs []string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.TogglePositionLocks(sectionIDs); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) TogglePositionLocks(ctx context.Context, projectID string, sectionIDs []string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.TogglePositionLocks(projectID, sectionIDs); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) ToggleMinimized(sectionID string) error {
	return p.toggleCurrentSectionBoolField(sectionID, "isMinimized")
}

func (d *Document) ToggleMinimized(projectID string, sectionID string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.ToggleMinimized(sectionID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) ToggleMinimized(ctx context.Context, projectID string, sectionID string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.ToggleMinimized(projectID, sectionID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) ToggleGroupOrientation(sectionID string) error {
	section, _, payload, err := p.resolveGroupSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "isHorizontalOrientation", !payloadBoolField(payload, "isHorizontalOrientation"))
}

func (d *Document) ToggleGroupOrientation(projectID string, sectionID string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.ToggleGroupOrientation(sectionID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) ToggleGroupOrientation(ctx context.Context, projectID string, sectionID string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.ToggleGroupOrientation(projectID, sectionID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetGroupOverflowMode(sectionID string, overflowMode bool) error {
	section, _, _, err := p.resolveGroupSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "overflowMode", overflowMode)
}

func (d *Document) SetGroupOverflowMode(projectID string, sectionID string, overflowMode bool) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetGroupOverflowMode(sectionID, overflowMode); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetGroupOverflowMode(ctx context.Context, projectID string, sectionID string, overflowMode bool) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetGroupOverflowMode(projectID, sectionID, overflowMode); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionTagColor(sectionID string, tagColor *string) error {
	return p.setCurrentSectionField(strings.TrimSpace(sectionID), "tagColor", optionalStringValue(tagColor))
}

func (d *Document) SetSectionTagColor(projectID string, sectionID string, tagColor *string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionTagColor(sectionID, tagColor); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionTagColor(ctx context.Context, projectID string, sectionID string, tagColor *string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionTagColor(projectID, sectionID, tagColor); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionStyleColor(sectionID string, styleColor *string) error {
	return p.setCurrentSectionField(strings.TrimSpace(sectionID), "styleColor", optionalStringValue(styleColor))
}

func (d *Document) SetSectionStyleColor(projectID string, sectionID string, styleColor *string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionStyleColor(sectionID, styleColor); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionStyleColor(ctx context.Context, projectID string, sectionID string, styleColor *string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionStyleColor(projectID, sectionID, styleColor); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetCallableHideParams(sectionID string, hideParams bool) error {
	return p.setCurrentSectionField(strings.TrimSpace(sectionID), "hideParams", hideParams)
}

func (d *Document) SetCallableHideParams(projectID string, sectionID string, hideParams bool) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetCallableHideParams(sectionID, hideParams); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetCallableHideParams(ctx context.Context, projectID string, sectionID string, hideParams bool) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetCallableHideParams(projectID, sectionID, hideParams); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionColumnWidth(sectionID string, columnWidth *float64) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	sectionType, err := p.resolveCurrentSectionPresentationType(trimmedSectionID)
	if err != nil {
		return err
	}
	if !sectionTypeSupportsParamPresentation(sectionType) {
		return fmt.Errorf("%w: section=%q type=%q", ErrSectionParamColumnWidthUnsupported, trimmedSectionID, sectionType)
	}
	return p.setCurrentSectionField(trimmedSectionID, "columnWidth", optionalFloat64Value(columnWidth))
}

func (d *Document) SetSectionColumnWidth(projectID string, sectionID string, columnWidth *float64) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionColumnWidth(sectionID, columnWidth); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionColumnWidth(ctx context.Context, projectID string, sectionID string, columnWidth *float64) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionColumnWidth(projectID, sectionID, columnWidth); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionHideUnpinnedParams(sectionID string, hideUnpinnedParams bool) error {
	return p.setCurrentSectionField(strings.TrimSpace(sectionID), "hideUnpinnedParams", hideUnpinnedParams)
}

func (d *Document) SetSectionHideUnpinnedParams(projectID string, sectionID string, hideUnpinnedParams bool) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionHideUnpinnedParams(sectionID, hideUnpinnedParams); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionHideUnpinnedParams(ctx context.Context, projectID string, sectionID string, hideUnpinnedParams bool) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionHideUnpinnedParams(projectID, sectionID, hideUnpinnedParams); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionPinnedParams(sectionID string, pinnedParams []string) error {
	clonedPinnedParams := append([]string(nil), pinnedParams...)
	return p.setCurrentSectionField(strings.TrimSpace(sectionID), "pinnedParams", clonedPinnedParams)
}

func (d *Document) SetSectionPinnedParams(projectID string, sectionID string, pinnedParams []string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionPinnedParams(sectionID, pinnedParams); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionPinnedParams(ctx context.Context, projectID string, sectionID string, pinnedParams []string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionPinnedParams(projectID, sectionID, pinnedParams); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) toggleCurrentSectionBoolField(sectionID string, fieldName string) error {
	section, variant, _, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, fieldName, !payloadBoolField(payload, fieldName))
}

func (p *Project) resolveGroupSectionMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
	section, variant, impl, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}

	sectionType := payloadStringField(payload, "type")
	if sectionType == "" {
		sectionType = fallbackSectionType(impl)
	}
	if !strings.EqualFold(sectionType, "Group") {
		return Section{}, SectionVariant{}, nil, fmt.Errorf("%w: %q", ErrGroupSectionRequired, section.ID)
	}
	return section, variant, payload, nil
}

func optionalStringValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func payloadBoolField(object map[string]any, key string) bool {
	value, ok := object[key]
	if !ok {
		return false
	}
	typed, ok := value.(bool)
	return ok && typed
}
