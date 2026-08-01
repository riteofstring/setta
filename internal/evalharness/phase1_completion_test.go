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
			output, err := publishPhase1Evaluation(
				t.TempDir(),
				validTestManifest(
					strings.Repeat("a", 40),
					startedAt,
					finishedAt,
					state.roles,
				),
				validTestScenario(),
				startedAt,
				finishedAt,
				finishedAt,
				state,
			)
			if err != nil {
				t.Fatalf("publish Phase 1 evaluation: %v", err)
			}
			if len(output.Results.Scenarios) != 1 ||
				output.Results.Scenarios[0].Classification != test.classification {
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
	usage, err := AggregateScenarioTokenUsage(ScenarioVerifierStraightforward, []agent.TokenUsageObservation{observation})
	if err != nil {
		t.Fatalf("aggregate Phase 2 completion tokens: %v", err)
	}
	state.tokenUsage = &usage
	state.transcript = &ScenarioTranscript{
		ScenarioID:        ScenarioVerifierStraightforward,
		EvidenceAvailable: true,
		Entries: []TranscriptEntry{{
			Sequence:   1,
			Speaker:    TranscriptSpeakerUser,
			Kind:       TranscriptEntryUserSubmission,
			Text:       "Complete the fixture task.",
			OccurredAt: startedAt.Format(time.RFC3339Nano),
		}},
	}
	state.events = []EvaluationEvent{{
		SchemaVersion: EvaluationEventSchemaVersion,
		ScenarioID:    ScenarioVerifierStraightforward,
		Sequence:      1,
		RecordedAt:    startedAt.Format(time.RFC3339Nano),
		Kind:          EvaluationEventUserSubmission,
		UserSubmission: &EvaluationUserSubmission{
			Text: "Complete the fixture task.",
		},
	}}
	state.events, err = appendTokenUsageEvents(
		state.events,
		ScenarioVerifierStraightforward,
		[]agent.TokenUsageObservation{observation},
		startedAt.Add(time.Nanosecond),
	)
	if err != nil {
		t.Fatalf("append Phase 2 completion token event: %v", err)
	}
	return state
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
	output Phase1EvaluationOutput,
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
	row := "| `straightforward-task` | " + string(classification) + " |"
	if !strings.Contains(string(report), row) {
		t.Fatalf("classification report omitted %q: %s", row, report)
	}
}
