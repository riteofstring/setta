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

type CanvasPoint struct{}

type DrawAreaTransform struct{}

type BrushStroke struct{}

type BrushStrokeWithTransform struct{}

type DrawAreaLayerItemTransform struct{}

type DrawAreaLayerItem struct{}

type DrawAreaLayer struct{}

type ImageArtifact struct{}

type BrushStrokeArtifact struct{}

type DrawAreaLayerItemTransformArtifact struct{}

type ChartDataValue struct{}

type ChartDataArtifact struct{}

type FileArtifact struct{}

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

type UpdateArtifactMsgContent struct{}

const canvasPointRawTS = `
export type CanvasPoint = [number, number];
`

const drawAreaTransformRawTS = `
export type DrawAreaTransform = [number, number, number, number, number, number];
`

const brushStrokeRawTS = `
export type BrushStroke = {
  strokeStyle: string;
  lineWidth: number;
  lineCap: DrawAreaBrushShape;
  points: Array<CanvasPoint | "BREAK">;
  globalCompositeOperation: string;
};
export function createBrushStroke(
  options: Partial<BrushStroke> = {},
): BrushStroke {
  return mergeGeneratedOptions(
    {
      strokeStyle: "",
      lineWidth: 1,
      lineCap: DrawAreaBrushShapeEnum.round,
      points: [],
      globalCompositeOperation: "source-over",
    },
    options,
  );
}
`

const brushStrokeWithTransformRawTS = `
export type BrushStrokeWithTransform = BrushStroke & {
  transform: DrawAreaTransform;
};
`

const drawAreaLayerItemTransformRawTS = `
export type DrawAreaLayerItemTransform = {
  transform: DrawAreaTransform;
  eraserStrokes: Array<BrushStrokeWithTransform>;
};
export function createDrawAreaLayerItemTransform(
  options: Partial<DrawAreaLayerItemTransform> = {},
): DrawAreaLayerItemTransform {
  return mergeGeneratedOptions(
    {
      transform: [1, 0, 0, 1, 0, 0],
      eraserStrokes: [],
    },
    options,
  );
}
`

const drawAreaLayerItemRawTS = `
export type DrawAreaLayerItem = {
  type: typeof ArtifactTypeEnum.Image | typeof ArtifactTypeEnum.BrushStroke;
  dataPath: string;
  transformId: string;
};
export function createDrawAreaLayerItem(
  options: Partial<DrawAreaLayerItem> = {},
): DrawAreaLayerItem {
  return mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.BrushStroke,
      dataPath: "",
      transformId: "",
    },
    options,
  );
}
`

const drawAreaLayerRawTS = `
export type DrawAreaLayer = {
  name: string;
  elements: Array<DrawAreaLayerItem>;
  visible: boolean;
  layerOpacity: number;
};
export function createDrawAreaLayer(
  options: Partial<DrawAreaLayer> = {},
): DrawAreaLayer {
  return mergeGeneratedOptions(
    {
      name: createRandomName(),
      elements: [],
      visible: true,
      layerOpacity: 1,
    },
    options,
  );
}
`

const imageArtifactRawTS = `
export type ImageArtifact = {
  type: typeof ArtifactTypeEnum.Image;
  id: string;
  value: BinaryContentRef;
};
export function createImageArtifact(
  options: Partial<ImageArtifact> = {},
): ImageArtifact {
  return mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.Image,
      id: createPngArtifactId(),
      value: createBinaryContentRef(),
    },
    options,
  );
}
`

const brushStrokeArtifactRawTS = `
export type BrushStrokeArtifact = {
  type: typeof ArtifactTypeEnum.BrushStroke;
  id: string;
  value: BrushStroke;
};
export function createBrushStrokeArtifact(
  options: Partial<BrushStrokeArtifact> = {},
): BrushStrokeArtifact {
  return mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.BrushStroke,
      id: createJsonArtifactId(),
      value: createBrushStroke(),
    },
    options,
  );
}
`

const drawAreaLayerItemTransformArtifactRawTS = `
export type DrawAreaLayerItemTransformArtifact = {
  type: typeof ArtifactTypeEnum.DrawAreaLayerItemTransform;
  id: string;
  value: DrawAreaLayerItemTransform;
};
export function createDrawAreaLayerItemTransformArtifact(
  options: Partial<DrawAreaLayerItemTransformArtifact> = {},
): DrawAreaLayerItemTransformArtifact {
  return mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.DrawAreaLayerItemTransform,
      id: createJsonArtifactId(),
      value: createDrawAreaLayerItemTransform(),
    },
    options,
  );
}
`

const chartDataValueRawTS = `
export type ChartDataValue = Record<string, Array<string | number>>;
`

const chartDataArtifactRawTS = `
export type ChartDataArtifact = {
  type: typeof ArtifactTypeEnum.ChartData;
  id: string;
  value: ChartDataValue;
};
export function createChartDataArtifact(
  options: Partial<ChartDataArtifact> = {},
): ChartDataArtifact {
  return mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.ChartData,
      id: createCsvArtifactId(),
      value: {},
    },
    options,
  );
}
`

const fileArtifactRawTS = `
export type FileArtifact = {
  type: typeof ArtifactTypeEnum.File;
  id: string;
  value: BinaryContentRef;
};
export function createFileArtifact(
  options: Partial<FileArtifact> = {},
): FileArtifact {
  return mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.File,
      id: createFileArtifactId(),
      value: createBinaryContentRef(),
    },
    options,
  );
}
`

const artifactUnionRawTS = `
export type ArtifactUnion =
  | ImageArtifact
  | BrushStrokeArtifact
  | DrawAreaLayerItemTransformArtifact
  | ChartDataArtifact
  | FileArtifact;
`

const updateArtifactMsgContentRawTS = `
export type UpdateArtifactMsgContent = {
  artifacts: Array<ArtifactUnion>;
  updateType: "update" | "delete";
};
`
