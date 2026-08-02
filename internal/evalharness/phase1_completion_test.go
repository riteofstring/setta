package evalharness

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/codexapp"
	"setta/internal/conversation"
	"setta/internal/director"
	evalverifier "setta/internal/evalharness/verifier"
)

func TestPhase1CheckedInToolchainMatchesFixture(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve test source path")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
	pin, err := loadPhase1ToolchainPin(repoRoot)
	if err != nil {
		t.Fatalf("load toolchain pin: %v", err)
	}
	fixture, err := readPhase1FixturePackage(repoRoot)
	if err != nil {
		t.Fatalf("read fixture package: %v", err)
	}
	if err := validatePhase1FixtureToolchain(fixture, pin); err != nil {
		t.Fatalf("validate fixture toolchain: %v", err)
	}
}

func TestPhase1WritableVerificationVolumesHaveHardDiskCeilings(t *testing.T) {
	for _, volume := range []struct {
		label   string
		options []string
	}{
		{label: "workspace", options: phase1WorkspaceVolumeDriverOptions()},
		{label: "verification", options: phase1BoundedVolumeDriverOptions(phase1VerificationDiskBytes)},
	} {
		options := strings.Join(volume.options, " ")
		for _, expected := range []string{
			"--driver local",
			"--opt type=tmpfs",
			"--opt device=tmpfs",
			"o=size=67108864,uid=65532,gid=65532,mode=0755",
		} {
			if !strings.Contains(options, expected) {
				t.Fatalf("%s volume options %q omitted %q", volume.label, options, expected)
			}
		}
	}
}

func TestPhase1TokenBudgetUsesLatestTotalPerThread(t *testing.T) {
	aborts := 0
	budget, err := newPhase1TokenBudget(100, func() { aborts++ })
	if err != nil {
		t.Fatalf("create token budget: %v", err)
	}
	for _, update := range []struct {
		thread string
		turn   string
		total  int
	}{
		{thread: "thread-1", turn: "turn-1", total: 40},
		{thread: "thread-1", turn: "turn-1", total: 40},
		{thread: "thread-2", turn: "turn-2", total: 60},
	} {
		if err := budget.observeProviderMessage(
			phase1TokenUsageMessage(t, update.thread, update.turn, update.total),
		); err != nil {
			t.Fatalf("observe token usage: %v", err)
		}
	}
	if aborts != 0 {
		t.Fatalf("budget aborted at its exact ceiling %d times", aborts)
	}
	err = budget.observeProviderMessage(phase1TokenUsageMessage(t, "thread-1", "turn-3", 41))
	failure := budget.failureState()
	if err == nil || failure == nil || failure.kind != phase1TokenBudgetExceeded {
		t.Fatalf("token budget failure = %v / %#v", err, failure)
	}
	if failure.total != 101 || failure.limit != 100 || aborts != 1 {
		t.Fatalf("token budget failure = %#v, aborts = %d", failure, aborts)
	}
}

func TestPhase1TokenBudgetRejectsRegressingEvidence(t *testing.T) {
	budget, err := newPhase1TokenBudget(100, func() {})
	if err != nil {
		t.Fatalf("create token budget: %v", err)
	}
	if err := budget.observeProviderMessage(
		phase1TokenUsageMessage(t, "thread-1", "turn-1", 50),
	); err != nil {
		t.Fatalf("observe initial token usage: %v", err)
	}
	err = budget.observeProviderMessage(phase1TokenUsageMessage(t, "thread-1", "turn-2", 49))
	failure := budget.failureState()
	if err == nil || failure == nil || failure.kind != phase1TokenBudgetEvidenceInvalid {
		t.Fatalf("regressing evidence failure = %v / %#v", err, failure)
	}
}

func TestPhase1ProviderForwardingPreservesMessagesAndEnforcesBudget(t *testing.T) {
	budget, err := newPhase1TokenBudget(100, func() {})
	if err != nil {
		t.Fatalf("create token budget: %v", err)
	}
	usage := phase1TokenUsageMessage(t, "thread-1", "turn-1", 10)
	input := "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}\n" + string(usage) + "\n"
	var output strings.Builder
	if err := forwardPhase1ProviderResponses(&output, strings.NewReader(input), budget); err != nil {
		t.Fatalf("forward provider responses: %v", err)
	}
	if output.String() != input || !budget.observedUsage() {
		t.Fatalf("forwarded provider output = %q, observed = %t", output.String(), budget.observedUsage())
	}
}

func TestPhase1TokenBudgetFailureRetainsRoleEvidence(t *testing.T) {
	directorUsage := testTokenObservation(
		testTokenAttribution(
			agent.TokenUsageBucketSystem,
			agent.TokenUsageRoleDirector,
			"director-invocation",
			"gpt-director",
		),
		"director-thread",
		"director-turn",
		30,
		20,
		10,
	)
	agentUsage := testTokenObservation(
		testTokenAttribution(
			agent.TokenUsageBucketSystem,
			agent.TokenUsageRoleAgent,
			"agent-invocation",
			"gpt-agent",
		),
		"agent-thread",
		"agent-turn",
		71,
		60,
		11,
	)
	state := phase1TokenBudgetFailureState(
		&phase1TokenBudgetFailure{kind: phase1TokenBudgetExceeded, limit: 100, total: 101},
		nil,
		ScenarioVerifierStraightforward,
		EvaluationAttemptFirst,
		[]agent.TokenUsageObservation{directorUsage, agentUsage},
		nil,
		phase1TokenBudgetSnapshot{
			totals: map[string]int64{"director-thread": 30, "agent-thread": 71},
			total:  101,
			seen:   true,
		},
	)
	if state.outcome != ScenarioExecutionTimedOut || state.tokenUsage == nil ||
		state.tokenUsage.System.Total.TotalTokens != 101 ||
		len(state.tokenUsage.System.Roles) != 2 || len(state.events) != 2 {
		t.Fatalf("budget failure state = %#v", state)
	}
}

func TestPublishPhase1EvaluationExercisesExitClassifications(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 22, 0, 0, 0, time.UTC)
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
	controlDiagnostic := mustTestDiagnostic(t, "director_stalled", "The Director stalled for another user turn.")
	infrastructureDiagnostic := mustTestDiagnostic(t, "docker_unavailable", "Docker Desktop is stopped.")
	tests := []struct {
		name           string
		state          phase1RunState
		classification ScenarioClassification
	}{
		{
			name: "pass",
			state: phase1RunState{
				outcome:  ScenarioExecutionCompleted,
				roles:    validTestEvaluatedRoles(),
				verifier: &passingVerifier,
			},
			classification: ScenarioClassificationPass,
		},
		{
			name: "incorrect workspace",
			state: phase1RunState{
				outcome:  ScenarioExecutionCompleted,
				roles:    validTestEvaluatedRoles(),
				verifier: &failingVerifier,
			},
			classification: ScenarioClassificationAbilityFailure,
		},
		{
			name: "control failure",
			state: phase1RunState{
				outcome:    ScenarioExecutionControlFailed,
				roles:      validTestEvaluatedRoles(),
				diagnostic: controlDiagnostic,
			},
			classification: ScenarioClassificationControlFailure,
		},
		{
			name: "timeout",
			state: phase1RunState{
				outcome:    ScenarioExecutionTimedOut,
				roles:      validTestEvaluatedRoles(),
				diagnostic: timeoutDiagnostic,
			},
			classification: ScenarioClassificationTimeout,
		},
		{
			name: "infrastructure failure",
			state: phase1RunState{
				outcome:    ScenarioExecutionInfrastructureFailed,
				roles:      []EvaluatedRoleConfiguration{},
				diagnostic: infrastructureDiagnostic,
			},
			classification: ScenarioClassificationInfrastructureFailure,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			finishedAt := startedAt.Add(time.Second)
			state := test.state
			if state.outcome == ScenarioExecutionCompleted {
				state = phase2CompletedTestState(t, state, startedAt)
			}
			run := evaluationScenarioRun{
				scenario: validTestScenario(),
				firstAttempt: evaluationScenarioAttempt{
					attempt:    EvaluationAttemptFirst,
					startedAt:  startedAt,
					finishedAt: finishedAt,
					state:      phase3TestStateAttempt(state, EvaluationAttemptFirst),
				},
			}
			if test.classification != ScenarioClassificationPass &&
				test.classification != ScenarioClassificationInfrastructureFailure {
				rerun := evaluationScenarioAttempt{
					attempt:    EvaluationAttemptRerun,
					startedAt:  finishedAt,
					finishedAt: finishedAt.Add(time.Second),
					state:      phase3TestStateAttempt(state, EvaluationAttemptRerun),
				}
				run.rerun = &rerun
			}
			invocationFinishedAt := finishedAt
			if run.rerun != nil {
				invocationFinishedAt = run.rerun.finishedAt
			}
			manifest := validTestManifest(
				strings.Repeat("a", 40),
				startedAt,
				invocationFinishedAt,
				state.roles,
			)
			if run.rerun != nil {
				manifest.Scenarios[0].Attempts = append(
					manifest.Scenarios[0].Attempts,
					ManifestScenarioAttempt{
						Attempt: EvaluationAttemptRerun,
						Roles:   cloneEvaluatedRoleConfigurations(state.roles),
					},
				)
			}
			output, err := publishEvaluation(
				t.TempDir(),
				manifest,
				[]evaluationScenarioRun{run},
				validTestPromptGenericityArtifact(t),
				startedAt,
				invocationFinishedAt,
			)
			if err != nil {
				t.Fatalf("publish Phase 1 evaluation: %v", err)
			}
			if len(output.Results.Scenarios) != 1 ||
				output.Results.Scenarios[0].FirstAttempt.Classification != test.classification {
				t.Fatalf("published results = %#v", output.Results.Scenarios)
			}
			assertPhase1ClassificationArtifacts(t, output, test.classification)
		})
	}
}

func phase2CompletedTestState(
	t *testing.T,
	state phase1RunState,
	startedAt time.Time,
) phase1RunState {
	t.Helper()
	observation := testTokenObservation(
		testTokenAttribution(
			agent.TokenUsageBucketSystem,
			agent.TokenUsageRoleAgent,
			"phase2-agent",
			"gpt-agent",
		),
		"phase2-agent-thread",
		"phase2-agent-turn",
		42,
		30,
		12,
	)
	usage, err := AggregateScenarioTokenUsage(
		ScenarioVerifierStraightforward,
		EvaluationAttemptFirst,
		[]agent.TokenUsageObservation{observation},
	)
	if err != nil {
		t.Fatalf("aggregate Phase 2 completion tokens: %v", err)
	}
	state.tokenUsage = &usage
	scenario := validTestScenario()
	state.transcript = &ScenarioTranscript{
		ScenarioID:        ScenarioVerifierStraightforward,
		Attempt:           EvaluationAttemptFirst,
		EvidenceAvailable: true,
		Entries: []TranscriptEntry{{
			Sequence:   1,
			Speaker:    TranscriptSpeakerUser,
			Kind:       TranscriptEntryUserSubmission,
			Text:       scenario.Steps[0].Text,
			OccurredAt: startedAt.Format(time.RFC3339Nano),
		}},
	}
	workstreamID := "workstream-eval"
	directorAttribution := testTokenAttribution(
		agent.TokenUsageBucketSystem,
		agent.TokenUsageRoleDirector,
		"phase2-director",
		*conversation.DefaultDirectorRoleProfile().ModelSelection.ModelID,
	)
	directorAttribution.ReasoningEffort = conversation.DefaultDirectorRoleProfile().ReasoningEffort
	directorInvocation := testResolvedTokenInvocation(
		conversation.RoleDirector,
		directorAttribution,
		"phase2-director-turn",
	)
	state.events = []EvaluationEvent{
		{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    ScenarioVerifierStraightforward,
			Attempt:       EvaluationAttemptFirst,
			Sequence:      1,
			RecordedAt:    startedAt.Format(time.RFC3339Nano),
			Kind:          EvaluationEventUserSubmission,
			UserSubmission: &EvaluationUserSubmission{
				StepIndex: 0,
				Text:      scenario.Steps[0].Text,
				Workspace: testWorkspaceObservation(0),
			},
		},
		{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    ScenarioVerifierStraightforward,
			Attempt:       EvaluationAttemptFirst,
			Sequence:      2,
			RecordedAt:    startedAt.Add(time.Nanosecond).Format(time.RFC3339Nano),
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
						ResolvedInvocations: []conversation.ResolvedInvocation{directorInvocation},
					},
				},
			},
		},
		{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    ScenarioVerifierStraightforward,
			Attempt:       EvaluationAttemptFirst,
			Sequence:      3,
			RecordedAt:    startedAt.Add(2 * time.Nanosecond).Format(time.RFC3339Nano),
			Kind:          EvaluationEventConversationState,
			ConversationState: &EvaluationConversationState{
				WorkstreamID:   workstreamID,
				ConversationID: "conversation-eval",
				Turns: []EvaluationConversationTurnState{{
					TurnID:        "turn-eval",
					AuthoredInput: conversation.AuthoredInput{Text: scenario.Steps[0].Text},
					Delivery:      conversation.TurnDeliveryNormal,
					Status:        conversation.TurnStatusCompleted,
				}},
				QueueTurnIDs: []string{},
				Workspace:    testWorkspaceObservation(0),
			},
		},
	}
	state.events, err = appendTokenUsageEvents(
		state.events,
		ScenarioVerifierStraightforward,
		EvaluationAttemptFirst,
		[]agent.TokenUsageObservation{observation},
		startedAt.Add(3*time.Nanosecond),
	)
	if err != nil {
		t.Fatalf("append Phase 2 completion token event: %v", err)
	}
	return state
}

func phase3TestStateAttempt(state phase1RunState, attempt int) phase1RunState {
	cloned := state
	if state.tokenUsage != nil {
		usage := *state.tokenUsage
		usage.Attempt = attempt
		cloned.tokenUsage = &usage
	}
	if state.transcript != nil {
		transcript := cloneScenarioTranscript(state.transcript)
		transcript.Attempt = attempt
		cloned.transcript = transcript
	}
	if state.judge != nil {
		judge := *state.judge
		judge.Attempt = attempt
		cloned.judge = &judge
	}
	cloned.events = append([]EvaluationEvent{}, state.events...)
	for index := range cloned.events {
		cloned.events[index].Attempt = attempt
	}
	return cloned
}

func phase1TokenUsageMessage(
	t *testing.T,
	threadID string,
	turnID string,
	total int,
) []byte {
	t.Helper()
	breakdown := codexapp.TokenUsageBreakdown{TotalTokens: total}
	payload, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"method":  codexapp.CodexNotificationThreadTokenUsageUpdated,
		"params": codexapp.ThreadTokenUsageUpdatedNotification{
			ThreadID: threadID,
			TurnID:   turnID,
			TokenUsage: codexapp.ThreadTokenUsage{
				Last:  breakdown,
				Total: breakdown,
			},
		},
	})
	if err != nil {
		t.Fatalf("encode token usage message: %v", err)
	}
	return payload
}

func assertPhase1ClassificationArtifacts(
	t *testing.T,
	output EvaluationOutput,
	classification ScenarioClassification,
) {
	t.Helper()
	for _, path := range []string{output.Artifacts.ResultsJSON, output.Artifacts.ReportMarkdown} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("inspect classification artifact %s: %v", path, err)
		}
	}
	report, err := os.ReadFile(output.Artifacts.ReportMarkdown)
	if err != nil {
		t.Fatalf("read classification report: %v", err)
	}
	want := "classification=" + string(classification)
	if !strings.Contains(string(report), want) {
		t.Fatalf("classification report omitted %q: %s", want, report)
	}
}
