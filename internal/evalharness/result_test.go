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

func TestScenarioResultRejectsAmbiguousClassificationInputs(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 0, 0, 0, time.UTC)
	_, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         validTestScenario(),
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
	results, err := NewResults(
		strings.Repeat("a", 40),
		startedAt,
		startedAt.Add(2*time.Second),
		[]ScenarioResult{scenario},
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
	scenarioUsage, err := AggregateScenarioTokenUsage(scenario.ScenarioID, []agent.TokenUsageObservation{
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
			observations,
		)
		if err != nil {
			t.Fatalf("aggregate altered token evidence: %v", err)
		}
		mismatched.TokenUsage.Scenarios[0] = usage
		assertArtifactSetValidationError(t, mismatched, "judge token evidence does not use the fixed judge configuration")
	})
	t.Run("public transcript", func(t *testing.T) {
		mismatched := cloneTestArtifactSet(t, artifacts)
		mismatched.Transcript.Scenarios[0].Entries[0].Text = "Complete a different fixture task."
		assertArtifactSetValidationError(t, mismatched, "transcript does not match public event evidence")
	})
	t.Run("control event reference", func(t *testing.T) {
		mismatched := cloneTestArtifactSet(t, artifacts)
		mismatched.Results.Scenarios[0].Control.Clarification.EvidenceEventSequences = []int{1}
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
	for _, path := range []string{
		paths.ManifestJSON,
		paths.EventsJSONL,
		paths.TranscriptJSON,
		paths.VerifierResultsJSON,
		paths.JudgeResultsJSON,
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
	for _, section := range []string{"## Ability", "## User Control", "## AI Communication", "## Efficiency"} {
		if !strings.Contains(string(report), section) {
			t.Fatalf("report omitted %s: %s", section, report)
		}
	}
	if !strings.Contains(string(report), "agent=42") ||
		!strings.Contains(string(report), "forbidden=pass") ||
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
	transcripts := make([]ScenarioTranscript, len(results.Scenarios))
	verifiers := make([]ScenarioVerifierResult, len(results.Scenarios))
	judges := make([]ScenarioJudgeResult, len(results.Scenarios))
	for index, scenario := range results.Scenarios {
		scenarios[index] = validTestScenario()
		if scenarios[index].ID != scenario.ScenarioID {
			t.Fatalf("test artifact scenario %d is %s, want %s", index, scenarios[index].ID, scenario.ScenarioID)
		}
		manifestScenarios[index] = validTestManifestScenario(scenario.ScenarioID, scenario.Roles)
		if tokenUsage.Scenarios[index].Judge.EvidenceAvailable {
			judgeTurns := tokenUsage.Scenarios[index].Judge.ProviderTurns
			if len(judgeTurns) != 1 {
				t.Fatalf("judge provider turns = %d, want 1", len(judgeTurns))
			}
			judgeTurn := judgeTurns[0]
			transcripts[index] = ScenarioTranscript{
				ScenarioID:        scenario.ScenarioID,
				EvidenceAvailable: true,
				Entries: []TranscriptEntry{{
					Sequence:   1,
					Speaker:    TranscriptSpeakerUser,
					Kind:       TranscriptEntryUserSubmission,
					Text:       scenarios[index].Steps[0].Text,
					OccurredAt: scenario.StartedAt.Format(time.RFC3339Nano),
				}},
			}
			judges[index] = ScenarioJudgeResult{
				ScenarioID:        scenario.ScenarioID,
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
			transcripts[index] = mustUnavailableTestTranscript(t, scenario.ScenarioID, scenario.Diagnostic)
			judges[index] = mustUnavailableTestJudge(t, scenario.ScenarioID, scenario.Diagnostic)
		}
		var err error
		verifiers[index], err = scenarioVerifierResult(scenario)
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
		Events:          testArtifactEvents(results, tokenUsage, scenarios),
		Transcript:      mustTestTranscriptArtifact(t, transcripts),
		TokenUsage:      tokenUsage,
		VerifierResults: mustTestVerifierArtifact(t, verifiers),
		JudgeResults:    mustTestJudgeArtifact(t, judges),
		Results:         results,
	}
}

func testArtifactEvents(
	results Results,
	tokenUsage TokenUsageArtifact,
	scenarios []Scenario,
) []EvaluationEvent {
	events := []EvaluationEvent{}
	for index, scenario := range results.Scenarios {
		sequence := 1
		recordedAt := scenario.StartedAt
		workstreamID := "workstream-eval"
		events = append(events, EvaluationEvent{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    scenario.ScenarioID,
			Sequence:      sequence,
			RecordedAt:    recordedAt.Format(time.RFC3339Nano),
			Kind:          EvaluationEventUserSubmission,
			UserSubmission: &EvaluationUserSubmission{
				StepIndex: 0,
				Text:      scenarios[index].Steps[0].Text,
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
			ScenarioID:    scenario.ScenarioID,
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
			ScenarioID:    scenario.ScenarioID,
			Sequence:      sequence,
			RecordedAt:    recordedAt.Format(time.RFC3339Nano),
			Kind:          EvaluationEventConversationState,
			ConversationState: &EvaluationConversationState{
				WorkstreamID:   workstreamID,
				ConversationID: "conversation-eval",
				Turns: []EvaluationConversationTurnState{{
					TurnID:        "turn-eval",
					AuthoredInput: conversation.AuthoredInput{Text: scenarios[index].Steps[0].Text},
					Delivery:      conversation.TurnDeliveryNormal,
					Status:        conversation.TurnStatusCompleted,
				}},
				QueueTurnIDs: []string{},
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
					ScenarioID:    scenario.ScenarioID,
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
		Roles:                     cloneEvaluatedRoleConfigurations(roles),
	}
}

func validTestManifestSandbox() *ManifestSandbox {
	return &ManifestSandbox{
		Platform:         phase1ImagePlatform,
		ToolchainImage:   "docker.io/library/node@sha256:" + strings.Repeat("d", 64),
		ToolchainImageID: "sha256:" + strings.Repeat("e", 64),
		AgentImageID:     "sha256:" + strings.Repeat("f", 64),
		BackendImageID:   "sha256:" + strings.Repeat("1", 64),
		VerifierImageID:  "sha256:" + strings.Repeat("2", 64),
	}
}

func mustUnavailableTestTranscript(
	t *testing.T,
	scenarioID string,
	diagnostic *ScenarioDiagnostic,
) ScenarioTranscript {
	t.Helper()
	transcript, err := unavailableScenarioTranscript(scenarioID, diagnostic)
	if err != nil {
		t.Fatalf("create unavailable transcript: %v", err)
	}
	return transcript
}

func mustUnavailableTestJudge(
	t *testing.T,
	scenarioID string,
	diagnostic *ScenarioDiagnostic,
) ScenarioJudgeResult {
	t.Helper()
	judge, err := unavailableScenarioJudgeResult(scenarioID, diagnostic)
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
	for index, role := range []conversation.Role{
		conversation.RoleAgent,
		conversation.RoleNarrator,
		conversation.RoleDirector,
		conversation.RoleSideAgent,
	} {
		profile := profiles[role]
		catalog.Models = append(catalog.Models, conversation.RoleModelOption{
			Provider:                  conversation.ProviderCodex,
			ModelID:                   *profile.ModelSelection.ModelID,
			DisplayName:               string(role) + " model",
			DefaultReasoningEffort:    profile.ReasoningEffort,
			SupportedReasoningEfforts: []conversation.ReasoningEffort{profile.ReasoningEffort},
			ServiceTiers:              []string{},
			IsDefault:                 index == 0,
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
