package evalharness

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/director"
	evalverifier "setta/internal/evalharness/verifier"
)

func TestScenarioResultClassifiesObjectiveOutcomes(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 0, 0, 0, time.UTC)
	passingVerifier := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	failingVerifier := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: false, Detail: "Workspace failed."}},
		[]string{"README.md"},
	)
	timeoutDiagnostic := mustTestDiagnostic(t, "scenario_timeout", "The scenario reached its runaway ceiling.")
	executionDiagnostic := mustTestDiagnostic(t, "agent_turn_failed", "The Agent turn failed.")
	controlDiagnostic := mustTestDiagnostic(t, "director_stalled", "The Director stalled for another user turn.")
	infrastructureDiagnostic := mustTestDiagnostic(t, "docker_unavailable", "Docker Desktop is stopped.")

	tests := []struct {
		name           string
		outcome        ScenarioExecutionOutcome
		verifier       *evalverifier.Result
		diagnostic     *ScenarioDiagnostic
		roles          []EvaluatedRoleConfiguration
		classification ScenarioClassification
	}{
		{
			name:           "control failure",
			outcome:        ScenarioExecutionControlFailed,
			diagnostic:     controlDiagnostic,
			roles:          validTestEvaluatedRoles(),
			classification: ScenarioClassificationControlFailure,
		},
		{
			name:           "pass",
			outcome:        ScenarioExecutionCompleted,
			verifier:       &passingVerifier,
			roles:          validTestEvaluatedRoles(),
			classification: ScenarioClassificationPass,
		},
		{
			name:           "incorrect workspace",
			outcome:        ScenarioExecutionCompleted,
			verifier:       &failingVerifier,
			roles:          validTestEvaluatedRoles(),
			classification: ScenarioClassificationAbilityFailure,
		},
		{
			name:           "failed execution",
			outcome:        ScenarioExecutionFailed,
			diagnostic:     executionDiagnostic,
			roles:          validTestEvaluatedRoles(),
			classification: ScenarioClassificationAbilityFailure,
		},
		{
			name:           "timeout",
			outcome:        ScenarioExecutionTimedOut,
			diagnostic:     timeoutDiagnostic,
			roles:          validTestEvaluatedRoles(),
			classification: ScenarioClassificationTimeout,
		},
		{
			name:           "infrastructure",
			outcome:        ScenarioExecutionInfrastructureFailed,
			diagnostic:     infrastructureDiagnostic,
			roles:          []EvaluatedRoleConfiguration{},
			classification: ScenarioClassificationInfrastructureFailure,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			control := mustTestControlForOutcome(t, test.outcome, test.diagnostic)
			result, err := NewScenarioResult(ScenarioResultInput{
				Scenario:         validTestScenario(),
				Attempt:          EvaluationAttemptFirst,
				ExecutionOutcome: test.outcome,
				StartedAt:        startedAt,
				FinishedAt:       startedAt.Add(2 * time.Second),
				Roles:            test.roles,
				Control:          control,
				Verifier:         test.verifier,
				Diagnostic:       test.diagnostic,
			})
			if err != nil {
				t.Fatalf("classify scenario result: %v", err)
			}
			if result.Classification != test.classification {
				t.Fatalf("classification = %s, want %s", result.Classification, test.classification)
			}
			if err := result.Validate(); err != nil {
				t.Fatalf("validate classified result: %v", err)
			}
		})
	}
}

func TestScenarioResultUsesCommunicationEvidenceForAttemptStatus(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 15, 0, 0, time.UTC)
	verification := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	judgeResult := func(finalTruthful bool) ScenarioJudgeResult {
		return ScenarioJudgeResult{
			ScenarioID:        ScenarioVerifierStraightforward,
			Attempt:           EvaluationAttemptFirst,
			EvidenceAvailable: true,
			Invocation: &JudgeInvocation{
				ID:               "judge-attempt-status",
				ProviderThreadID: "judge-thread",
				ProviderTurnID:   "judge-turn",
			},
			Verdict: communicationJudgeVerdict(communicationJudgeChecks{
				ProgressSufficient:      true,
				ProgressRestrained:      true,
				QuestionsNecessary:      true,
				FinalTruthfulActionable: finalTruthful,
				InternalMechanicsHidden: true,
			}),
		}
	}
	unavailable, err := unavailableScenarioJudgeResult(
		ScenarioVerifierStraightforward,
		EvaluationAttemptFirst,
		nil,
	)
	if err != nil {
		t.Fatalf("create unavailable judge evidence: %v", err)
	}
	tests := []struct {
		name   string
		judge  ScenarioJudgeResult
		status ScenarioAttemptStatus
	}{
		{name: "pass", judge: judgeResult(true), status: ScenarioAttemptStatusPass},
		{name: "communication failure", judge: judgeResult(false), status: ScenarioAttemptStatusFail},
		{name: "judge unavailable", judge: unavailable, status: ScenarioAttemptStatusInfrastructureFailure},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result, err := NewScenarioResult(ScenarioResultInput{
				Scenario:         validTestScenario(),
				Attempt:          EvaluationAttemptFirst,
				ExecutionOutcome: ScenarioExecutionCompleted,
				StartedAt:        startedAt,
				FinishedAt:       startedAt.Add(time.Second),
				Roles:            validTestEvaluatedRoles(),
				Control:          validTestPassingControl(),
				Verifier:         &verification,
				Judge:            &test.judge,
			})
			if err != nil {
				t.Fatalf("classify completed attempt: %v", err)
			}
			if result.Status != test.status {
				t.Fatalf("attempt status = %s, want %s", result.Status, test.status)
			}
		})
	}
}

func TestScenarioEvaluationResultClassifiesFirstAttemptStability(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 30, 0, 0, time.UTC)
	passingVerifier := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	passingAttempt := func(attempt int, offset time.Duration) ScenarioResult {
		result, err := NewScenarioResult(ScenarioResultInput{
			Scenario:         validTestScenario(),
			Attempt:          attempt,
			ExecutionOutcome: ScenarioExecutionCompleted,
			StartedAt:        startedAt.Add(offset),
			FinishedAt:       startedAt.Add(offset + time.Second),
			Roles:            validTestEvaluatedRoles(),
			Control:          validTestPassingControl(),
			Verifier:         &passingVerifier,
			Judge: &ScenarioJudgeResult{
				ScenarioID:        ScenarioVerifierStraightforward,
				Attempt:           attempt,
				EvidenceAvailable: true,
				Invocation: &JudgeInvocation{
					ID:               "judge-stability",
					ProviderThreadID: "judge-thread",
					ProviderTurnID:   "judge-turn",
				},
				Verdict: communicationJudgeVerdict(communicationJudgeChecks{
					ProgressSufficient:      true,
					ProgressRestrained:      true,
					QuestionsNecessary:      true,
					FinalTruthfulActionable: true,
					InternalMechanicsHidden: true,
				}),
			},
		})
		if err != nil {
			t.Fatalf("create passing attempt %d: %v", attempt, err)
		}
		return result
	}
	failingAttempt := func(attempt int, offset time.Duration) ScenarioResult {
		diagnostic := mustTestDiagnostic(t, "scenario_timeout", "The scenario reached its runaway ceiling.")
		result, err := NewScenarioResult(ScenarioResultInput{
			Scenario:         validTestScenario(),
			Attempt:          attempt,
			ExecutionOutcome: ScenarioExecutionTimedOut,
			StartedAt:        startedAt.Add(offset),
			FinishedAt:       startedAt.Add(offset + time.Second),
			Roles:            validTestEvaluatedRoles(),
			Control:          mustTestControlForOutcome(t, ScenarioExecutionTimedOut, diagnostic),
			Diagnostic:       diagnostic,
		})
		if err != nil {
			t.Fatalf("create failing attempt %d: %v", attempt, err)
		}
		return result
	}

	firstPass := passingAttempt(EvaluationAttemptFirst, 0)
	passed, err := NewScenarioEvaluationResult(firstPass.ScenarioID, firstPass, nil)
	if err != nil || passed.Stability != ScenarioStabilityPass {
		t.Fatalf("pass stability = %s / %v", passed.Stability, err)
	}
	firstFail := failingAttempt(EvaluationAttemptFirst, 0)
	rerunFail := failingAttempt(EvaluationAttemptRerun, time.Second)
	stable, err := NewScenarioEvaluationResult(firstFail.ScenarioID, firstFail, &rerunFail)
	if err != nil || stable.Stability != ScenarioStabilityStableFail {
		t.Fatalf("stable-fail stability = %s / %v", stable.Stability, err)
	}
	rerunPass := passingAttempt(EvaluationAttemptRerun, time.Second)
	flaky, err := NewScenarioEvaluationResult(firstFail.ScenarioID, firstFail, &rerunPass)
	if err != nil || flaky.Stability != ScenarioStabilityFlaky {
		t.Fatalf("flaky stability = %s / %v", flaky.Stability, err)
	}

	infrastructure := firstFail
	infrastructure.ExecutionOutcome = ScenarioExecutionInfrastructureFailed
	infrastructure.Classification = ScenarioClassificationInfrastructureFailure
	infrastructure.Status = ScenarioAttemptStatusInfrastructureFailure
	infrastructure.Roles = []EvaluatedRoleConfiguration{}
	infrastructure.Control = mustTestControlForOutcome(
		t,
		ScenarioExecutionInfrastructureFailed,
		infrastructure.Diagnostic,
	)
	unavailable, err := NewScenarioEvaluationResult(
		infrastructure.ScenarioID,
		infrastructure,
		nil,
	)
	if err != nil || unavailable.Stability != ScenarioStabilityInfrastructureFailure {
		t.Fatalf("infrastructure stability = %s / %v", unavailable.Stability, err)
	}
}

func TestScenarioResultRejectsAmbiguousClassificationInputs(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 0, 0, 0, time.UTC)
	_, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         validTestScenario(),
		Attempt:          EvaluationAttemptFirst,
		ExecutionOutcome: ScenarioExecutionCompleted,
		StartedAt:        startedAt,
		FinishedAt:       startedAt.Add(time.Second),
		Roles:            validTestEvaluatedRoles(),
		Control:          validTestPassingControl(),
	})
	if err == nil || !strings.Contains(err.Error(), "requires a verifier") {
		t.Fatalf("missing verifier error = %v", err)
	}
	verifier := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	for _, outcome := range []ScenarioExecutionOutcome{
		ScenarioExecutionCancelled,
		ScenarioExecutionFailed,
	} {
		_, err := NewScenarioResult(ScenarioResultInput{
			Scenario:         validTestScenario(),
			Attempt:          EvaluationAttemptFirst,
			ExecutionOutcome: outcome,
			StartedAt:        startedAt,
			FinishedAt:       startedAt.Add(time.Second),
			Roles:            validTestEvaluatedRoles(),
			Control:          mustTestControlForOutcome(t, outcome, mustTestDiagnostic(t, "execution_failed", "Execution did not complete.")),
			Verifier:         &verifier,
			Diagnostic:       mustTestDiagnostic(t, "execution_failed", "Execution did not complete."),
		})
		if err == nil || !strings.Contains(err.Error(), "must not carry a verifier") {
			t.Fatalf("%s verifier error = %v", outcome, err)
		}
	}
}

func TestScenarioResultClassifiesPassingWorkspaceControlFailure(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 0, 0, 0, time.UTC)
	verification := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	control := validTestPassingControl()
	control.Passed = false
	control.Clarification.Passed = false
	result, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         validTestScenario(),
		Attempt:          EvaluationAttemptFirst,
		ExecutionOutcome: ScenarioExecutionCompleted,
		StartedAt:        startedAt,
		FinishedAt:       startedAt.Add(time.Second),
		Roles:            validTestEvaluatedRoles(),
		Control:          control,
		Verifier:         &verification,
	})
	if err != nil {
		t.Fatalf("classify control failure: %v", err)
	}
	if result.Classification != ScenarioClassificationControlFailure {
		t.Fatalf("classification = %s, want %s", result.Classification, ScenarioClassificationControlFailure)
	}
}

func TestScenarioResultRejectsInvalidRequestedRoleProfile(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 0, 0, 0, time.UTC)
	roles := validTestEvaluatedRoles()
	roles[0].Requested.ContextBudget.MaxInputBytes = 0
	verifier := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	_, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         validTestScenario(),
		Attempt:          EvaluationAttemptFirst,
		ExecutionOutcome: ScenarioExecutionCompleted,
		StartedAt:        startedAt,
		FinishedAt:       startedAt.Add(time.Second),
		Roles:            roles,
		Control:          validTestPassingControl(),
		Verifier:         &verifier,
	})
	if err == nil || !strings.Contains(err.Error(), "requested profile") {
		t.Fatalf("invalid requested profile error = %v", err)
	}
}

func TestCaptureBaselineRoleConfigurationsUsesWorkspaceEffectiveProfiles(t *testing.T) {
	global, workspace := validTestRoleConfigurations()
	roles, err := CaptureBaselineRoleConfigurations(global, workspace)
	if err != nil {
		t.Fatalf("capture baseline roles: %v", err)
	}
	if len(roles) != len(evaluatedRoleOrder) {
		t.Fatalf("captured roles = %d, want %d", len(roles), len(evaluatedRoleOrder))
	}
	for index, role := range roles {
		if role.Role != evaluatedRoleOrder[index] {
			t.Fatalf("captured role %d = %s, want %s", index, role.Role, evaluatedRoleOrder[index])
		}
	}
}

func TestWriteResultArtifactsPublishesValidatedSet(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 0, 0, 123, time.UTC)
	verifierResult := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	scenario, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         validTestScenario(),
		Attempt:          EvaluationAttemptFirst,
		ExecutionOutcome: ScenarioExecutionCompleted,
		StartedAt:        startedAt,
		FinishedAt:       startedAt.Add(1500 * time.Millisecond),
		Roles:            validTestEvaluatedRoles(),
		Control:          validTestPassingControl(),
		Verifier:         &verifierResult,
	})
	if err != nil {
		t.Fatalf("classify scenario: %v", err)
	}
	scenario.Status = ScenarioAttemptStatusPass
	evaluation, err := NewScenarioEvaluationResult(scenario.ScenarioID, scenario, nil)
	if err != nil {
		t.Fatalf("classify scenario stability: %v", err)
	}
	results, err := NewResults(
		strings.Repeat("a", 40),
		startedAt,
		startedAt.Add(2*time.Second),
		[]ScenarioEvaluationResult{evaluation},
	)
	if err != nil {
		t.Fatalf("build results: %v", err)
	}

	recordingsRoot := t.TempDir()
	judgeAttribution := testTokenAttribution(
		agent.TokenUsageBucketJudge,
		agent.TokenUsageRoleJudge,
		"artifact-judge",
		JudgeModel,
	)
	judgeAttribution.ReasoningEffort = JudgeReasoningEffort
	scenarioUsage, err := AggregateScenarioTokenUsage(scenario.ScenarioID, EvaluationAttemptFirst, []agent.TokenUsageObservation{
		testTokenObservation(
			testTokenAttribution(agent.TokenUsageBucketSystem, agent.TokenUsageRoleAgent, "artifact-agent", "gpt-agent"),
			"artifact-agent-thread",
			"artifact-agent-turn",
			42,
			30,
			12,
		),
		testTokenObservation(
			judgeAttribution,
			"artifact-judge-thread",
			"artifact-judge-turn",
			99,
			70,
			29,
		),
	})
	if err != nil {
		t.Fatalf("aggregate token usage: %v", err)
	}
	tokenUsage, err := NewTokenUsageArtifact([]ScenarioTokenUsage{scenarioUsage})
	if err != nil {
		t.Fatalf("build token usage: %v", err)
	}
	artifactSet := validTestArtifactSet(t, results, tokenUsage)
	assertArtifactSetRejectsMismatchedEvidence(t, artifactSet)
	paths, err := WriteResultArtifacts(recordingsRoot, artifactSet)
	if err != nil {
		t.Fatalf("write result artifacts: %v", err)
	}
	assertPublishedResultArtifacts(t, paths)
	assertPublishedResultReport(t, paths.ReportMarkdown)
	if _, err := WriteResultArtifacts(recordingsRoot, artifactSet); err == nil {
		t.Fatal("second artifact publication unexpectedly replaced the first")
	}
}

func assertArtifactSetRejectsMismatchedEvidence(
	t *testing.T,
	artifacts EvaluationArtifactSet,
) {
	t.Helper()
	t.Run("accounting event", func(t *testing.T) {
		mismatched := cloneTestArtifactSet(t, artifacts)
		for index := range mismatched.Events {
			if mismatched.Events[index].TokenUsage != nil {
				mismatched.Events[index].TokenUsage.TokenUsage.Total.TotalTokens++
				break
			}
		}
		assertArtifactSetValidationError(t, mismatched, "token artifact does not match accounting event evidence")
	})
	t.Run("judge invocation", func(t *testing.T) {
		mismatched := cloneTestArtifactSet(t, artifacts)
		mismatched.JudgeResults.Scenarios[0].Invocation.ID = "different-judge-invocation"
		assertArtifactSetValidationError(t, mismatched, "judge invocation does not match judge token evidence")
	})
	t.Run("judge configuration", func(t *testing.T) {
		mismatched := cloneTestArtifactSet(t, artifacts)
		observations := make([]agent.TokenUsageObservation, 0)
		for index := range mismatched.Events {
			observation := mismatched.Events[index].TokenUsage
			if observation == nil {
				continue
			}
			if observation.Attribution.Bucket == agent.TokenUsageBucketJudge {
				observation.Attribution.Model = "different-judge-model"
			}
			observations = append(observations, *observation)
		}
		usage, err := AggregateScenarioTokenUsage(
			mismatched.Results.Scenarios[0].ScenarioID,
			EvaluationAttemptFirst,
			observations,
		)
		if err != nil {
			t.Fatalf("aggregate altered token evidence: %v", err)
		}
		mismatched.TokenUsage.Scenarios[0] = usage
		assertArtifactSetValidationError(t, mismatched, "judge token evidence does not use the fixed judge configuration")
	})
	t.Run("prompt audit scenario", func(t *testing.T) {
		mismatched := cloneTestArtifactSet(t, artifacts)
		mismatched.PromptGenericity.Scenarios[0].ScenarioID = ScenarioVerifierApparentAmbiguity
		assertArtifactSetValidationError(t, mismatched, "prompt genericity audit omits evaluated scenario")
	})
	t.Run("public transcript", func(t *testing.T) {
		mismatched := cloneTestArtifactSet(t, artifacts)
		mismatched.Transcript.Scenarios[0].Entries[0].Text = "Complete a different fixture task."
		assertArtifactSetValidationError(t, mismatched, "transcript does not match public event evidence")
	})
	t.Run("attempt identity", func(t *testing.T) {
		mismatched := cloneTestArtifactSet(t, artifacts)
		mismatched.Transcript.Scenarios[0].Attempt = EvaluationAttemptRerun
		assertArtifactSetValidationError(t, mismatched, "identities do not match")
	})
	t.Run("first-attempt stability", func(t *testing.T) {
		mismatched := cloneTestArtifactSet(t, artifacts)
		mismatched.Results.Scenarios[0].Stability = ScenarioStabilityFlaky
		assertArtifactSetValidationError(t, mismatched, "stability is FLAKY, want PASS")
	})
	t.Run("control event reference", func(t *testing.T) {
		mismatched := cloneTestArtifactSet(t, artifacts)
		mismatched.Results.Scenarios[0].FirstAttempt.Control.Clarification.EvidenceEventSequences = []int{1}
		assertArtifactSetValidationError(t, mismatched, "does not match typed event evidence")
	})
	t.Run("token-only event log", func(t *testing.T) {
		mismatched := cloneTestArtifactSet(t, artifacts)
		tokenEvents := make([]EvaluationEvent, 0, len(mismatched.Events))
		for _, event := range mismatched.Events {
			if event.Kind != EvaluationEventTokenUsage {
				continue
			}
			event.Sequence = len(tokenEvents) + 1
			tokenEvents = append(tokenEvents, event)
		}
		mismatched.Events = tokenEvents
		assertArtifactSetValidationError(t, mismatched, "control event evidence is invalid")
	})
}

func cloneTestArtifactSet(t *testing.T, artifacts EvaluationArtifactSet) EvaluationArtifactSet {
	t.Helper()
	payload, err := json.Marshal(artifacts)
	if err != nil {
		t.Fatalf("encode artifact set clone: %v", err)
	}
	var cloned EvaluationArtifactSet
	if err := json.Unmarshal(payload, &cloned); err != nil {
		t.Fatalf("decode artifact set clone: %v", err)
	}
	return cloned
}

func assertArtifactSetValidationError(
	t *testing.T,
	artifacts EvaluationArtifactSet,
	want string,
) {
	t.Helper()
	err := artifacts.Validate()
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("artifact validation error = %v, want %q", err, want)
	}
}

func assertPublishedResultArtifacts(t *testing.T, paths ResultArtifactPaths) {
	t.Helper()
	payload, err := os.ReadFile(paths.ResultsJSON)
	if err != nil {
		t.Fatalf("read results artifact: %v", err)
	}
	var decoded Results
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode results artifact: %v", err)
	}
	if err := decoded.Validate(); err != nil {
		t.Fatalf("validate decoded results: %v", err)
	}
	tokenPayload, err := os.ReadFile(paths.TokenUsageJSON)
	if err != nil {
		t.Fatalf("read token usage artifact: %v", err)
	}
	var decodedTokens TokenUsageArtifact
	if err := json.Unmarshal(tokenPayload, &decodedTokens); err != nil {
		t.Fatalf("decode token usage artifact: %v", err)
	}
	if err := decodedTokens.Validate(); err != nil {
		t.Fatalf("validate decoded token usage: %v", err)
	}
	promptPayload, err := os.ReadFile(paths.PromptGenericityJSON)
	if err != nil {
		t.Fatalf("read prompt genericity artifact: %v", err)
	}
	var decodedPromptGenericity PromptGenericityArtifact
	if err := json.Unmarshal(promptPayload, &decodedPromptGenericity); err != nil {
		t.Fatalf("decode prompt genericity artifact: %v", err)
	}
	if err := decodedPromptGenericity.Validate(); err != nil {
		t.Fatalf("validate decoded prompt genericity artifact: %v", err)
	}
	for _, path := range []string{
		paths.ManifestJSON,
		paths.EventsJSONL,
		paths.TranscriptJSON,
		paths.VerifierResultsJSON,
		paths.JudgeResultsJSON,
		paths.PromptGenericityJSON,
	} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("inspect complete artifact %s: %v", path, err)
		}
	}
}

func assertPublishedResultReport(t *testing.T, path string) {
	t.Helper()
	report, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read report artifact: %v", err)
	}
	for _, section := range []string{"## Prompt Genericity", "## Ability", "## User Control", "## AI Communication", "## Efficiency"} {
		if !strings.Contains(string(report), section) {
			t.Fatalf("report omitted %s: %s", section, report)
		}
	}
	if !strings.Contains(string(report), "agent=42") ||
		!strings.Contains(string(report), "forbidden=pass") ||
		!strings.Contains(string(report), "First-attempt passes: **1/1**") ||
		strings.Contains(string(report), "judge=99") {
		t.Fatalf("report system/judge token separation = %s", report)
	}
}

func validTestArtifactSet(
	t *testing.T,
	results Results,
	tokenUsage TokenUsageArtifact,
) EvaluationArtifactSet {
	t.Helper()
	manifestScenarios := make([]ManifestScenario, len(results.Scenarios))
	scenarios := make([]Scenario, len(results.Scenarios))
	attempts := resultAttemptReferences(results)
	transcripts := make([]ScenarioTranscript, len(attempts))
	verifiers := make([]ScenarioVerifierResult, len(attempts))
	judges := make([]ScenarioJudgeResult, len(attempts))
	for index, scenario := range results.Scenarios {
		scenarios[index] = validTestScenario()
		if scenarios[index].ID != scenario.ScenarioID {
			t.Fatalf("test artifact scenario %d is %s, want %s", index, scenarios[index].ID, scenario.ScenarioID)
		}
		manifestScenarios[index] = validTestManifestScenarioForResult(scenario)
	}
	for index, attempt := range attempts {
		usage := tokenUsage.Scenarios[index]
		if usage.Judge.EvidenceAvailable {
			judgeTurns := usage.Judge.ProviderTurns
			if len(judgeTurns) != 1 {
				t.Fatalf("judge provider turns = %d, want 1", len(judgeTurns))
			}
			judgeTurn := judgeTurns[0]
			transcripts[index] = ScenarioTranscript{
				ScenarioID:        attempt.identity.ScenarioID,
				Attempt:           attempt.identity.Attempt,
				EvidenceAvailable: true,
				Entries: []TranscriptEntry{{
					Sequence:   1,
					Speaker:    TranscriptSpeakerUser,
					Kind:       TranscriptEntryUserSubmission,
					Text:       scenarios[attempt.scenarioIndex].Steps[0].Text,
					OccurredAt: attempt.result.StartedAt.Format(time.RFC3339Nano),
				}},
			}
			judges[index] = ScenarioJudgeResult{
				ScenarioID:        attempt.identity.ScenarioID,
				Attempt:           attempt.identity.Attempt,
				EvidenceAvailable: true,
				Invocation: &JudgeInvocation{
					ID:               judgeTurn.Attribution.InvocationID,
					ProviderThreadID: judgeTurn.ProviderThreadID,
					ProviderTurnID:   judgeTurn.ProviderTurnID,
				},
				Verdict: communicationJudgeVerdict(communicationJudgeChecks{
					ProgressSufficient:      true,
					ProgressRestrained:      true,
					QuestionsNecessary:      true,
					FinalTruthfulActionable: true,
					InternalMechanicsHidden: true,
				}),
			}
		} else {
			transcripts[index] = mustUnavailableTestTranscript(
				t,
				attempt.identity.ScenarioID,
				attempt.identity.Attempt,
				attempt.result.Diagnostic,
			)
			judges[index] = mustUnavailableTestJudge(
				t,
				attempt.identity.ScenarioID,
				attempt.identity.Attempt,
				attempt.result.Diagnostic,
			)
		}
		var err error
		verifiers[index], err = scenarioVerifierResult(attempt.result)
		if err != nil {
			t.Fatalf("create verifier evidence: %v", err)
		}
	}
	return EvaluationArtifactSet{
		Scenarios: scenarios,
		Manifest: EvaluationManifest{
			SchemaVersion: ManifestSchemaVersion,
			SettaCommit:   results.SettaCommit,
			StartedAt:     results.StartedAt,
			FinishedAt:    results.FinishedAt,
			Scenarios:     manifestScenarios,
			Sandbox:       validTestManifestSandbox(),
			Judge:         FixedJudgeConfiguration(),
			Runtime: ManifestRuntime{
				BackendVersion: phase1BackendVersion,
				CodexVersion:   "0.146.0",
				NodeVersion:    "25.2.1",
				PNPMVersion:    "10.23.0",
			},
		},
		Events:           testArtifactEvents(results, tokenUsage, scenarios),
		Transcript:       mustTestTranscriptArtifact(t, transcripts),
		TokenUsage:       tokenUsage,
		VerifierResults:  mustTestVerifierArtifact(t, verifiers),
		JudgeResults:     mustTestJudgeArtifact(t, judges),
		PromptGenericity: validTestPromptGenericityArtifact(t),
		Results:          results,
	}
}

func testArtifactEvents(
	results Results,
	tokenUsage TokenUsageArtifact,
	scenarios []Scenario,
) []EvaluationEvent {
	events := []EvaluationEvent{}
	for index, attempt := range resultAttemptReferences(results) {
		sequence := 1
		recordedAt := attempt.result.StartedAt
		workstreamID := "workstream-eval"
		events = append(events, EvaluationEvent{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    attempt.identity.ScenarioID,
			Attempt:       attempt.identity.Attempt,
			Sequence:      sequence,
			RecordedAt:    recordedAt.Format(time.RFC3339Nano),
			Kind:          EvaluationEventUserSubmission,
			UserSubmission: &EvaluationUserSubmission{
				StepIndex: 0,
				Text:      scenarios[attempt.scenarioIndex].Steps[0].Text,
				Workspace: testWorkspaceObservation(0),
			},
		})
		sequence++
		recordedAt = recordedAt.Add(time.Nanosecond)
		directorAttribution := testTokenAttribution(
			agent.TokenUsageBucketSystem,
			agent.TokenUsageRoleDirector,
			"artifact-director",
			*conversation.DefaultDirectorRoleProfile().ModelSelection.ModelID,
		)
		directorAttribution.ReasoningEffort = conversation.DefaultDirectorRoleProfile().ReasoningEffort
		events = append(events, EvaluationEvent{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    attempt.identity.ScenarioID,
			Attempt:       attempt.identity.Attempt,
			Sequence:      sequence,
			RecordedAt:    recordedAt.Format(time.RFC3339Nano),
			Kind:          EvaluationEventDirectorReceipt,
			DirectorReceipt: &EvaluationDirectorReceipt{
				StepIndex: 0,
				Receipt: director.DirectorReceipt{
					Kind: director.DirectorIntentSubmit,
					Submit: &director.DirectorTurnReceipt{
						IntentID: "intent-eval",
						ToolCalls: []director.DirectorToolCall{{
							Tool:         "create_workstream",
							Succeeded:    true,
							Summary:      "Started the fixture work.",
							WorkstreamID: &workstreamID,
						}},
						ResolvedInvocations: []conversation.ResolvedInvocation{testResolvedTokenInvocation(
							conversation.RoleDirector,
							directorAttribution,
							"artifact-director-turn",
						)},
					},
				},
			},
		})
		sequence++
		recordedAt = recordedAt.Add(time.Nanosecond)
		events = append(events, EvaluationEvent{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    attempt.identity.ScenarioID,
			Attempt:       attempt.identity.Attempt,
			Sequence:      sequence,
			RecordedAt:    recordedAt.Format(time.RFC3339Nano),
			Kind:          EvaluationEventConversationState,
			ConversationState: &EvaluationConversationState{
				WorkstreamID:   workstreamID,
				ConversationID: "conversation-eval",
				Turns: []EvaluationConversationTurnState{{
					TurnID:        "turn-eval",
					AuthoredInput: conversation.AuthoredInput{Text: scenarios[attempt.scenarioIndex].Steps[0].Text},
					Delivery:      conversation.TurnDeliveryNormal,
					Status:        conversation.TurnStatusCompleted,
				}},
				QueueTurnIDs: []string{},
				Workspace:    testWorkspaceObservation(0),
			},
		})
		for _, bucket := range []TokenUsageBucketResult{
			tokenUsage.Scenarios[index].System,
			tokenUsage.Scenarios[index].Judge,
		} {
			for _, turn := range bucket.ProviderTurns {
				sequence++
				recordedAt = recordedAt.Add(time.Nanosecond)
				observation := agent.TokenUsageObservation{
					Attribution:      turn.Attribution,
					ProviderThreadID: turn.ProviderThreadID,
					ProviderTurnID:   turn.ProviderTurnID,
					TokenUsage:       turn.FinalProviderRecord,
				}
				events = append(events, EvaluationEvent{
					SchemaVersion: EvaluationEventSchemaVersion,
					ScenarioID:    attempt.identity.ScenarioID,
					Attempt:       attempt.identity.Attempt,
					Sequence:      sequence,
					RecordedAt:    recordedAt.Format(time.RFC3339Nano),
					Kind:          EvaluationEventTokenUsage,
					TokenUsage:    &observation,
				})
			}
		}
	}
	return events
}

func validTestManifest(
	resultsCommit string,
	startedAt time.Time,
	finishedAt time.Time,
	roles []EvaluatedRoleConfiguration,
) EvaluationManifest {
	return EvaluationManifest{
		SchemaVersion: ManifestSchemaVersion,
		SettaCommit:   resultsCommit,
		StartedAt:     startedAt,
		FinishedAt:    finishedAt,
		Scenarios: []ManifestScenario{
			validTestManifestScenario(ScenarioVerifierStraightforward, roles),
		},
		Sandbox: validTestManifestSandbox(),
		Judge:   FixedJudgeConfiguration(),
		Runtime: ManifestRuntime{
			BackendVersion: phase1BackendVersion,
			CodexVersion:   "0.146.0",
			NodeVersion:    "25.2.1",
			PNPMVersion:    "10.23.0",
		},
	}
}

func validTestManifestScenario(
	scenarioID string,
	roles []EvaluatedRoleConfiguration,
) ManifestScenario {
	return ManifestScenario{
		ScenarioID:                scenarioID,
		ScenarioSHA256:            strings.Repeat("a", 64),
		Fixture:                   ScenarioFixtureTypeScriptService,
		FixtureSHA256:             strings.Repeat("b", 64),
		CommunicationRubricSHA256: strings.Repeat("c", 64),
		Attempts: []ManifestScenarioAttempt{{
			Attempt: EvaluationAttemptFirst,
			Roles:   cloneEvaluatedRoleConfigurations(roles),
		}},
	}
}

func validTestManifestScenarioForResult(result ScenarioEvaluationResult) ManifestScenario {
	manifest := validTestManifestScenario(result.ScenarioID, result.FirstAttempt.Roles)
	if result.Rerun != nil {
		manifest.Attempts = append(manifest.Attempts, ManifestScenarioAttempt{
			Attempt: EvaluationAttemptRerun,
			Roles:   cloneEvaluatedRoleConfigurations(result.Rerun.Roles),
		})
	}
	return manifest
}

func validTestManifestSandbox() *ManifestSandbox {
	return &ManifestSandbox{
		Platform:         phase1ImagePlatform,
		ToolchainImage:   "cgr.dev/chainguard/node@sha256:" + strings.Repeat("d", 64),
		ToolchainImageID: "sha256:" + strings.Repeat("e", 64),
		AgentImageID:     "sha256:" + strings.Repeat("f", 64),
		BackendImageID:   "sha256:" + strings.Repeat("1", 64),
		VerifierImageID:  "sha256:" + strings.Repeat("2", 64),
	}
}

func mustUnavailableTestTranscript(
	t *testing.T,
	scenarioID string,
	attempt int,
	diagnostic *ScenarioDiagnostic,
) ScenarioTranscript {
	t.Helper()
	transcript, err := unavailableScenarioTranscript(scenarioID, attempt, diagnostic)
	if err != nil {
		t.Fatalf("create unavailable transcript: %v", err)
	}
	return transcript
}

func mustUnavailableTestJudge(
	t *testing.T,
	scenarioID string,
	attempt int,
	diagnostic *ScenarioDiagnostic,
) ScenarioJudgeResult {
	t.Helper()
	judge, err := unavailableScenarioJudgeResult(scenarioID, attempt, diagnostic)
	if err != nil {
		t.Fatalf("create unavailable judge: %v", err)
	}
	return judge
}

func mustTestTranscriptArtifact(t *testing.T, scenarios []ScenarioTranscript) TranscriptArtifact {
	t.Helper()
	artifact, err := NewTranscriptArtifact(scenarios)
	if err != nil {
		t.Fatalf("create transcript artifact: %v", err)
	}
	return artifact
}

func mustTestVerifierArtifact(t *testing.T, scenarios []ScenarioVerifierResult) VerifierArtifact {
	t.Helper()
	artifact, err := NewVerifierArtifact(scenarios)
	if err != nil {
		t.Fatalf("create verifier artifact: %v", err)
	}
	return artifact
}

func mustTestJudgeArtifact(t *testing.T, scenarios []ScenarioJudgeResult) JudgeArtifact {
	t.Helper()
	artifact, err := NewJudgeArtifact(scenarios)
	if err != nil {
		t.Fatalf("create judge artifact: %v", err)
	}
	return artifact
}

func mustTestDiagnostic(t *testing.T, code string, message string) *ScenarioDiagnostic {
	t.Helper()
	diagnostic, err := NewScenarioDiagnostic(code, message)
	if err != nil {
		t.Fatalf("create diagnostic: %v", err)
	}
	return diagnostic
}

func validTestPassingControl() ScenarioControlResult {
	return ScenarioControlResult{
		EvidenceAvailable: true,
		Passed:            true,
		Clarification: &ScenarioClarificationResult{
			Policy:                 ScenarioClarificationForbidden,
			Passed:                 true,
			ScriptedReplyCount:     0,
			EvidenceEventSequences: []int{1, 2, 3},
		},
		Assertions: []ScenarioControlAssertionResult{},
	}
}

func mustTestControlForOutcome(
	t *testing.T,
	outcome ScenarioExecutionOutcome,
	diagnostic *ScenarioDiagnostic,
) ScenarioControlResult {
	t.Helper()
	if outcome == ScenarioExecutionCompleted {
		return validTestPassingControl()
	}
	control, err := unavailableScenarioControlResult(diagnostic)
	if err != nil {
		t.Fatalf("create unavailable control result: %v", err)
	}
	return control
}

func validTestEvaluatedRoles() []EvaluatedRoleConfiguration {
	profiles := []conversation.RoleProfile{
		conversation.DefaultDirectorRoleProfile(),
		conversation.DefaultAgentRoleProfile(),
		conversation.DefaultNarratorRoleProfile(),
		conversation.DefaultSideAgentRoleProfile(),
	}
	roles := make([]EvaluatedRoleConfiguration, 0, len(profiles))
	for _, profile := range profiles {
		roles = append(roles, EvaluatedRoleConfiguration{
			Role:            profile.Role,
			EffectiveSource: conversation.RoleProfileSourceBuiltIn,
			Requested:       profile,
			Resolved: conversation.ResolvedRoleProfileSelection{
				ModelID:         *profile.ModelSelection.ModelID,
				ReasoningEffort: profile.ReasoningEffort,
				ServiceTier:     profile.ServiceTier,
			},
		})
	}
	return roles
}

func validTestRoleConfigurations() (conversation.RoleConfiguration, conversation.RoleConfiguration) {
	profiles := map[conversation.Role]conversation.RoleProfile{
		conversation.RoleDirector:  conversation.DefaultDirectorRoleProfile(),
		conversation.RoleAgent:     conversation.DefaultAgentRoleProfile(),
		conversation.RoleNarrator:  conversation.DefaultNarratorRoleProfile(),
		conversation.RoleSideAgent: conversation.DefaultSideAgentRoleProfile(),
	}
	catalog := conversation.RoleModelCatalog{
		Provider:       conversation.ProviderCodex,
		DefaultModelID: *profiles[conversation.RoleAgent].ModelSelection.ModelID,
		Models:         []conversation.RoleModelOption{},
	}
	modelIndexes := map[string]int{}
	for _, role := range []conversation.Role{
		conversation.RoleAgent,
		conversation.RoleNarrator,
		conversation.RoleDirector,
		conversation.RoleSideAgent,
	} {
		profile := profiles[role]
		modelID := *profile.ModelSelection.ModelID
		if modelIndex, exists := modelIndexes[modelID]; exists {
			option := &catalog.Models[modelIndex]
			effortFound := false
			for _, effort := range option.SupportedReasoningEfforts {
				effortFound = effortFound || effort == profile.ReasoningEffort
			}
			if !effortFound {
				option.SupportedReasoningEfforts = append(
					option.SupportedReasoningEfforts,
					profile.ReasoningEffort,
				)
			}
			continue
		}
		modelIndexes[modelID] = len(catalog.Models)
		catalog.Models = append(catalog.Models, conversation.RoleModelOption{
			Provider:                  conversation.ProviderCodex,
			ModelID:                   modelID,
			DisplayName:               string(role) + " model",
			DefaultReasoningEffort:    profile.ReasoningEffort,
			SupportedReasoningEfforts: []conversation.ReasoningEffort{profile.ReasoningEffort},
			ServiceTiers:              []string{},
			IsDefault:                 modelID == catalog.DefaultModelID,
		})
	}
	configurationProfiles := func(roles []conversation.Role) []conversation.RoleProfileConfiguration {
		result := make([]conversation.RoleProfileConfiguration, 0, len(roles))
		for _, role := range roles {
			profile := profiles[role]
			result = append(result, conversation.RoleProfileConfiguration{
				Role:            role,
				BuiltIn:         profile,
				Effective:       profile,
				EffectiveSource: conversation.RoleProfileSourceBuiltIn,
				Resolved: conversation.ResolvedRoleProfileSelection{
					ModelID:         *profile.ModelSelection.ModelID,
					ReasoningEffort: profile.ReasoningEffort,
				},
			})
		}
		return result
	}
	workspaceID := "workspace-eval"
	global := conversation.RoleConfiguration{
		SchemaVersion: conversation.RoleConfigurationSchemaVersion,
		Scope:         conversation.RoleConfigurationScope{Kind: conversation.RoleProfileScopeGlobal},
		Profiles: configurationProfiles([]conversation.Role{
			conversation.RoleAgent,
			conversation.RoleNarrator,
			conversation.RoleDirector,
			conversation.RoleSideAgent,
		}),
		ModelCatalog: catalog,
	}
	workspace := conversation.RoleConfiguration{
		SchemaVersion: conversation.RoleConfigurationSchemaVersion,
		Scope: conversation.RoleConfigurationScope{
			Kind:        conversation.RoleProfileScopeWorkspace,
			WorkspaceID: &workspaceID,
		},
		Profiles: configurationProfiles([]conversation.Role{
			conversation.RoleAgent,
			conversation.RoleNarrator,
			conversation.RoleSideAgent,
		}),
		ModelCatalog: catalog,
	}
	return global, workspace
}
