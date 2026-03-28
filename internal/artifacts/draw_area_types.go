package artifacts

import "setta/internal/projectstate"

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
	Points                   []any              `json:"points"`
	GlobalCompositeOperation string             `json:"globalCompositeOperation"`
}

type BrushStrokeWithTransform struct {
	StrokeStyle              string             `json:"strokeStyle"`
	LineWidth                float64            `json:"lineWidth"`
	LineCap                  DrawAreaBrushShape `json:"lineCap"`
	Points                   []any              `json:"points"`
	GlobalCompositeOperation string             `json:"globalCompositeOperation"`
	Transform                [6]float64         `json:"transform"`
}

type DrawAreaLayerItemTransform struct {
	Transform     [6]float64                 `json:"transform"`
	EraserStrokes []BrushStrokeWithTransform `json:"eraserStrokes"`
}

type DrawAreaLayer struct {
	Name         string                           `json:"name"`
	Elements     []projectstate.DrawAreaLayerItem `json:"elements"`
	Visible      bool                             `json:"visible"`
	LayerOpacity float64                          `json:"layerOpacity"`
}

type BrushStrokeArtifact struct {
	Type  ArtifactType `json:"type"`
	ID    string       `json:"id"`
	Value BrushStroke  `json:"value"`
}

type DrawAreaLayerItemTransformArtifact struct {
	Type  ArtifactType               `json:"type"`
	ID    string                     `json:"id"`
	Value DrawAreaLayerItemTransform `json:"value"`
}
