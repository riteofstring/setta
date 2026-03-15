package frontendbindings

type BinaryUploadRequestInput struct{}

type BinaryDownloadRequestInput struct {
	ContentID string `json:"contentId"`
}

type BinaryDownloadResponse struct{}

type ImportFilesToArtifactsRequestInput struct {
	Paths       []string `json:"paths"`
	UploadScope string   `json:"uploadScope"`
}

type ImportFilesToArtifactsResponseItem struct {
	Kind     string `json:"kind"`
	ID       string `json:"id"`
	Name     string `json:"name"`
	MimeType string `json:"mimeType"`
	Size     int    `json:"size"`
}

type ImportFilesToArtifactsResponse []ImportFilesToArtifactsResponseItem

type LoadCachedArtifactsRequestInput struct {
	Paths []string `json:"paths"`
}

type ArtifactType string

const (
	ArtifactTypeImage                      ArtifactType = "Image"
	ArtifactTypeBrushStroke                ArtifactType = "BrushStroke"
	ArtifactTypeDrawAreaLayerItemTransform ArtifactType = "DrawAreaLayerItemTransform"
	ArtifactTypeChartData                  ArtifactType = "ChartData"
	ArtifactTypeFile                       ArtifactType = "File"
)

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

type DrawAreaLayerItem struct {
	Type        ArtifactType `json:"type"`
	DataPath    string       `json:"dataPath"`
	TransformID string       `json:"transformId"`
}

type DrawAreaLayer struct {
	Name         string              `json:"name"`
	Elements     []DrawAreaLayerItem `json:"elements"`
	Visible      bool                `json:"visible"`
	LayerOpacity float64             `json:"layerOpacity"`
}

type ImageArtifact struct {
	Type  ArtifactType     `json:"type"`
	ID    string           `json:"id"`
	Value BinaryContentRef `json:"value"`
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

type ChartDataScalar struct{}

type ChartDataValue map[string][]ChartDataScalar

type ChartDataArtifact struct {
	Type  ArtifactType   `json:"type"`
	ID    string         `json:"id"`
	Value ChartDataValue `json:"value"`
}

type FileArtifact struct {
	Type  ArtifactType     `json:"type"`
	ID    string           `json:"id"`
	Value BinaryContentRef `json:"value"`
}

type ArtifactUnion struct{}

type ImageMapping map[string]ImageArtifact

type BrushStrokeMapping map[string]BrushStrokeArtifact

type DrawAreaLayerItemTransformMapping map[string]DrawAreaLayerItemTransformArtifact

type ChartDataMapping map[string]ChartDataArtifact

type FileMapping map[string]FileArtifact

type ArtifactSaveConflictStrategy string

const (
	ArtifactSaveConflictStrategySkip      ArtifactSaveConflictStrategy = "skip"
	ArtifactSaveConflictStrategyBackup    ArtifactSaveConflictStrategy = "backup"
	ArtifactSaveConflictStrategyOverwrite ArtifactSaveConflictStrategy = "overwrite"
)

type ArtifactSaveStatus string

const (
	ArtifactSaveStatusSaved     ArtifactSaveStatus = "saved"
	ArtifactSaveStatusUnchanged ArtifactSaveStatus = "unchanged"
	ArtifactSaveStatusSkipped   ArtifactSaveStatus = "skipped"
	ArtifactSaveStatusConflict  ArtifactSaveStatus = "conflict"
)

type ArtifactSaveResult struct {
	ID         string             `json:"id"`
	Type       ArtifactType       `json:"type"`
	Status     ArtifactSaveStatus `json:"status"`
	BackupPath *string            `json:"backupPath,omitempty"`
	Message    *string            `json:"message,omitempty"`
}

type UpdateArtifactsRequestInput struct {
	Artifacts        []ArtifactUnion               `json:"artifacts"`
	ConflictStrategy *ArtifactSaveConflictStrategy `json:"conflictStrategy,omitempty"`
	UploadScope      *string                       `json:"uploadScope,omitempty"`
}

type UpdateArtifactsResponse []ArtifactSaveResult

type DeleteArtifactRequestItem struct {
	ID   string       `json:"id"`
	Type ArtifactType `json:"type"`
}

type DeleteArtifactsRequestInput struct {
	Artifacts []DeleteArtifactRequestItem `json:"artifacts"`
}

type DeleteArtifactsResponse []string

type LoadCachedImageArtifactsResponse []*ImageArtifact

type LoadCachedChartDataResponse []*ChartDataArtifact

type LoadCachedBrushStrokesResponse []*BrushStrokeArtifact

type LoadCachedDrawAreaLayerItemTransformResponse []*DrawAreaLayerItemTransformArtifact

type UpdateArtifactMsgContent struct {
	Artifacts  []ArtifactUnion `json:"artifacts"`
	UpdateType string          `json:"updateType"`
}
