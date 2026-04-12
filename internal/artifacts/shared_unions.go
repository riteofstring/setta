package artifacts

import "reflect"

type BaseArtifactUnion struct{}

func (BaseArtifactUnion) FrontendBindingUnionTypes() []reflect.Type {
	return []reflect.Type{
		reflect.TypeOf(ImageArtifact{}),
		reflect.TypeOf(BrushStrokeArtifact{}),
		reflect.TypeOf(DrawAreaLayerItemTransformArtifact{}),
		reflect.TypeOf(ChartDataArtifact{}),
		reflect.TypeOf(FileArtifact{}),
	}
}
