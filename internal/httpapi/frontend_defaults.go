package httpapi

import "setta/internal/projectview"

func FrontendDefaultProjectStateSingleConfigWithCompletedOpIDs() ProjectStateSingleConfigWithCompletedOpIDs {
	return ProjectStateSingleConfigWithCompletedOpIDs{
		ProjectState:   projectview.FrontendDefaultSingleConfig(),
		CompletedOpIDs: []string{},
		PendingOpIDs:   []string{},
	}
}
