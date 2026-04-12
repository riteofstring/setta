package projectview

import "setta/internal/projectstate"

// Keep list-root child-default view mode labels and ordering Go-owned so the
// frontend does not hand-maintain enum-derived UI metadata.
var frontendListRootViewModeOptions = []ListRootViewModeOption{
	{Value: projectstate.ListRootViewModeDefault, Label: "Default Stack"},
	{Value: projectstate.ListRootViewModeTaskList, Label: "Task List"},
	{Value: projectstate.ListRootViewModeKanban, Label: "Kanban Board"},
}

type ListRootViewModeOption struct {
	Value projectstate.ListRootViewMode `json:"value"`
	Label string                        `json:"label"`
}

type ChildDefaultsUIConfigValue struct {
	ListRootViewModeOptions []ListRootViewModeOption `json:"listRootViewModeOptions"`
}

func FrontendValueChildDefaultsUIConfig() ChildDefaultsUIConfigValue {
	return ChildDefaultsUIConfigValue{
		ListRootViewModeOptions: append([]ListRootViewModeOption(nil), frontendListRootViewModeOptions...),
	}
}
