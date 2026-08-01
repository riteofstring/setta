package main

import (
	"context"
	"strings"
	"testing"

	"setta/internal/evalharness"
)

func TestRunPassesExplicitInputsAndReportsArtifacts(t *testing.T) {
	var received evalharness.Phase1EvaluationConfig
	runner := func(
		_ context.Context,
		config evalharness.Phase1EvaluationConfig,
	) (evalharness.Phase1EvaluationOutput, error) {
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
	}, &stdout, &stderr, runner)
	if exitCode != 0 {
		t.Fatalf("exit code = %d, stderr = %q", exitCode, stderr.String())
	}
	if received.RepoRoot != "/repo" || received.RecordingsRoot != "/recordings" ||
		received.CodexLinuxBundle != "/bundle" ||
		received.DockerCommand != "/usr/local/bin/docker" ||
		received.CodexCommand != "/usr/local/bin/codex" ||
		received.PNPMCommand != "/usr/local/bin/pnpm" {
		t.Fatalf("received config = %#v", received)
	}
	if !strings.Contains(stdout.String(), "straightforward-task: pass (completed)") ||
		!strings.Contains(stdout.String(), "Results: /recordings/run/results.json") ||
		!strings.Contains(stdout.String(), "Manifest: /recordings/run/manifest.json") ||
		!strings.Contains(stdout.String(), "Events: /recordings/run/events.jsonl") ||
		!strings.Contains(stdout.String(), "Transcript: /recordings/run/transcript.json") ||
		!strings.Contains(stdout.String(), "Token usage: /recordings/run/token-usage.json") ||
		!strings.Contains(stdout.String(), "Verifier results: /recordings/run/verifier-results.json") ||
		!strings.Contains(stdout.String(), "Judge results: /recordings/run/judge-results.json") ||
		!strings.Contains(stdout.String(), "Report: /recordings/run/report.md") {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestRunReturnsFailureForObjectiveEvaluationFailure(t *testing.T) {
	for _, classification := range []evalharness.ScenarioClassification{
		evalharness.ScenarioClassificationAbilityFailure,
		evalharness.ScenarioClassificationTimeout,
		evalharness.ScenarioClassificationInfrastructureFailure,
	} {
		t.Run(string(classification), func(t *testing.T) {
			runner := func(
				_ context.Context,
				_ evalharness.Phase1EvaluationConfig,
			) (evalharness.Phase1EvaluationOutput, error) {
				return phase1CommandOutput(classification), nil
			}
			var stdout strings.Builder
			var stderr strings.Builder
			if exitCode := run(nil, &stdout, &stderr, runner); exitCode != 1 {
				t.Fatalf("exit code = %d, want 1", exitCode)
			}
			if !strings.Contains(stderr.String(), "did not pass ability and communication") {
				t.Fatalf("stderr = %q", stderr.String())
			}
		})
	}
}

func TestRunReturnsFailureForCommunicationEvaluationFailure(t *testing.T) {
	runner := func(
		_ context.Context,
		_ evalharness.Phase1EvaluationConfig,
	) (evalharness.Phase1EvaluationOutput, error) {
		output := phase1CommandOutput(evalharness.ScenarioClassificationPass)
		output.JudgeResults.Scenarios[0].Verdict.OverallPass = false
		return output, nil
	}
	var stdout strings.Builder
	var stderr strings.Builder
	if exitCode := run(nil, &stdout, &stderr, runner); exitCode != 1 {
		t.Fatalf("exit code = %d, want 1", exitCode)
	}
	if !strings.Contains(stderr.String(), "did not pass ability and communication") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestRunHelpDoesNotStartEvaluation(t *testing.T) {
	called := false
	runner := func(
		_ context.Context,
		_ evalharness.Phase1EvaluationConfig,
	) (evalharness.Phase1EvaluationOutput, error) {
		called = true
		return evalharness.Phase1EvaluationOutput{}, nil
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
) evalharness.Phase1EvaluationOutput {
	outcome := evalharness.ScenarioExecutionCompleted
	switch classification {
	case evalharness.ScenarioClassificationTimeout:
		outcome = evalharness.ScenarioExecutionTimedOut
	case evalharness.ScenarioClassificationInfrastructureFailure:
		outcome = evalharness.ScenarioExecutionInfrastructureFailed
	}
	return evalharness.Phase1EvaluationOutput{
		Results: evalharness.Results{
			Scenarios: []evalharness.ScenarioResult{{
				ScenarioID:       evalharness.ScenarioVerifierStraightforward,
				Classification:   classification,
				ExecutionOutcome: outcome,
			}},
		},
		JudgeResults: evalharness.JudgeArtifact{
			Scenarios: []evalharness.ScenarioJudgeResult{{
				ScenarioID:        evalharness.ScenarioVerifierStraightforward,
				EvidenceAvailable: true,
				Verdict: &evalharness.CommunicationJudgeVerdict{
					OverallPass: true,
				},
			}},
		},
		Artifacts: evalharness.ResultArtifactPaths{
			Directory:           "/recordings/run",
			ManifestJSON:        "/recordings/run/manifest.json",
			EventsJSONL:         "/recordings/run/events.jsonl",
			TranscriptJSON:      "/recordings/run/transcript.json",
			ResultsJSON:         "/recordings/run/results.json",
			TokenUsageJSON:      "/recordings/run/token-usage.json",
			VerifierResultsJSON: "/recordings/run/verifier-results.json",
			JudgeResultsJSON:    "/recordings/run/judge-results.json",
			ReportMarkdown:      "/recordings/run/report.md",
		},
	}
}
