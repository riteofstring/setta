package projectview

import (
	"reflect"
	"testing"

	"setta/internal/projectstate"
)

func TestFrontendValueChildDefaultsUIConfigUsesGoOwnedListRootMetadata(t *testing.T) {
	config := FrontendValueChildDefaultsUIConfig()

	if got, want := config.ListRootViewModeOptions, []ListRootViewModeOption{
		{Value: projectstate.ListRootViewModeDefault, Label: "Default Stack"},
		{Value: projectstate.ListRootViewModeTaskList, Label: "Task List"},
		{Value: projectstate.ListRootViewModeKanban, Label: "Kanban Board"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected list root view mode options: %#v", got)
	}
}
