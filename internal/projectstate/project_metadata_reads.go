package projectstate

import (
	"sort"
	"strings"
)

type ProjectConfigMetadata struct {
	Name string `json:"name"`
	ID   string `json:"id"`
}

func (d Document) ProjectConfigMetadata() []ProjectConfigMetadata {
	metadata := make([]ProjectConfigMetadata, 0, len(d.Projects))
	for projectID, project := range d.Projects {
		metadata = append(metadata, ProjectConfigMetadata{
			Name: project.Name,
			ID:   projectID,
		})
	}

	sort.Slice(metadata, func(left int, right int) bool {
		leftName := strings.ToLower(metadata[left].Name)
		rightName := strings.ToLower(metadata[right].Name)
		if leftName != rightName {
			return leftName < rightName
		}
		if metadata[left].Name != metadata[right].Name {
			return metadata[left].Name < metadata[right].Name
		}
		return metadata[left].ID < metadata[right].ID
	})
	return metadata
}
