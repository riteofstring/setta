package frontendbindings

import (
	"setta/internal/artifacts"
	"setta/internal/projectstate"
)

type BinaryUploadRequestInput struct{}

type BinaryDownloadRequestInput struct {
	ContentID string `json:"contentId"`
}

type BinaryDownloadResponse struct{}

type ImportFilesToArtifactsRequestInput artifacts.ImportFilesRequest

type ImportFilesToArtifactsResponseItem artifacts.ImportFilesResponseItem

type ImportFilesToArtifactsResponse []ImportFilesToArtifactsResponseItem

type LoadCachedArtifactsRequestInput artifacts.LoadCachedPathsRequest

type ArtifactType = artifacts.ArtifactType

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

type CanvasPoint [2]float64

type DrawAreaTransform [6]float64

type BrushStrokePoint struct{}

type BrushStroke struct {
	StrokeStyle              string             `json:"strokeStyle"`
	LineWidth                float64            `json:"lineWidth"`
	LineCap                  DrawAreaBrushShape `json:"lineCap"`
	Points                   []BrushStrokePoint `json:"points"`
	GlobalCompositeOperation string             `json:"globalCompositeOperation"`
}

type BrushStrokeWithTransform struct {
	StrokeStyle              string             `json:"strokeStyle"`
	LineWidth                float64            `json:"lineWidth"`
	LineCap                  DrawAreaBrushShape `json:"lineCap"`
	Points                   []BrushStrokePoint `json:"points"`
	GlobalCompositeOperation string             `json:"globalCompositeOperation"`
	Transform                DrawAreaTransform  `json:"transform"`
}

type DrawAreaLayerItemTransform struct {
	Transform     DrawAreaTransform          `json:"transform"`
	EraserStrokes []BrushStrokeWithTransform `json:"eraserStrokes"`
}

type DrawAreaLayerItem = projectstate.DrawAreaLayerItem

type DrawAreaLayer struct {
	Name         string              `json:"name"`
	Elements     []DrawAreaLayerItem `json:"elements"`
	Visible      bool                `json:"visible"`
	LayerOpacity float64             `json:"layerOpacity"`
}

type ImageArtifact = artifacts.ImageArtifact

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

type ChartDataScalar struct{}

type ChartDataValue map[string][]ChartDataScalar

type ChartDataArtifact = artifacts.ChartDataArtifact

type FileArtifact = artifacts.FileArtifact

type ArtifactUnion struct{}

type ImageMapping map[string]ImageArtifact

type BrushStrokeMapping map[string]BrushStrokeArtifact

type DrawAreaLayerItemTransformMapping map[string]DrawAreaLayerItemTransformArtifact

type ChartDataMapping map[string]ChartDataArtifact

type FileMapping map[string]FileArtifact

type ArtifactSaveConflictStrategy artifacts.SaveConflictStrategy

type ArtifactSaveStatus artifacts.SaveStatus

type ArtifactSaveResult artifacts.ArtifactSaveResult

type UpdateArtifactsRequestInput struct {
	Artifacts        []ArtifactUnion               `json:"artifacts"`
	ConflictStrategy *ArtifactSaveConflictStrategy `json:"conflictStrategy,omitempty"`
	UploadScope      *string                       `json:"uploadScope,omitempty"`
}

type UpdateArtifactsResponse []ArtifactSaveResult

type DeleteArtifactRequestItem artifacts.DeleteRequestItem

type DeleteArtifactsRequestInput artifacts.DeleteRequest

type DeleteArtifactsResponse []string

type LoadCachedImageArtifactsResponse []*artifacts.ImageArtifact

type LoadCachedChartDataResponse []*artifacts.ChartDataArtifact

type LoadCachedBrushStrokesResponse []*BrushStrokeArtifact

type LoadCachedDrawAreaLayerItemTransformResponse []*DrawAreaLayerItemTransformArtifact

type UpdateArtifactMsgContent struct {
	Artifacts  []ArtifactUnion `json:"artifacts"`
	UpdateType string          `json:"updateType"`
}
