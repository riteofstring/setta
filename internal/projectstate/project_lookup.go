package projectstate

import (
	"errors"
	"fmt"
	"strings"
)

var (
	ErrProjectLookupNameRequired = errors.New("project lookup name is required")
	ErrProjectNameAmbiguous      = errors.New("project name resolves to multiple projects")
)

func (d Document) ProjectIDByName(projectName string) (string, error) {
	trimmedProjectName := strings.TrimSpace(projectName)
	if trimmedProjectName == "" {
		return "", ErrProjectLookupNameRequired
	}

	resolvedProjectID := ""
	for projectID, project := range d.Projects {
		if project.Name != trimmedProjectName {
			continue
		}
		if resolvedProjectID != "" && resolvedProjectID != projectID {
			return "", fmt.Errorf("%w: %q", ErrProjectNameAmbiguous, trimmedProjectName)
		}
		resolvedProjectID = projectID
	}
	if resolvedProjectID == "" {
		return "", fmt.Errorf("%w: %q", ErrProjectNotFound, trimmedProjectName)
	}
	return resolvedProjectID, nil
}
