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

type DrawAreaBrushShape = artifacts.DrawAreaBrushShape

type DrawAreaMode = artifacts.DrawAreaMode

type CanvasPoint [2]float64

type DrawAreaTransform [6]float64

type BrushStrokePoint struct{}

type BrushStroke = artifacts.BrushStroke

type BrushStrokeWithTransform = artifacts.BrushStrokeWithTransform

type DrawAreaLayerItemTransform = artifacts.DrawAreaLayerItemTransform

type DrawAreaLayerItem = projectstate.DrawAreaLayerItem

type DrawAreaLayer = artifacts.DrawAreaLayer

type ImageArtifact = artifacts.ImageArtifact

type BrushStrokeArtifact = artifacts.BrushStrokeArtifact

type DrawAreaLayerItemTransformArtifact = artifacts.DrawAreaLayerItemTransformArtifact

type ChartDataValue = artifacts.ChartDataValue

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
