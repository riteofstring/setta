package contracts

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestObservationSourceRequiresExactDeclaredFieldTypes(t *testing.T) {
	manifest := validManifest()
	source := ObservationSource{
		Version: 1, ExperimentID: manifest.ID,
		Observations: []Observation{{ID: "run-1", Values: map[string]json.RawMessage{"score": json.RawMessage(`"high"`)}}},
	}
	if err := source.ValidateAgainst(manifest); err == nil || !strings.Contains(err.Error(), "number") {
		t.Fatalf("expected number validation failure, got %v", err)
	}
	source.Observations[0].Values["score"] = json.RawMessage(`0.9`)
	if err := source.ValidateAgainst(manifest); err != nil {
		t.Fatalf("expected valid source: %v", err)
	}
}

func TestMutationRequiresBothImmutableSourceDigests(t *testing.T) {
	mutation := LensMutation{
		ExperimentID: "experiment", ManifestSHA256: strings.Repeat("a", 64),
		ExpectedRevision: 0, Selection: EmptySelection(),
	}
	if err := mutation.Validate(); err == nil || !strings.Contains(err.Error(), "observation source digest") {
		t.Fatalf("expected observation digest failure, got %v", err)
	}
	mutation.ObservationSourceSHA256 = strings.Repeat("b", 64)
	if err := mutation.Validate(); err != nil {
		t.Fatalf("expected valid mutation: %v", err)
	}
}

func TestTimelineCoordinateAndSelectionReferencesAreValidated(t *testing.T) {
	relation := ArtifactRelation{
		ObservationID: "run-1", ArtifactID: "frame-1", Role: "thermal-frame",
		Timeline: &TimelineCoordinate{AxisID: "elapsed", Value: 1},
	}
	if err := relation.Validate(); err != nil {
		t.Fatalf("expected valid timeline: %v", err)
	}
	selection := EmptySelection()
	selection.SelectedObservationIDs = []string{"missing"}
	manifest := validManifest()
	source := ObservationSource{Version: 1, ExperimentID: manifest.ID, Observations: []Observation{{ID: "run-1", Values: map[string]json.RawMessage{"score": json.RawMessage(`0.9`)}}}}
	if err := selection.ValidateAgainst(manifest, source); err == nil || !strings.Contains(err.Error(), "unknown observation") {
		t.Fatalf("expected unknown observation failure, got %v", err)
	}
}

func TestPublicSchemaInventoryUsesLocalNamespace(t *testing.T) {
	schemas := PublicSchemas()
	expected := []string{"experimentManifest", "observationSource", "lensMutation", "lensSnapshot", "selectionPacket", "mutationResult", "exportResult", "structuredError", "series"}
	if len(schemas) != len(expected) {
		t.Fatalf("unexpected schema count %d", len(schemas))
	}
	for _, name := range expected {
		schema, exists := schemas[name]
		if !exists {
			t.Fatalf("missing schema %s", name)
		}
		id, ok := schema["$id"].(string)
		if !ok || !strings.HasPrefix(id, "https://setta.local/schemas/experiment-lens/") {
			t.Fatalf("unexpected schema id %v", schema["$id"])
		}
	}
}

func TestSeriesRejectsMissingValuesAndDescendingAxis(t *testing.T) {
	series := SeriesDocument{
		SchemaVersion: "setta-series/v1", Axis: SeriesAxis{ID: "time", Label: "Time"},
		Series:  []SeriesDefinition{{ID: "signal", Label: "Signal"}},
		Samples: []SeriesSample{{X: 1, Values: map[string]*float64{"signal": numberPointer(1)}}, {X: 0, Values: map[string]*float64{"signal": numberPointer(2)}}},
	}
	if err := series.Validate(); err == nil {
		t.Fatal("expected descending series axis to fail")
	}
}

func validManifest() ExperimentManifest {
	return ExperimentManifest{
		Version: 1, ID: "experiment", Title: "Experiment", Summary: "Experiment summary",
		Fields:       []FieldDefinition{{ID: "score", Label: "Score", Description: "", Role: "metric", ValueType: "number", Nullable: false}},
		Observations: ObservationReference{Path: "observations.json", ByteLength: 10, SHA256: strings.Repeat("a", 64)},
		Artifacts:    []ArtifactReference{}, Relations: []ArtifactRelation{},
		Provenance: Provenance{Producer: ProducerIdentity{Kind: "application", Name: "test"}, CreatedAt: "2026-09-19T12:00:00Z"},
	}
}

func numberPointer(value float64) *float64 {
	return &value
}
