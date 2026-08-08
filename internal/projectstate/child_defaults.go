package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrDefaultChildSectionParentRequired = errors.New("section must resolve to a list root or group section")
	ErrDefaultChildSectionTypeInvalid    = errors.New("default child section type is invalid")
	ErrListRootSectionRequired           = errors.New("section must resolve to a list root section")
	ErrListRootViewModeInvalid           = errors.New("list root view mode is invalid")
)

type ListRootViewMode string

const (
	ListRootViewModeDefault  ListRootViewMode = "default"
	ListRootViewModeTaskList ListRootViewMode = "task_list"
	ListRootViewModeKanban   ListRootViewMode = "kanban"
)

func (p *Project) SetParentDefaultChildSectionType(sectionID string, defaultChildSectionType string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	normalizedChildType, err := normalizeDefaultChildSectionType(defaultChildSectionType)
	if err != nil {
		return err
	}
	sectionType, err := p.resolveCurrentSectionPresentationType(trimmedSectionID)
	if err != nil {
		return err
	}
	switch sectionType {
	case "ListRoot", "Group":
		return p.setCurrentSectionField(trimmedSectionID, "defaultChildSectionType", normalizedChildType)
	default:
		return fmt.Errorf("%w: section=%q type=%q", ErrDefaultChildSectionParentRequired, trimmedSectionID, sectionType)
	}
}

func (d *Document) SetParentDefaultChildSectionType(projectID string, sectionID string, defaultChildSectionType string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetParentDefaultChildSectionType(sectionID, defaultChildSectionType); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetParentDefaultChildSectionType(
	ctx context.Context,
	projectID string,
	sectionID string,
	defaultChildSectionType string,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetParentDefaultChildSectionType(projectID, sectionID, defaultChildSectionType); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetListRootViewMode(sectionID string, viewMode ListRootViewMode) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	sectionType, err := p.resolveCurrentSectionPresentationType(trimmedSectionID)
	if err != nil {
		return err
	}
	if sectionType != "ListRoot" {
		return fmt.Errorf("%w: section=%q type=%q", ErrListRootSectionRequired, trimmedSectionID, sectionType)
	}
	normalizedViewMode, err := normalizeListRootViewMode(viewMode)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(trimmedSectionID, "viewMode", string(normalizedViewMode))
}

func (d *Document) SetListRootViewMode(projectID string, sectionID string, viewMode ListRootViewMode) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetListRootViewMode(sectionID, viewMode); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetListRootViewMode(
	ctx context.Context,
	projectID string,
	sectionID string,
	viewMode ListRootViewMode,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetListRootViewMode(projectID, sectionID, viewMode); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func normalizeDefaultChildSectionType(sectionType string) (string, error) {
	trimmed := strings.TrimSpace(sectionType)
	switch trimmed {
	case "Callable",
		"Dict",
		"ListRoot",
		"Group",
		"Image",
		"Chart",
		"Draw",
		"TextBlock",
		"Prompt",
		"MetaControl",
		"Social",
		"Code",
		"Terminal",
		"IFrame",
		"Chat",
		"Browser",
		"Plugin",
		"TaskBoard",
		"Spreadsheet":
		return trimmed, nil
	case "GlobalVariables", "GenPythonCode", "GenPythonMetadata", "":
		return "", fmt.Errorf("%w: %q", ErrDefaultChildSectionTypeInvalid, trimmed)
	default:
		return "", fmt.Errorf("%w: %q", ErrDefaultChildSectionTypeInvalid, trimmed)
	}
}

func normalizeListRootViewMode(viewMode ListRootViewMode) (ListRootViewMode, error) {
	trimmed := ListRootViewMode(strings.TrimSpace(string(viewMode)))
	switch trimmed {
	case ListRootViewModeDefault, ListRootViewModeTaskList, ListRootViewModeKanban:
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrListRootViewModeInvalid, trimmed)
	}
}
