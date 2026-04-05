package artifacts

import (
	binarypayload "setta/internal/binary"
	"setta/internal/projectstate"
)

func FrontendDefaultBrushStroke() BrushStroke {
	return BrushStroke{
		StrokeStyle:              "",
		LineWidth:                1,
		LineCap:                  DrawAreaBrushShapeRound,
		Points:                   []any{},
		GlobalCompositeOperation: "source-over",
	}
}

func FrontendDefaultDrawAreaLayerItemTransform() DrawAreaLayerItemTransform {
	return DrawAreaLayerItemTransform{
		Transform:     [6]float64{1, 0, 0, 1, 0, 0},
		EraserStrokes: []BrushStrokeWithTransform{},
	}
}

func FrontendDefaultDrawAreaLayer() DrawAreaLayer {
	return DrawAreaLayer{
		Name:         "",
		Elements:     []projectstate.DrawAreaLayerItem{},
		Visible:      true,
		LayerOpacity: 1,
	}
}

func FrontendDefaultImageArtifact() ImageArtifact {
	return ImageArtifact{
		Type:  ArtifactTypeImage,
		ID:    "",
		Value: binarypayload.ContentRef{},
	}
}

func FrontendDefaultBrushStrokeArtifact() BrushStrokeArtifact {
	return BrushStrokeArtifact{
		Type:  ArtifactTypeBrushStroke,
		ID:    "",
		Value: FrontendDefaultBrushStroke(),
	}
}

func FrontendDefaultDrawAreaLayerItemTransformArtifact() DrawAreaLayerItemTransformArtifact {
	return DrawAreaLayerItemTransformArtifact{
		Type:  ArtifactTypeDrawAreaLayerItemTransform,
		ID:    "",
		Value: FrontendDefaultDrawAreaLayerItemTransform(),
	}
}

func FrontendDefaultChartDataArtifact() ChartDataArtifact {
	return ChartDataArtifact{
		Type:  ArtifactTypeChartData,
		ID:    "",
		Value: ChartDataValue{},
	}
}

func FrontendDefaultFileArtifact() FileArtifact {
	return FileArtifact{
		Type:  ArtifactTypeFile,
		ID:    "",
		Value: binarypayload.ContentRef{},
	}
}
