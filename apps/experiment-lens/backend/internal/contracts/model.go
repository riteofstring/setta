package contracts

import "encoding/json"

const ContractVersion = 1

type ProducerIdentity struct {
	Kind    string  `json:"kind"`
	Name    string  `json:"name"`
	Model   *string `json:"model,omitempty"`
	Harness *string `json:"harness,omitempty"`
}

type Provenance struct {
	Producer  ProducerIdentity `json:"producer"`
	CreatedAt string           `json:"createdAt"`
}

type FieldDefinition struct {
	ID          string  `json:"id"`
	Label       string  `json:"label"`
	Description string  `json:"description"`
	Role        string  `json:"role"`
	ValueType   string  `json:"valueType"`
	Unit        *string `json:"unit"`
	Nullable    bool    `json:"nullable"`
}

type ObservationReference struct {
	Path       string `json:"path"`
	ByteLength int64  `json:"byteLength"`
	SHA256     string `json:"sha256"`
}

type ArtifactReference struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Path       string `json:"path"`
	MediaType  string `json:"mediaType"`
	ByteLength int64  `json:"byteLength"`
	SHA256     string `json:"sha256"`
}

type ArtifactRelation struct {
	ObservationID string              `json:"observationId"`
	ArtifactID    string              `json:"artifactId"`
	Role          string              `json:"role"`
	Timeline      *TimelineCoordinate `json:"timeline"`
}

type TimelineCoordinate struct {
	AxisID string  `json:"axisId"`
	Value  float64 `json:"value"`
}

type PresentationSection struct {
	ID             string   `json:"id"`
	Type           string   `json:"type"`
	Title          string   `json:"title"`
	FieldIDs       []string `json:"fieldIds,omitempty"`
	FieldID        *string  `json:"fieldId,omitempty"`
	XFieldID       *string  `json:"xFieldId,omitempty"`
	YFieldID       *string  `json:"yFieldId,omitempty"`
	ColorFieldID   *string  `json:"colorFieldId,omitempty"`
	ValueFieldID   *string  `json:"valueFieldId,omitempty"`
	Aggregation    *string  `json:"aggregation,omitempty"`
	Bins           *int     `json:"bins,omitempty"`
	ArtifactRole   *string  `json:"artifactRole,omitempty"`
	ArtifactRoles  []string `json:"artifactRoles,omitempty"`
	DetailFieldIDs []string `json:"detailFieldIds,omitempty"`
}

type PresentationPlacement struct {
	SectionID string `json:"sectionId"`
	X         int    `json:"x"`
	Y         int    `json:"y"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
}

type PresentationViewport struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

type PresentationView struct {
	ID         string                  `json:"id"`
	Name       string                  `json:"name"`
	Viewport   PresentationViewport    `json:"viewport"`
	Placements []PresentationPlacement `json:"placements"`
}

type ExperimentPresentation struct {
	InitialViewID string                `json:"initialViewId"`
	Sections      []PresentationSection `json:"sections"`
	Views         []PresentationView    `json:"views"`
}

type ExperimentManifest struct {
	Version      int                    `json:"version"`
	ID           string                 `json:"id"`
	Title        string                 `json:"title"`
	Summary      string                 `json:"summary"`
	Fields       []FieldDefinition      `json:"fields"`
	Observations ObservationReference   `json:"observations"`
	Artifacts    []ArtifactReference    `json:"artifacts"`
	Relations    []ArtifactRelation     `json:"relations"`
	Presentation ExperimentPresentation `json:"presentation"`
	Provenance   Provenance             `json:"provenance"`
}

type ObservationSource struct {
	Version      int           `json:"version"`
	ExperimentID string        `json:"experimentId"`
	Observations []Observation `json:"observations"`
}

type Observation struct {
	ID     string                     `json:"id"`
	Values map[string]json.RawMessage `json:"values"`
}

type FieldFilter struct {
	FieldID  string            `json:"fieldId"`
	Operator string            `json:"operator"`
	Values   []json.RawMessage `json:"values"`
	Minimum  *float64          `json:"minimum"`
	Maximum  *float64          `json:"maximum"`
}

type ArtifactRange struct {
	ID             string  `json:"id"`
	ArtifactID     string  `json:"artifactId"`
	ArtifactSHA256 string  `json:"artifactSha256"`
	AxisID         string  `json:"axisId"`
	Start          float64 `json:"start"`
	End            float64 `json:"end"`
}

type AnnotationPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type AnnotationStroke struct {
	Points []AnnotationPoint `json:"points"`
}

type SelectionAnnotation struct {
	ID             string             `json:"id"`
	Kind           string             `json:"kind"`
	Intent         string             `json:"intent"`
	Text           string             `json:"text"`
	SectionID      *string            `json:"sectionId"`
	ViewID         *string            `json:"viewId"`
	ObservationIDs []string           `json:"observationIds"`
	ArtifactID     *string            `json:"artifactId"`
	ArtifactSHA256 *string            `json:"artifactSha256"`
	RangeID        *string            `json:"rangeId"`
	Filters        []FieldFilter      `json:"filters"`
	ChartFieldIDs  []string           `json:"chartFieldIds"`
	Strokes        []AnnotationStroke `json:"strokes"`
}

type LensSelection struct {
	Filters                []FieldFilter         `json:"filters"`
	FocusedObservationID   *string               `json:"focusedObservationId"`
	SelectedObservationIDs []string              `json:"selectedObservationIds"`
	SelectedArtifactIDs    []string              `json:"selectedArtifactIds"`
	Ranges                 []ArtifactRange       `json:"ranges"`
	Annotations            []SelectionAnnotation `json:"annotations"`
}

type LensMutation struct {
	ExperimentID            string        `json:"experimentId"`
	ManifestSHA256          string        `json:"manifestSha256"`
	ObservationSourceSHA256 string        `json:"observationSourceSha256"`
	ExpectedRevision        uint64        `json:"expectedRevision"`
	Selection               LensSelection `json:"selection"`
}

type SeriesAxis struct {
	ID    string  `json:"id"`
	Label string  `json:"label"`
	Unit  *string `json:"unit"`
}

type SeriesDefinition struct {
	ID    string  `json:"id"`
	Label string  `json:"label"`
	Unit  *string `json:"unit"`
}

type SeriesSample struct {
	X      float64             `json:"x"`
	Values map[string]*float64 `json:"values"`
}

type SeriesDocument struct {
	SchemaVersion string             `json:"schemaVersion"`
	Axis          SeriesAxis         `json:"axis"`
	Series        []SeriesDefinition `json:"series"`
	Samples       []SeriesSample     `json:"samples"`
}

type StructuredError struct {
	Code       string  `json:"code"`
	Message    string  `json:"message"`
	Field      *string `json:"field"`
	ArtifactID *string `json:"artifactId"`
}

type ResolvedArtifactContent struct {
	Kind       string          `json:"kind"`
	Text       *string         `json:"text,omitempty"`
	Truncated  *bool           `json:"truncated,omitempty"`
	JSON       json.RawMessage `json:"json,omitempty"`
	Series     *SeriesDocument `json:"series,omitempty"`
	Route      *string         `json:"route,omitempty"`
	Inline     *bool           `json:"inline,omitempty"`
	MediaType  *string         `json:"mediaType,omitempty"`
	ByteLength *int64          `json:"byteLength,omitempty"`
	SHA256     *string         `json:"sha256,omitempty"`
}

type ResolvedArtifact struct {
	Reference ArtifactReference        `json:"reference"`
	Status    string                   `json:"status"`
	Content   *ResolvedArtifactContent `json:"content"`
	Error     *StructuredError         `json:"error"`
}

type LensSnapshot struct {
	Version                 int                `json:"version"`
	ManifestPath            string             `json:"manifestPath"`
	ManifestSHA256          string             `json:"manifestSha256"`
	ObservationSourcePath   string             `json:"observationSourcePath"`
	ObservationSourceSHA256 string             `json:"observationSourceSha256"`
	Experiment              ExperimentManifest `json:"experiment"`
	Observations            []Observation      `json:"observations"`
	Artifacts               []ResolvedArtifact `json:"artifacts"`
	Revision                uint64             `json:"revision"`
	Selection               LensSelection      `json:"selection"`
}

type SourceIdentity struct {
	ManifestPath            string `json:"manifestPath"`
	ManifestSHA256          string `json:"manifestSha256"`
	ObservationSourcePath   string `json:"observationSourcePath"`
	ObservationSourceSHA256 string `json:"observationSourceSha256"`
}

type PacketExperiment struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Summary string `json:"summary"`
}

type SelectionPacket struct {
	Version      int                 `json:"version"`
	ID           string              `json:"id"`
	Experiment   PacketExperiment    `json:"experiment"`
	Source       SourceIdentity      `json:"source"`
	Revision     uint64              `json:"revision"`
	Selection    LensSelection       `json:"selection"`
	Observations []Observation       `json:"observations"`
	Artifacts    []ArtifactReference `json:"artifacts"`
}

type MutationResult struct {
	Version  int          `json:"version"`
	Snapshot LensSnapshot `json:"snapshot"`
}

type ExportResult struct {
	Version int             `json:"version"`
	Packet  SelectionPacket `json:"packet"`
}
