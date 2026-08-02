package evalharness

import (
	"errors"
	"os"
	"strings"
	"testing"
	"time"
)

func TestEvaluationScenarioRerunsOnlyAnEvaluatedFailure(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 22, 30, 0, 0, time.UTC)
	timeout := mustTestDiagnostic(t, "scenario_timeout", "The scenario reached its runaway ceiling.")
	failedAttempts := []int{}
	run, err := runEvaluationScenarioWithRerun(
		validTestScenario(),
		func(attempt int) evaluationScenarioAttempt {
			failedAttempts = append(failedAttempts, attempt)
			return evaluationScenarioAttempt{
				attempt:    attempt,
				startedAt:  startedAt.Add(time.Duration(attempt-1) * time.Second),
				finishedAt: startedAt.Add(time.Duration(attempt) * time.Second),
				state: phase1RunState{
					outcome:    ScenarioExecutionTimedOut,
					roles:      validTestEvaluatedRoles(),
					diagnostic: timeout,
				},
			}
		},
	)
	if err != nil {
		t.Fatalf("run failed scenario with rerun: %v", err)
	}
	if len(failedAttempts) != EvaluationAttemptRerun || run.rerun == nil ||
		failedAttempts[0] != EvaluationAttemptFirst || failedAttempts[1] != EvaluationAttemptRerun {
		t.Fatalf("failed scenario attempts = %v, rerun = %#v", failedAttempts, run.rerun)
	}

	infrastructureAttempts := []int{}
	_, err = runEvaluationScenarioWithRerun(
		validTestScenario(),
		func(attempt int) evaluationScenarioAttempt {
			infrastructureAttempts = append(infrastructureAttempts, attempt)
			return evaluationScenarioAttempt{
				attempt:    attempt,
				startedAt:  startedAt,
				finishedAt: startedAt.Add(time.Second),
				state: phase1InfrastructureFailure(
					"docker_preflight_failed",
					errors.New("Docker Desktop is stopped"),
					nil,
				),
			}
		},
	)
	if err != nil {
		t.Fatalf("classify infrastructure attempt: %v", err)
	}
	if len(infrastructureAttempts) != 1 || infrastructureAttempts[0] != EvaluationAttemptFirst {
		t.Fatalf("infrastructure attempts = %v, want first attempt only", infrastructureAttempts)
	}
}

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
			scenario: first,
			firstAttempt: evaluationScenarioAttempt{
				attempt:    EvaluationAttemptFirst,
				startedAt:  startedAt,
				finishedAt: startedAt.Add(time.Second),
				state: phase1RunState{
					outcome:    ScenarioExecutionInfrastructureFailed,
					roles:      []EvaluatedRoleConfiguration{},
					diagnostic: firstDiagnostic,
				},
			},
		},
		{
			scenario: second,
			firstAttempt: evaluationScenarioAttempt{
				attempt:    EvaluationAttemptFirst,
				startedAt:  startedAt.Add(2 * time.Second),
				finishedAt: startedAt.Add(3 * time.Second),
				state: phase1RunState{
					outcome:    ScenarioExecutionInfrastructureFailed,
					roles:      []EvaluatedRoleConfiguration{},
					diagnostic: secondDiagnostic,
				},
			},
		},
	}
	finishedAt := startedAt.Add(4 * time.Second)
	manifest := validTestManifest(strings.Repeat("a", 40), startedAt, finishedAt, []EvaluatedRoleConfiguration{})
	manifest.Scenarios = append(
		manifest.Scenarios,
		validTestManifestScenario(second.ID, []EvaluatedRoleConfiguration{}),
	)
	output, err := publishEvaluation(
		t.TempDir(),
		manifest,
		runs,
		validTestPromptGenericityArtifact(t, first.ID, second.ID),
		startedAt,
		finishedAt,
	)
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
	if !strings.Contains(report, "First-attempt passes: **0/2**") {
		t.Fatalf("report omitted the first-attempt headline: %s", report)
	}
	for _, scenarioID := range []string{first.ID, second.ID} {
		if !strings.Contains(report, "| `"+scenarioID+"` | status=infrastructure_failure") ||
			!strings.Contains(report, "| INFRASTRUCTURE_FAILURE |") {
			t.Fatalf("report omitted scenario %s: %s", scenarioID, report)
		}
	}
}
