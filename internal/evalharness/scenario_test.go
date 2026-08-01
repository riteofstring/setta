package evalharness

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestScenarioValidateCurrentContract(t *testing.T) {
	scenario := validTestScenario()
	if err := scenario.Validate(); err != nil {
		t.Fatalf("validate current scenario contract: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*Scenario)
		want   string
	}{
		{
			name: "schema",
			mutate: func(value *Scenario) {
				value.SchemaVersion++
			},
			want: "schemaVersion",
		},
		{
			name: "identifier",
			mutate: func(value *Scenario) {
				value.ID = "../escape"
			},
			want: "lowercase ASCII",
		},
		{
			name: "fixed timeout",
			mutate: func(value *Scenario) {
				value.TimeoutSeconds--
			},
			want: "current contract value",
		},
		{
			name: "step kind",
			mutate: func(value *Scenario) {
				value.Steps[0].Kind = "submit_when"
			},
			want: "kind",
		},
		{
			name: "clarification",
			mutate: func(value *Scenario) {
				value.Expect.Clarification = "allowed"
			},
			want: "clarification",
		},
		{
			name: "budget",
			mutate: func(value *Scenario) {
				value.Budget.HardTotalTokens = 0
			},
			want: "hardTotalTokens",
		},
		{
			name: "final result",
			mutate: func(value *Scenario) {
				value.Communication.FinalResultRequired = false
			},
			want: "finalResultRequired",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := validTestScenario()
			test.mutate(&candidate)
			err := candidate.Validate()
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Validate() error = %v, want substring %q", err, test.want)
			}
		})
	}
}

func TestLoadScenariosRejectsUnknownFieldsAndFilenameDrift(t *testing.T) {
	directory := t.TempDir()
	scenario := validTestScenario()
	writeTestScenario(t, filepath.Join(directory, "different-name.json"), scenario)

	if _, err := LoadScenarios(directory, nil); err == nil || !strings.Contains(err.Error(), "declares id") {
		t.Fatalf("filename drift error = %v", err)
	}

	unknownPath := filepath.Join(directory, scenario.ID+".json")
	if err := os.WriteFile(
		unknownPath,
		[]byte(`{"schemaVersion":1,"unknown":true}`),
		0o600,
	); err != nil {
		t.Fatalf("write unknown-field scenario: %v", err)
	}
	if _, err := LoadScenario(unknownPath); err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("unknown field error = %v", err)
	}
}

func TestLoadScenariosPreservesExplicitSelectionOrder(t *testing.T) {
	directory := t.TempDir()
	first := validTestScenario()
	first.ID = "first"
	second := validTestScenario()
	second.ID = "second"
	writeTestScenario(t, filepath.Join(directory, first.ID+".json"), first)
	writeTestScenario(t, filepath.Join(directory, second.ID+".json"), second)

	scenarios, err := LoadScenarios(directory, []string{second.ID, first.ID})
	if err != nil {
		t.Fatalf("load selected scenarios: %v", err)
	}
	if len(scenarios) != 2 || scenarios[0].ID != second.ID || scenarios[1].ID != first.ID {
		t.Fatalf("selected scenarios = %#v", scenarios)
	}
	if _, err := LoadScenarios(directory, []string{first.ID, first.ID}); err == nil ||
		!strings.Contains(err.Error(), "repeated") {
		t.Fatalf("duplicate selection error = %v", err)
	}
}

func validTestScenario() Scenario {
	return Scenario{
		SchemaVersion:  ScenarioSchemaVersion,
		ID:             ScenarioVerifierStraightforward,
		Fixture:        ScenarioFixtureTypeScriptService,
		TimeoutSeconds: ScenarioTimeoutSeconds,
		Steps: []ScenarioStep{
			{
				Kind: ScenarioStepSubmit,
				Text: "Add the requested endpoint.",
			},
		},
		Expect: ScenarioExpectations{
			TerminalState: ScenarioTerminalCompleted,
			Clarification: ScenarioClarificationForbidden,
		},
		Verifier: ScenarioVerifierStraightforward,
		Budget: ScenarioBudget{
			HardTotalTokens: 50_000,
		},
		Communication: ScenarioCommunication{
			Progress:            ScenarioProgressWhenUseful,
			FinalResultRequired: true,
		},
	}
}

func writeTestScenario(t *testing.T, path string, scenario Scenario) {
	t.Helper()
	payload, err := json.Marshal(scenario)
	if err != nil {
		t.Fatalf("marshal scenario: %v", err)
	}
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		t.Fatalf("write scenario: %v", err)
	}
}
