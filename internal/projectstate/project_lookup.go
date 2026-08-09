package projectstate

import (
	"errors"
	"fmt"
)

var (
	ErrProjectNameAmbiguous = errors.New("project name resolves to multiple projects")
)

func (d Document) ProjectIDByName(projectName string) (string, error) {
	resolvedProjectID := ""
	for projectID, project := range d.Projects {
		if project.Name != projectName {
			continue
		}
		if resolvedProjectID != "" && resolvedProjectID != projectID {
			return "", fmt.Errorf("%w: %q", ErrProjectNameAmbiguous, projectName)
		}
		resolvedProjectID = projectID
	}
	if resolvedProjectID == "" {
		return "", fmt.Errorf("%w: %q", ErrProjectNotFound, projectName)
	}
	return resolvedProjectID, nil
}
