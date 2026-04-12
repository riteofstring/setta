package httpapi

import (
	"reflect"
	"testing"

	"setta/internal/projectview"
)

func TestFrontendDefaultProjectStateSingleConfigWithCompletedOpIDsUsesOwnerDefaults(t *testing.T) {
	defaults := FrontendDefaultProjectStateSingleConfigWithCompletedOpIDs()
	if !reflect.DeepEqual(defaults.ProjectState, projectview.FrontendDefaultSingleConfig()) {
		t.Fatalf("unexpected project state defaults: %#v", defaults.ProjectState)
	}
	if defaults.CompletedOpIDs == nil || defaults.PendingOpIDs == nil {
		t.Fatalf("expected op id slices to be initialized, got %#v", defaults)
	}
}

func TestFrontendBindingTagsLiveOnOwnerTypes(t *testing.T) {
	type tagExpectation struct {
		typ      reflect.Type
		field    string
		tagName  string
		tagValue string
	}

	expectations := []tagExpectation{
		{typ: reflect.TypeOf(RunCodeRequest{}), field: "RunSnapshotMode", tagName: "ts_type", tagValue: "RunSnapshotMode | null"},
		{typ: reflect.TypeOf(UpdateArtifactsRequest{}), field: "Artifacts", tagName: "ts_type", tagValue: "Array<ImageArtifact | BrushStrokeArtifact | DrawAreaLayerItemTransformArtifact | ChartDataArtifact | FileArtifact>"},
		{typ: reflect.TypeOf(CreateEdgeRequest{}), field: "Style", tagName: "ts_type", tagValue: "Record<string, unknown> | null"},
		{typ: reflect.TypeOf(CreateEdgeRequest{}), field: "Data", tagName: "ts_type", tagValue: "Record<string, unknown> | null"},
		{typ: reflect.TypeOf(CreateStateMachineEdgeRequest{}), field: "Style", tagName: "ts_type", tagValue: "Record<string, unknown> | null"},
		{typ: reflect.TypeOf(CreateAgenticEdgeRequest{}), field: "Style", tagName: "ts_type", tagValue: "Record<string, unknown> | null"},
		{typ: reflect.TypeOf(MoveSectionsRequest{}), field: "PositionsByID", tagName: "ts_type", tagValue: "Record<string, Position> | null"},
	}

	for _, expectation := range expectations {
		field, ok := expectation.typ.FieldByName(expectation.field)
		if !ok {
			t.Fatalf("%s.%s field not found", expectation.typ.Name(), expectation.field)
		}
		if got := field.Tag.Get(expectation.tagName); got != expectation.tagValue {
			t.Fatalf(
				"%s.%s tag %q = %q, want %q",
				expectation.typ.Name(),
				expectation.field,
				expectation.tagName,
				got,
				expectation.tagValue,
			)
		}
	}
}
