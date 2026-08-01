package evalharness

import (
	"os"
	"strings"
	"testing"
	"time"
)

func TestPublishEvaluationWritesOneOrderedMultiScenarioArtifactSet(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 23, 0, 0, 0, time.UTC)
	first := validTestScenario()
	second := validTestScenario()
	second.ID = ScenarioVerifierApparentAmbiguity
	second.Verifier = ScenarioVerifierApparentAmbiguity
	if err := second.Validate(); err != nil {
		t.Fatalf("validate second scenario: %v", err)
	}
	firstDiagnostic := mustTestDiagnostic(t, "docker_unavailable", "Docker Desktop is stopped.")
	secondDiagnostic := mustTestDiagnostic(t, "provider_unavailable", "The provider boundary is unavailable.")
	runs := []evaluationScenarioRun{
		{
			scenario:   first,
			startedAt:  startedAt,
			finishedAt: startedAt.Add(time.Second),
			state: phase1RunState{
				outcome:    ScenarioExecutionInfrastructureFailed,
				roles:      []EvaluatedRoleConfiguration{},
				diagnostic: firstDiagnostic,
			},
		},
		{
			scenario:   second,
			startedAt:  startedAt.Add(2 * time.Second),
			finishedAt: startedAt.Add(3 * time.Second),
			state: phase1RunState{
				outcome:    ScenarioExecutionInfrastructureFailed,
				roles:      []EvaluatedRoleConfiguration{},
				diagnostic: secondDiagnostic,
			},
		},
	}
	finishedAt := startedAt.Add(4 * time.Second)
	manifest := validTestManifest(strings.Repeat("a", 40), startedAt, finishedAt, []EvaluatedRoleConfiguration{})
	manifest.Scenarios = append(
		manifest.Scenarios,
		validTestManifestScenario(second.ID, []EvaluatedRoleConfiguration{}),
	)
	output, err := publishEvaluation(t.TempDir(), manifest, runs, startedAt, finishedAt)
	if err != nil {
		t.Fatalf("publish multi-scenario evaluation: %v", err)
	}
	if len(output.Results.Scenarios) != 2 ||
		output.Results.Scenarios[0].ScenarioID != first.ID ||
		output.Results.Scenarios[1].ScenarioID != second.ID ||
		len(output.JudgeResults.Scenarios) != 2 {
		t.Fatalf("published scenarios = %#v", output.Results.Scenarios)
	}
	payload, err := os.ReadFile(output.Artifacts.ReportMarkdown)
	if err != nil {
		t.Fatalf("read multi-scenario report: %v", err)
	}
	report := string(payload)
	for _, scenarioID := range []string{first.ID, second.ID} {
		if !strings.Contains(report, "| `"+scenarioID+"` | infrastructure_failure |") {
			t.Fatalf("report omitted scenario %s: %s", scenarioID, report)
		}
	}
}
