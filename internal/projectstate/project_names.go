package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

type InvalidProjectNameError struct {
	Message string
}

func (e *InvalidProjectNameError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (d *Document) SetProjectName(projectID string, name string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}

	allowReserved := false
	if _, reserved := projectReservedNames[strings.ToLower(strings.TrimSpace(project.Name))]; reserved {
		allowReserved = true
	}

	normalized, err := validateProjectName(*d, project.ID, name, allowReserved)
	if err != nil {
		return err
	}
	project.Name = normalized
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetProjectName(ctx context.Context, projectID string, name string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetProjectName(projectID, name); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func validateProjectName(document Document, projectID string, name string, allowReserved bool) (string, error) {
	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return "", ErrProjectIDRequired
	}

	normalized := strings.TrimSpace(name)
	if formatError := projectNameFormatError(normalized, allowReserved); formatError != "" {
		return "", &InvalidProjectNameError{Message: formatError}
	}

	slug := sanitizeProjectSlug(normalized)
	if slug == "" {
		return "", &InvalidProjectNameError{Message: "Project name is invalid after sanitization."}
	}

	for existingProjectID, project := range document.Projects {
		if existingProjectID == trimmedProjectID {
			continue
		}
		if sanitizeProjectSlug(project.Name) != slug {
			continue
		}
		return "", &InvalidProjectNameError{
			Message: fmt.Sprintf(
				"Project name '%s' conflicts with existing project '%s'.",
				normalized,
				project.Name,
			),
		}
	}

	return normalized, nil
}

func projectNameFormatError(normalized string, allowReserved bool) string {
	if normalized == "" {
		return "Project name cannot be empty."
	}
	if containsControlChars(normalized) {
		return "Project name cannot include control characters."
	}
	if strings.Contains(normalized, "/") || strings.Contains(normalized, "\\") {
		return "Project name cannot include path separators."
	}
	if strings.Contains(normalized, "..") {
		return "Project name cannot include '..' path segments."
	}
	for _, char := range normalized {
		if !isAllowedSimpleNameChar(char) {
			return "Project name can only contain letters, numbers, spaces, '_' and '-'."
		}
	}
	if !allowReserved {
		if _, reserved := projectReservedNames[strings.ToLower(normalized)]; reserved {
			return fmt.Sprintf("Project name '%s' is reserved.", normalized)
		}
	}
	return ""
}

func IsInvalidProjectNameError(err error) bool {
	var invalid *InvalidProjectNameError
	return errors.As(err, &invalid)
}
