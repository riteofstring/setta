package projectstate

import (
	"context"
	"fmt"
	"strings"
)

const defaultCreatedProjectName = "Project"

func (d *Document) CreateProject(previewImgColor string) (string, string, error) {
	if d == nil {
		return "", "", ErrProjectNotFound
	}
	if d.Projects == nil {
		d.Projects = map[string]Project{}
	}

	projectID, err := newProjectStateID()
	if err != nil {
		return "", "", err
	}
	projectName, err := nextAvailableProjectName(*d)
	if err != nil {
		return "", "", err
	}

	project := Project{
		ID:                      projectID,
		Name:                    projectName,
		AllowJSONSourceKeyEdits: true,
		PreviewImgColor:         strings.TrimSpace(previewImgColor),
	}
	if _, err := project.CreateViewMode(); err != nil {
		return "", "", err
	}

	d.Projects[projectID] = project
	d.reconcileDefaultProjectID()
	return projectID, projectName, nil
}

func (d *Document) CloneProject(projectID string, newName string) (string, string, error) {
	if d == nil {
		return "", "", ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return "", "", err
	}

	normalizedName, err := validateProjectName(*d, "new-project", newName, false)
	if err != nil {
		return "", "", err
	}
	clonedProjectID, err := newProjectStateID()
	if err != nil {
		return "", "", err
	}

	cloned := project.Clone()
	cloned.ID = clonedProjectID
	cloned.Name = normalizedName

	if d.Projects == nil {
		d.Projects = map[string]Project{}
	}
	d.Projects[clonedProjectID] = cloned
	d.reconcileDefaultProjectID()
	return clonedProjectID, normalizedName, nil
}

func (d *Document) DeleteProjects(projectIDs []string) ([]string, error) {
	if d == nil {
		return nil, ErrProjectNotFound
	}
	if len(projectIDs) == 0 {
		return nil, nil
	}

	trimmedIDs := make([]string, 0, len(projectIDs))
	seen := make(map[string]struct{}, len(projectIDs))
	for _, rawProjectID := range projectIDs {
		projectID := strings.TrimSpace(rawProjectID)
		if projectID == "" {
			return nil, ErrProjectIDRequired
		}
		if _, err := d.ProjectByID(projectID); err != nil {
			return nil, err
		}
		if _, ok := seen[projectID]; ok {
			continue
		}
		seen[projectID] = struct{}{}
		trimmedIDs = append(trimmedIDs, projectID)
	}

	for _, projectID := range trimmedIDs {
		delete(d.Projects, projectID)
	}
	d.reconcileDefaultProjectID()
	return trimmedIDs, nil
}

func (r *Runtime) CreateProject(ctx context.Context, previewImgColor string) (Snapshot, string, string, error) {
	var (
		createdProjectID string
		createdName      string
	)
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		projectID, projectName, err := document.CreateProject(previewImgColor)
		if err != nil {
			return Document{}, err
		}
		createdProjectID = projectID
		createdName = projectName
		return document, nil
	})
	return snapshot, createdProjectID, createdName, err
}

func (r *Runtime) CloneProject(ctx context.Context, projectID string, newName string) (Snapshot, string, string, error) {
	var (
		clonedProjectID string
		normalizedName  string
	)
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		projectID, projectName, err := document.CloneProject(projectID, newName)
		if err != nil {
			return Document{}, err
		}
		clonedProjectID = projectID
		normalizedName = projectName
		return document, nil
	})
	return snapshot, clonedProjectID, normalizedName, err
}

func (r *Runtime) DeleteProjects(ctx context.Context, projectIDs []string) (Snapshot, []string, error) {
	var deletedIDs []string
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		removedIDs, err := document.DeleteProjects(projectIDs)
		if err != nil {
			return Document{}, err
		}
		deletedIDs = append([]string(nil), removedIDs...)
		return document, nil
	})
	return snapshot, deletedIDs, err
}

func (d *Document) reconcileDefaultProjectID() {
	if d == nil {
		return
	}
	if len(d.Projects) == 0 {
		d.DefaultProjectID = ""
		return
	}

	trimmedDefault := strings.TrimSpace(d.DefaultProjectID)
	if trimmedDefault != "" {
		if _, ok := d.Projects[trimmedDefault]; ok {
			d.DefaultProjectID = trimmedDefault
			return
		}
	}

	metadata := d.ProjectConfigMetadata()
	if len(metadata) == 0 {
		d.DefaultProjectID = ""
		return
	}
	d.DefaultProjectID = metadata[0].ID
}

func nextAvailableProjectName(document Document) (string, error) {
	if _, err := validateProjectName(document, "new-project", defaultCreatedProjectName, false); err == nil {
		return defaultCreatedProjectName, nil
	} else if !IsInvalidProjectNameError(err) {
		return "", err
	}

	for suffix := 2; ; suffix++ {
		candidate := fmt.Sprintf("%s %d", defaultCreatedProjectName, suffix)
		if _, err := validateProjectName(document, "new-project", candidate, false); err == nil {
			return candidate, nil
		} else if !IsInvalidProjectNameError(err) {
			return "", err
		}
	}
}
