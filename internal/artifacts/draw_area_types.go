package artifacts

import "setta/internal/projectstate"

type CanvasPoint [2]float64

type DrawAreaTransform [6]float64

type DrawAreaBrushShape string

const (
	DrawAreaBrushShapeButt   DrawAreaBrushShape = "butt"
	DrawAreaBrushShapeRound  DrawAreaBrushShape = "round"
	DrawAreaBrushShapeSquare DrawAreaBrushShape = "square"
)

type DrawAreaMode string

const (
	DrawAreaModeDraw  DrawAreaMode = "draw"
	DrawAreaModeErase DrawAreaMode = "erase"
	DrawAreaModeEdit  DrawAreaMode = "edit"
)

type BrushStroke struct {
	StrokeStyle              string             `json:"strokeStyle"`
	LineWidth                float64            `json:"lineWidth"`
	LineCap                  DrawAreaBrushShape `json:"lineCap"`
	Points                   []any              `json:"points" ts_type:"Array<CanvasPoint | \"BREAK\">" py_default:"factory:list" shared_schema_non_null:"true"`
	GlobalCompositeOperation string             `json:"globalCompositeOperation"`
}

type BrushStrokeWithTransform struct {
	StrokeStyle              string             `json:"strokeStyle"`
	LineWidth                float64            `json:"lineWidth"`
	LineCap                  DrawAreaBrushShape `json:"lineCap"`
	Points                   []any              `json:"points" ts_type:"Array<CanvasPoint | \"BREAK\">" py_default:"factory:list" shared_schema_non_null:"true"`
	GlobalCompositeOperation string             `json:"globalCompositeOperation"`
	Transform                DrawAreaTransform  `json:"transform"`
}

type DrawAreaLayerItemTransform struct {
	Transform     DrawAreaTransform          `json:"transform"`
	EraserStrokes []BrushStrokeWithTransform `json:"eraserStrokes" py_default:"factory:list" shared_schema_non_null:"true"`
}

type DrawAreaLayer struct {
	Name         string                           `json:"name" ts_create_expr:"createRandomName()"`
	Elements     []projectstate.DrawAreaLayerItem `json:"elements" py_default:"factory:list" shared_schema_non_null:"true"`
	Visible      bool                             `json:"visible"`
	LayerOpacity float64                          `json:"layerOpacity"`
}

type BrushStrokeArtifact struct {
	Type  ArtifactType `json:"type" ts_type:"typeof ArtifactTypeEnum.BrushStroke" shared_discriminator:"BrushStroke"`
	ID    string       `json:"id" ts_create_expr:"createJsonArtifactId()"`
	Value BrushStroke  `json:"value" ts_create_expr:"createBrushStroke()"`
}

type DrawAreaLayerItemTransformArtifact struct {
	Type  ArtifactType               `json:"type" ts_type:"typeof ArtifactTypeEnum.DrawAreaLayerItemTransform" shared_discriminator:"DrawAreaLayerItemTransform"`
	ID    string                     `json:"id" ts_create_expr:"createJsonArtifactId()"`
	Value DrawAreaLayerItemTransform `json:"value" ts_create_expr:"createDrawAreaLayerItemTransform()"`
}
