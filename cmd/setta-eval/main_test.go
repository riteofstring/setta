package main

import (
	"context"
	"strings"
	"testing"

	"setta/internal/evalharness"
)

func TestRunPassesExplicitInputsAndReportsArtifacts(t *testing.T) {
	var received evalharness.EvaluationConfig
	runner := func(
		_ context.Context,
		config evalharness.EvaluationConfig,
	) (evalharness.EvaluationOutput, error) {
		received = config
		return phase1CommandOutput(evalharness.ScenarioClassificationPass), nil
	}
	var stdout strings.Builder
	var stderr strings.Builder
	exitCode := run([]string{
		"--repo-root", "/repo",
		"--recordings-root", "/recordings",
		"--codex-linux-bundle", "/bundle",
		"--docker", "/usr/local/bin/docker",
		"--codex", "/usr/local/bin/codex",
		"--pnpm", "/usr/local/bin/pnpm",
		"--scenario", "mid-run-steering",
		"--scenario", "queue-then-cancel",
		"--candidate", "evals/models/director-alternative.json",
	}, &stdout, &stderr, runner)
	if exitCode != 0 {
		t.Fatalf("exit code = %d, stderr = %q", exitCode, stderr.String())
	}
	assertReceivedEvaluationConfig(t, received)
	assertEvaluationCommandOutput(t, stdout.String())
}

func assertReceivedEvaluationConfig(t *testing.T, received evalharness.EvaluationConfig) {
	t.Helper()
	if received.RepoRoot != "/repo" || received.RecordingsRoot != "/recordings" ||
		received.CodexLinuxBundle != "/bundle" ||
		received.DockerCommand != "/usr/local/bin/docker" ||
		received.CodexCommand != "/usr/local/bin/codex" ||
		received.PNPMCommand != "/usr/local/bin/pnpm" ||
		received.CandidatePath != "evals/models/director-alternative.json" ||
		len(received.ScenarioIDs) != 2 || received.ScenarioIDs[0] != "mid-run-steering" ||
		received.ScenarioIDs[1] != "queue-then-cancel" {
		t.Fatalf("received config = %#v", received)
	}
}

func assertEvaluationCommandOutput(t *testing.T, output string) {
	t.Helper()
	want := []string{
		"straightforward-task: first=pass/pass; stability=PASS",
		"Results: /recordings/run/results.json",
		"Manifest: /recordings/run/manifest.json",
		"Events: /recordings/run/events.jsonl",
		"Transcript: /recordings/run/transcript.json",
		"Token usage: /recordings/run/token-usage.json",
		"Verifier results: /recordings/run/verifier-results.json",
		"Judge results: /recordings/run/judge-results.json",
		"Prompt genericity: score=100/100; pass=true",
		"Prompt genericity evidence: /recordings/run/prompt-genericity.json",
		"Report: /recordings/run/report.md",
	}
	for _, expected := range want {
		if !strings.Contains(output, expected) {
			t.Fatalf("stdout omitted %q: %q", expected, output)
		}
	}
}

func TestRunReturnsFailureForObjectiveEvaluationFailure(t *testing.T) {
	for _, classification := range []evalharness.ScenarioClassification{
		evalharness.ScenarioClassificationAbilityFailure,
		evalharness.ScenarioClassificationControlFailure,
		evalharness.ScenarioClassificationTimeout,
		evalharness.ScenarioClassificationInfrastructureFailure,
	} {
		t.Run(string(classification), func(t *testing.T) {
			runner := func(
				_ context.Context,
				_ evalharness.EvaluationConfig,
			) (evalharness.EvaluationOutput, error) {
				return phase1CommandOutput(classification), nil
			}
			var stdout strings.Builder
			var stderr strings.Builder
			if exitCode := run(nil, &stdout, &stderr, runner); exitCode != 1 {
				t.Fatalf("exit code = %d, want 1", exitCode)
			}
			if !strings.Contains(stderr.String(), "did not pass ability, user control, communication, and prompt genericity") {
				t.Fatalf("stderr = %q", stderr.String())
			}
		})
	}
}

func TestRunReturnsFailureForCommunicationEvaluationFailure(t *testing.T) {
	runner := func(
		_ context.Context,
		_ evalharness.EvaluationConfig,
	) (evalharness.EvaluationOutput, error) {
		output := phase1CommandOutput(evalharness.ScenarioClassificationPass)
		output.JudgeResults.Scenarios[0].Verdict.OverallPass = false
		output.Results.Scenarios[0].Stability = evalharness.ScenarioStabilityStableFail
		output.Results.Scenarios[0].FirstAttempt.Status = evalharness.ScenarioAttemptStatusFail
		return output, nil
	}
	var stdout strings.Builder
	var stderr strings.Builder
	if exitCode := run(nil, &stdout, &stderr, runner); exitCode != 1 {
		t.Fatalf("exit code = %d, want 1", exitCode)
	}
	if !strings.Contains(stderr.String(), "did not pass ability, user control, communication, and prompt genericity") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestRunReturnsFailureForPromptGenericityFailure(t *testing.T) {
	runner := func(
		_ context.Context,
		_ evalharness.EvaluationConfig,
	) (evalharness.EvaluationOutput, error) {
		output := phase1CommandOutput(evalharness.ScenarioClassificationPass)
		output.PromptGenericity.Verdict.Score = 80
		output.PromptGenericity.Verdict.OverallPass = false
		return output, nil
	}
	var stdout strings.Builder
	var stderr strings.Builder
	if exitCode := run(nil, &stdout, &stderr, runner); exitCode != 1 {
		t.Fatalf("exit code = %d, want 1", exitCode)
	}
	if !strings.Contains(stderr.String(), "prompt genericity") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestRunHelpDoesNotStartEvaluation(t *testing.T) {
	called := false
	runner := func(
		_ context.Context,
		_ evalharness.EvaluationConfig,
	) (evalharness.EvaluationOutput, error) {
		called = true
		return evalharness.EvaluationOutput{}, nil
	}
	var stdout strings.Builder
	var stderr strings.Builder
	if exitCode := run([]string{"--help"}, &stdout, &stderr, runner); exitCode != 0 {
		t.Fatalf("exit code = %d, stderr = %q", exitCode, stderr.String())
	}
	if called {
		t.Fatal("evaluation started for --help")
	}
	if !strings.Contains(stderr.String(), "-pnpm") ||
		strings.Contains(stderr.String(), "toolchain-image-id") {
		t.Fatalf("help output = %q", stderr.String())
	}
}

func phase1CommandOutput(
	classification evalharness.ScenarioClassification,
) evalharness.EvaluationOutput {
	outcome := evalharness.ScenarioExecutionCompleted
	switch classification {
	case evalharness.ScenarioClassificationControlFailure:
		outcome = evalharness.ScenarioExecutionControlFailed
	case evalharness.ScenarioClassificationTimeout:
		outcome = evalharness.ScenarioExecutionTimedOut
	case evalharness.ScenarioClassificationInfrastructureFailure:
		outcome = evalharness.ScenarioExecutionInfrastructureFailed
	}
	status := evalharness.ScenarioAttemptStatusFail
	stability := evalharness.ScenarioStabilityStableFail
	if classification == evalharness.ScenarioClassificationPass {
		status = evalharness.ScenarioAttemptStatusPass
		stability = evalharness.ScenarioStabilityPass
	} else if classification == evalharness.ScenarioClassificationInfrastructureFailure {
		status = evalharness.ScenarioAttemptStatusInfrastructureFailure
		stability = evalharness.ScenarioStabilityInfrastructureFailure
	}
	return evalharness.EvaluationOutput{
		Results: evalharness.Results{
			Scenarios: []evalharness.ScenarioEvaluationResult{{
				ScenarioID: evalharness.ScenarioVerifierStraightforward,
				Stability:  stability,
				FirstAttempt: evalharness.ScenarioResult{
					ScenarioID:       evalharness.ScenarioVerifierStraightforward,
					Attempt:          evalharness.EvaluationAttemptFirst,
					Status:           status,
					Classification:   classification,
					ExecutionOutcome: outcome,
				},
			}},
		},
		JudgeResults: evalharness.JudgeArtifact{
			Scenarios: []evalharness.ScenarioJudgeResult{{
				ScenarioID:        evalharness.ScenarioVerifierStraightforward,
				Attempt:           evalharness.EvaluationAttemptFirst,
				EvidenceAvailable: true,
				Verdict: &evalharness.CommunicationJudgeVerdict{
					OverallPass: true,
				},
			}},
		},
		PromptGenericity: evalharness.PromptGenericityArtifact{
			Verdict: evalharness.PromptGenericityVerdict{
				Score:       100,
				OverallPass: true,
			},
		},
		Artifacts: evalharness.ResultArtifactPaths{
			Directory:            "/recordings/run",
			ManifestJSON:         "/recordings/run/manifest.json",
			EventsJSONL:          "/recordings/run/events.jsonl",
			TranscriptJSON:       "/recordings/run/transcript.json",
			ResultsJSON:          "/recordings/run/results.json",
			TokenUsageJSON:       "/recordings/run/token-usage.json",
			VerifierResultsJSON:  "/recordings/run/verifier-results.json",
			JudgeResultsJSON:     "/recordings/run/judge-results.json",
			PromptGenericityJSON: "/recordings/run/prompt-genericity.json",
			ReportMarkdown:       "/recordings/run/report.md",
		},
	}
}
