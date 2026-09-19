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

type ExperimentManifest struct {
	Version      int                  `json:"version"`
	ID           string               `json:"id"`
	Title        string               `json:"title"`
	Summary      string               `json:"summary"`
	Fields       []FieldDefinition    `json:"fields"`
	Observations ObservationReference `json:"observations"`
	Artifacts    []ArtifactReference  `json:"artifacts"`
	Relations    []ArtifactRelation   `json:"relations"`
	Provenance   Provenance           `json:"provenance"`
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

type SelectionNote struct {
	ID             string  `json:"id"`
	Text           string  `json:"text"`
	ObservationID  *string `json:"observationId"`
	ArtifactID     *string `json:"artifactId"`
	ArtifactSHA256 *string `json:"artifactSha256"`
	RangeID        *string `json:"rangeId"`
}

type LensSelection struct {
	Filters                []FieldFilter   `json:"filters"`
	FocusedObservationID   *string         `json:"focusedObservationId"`
	SelectedObservationIDs []string        `json:"selectedObservationIds"`
	SelectedArtifactIDs    []string        `json:"selectedArtifactIds"`
	Ranges                 []ArtifactRange `json:"ranges"`
	Notes                  []SelectionNote `json:"notes"`
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
