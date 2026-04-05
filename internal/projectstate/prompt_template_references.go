package projectstate

import (
	"fmt"
	"sort"
	"strings"
)

func (d Document) WorkflowPromptTemplateReferences(templateID string) []string {
	normalizedTemplateID := strings.TrimSpace(templateID)
	if normalizedTemplateID == "" || len(d.Projects) == 0 {
		return nil
	}

	projectIDs := make([]string, 0, len(d.Projects))
	for projectID := range d.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	references := make([]string, 0)
	for _, projectID := range projectIDs {
		project := d.Projects[projectID]
		for _, edge := range project.StateMachineEdges {
			if edge.TargetAction == nil || edge.TargetAction.PromptTemplateID == nil {
				continue
			}
			if strings.TrimSpace(*edge.TargetAction.PromptTemplateID) != normalizedTemplateID {
				continue
			}
			references = append(references, fmt.Sprintf("project %s, edge %s", projectID, edge.ID))
		}
	}
	return references
}
