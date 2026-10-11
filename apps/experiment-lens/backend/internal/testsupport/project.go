package testsupport

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/contracts"
)

type Fixture struct {
	Root           string
	ManifestSHA256 string
	SourceSHA256   string
	SeriesSHA256   string
	ImageSHA256    string
}

func Write(root string) (Fixture, error) {
	if err := os.MkdirAll(filepath.Join(root, "data"), 0o755); err != nil {
		return Fixture{}, err
	}
	if err := os.MkdirAll(filepath.Join(root, "artifacts"), 0o755); err != nil {
		return Fixture{}, err
	}
	source := contracts.ObservationSource{
		Version: 1, ExperimentID: "battery-test",
		Observations: []contracts.Observation{
			{ID: "run-a", Values: values(map[string]any{"chemistry": "NMC", "temperature": 25, "retention": 0.91})},
			{ID: "run-b", Values: values(map[string]any{"chemistry": "LFP", "temperature": 45, "retention": 0.84})},
		},
	}
	sourceBytes, err := encode(source)
	if err != nil {
		return Fixture{}, err
	}
	series := contracts.SeriesDocument{
		SchemaVersion: "setta-series/v1",
		Axis:          contracts.SeriesAxis{ID: "elapsed", Label: "Elapsed", Unit: pointer("min")},
		Series:        []contracts.SeriesDefinition{{ID: "voltage", Label: "Voltage", Unit: pointer("V")}},
		Samples:       []contracts.SeriesSample{{X: 0, Values: map[string]*float64{"voltage": number(4.2)}}, {X: 1, Values: map[string]*float64{"voltage": number(4.0)}}},
	}
	seriesBytes, err := encode(series)
	if err != nil {
		return Fixture{}, err
	}
	imageBytes := []byte("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 2 2\"><rect width=\"2\" height=\"2\" fill=\"red\"/></svg>\n")
	sourceSHA := digest(sourceBytes)
	seriesSHA := digest(seriesBytes)
	imageSHA := digest(imageBytes)
	manifest := contracts.ExperimentManifest{
		Version: 1, ID: "battery-test", Title: "Battery test", Summary: "A compact experiment fixture.",
		Fields: []contracts.FieldDefinition{
			{ID: "chemistry", Label: "Chemistry", Description: "", Role: "factor", ValueType: "string", Nullable: false},
			{ID: "temperature", Label: "Temperature", Description: "", Role: "factor", ValueType: "number", Unit: pointer("°C"), Nullable: false},
			{ID: "retention", Label: "Retention", Description: "", Role: "metric", ValueType: "number", Unit: pointer("fraction"), Nullable: false},
		},
		Observations: contracts.ObservationReference{Path: "data/observations.json", ByteLength: int64(len(sourceBytes)), SHA256: sourceSHA},
		Artifacts: []contracts.ArtifactReference{
			{ID: "series-a", Label: "Charge trace", Path: "artifacts/series.json", MediaType: "application/vnd.setta.series+json", ByteLength: int64(len(seriesBytes)), SHA256: seriesSHA},
			{ID: "thermal-b", Label: "Thermal frame", Path: "artifacts/thermal.svg", MediaType: "image/svg+xml", ByteLength: int64(len(imageBytes)), SHA256: imageSHA},
		},
		Relations: []contracts.ArtifactRelation{
			{ObservationID: "run-a", ArtifactID: "series-a", Role: "trace", Timeline: nil},
			{ObservationID: "run-b", ArtifactID: "thermal-b", Role: "thermal-frame", Timeline: &contracts.TimelineCoordinate{AxisID: "elapsed", Value: 1}},
		},
		Presentation: contracts.ExperimentPresentation{
			InitialViewID: "overview",
			Sections: []contracts.PresentationSection{
				{ID: "cohort", Type: "facets", Title: "Cohort", FieldIDs: []string{"chemistry", "temperature"}},
				{ID: "population", Type: "scatter", Title: "Population", XFieldID: pointer("temperature"), YFieldID: pointer("retention"), ColorFieldID: pointer("chemistry")},
				{ID: "observations", Type: "table", Title: "Observations", FieldIDs: []string{"chemistry", "temperature", "retention"}},
				{ID: "trace", Type: "timeline", Title: "Trace", ArtifactRole: pointer("trace"), DetailFieldIDs: []string{"temperature", "retention"}},
				{ID: "frames", Type: "gallery", Title: "Thermal frames", ArtifactRoles: []string{"thermal-frame"}},
			},
			Views: []contracts.PresentationView{
				{ID: "overview", Name: "Overview", Viewport: contracts.PresentationViewport{X: 0, Y: 0, Zoom: 0.8}, Placements: []contracts.PresentationPlacement{
					{SectionID: "cohort", X: 40, Y: 40, Width: 1_200, Height: 240},
					{SectionID: "population", X: 40, Y: 320, Width: 580, Height: 380},
					{SectionID: "observations", X: 660, Y: 320, Width: 580, Height: 380},
				}},
				{ID: "inspect", Name: "Inspect", Viewport: contracts.PresentationViewport{X: 0, Y: 0, Zoom: 0.8}, Placements: []contracts.PresentationPlacement{
					{SectionID: "observations", X: 40, Y: 40, Width: 1_200, Height: 320},
					{SectionID: "trace", X: 40, Y: 400, Width: 580, Height: 380},
					{SectionID: "frames", X: 660, Y: 400, Width: 580, Height: 380},
				}},
			},
		},
		Provenance: contracts.Provenance{
			Producer: contracts.ProducerIdentity{Kind: "application", Name: "test fixture"}, CreatedAt: "2026-09-19T12:00:00Z",
		},
	}
	manifestBytes, err := encode(manifest)
	if err != nil {
		return Fixture{}, err
	}
	for path, data := range map[string][]byte{
		filepath.Join(root, "data", "observations.json"): sourceBytes,
		filepath.Join(root, "artifacts", "series.json"):  seriesBytes,
		filepath.Join(root, "artifacts", "thermal.svg"):  imageBytes,
		filepath.Join(root, "experiment.json"):           manifestBytes,
	} {
		if err := os.WriteFile(path, data, 0o644); err != nil {
			return Fixture{}, err
		}
	}
	return Fixture{Root: root, ManifestSHA256: digest(manifestBytes), SourceSHA256: sourceSHA, SeriesSHA256: seriesSHA, ImageSHA256: imageSHA}, nil
}

func encode(value any) ([]byte, error) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

func values(input map[string]any) map[string]json.RawMessage {
	result := make(map[string]json.RawMessage, len(input))
	for key, value := range input {
		encoded, _ := json.Marshal(value)
		result[key] = encoded
	}
	return result
}

func digest(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func pointer(value string) *string {
	return &value
}

func number(value float64) *float64 {
	return &value
}
