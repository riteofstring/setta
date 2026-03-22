package projectstate

import (
	"reflect"
	"testing"

	"setta/internal/pythonsdkcontracts"
)

func TestBuildRunnerSummarySnapshotReturnsRunnerFacingLookupData(t *testing.T) {
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				SectionVariantMap: map[string]string{
					"notes-section":    "notes-variant",
					"training-section": "training-variant-base",
				},
				Sections: map[string]Section{
					"training-section": {
						ID:               "training-section",
						Name:             "Training",
						DisplayName:      "Training Settings",
						VariantIDs:       []string{"training-variant-base", "training-variant-accurate"},
						DefaultVariantID: "training-variant-base",
					},
					"notes-section": {
						ID:               "notes-section",
						Name:             "Notes",
						DisplayName:      "Overview Notes",
						VariantIDs:       []string{"notes-variant"},
						DefaultVariantID: "notes-variant",
					},
				},
				SectionVariants: map[string]SectionVariant{
					"training-variant-base": {
						ID:     "training-variant-base",
						Name:   "Baseline",
						ImplID: "training-impl",
					},
					"training-variant-accurate": {
						ID:     "training-variant-accurate",
						Name:   "High Accuracy",
						ImplID: "training-impl",
					},
					"notes-variant": {
						ID:     "notes-variant",
						Name:   "Notes Variant",
						ImplID: "notes-impl",
					},
				},
				SectionImpls: map[string]SectionImpl{
					"training-impl": {
						ID:      "training-impl",
						Kind:    SectionKind("dict"),
						Payload: RawJSON(`{"id":"training-impl","type":"Dict","codeObjVariantMap":{"learning-rate":"learning-rate-variant","training-root":"training-root-variant"}}`),
					},
					"notes-impl": {
						ID:      "notes-impl",
						Kind:    SectionKind("text_block"),
						Payload: RawJSON(`{"id":"notes-impl","type":"TextBlock","text":"Notes"}`),
					},
				},
				CodeObjs: map[string]CodeObject{
					"training-root": {
						ID:               "training-root",
						Name:             "training_root",
						DisplayName:      "Training Root",
						VariantIDs:       []string{"training-root-variant"},
						DefaultVariantID: "training-root-variant",
					},
					"learning-rate": {
						ID:               "learning-rate",
						Name:             "learning_rate",
						DisplayName:      "Learning Rate",
						VariantIDs:       []string{"learning-rate-variant"},
						DefaultVariantID: "learning-rate-variant",
					},
				},
				CodeObjVariants: map[string]CodeObjectVariant{
					"training-root-variant": {
						ID:     "training-root-variant",
						ImplID: "training-root-impl",
					},
					"learning-rate-variant": {
						ID:     "learning-rate-variant",
						ImplID: "learning-rate-impl",
					},
				},
				CodeObjImpls: map[string]CodeObjectImpl{
					"training-root-impl": {
						ID:      "training-root-impl",
						Type:    "NestedParam",
						Payload: RawJSON(`{"id":"training-root-impl","type":"NestedParam","children":["learning-rate"]}`),
					},
					"learning-rate-impl": {
						ID:      "learning-rate-impl",
						Type:    "TextParam",
						Payload: RawJSON(`{"id":"learning-rate-impl","type":"TextParam","value":"0.001"}`),
					},
				},
			},
		},
	}

	snapshot, err := BuildRunnerSummarySnapshot(document, "project-alpha")
	if err != nil {
		t.Fatalf("build runner summary snapshot: %v", err)
	}

	expected := pythonsdkcontracts.RunnerSummarySnapshot{
		ProjectConfigID: "project-alpha",
		Sections: []pythonsdkcontracts.RunnerSummarySection{
			{
				ID:             "notes-section",
				Name:           "Notes",
				DisplayName:    stringPointerForRunnerSummaryTest("Overview Notes"),
				SupportsParams: false,
				Variants: []pythonsdkcontracts.RunnerSummaryVariant{
					{ID: "notes-variant", Name: "Notes Variant"},
				},
			},
			{
				ID:             "training-section",
				Name:           "Training",
				DisplayName:    stringPointerForRunnerSummaryTest("Training Settings"),
				SupportsParams: true,
				Variants: []pythonsdkcontracts.RunnerSummaryVariant{
					{ID: "training-variant-base", Name: "Baseline"},
					{ID: "training-variant-accurate", Name: "High Accuracy"},
				},
				Params: []pythonsdkcontracts.RunnerSummaryParam{
					{ID: "learning-rate", Name: "learning_rate", DisplayName: stringPointerForRunnerSummaryTest("Learning Rate")},
					{ID: "training-root", Name: "training_root", DisplayName: stringPointerForRunnerSummaryTest("Training Root")},
				},
			},
		},
	}
	if !reflect.DeepEqual(snapshot, expected) {
		t.Fatalf("unexpected runner summary snapshot:\nwant %#v\n got %#v", expected, snapshot)
	}
}

func TestBuildRunnerSummarySnapshotRejectsUnknownProject(t *testing.T) {
	document := Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects:      map[string]Project{},
	}

	if _, err := BuildRunnerSummarySnapshot(document, "missing-project"); err == nil {
		t.Fatal("expected missing project error")
	}
}

func stringPointerForRunnerSummaryTest(value string) *string {
	return &value
}
