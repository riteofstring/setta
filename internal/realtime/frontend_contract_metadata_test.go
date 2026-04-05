package realtime

import (
	"reflect"
	"testing"
)

func TestFrontendBindingTagsLiveOnOwnerTypes(t *testing.T) {
	type tagExpectation struct {
		typ      reflect.Type
		field    string
		tagName  string
		tagValue string
	}

	expectations := []tagExpectation{
		{typ: reflect.TypeOf(UISettingRevealTarget{}), field: "RevealActivationSteps", tagName: "ts_optional", tagValue: "false"},
		{typ: reflect.TypeOf(UISettingRevealContent{}), field: "DurationMS", tagName: "ts_parse_fallback", tagValue: "3000"},
		{typ: reflect.TypeOf(UISettingRevealResultStatus{}), field: "Status", tagName: "ts_type", tagValue: "\"revealed\" | \"failed\""},
		{typ: reflect.TypeOf(UISettingRevealResultStatus{}), field: "ErrorCode", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(UISettingRevealResultStatus{}), field: "ErrorMessage", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(UpdateArtifactsContent{}), field: "Artifacts", tagName: "ts_type", tagValue: "Array<ImageArtifact | BrushStrokeArtifact | DrawAreaLayerItemTransformArtifact | ChartDataArtifact | FileArtifact>"},
		{typ: reflect.TypeOf(UpdateArtifactsContent{}), field: "UpdateType", tagName: "ts_type", tagValue: "\"update\" | \"delete\""},
		{typ: reflect.TypeOf(ListenerCoverageSnapshot{}), field: "Dependencies", tagName: "ts_type", tagValue: "Array<BaseDependencyKeyUnion>"},
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
