package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrSpreadsheetSectionRequired    = errors.New("section must resolve to a spreadsheet section")
	ErrSpreadsheetGridDensityInvalid = errors.New("spreadsheet grid density is invalid")
	ErrTaskBoardSectionRequired      = errors.New("section must resolve to a task board section")
	ErrTaskBoardViewModeInvalid      = errors.New("task board view mode is invalid")
	ErrImageSectionRequired          = errors.New("section must resolve to an image section")
	ErrSocialSectionRequired         = errors.New("section must resolve to a social section")
)

type SpreadsheetGridDensity string

const (
	SpreadsheetGridDensityCompact     SpreadsheetGridDensity = "compact"
	SpreadsheetGridDensityComfortable SpreadsheetGridDensity = "comfortable"
)

type TaskBoardViewMode string

const (
	TaskBoardViewModeTaskList TaskBoardViewMode = "task_list"
	TaskBoardViewModeKanban   TaskBoardViewMode = "kanban"
)

type TaskBoardColumn struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	SortIndex int    `json:"sortIndex"`
}

type TaskBoardTask struct {
	ID               string   `json:"id"`
	Title            string   `json:"title"`
	Description      string   `json:"description"`
	Completed        bool     `json:"completed"`
	ColumnID         *string  `json:"columnId" ts_optional:"true"`
	DueDateISO       string   `json:"dueDateIso"`
	Recurrence       string   `json:"recurrence" ts_type:"TaskBoardTaskRecurrence"`
	RecurrenceDays   []string `json:"recurrenceDays" ts_type:"Array<TaskBoardRecurringWeekday>"`
	RecurrenceMonths []string `json:"recurrenceMonths" ts_type:"Array<TaskBoardRecurringMonth>"`
	RecurrenceYears  []int    `json:"recurrenceYears"`
	SortIndex        int      `json:"sortIndex"`
}

func (p *Project) SetSpreadsheetFilePath(sectionID string, filePath string, activeSheet *string) error {
	section, _, _, err := p.resolveSpreadsheetSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	if err := p.setCurrentSectionField(section.ID, "filePath", strings.TrimSpace(filePath)); err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "activeSheet", optionalStringValue(activeSheet))
}

func (d *Document) SetSpreadsheetFilePath(projectID string, sectionID string, filePath string, activeSheet *string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSpreadsheetFilePath(sectionID, filePath, activeSheet); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSpreadsheetFilePath(
	ctx context.Context,
	projectID string,
	sectionID string,
	filePath string,
	activeSheet *string,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSpreadsheetFilePath(projectID, sectionID, filePath, activeSheet); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSpreadsheetSectionSettings(
	sectionID string,
	readOnly bool,
	showRowNumbers bool,
	density SpreadsheetGridDensity,
	autoReloadOnExternalChange bool,
) error {
	section, _, _, err := p.resolveSpreadsheetSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	normalizedDensity, err := normalizeSpreadsheetGridDensity(density)
	if err != nil {
		return err
	}
	if err := p.setCurrentSectionField(section.ID, "readOnly", readOnly); err != nil {
		return err
	}
	if err := p.setCurrentSectionField(section.ID, "showRowNumbers", showRowNumbers); err != nil {
		return err
	}
	if err := p.setCurrentSectionField(section.ID, "density", string(normalizedDensity)); err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "autoReloadOnExternalChange", autoReloadOnExternalChange)
}

func (d *Document) SetSpreadsheetSectionSettings(
	projectID string,
	sectionID string,
	readOnly bool,
	showRowNumbers bool,
	density SpreadsheetGridDensity,
	autoReloadOnExternalChange bool,
) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSpreadsheetSectionSettings(
		sectionID,
		readOnly,
		showRowNumbers,
		density,
		autoReloadOnExternalChange,
	); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSpreadsheetSectionSettings(
	ctx context.Context,
	projectID string,
	sectionID string,
	readOnly bool,
	showRowNumbers bool,
	density SpreadsheetGridDensity,
	autoReloadOnExternalChange bool,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSpreadsheetSectionSettings(
			projectID,
			sectionID,
			readOnly,
			showRowNumbers,
			density,
			autoReloadOnExternalChange,
		); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetTaskBoardSectionState(
	sectionID string,
	viewMode TaskBoardViewMode,
	columns []TaskBoardColumn,
	tasks []TaskBoardTask,
) error {
	section, _, _, err := p.resolveTaskBoardSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	normalizedViewMode, err := normalizeTaskBoardViewMode(viewMode)
	if err != nil {
		return err
	}
	normalizedColumns, knownColumnIDs, err := normalizeTaskBoardColumns(columns)
	if err != nil {
		return err
	}
	normalizedTasks, err := normalizeTaskBoardTasks(tasks, knownColumnIDs)
	if err != nil {
		return err
	}
	if err := p.setCurrentSectionField(section.ID, "viewMode", string(normalizedViewMode)); err != nil {
		return err
	}
	if err := p.setCurrentSectionField(section.ID, "columns", normalizedColumns); err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "tasks", normalizedTasks)
}

func (d *Document) SetTaskBoardSectionState(
	projectID string,
	sectionID string,
	viewMode TaskBoardViewMode,
	columns []TaskBoardColumn,
	tasks []TaskBoardTask,
) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetTaskBoardSectionState(sectionID, viewMode, columns, tasks); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetTaskBoardSectionState(
	ctx context.Context,
	projectID string,
	sectionID string,
	viewMode TaskBoardViewMode,
	columns []TaskBoardColumn,
	tasks []TaskBoardTask,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetTaskBoardSectionState(projectID, sectionID, viewMode, columns, tasks); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetImageAreaImagePath(sectionID string, imagePath string) error {
	section, _, _, err := p.resolveImageSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "imagePath", imagePath)
}

func (d *Document) SetImageAreaImagePath(projectID string, sectionID string, imagePath string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetImageAreaImagePath(sectionID, imagePath); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetImageAreaImagePath(ctx context.Context, projectID string, sectionID string, imagePath string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetImageAreaImagePath(projectID, sectionID, imagePath); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSocialURL(sectionID string, url string) error {
	section, _, _, err := p.resolveSocialSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "url", url)
}

func (d *Document) SetSocialURL(projectID string, sectionID string, url string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSocialURL(sectionID, url); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSocialURL(ctx context.Context, projectID string, sectionID string, url string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSocialURL(projectID, sectionID, url); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) resolveSpreadsheetSectionMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
	return p.resolveTypedSectionMutationState(sectionID, "Spreadsheet", ErrSpreadsheetSectionRequired)
}

func (p *Project) resolveTaskBoardSectionMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
	return p.resolveTypedSectionMutationState(sectionID, "TaskBoard", ErrTaskBoardSectionRequired)
}

func (p *Project) resolveImageSectionMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
	return p.resolveTypedSectionMutationState(sectionID, "Image", ErrImageSectionRequired)
}

func (p *Project) resolveSocialSectionMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
	return p.resolveTypedSectionMutationState(sectionID, "Social", ErrSocialSectionRequired)
}

func (p *Project) resolveTypedSectionMutationState(sectionID string, requiredType string, requiredErr error) (Section, SectionVariant, map[string]any, error) {
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
	if !strings.EqualFold(sectionType, requiredType) {
		return Section{}, SectionVariant{}, nil, fmt.Errorf("%w: %q", requiredErr, section.ID)
	}
	return section, variant, payload, nil
}

func normalizeSpreadsheetGridDensity(density SpreadsheetGridDensity) (SpreadsheetGridDensity, error) {
	trimmed := SpreadsheetGridDensity(strings.TrimSpace(string(density)))
	switch trimmed {
	case SpreadsheetGridDensityCompact, SpreadsheetGridDensityComfortable:
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrSpreadsheetGridDensityInvalid, trimmed)
	}
}

func normalizeTaskBoardViewMode(viewMode TaskBoardViewMode) (TaskBoardViewMode, error) {
	trimmed := TaskBoardViewMode(strings.TrimSpace(string(viewMode)))
	switch trimmed {
	case TaskBoardViewModeTaskList, TaskBoardViewModeKanban:
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrTaskBoardViewModeInvalid, trimmed)
	}
}

func normalizeTaskBoardColumns(columns []TaskBoardColumn) ([]TaskBoardColumn, map[string]struct{}, error) {
	if len(columns) == 0 {
		return []TaskBoardColumn{}, map[string]struct{}{}, nil
	}

	normalized := make([]TaskBoardColumn, 0, len(columns))
	knownIDs := make(map[string]struct{}, len(columns))
	for _, column := range columns {
		cloned := column
		cloned.ID = strings.TrimSpace(cloned.ID)
		if cloned.ID == "" {
			nextID, err := newProjectStateID()
			if err != nil {
				return nil, nil, err
			}
			cloned.ID = nextID
		}
		if _, exists := knownIDs[cloned.ID]; exists {
			continue
		}
		knownIDs[cloned.ID] = struct{}{}
		normalized = append(normalized, cloned)
	}
	return normalized, knownIDs, nil
}

func normalizeTaskBoardTasks(tasks []TaskBoardTask, knownColumnIDs map[string]struct{}) ([]TaskBoardTask, error) {
	if len(tasks) == 0 {
		return []TaskBoardTask{}, nil
	}

	normalized := make([]TaskBoardTask, 0, len(tasks))
	knownTaskIDs := make(map[string]struct{}, len(tasks))
	for _, task := range tasks {
		cloned := task
		cloned.ID = strings.TrimSpace(cloned.ID)
		if cloned.ID == "" {
			nextID, err := newProjectStateID()
			if err != nil {
				return nil, err
			}
			cloned.ID = nextID
		} else if _, exists := knownTaskIDs[cloned.ID]; exists {
			nextID, err := newProjectStateID()
			if err != nil {
				return nil, err
			}
			cloned.ID = nextID
		}
		knownTaskIDs[cloned.ID] = struct{}{}
		if cloned.ColumnID != nil {
			if _, ok := knownColumnIDs[*cloned.ColumnID]; !ok {
				cloned.ColumnID = nil
			}
		}
		normalized = append(normalized, cloned)
	}
	return normalized, nil
}
