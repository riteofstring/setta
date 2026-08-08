package artifacts

import (
	"reflect"
	"testing"
)

func TestFrontendDefaultsMaterializeGeneratorValues(t *testing.T) {
	image := FrontendDefaultImageArtifact()
	if image.Type != ArtifactTypeImage {
		t.Fatalf("expected image artifact type %q, got %q", ArtifactTypeImage, image.Type)
	}

	brush := FrontendDefaultBrushStrokeArtifact()
	if brush.Type != ArtifactTypeBrushStroke || brush.Value.Points == nil {
		t.Fatalf("unexpected brush artifact defaults: %#v", brush)
	}

	transform := FrontendDefaultDrawAreaLayerItemTransformArtifact()
	if transform.Type != ArtifactTypeDrawAreaLayerItemTransform || transform.Value.EraserStrokes == nil {
		t.Fatalf("unexpected transform artifact defaults: %#v", transform)
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
		{typ: reflect.TypeOf(BrushStroke{}), field: "Points", tagName: "ts_type", tagValue: "Array<CanvasPoint | \"BREAK\">"},
		{typ: reflect.TypeOf(DrawAreaLayer{}), field: "Name", tagName: "ts_create_expr", tagValue: "createRandomName()"},
		{typ: reflect.TypeOf(ImageArtifact{}), field: "Type", tagName: "ts_type", tagValue: "typeof ArtifactTypeEnum.Image"},
		{typ: reflect.TypeOf(ImageArtifact{}), field: "ID", tagName: "ts_create_expr", tagValue: "createPngArtifactId()"},
		{typ: reflect.TypeOf(ImageArtifact{}), field: "Value", tagName: "ts_create_expr", tagValue: "createContentRef()"},
		{typ: reflect.TypeOf(BrushStrokeArtifact{}), field: "ID", tagName: "ts_create_expr", tagValue: "createJsonArtifactId()"},
		{typ: reflect.TypeOf(BrushStrokeArtifact{}), field: "Value", tagName: "ts_create_expr", tagValue: "createBrushStroke()"},
		{typ: reflect.TypeOf(DrawAreaLayerItemTransformArtifact{}), field: "ID", tagName: "ts_create_expr", tagValue: "createJsonArtifactId()"},
		{typ: reflect.TypeOf(DrawAreaLayerItemTransformArtifact{}), field: "Value", tagName: "ts_create_expr", tagValue: "createDrawAreaLayerItemTransform()"},
		{typ: reflect.TypeOf(ChartDataArtifact{}), field: "ID", tagName: "ts_create_expr", tagValue: "createCsvArtifactId()"},
		{typ: reflect.TypeOf(FileArtifact{}), field: "ID", tagName: "ts_create_expr", tagValue: "createFileArtifactId()"},
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
