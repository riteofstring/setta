package evalharness

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

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
			output, err := publishPhase1Evaluation(
				t.TempDir(),
				strings.Repeat("a", 40),
				validTestScenario(),
				startedAt,
				startedAt.Add(time.Second),
				test.state,
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
