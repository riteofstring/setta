package evalharness

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"time"

	"setta/internal/agent"
	evalverifier "setta/internal/evalharness/verifier"
	"setta/internal/jsonio"
)

const (
	JudgeSchemaVersion            = 1
	JudgeProvider                 = "codex"
	JudgeModelSelection           = "exact"
	JudgeModel                    = "gpt-5.6-sol"
	JudgeReasoningEffort          = "max"
	JudgeApprovalPolicy           = "never"
	JudgeProviderPermission       = ":read-only"
	JudgeThreadPolicy             = "fresh_ephemeral"
	judgeRubricRelativePath       = "evals/communication-rubric.md"
	judgeRubricMaximumBytes int64 = 64 * 1024
	judgeTimeout                  = 10 * time.Minute
	judgeShutdownTimeout          = 30 * time.Second
)

type CommunicationFailureTag string

const (
	CommunicationFailureProgressInsufficient CommunicationFailureTag = "progress_insufficient"
	CommunicationFailureProgressExcessive    CommunicationFailureTag = "progress_excessive"
	CommunicationFailureQuestionUnnecessary  CommunicationFailureTag = "question_unnecessary"
	CommunicationFailureFinalUntruthful      CommunicationFailureTag = "final_not_truthful_actionable"
	CommunicationFailureMechanicsExposed     CommunicationFailureTag = "internal_mechanics_exposed"
)

type JudgeConfiguration struct {
	Provider                   string  `json:"provider"`
	ModelSelection             string  `json:"modelSelection"`
	Model                      string  `json:"model"`
	ReasoningEffort            string  `json:"reasoningEffort"`
	ServiceTier                *string `json:"serviceTier"`
	ApprovalPolicy             string  `json:"approvalPolicy"`
	ProviderPermissionProfile  string  `json:"providerPermissionProfile"`
	ToolsEnabled               bool    `json:"toolsEnabled"`
	MCPEnabled                 bool    `json:"mcpEnabled"`
	WebSearchEnabled           bool    `json:"webSearchEnabled"`
	ProjectInstructionsEnabled bool    `json:"projectInstructionsEnabled"`
	DelegationEnabled          bool    `json:"delegationEnabled"`
	ThreadPolicy               string  `json:"threadPolicy"`
}

type CommunicationJudgeVerdict struct {
	ProgressSufficient      bool                      `json:"progressSufficient"`
	ProgressRestrained      bool                      `json:"progressRestrained"`
	QuestionsNecessary      bool                      `json:"questionsNecessary"`
	FinalTruthfulActionable bool                      `json:"finalTruthfulAndActionable"`
	InternalMechanicsHidden bool                      `json:"internalMechanicsHidden"`
	OverallPass             bool                      `json:"overallPass"`
	FailureTags             []CommunicationFailureTag `json:"failureTags"`
}

type JudgeInvocation struct {
	ID               string `json:"id"`
	ProviderThreadID string `json:"providerThreadId"`
	ProviderTurnID   string `json:"providerTurnId"`
}

type ScenarioJudgeResult struct {
	ScenarioID        string                     `json:"scenarioId"`
	EvidenceAvailable bool                       `json:"evidenceAvailable"`
	Invocation        *JudgeInvocation           `json:"invocation"`
	Verdict           *CommunicationJudgeVerdict `json:"verdict"`
	Diagnostic        *ScenarioDiagnostic        `json:"diagnostic"`
}

type JudgeArtifact struct {
	SchemaVersion int                   `json:"schemaVersion"`
	Configuration JudgeConfiguration    `json:"configuration"`
	Scenarios     []ScenarioJudgeResult `json:"scenarios"`
}

type communicationJudgeChecks struct {
	ProgressSufficient      bool `json:"progressSufficient"`
	ProgressRestrained      bool `json:"progressRestrained"`
	QuestionsNecessary      bool `json:"questionsNecessary"`
	FinalTruthfulActionable bool `json:"finalTruthfulAndActionable"`
	InternalMechanicsHidden bool `json:"internalMechanicsHidden"`
}

type communicationJudgeMessage struct {
	Speaker TranscriptSpeaker   `json:"speaker"`
	Kind    TranscriptEntryKind `json:"kind"`
	Text    string              `json:"text"`
}

type communicationJudgeInput struct {
	Messages              []communicationJudgeMessage `json:"messages"`
	CommunicationContract ScenarioCommunication       `json:"communicationContract"`
	DeterministicVerifier evalverifier.Result         `json:"deterministicVerifier"`
}

type communicationJudgeRun struct {
	result       ScenarioJudgeResult
	judgeUsage   TokenUsageBucketResult
	observations []agent.TokenUsageObservation
}

type judgeTokenObserver struct {
	mutex        sync.Mutex
	observations []agent.TokenUsageObservation
	err          error
}

type communicationJudgePreparedCall struct {
	rubric       string
	input        json.RawMessage
	outputSchema json.RawMessage
	invocationID string
}

func FixedJudgeConfiguration() JudgeConfiguration {
	return JudgeConfiguration{
		Provider:                  JudgeProvider,
		ModelSelection:            JudgeModelSelection,
		Model:                     JudgeModel,
		ReasoningEffort:           JudgeReasoningEffort,
		ServiceTier:               nil,
		ApprovalPolicy:            JudgeApprovalPolicy,
		ProviderPermissionProfile: JudgeProviderPermission,
		ThreadPolicy:              JudgeThreadPolicy,
	}
}

func runCommunicationJudge(
	ctx context.Context,
	repoRoot string,
	codexCommand string,
	scenario Scenario,
	transcript ScenarioTranscript,
	verification evalverifier.Result,
) (run communicationJudgeRun, returnErr error) {
	if err := validateCommunicationJudgeInputs(ctx, scenario, transcript, verification); err != nil {
		return communicationJudgeRun{}, err
	}
	prepared, err := prepareCommunicationJudgeCall(repoRoot, scenario, transcript, verification)
	if err != nil {
		return communicationJudgeRun{}, err
	}
	workspaceRoot, err := os.MkdirTemp("/tmp", "setta-eval-judge-")
	if err != nil {
		return communicationJudgeRun{}, fmt.Errorf("create communication judge workspace: %w", err)
	}
	defer removeCommunicationJudgeWorkspace(workspaceRoot, &returnErr)

	observer := &judgeTokenObserver{observations: []agent.TokenUsageObservation{}}
	defer observer.finalize(scenario.ID, &run, &returnErr)
	runtime := newCommunicationJudgeRuntime(codexCommand, observer)
	defer shutdownCommunicationJudgeRuntime(runtime, &returnErr)

	requested := agent.Invocation{
		Model:           JudgeModel,
		ReasoningEffort: JudgeReasoningEffort,
		PermissionMode:  agent.PermissionModeReadOnly,
		ApprovalMode:    agent.ApprovalModeNever,
	}
	judgeCtx, cancel := context.WithTimeout(ctx, judgeTimeout)
	defer cancel()
	if err := resolveFixedCommunicationJudge(judgeCtx, runtime, requested); err != nil {
		return communicationJudgeRun{}, err
	}
	providerResult, err := runtime.RunFreshStructuredCall(judgeCtx, agent.FreshStructuredCallRequest{
		ID:            prepared.invocationID,
		WorkspaceRoot: workspaceRoot,
		Invocation:    requested,
		TokenUsageAttribution: agent.TokenUsageAttribution{
			Bucket:          agent.TokenUsageBucketJudge,
			Role:            agent.TokenUsageRoleJudge,
			InvocationID:    prepared.invocationID,
			Model:           JudgeModel,
			ReasoningEffort: JudgeReasoningEffort,
			ServiceTier:     nil,
		},
		DeveloperInstructions: prepared.rubric,
		Input:                 prepared.input,
		OutputSchema:          prepared.outputSchema,
	})
	if err != nil {
		return communicationJudgeRun{}, fmt.Errorf("run fixed communication judge: %w", err)
	}
	checks, err := decodeCommunicationJudgeChecks(providerResult.Output)
	if err != nil {
		return communicationJudgeRun{}, err
	}
	result := ScenarioJudgeResult{
		ScenarioID:        scenario.ID,
		EvidenceAvailable: true,
		Invocation: &JudgeInvocation{
			ID:               prepared.invocationID,
			ProviderThreadID: providerResult.ProviderThreadID,
			ProviderTurnID:   providerResult.ProviderTurnID,
		},
		Verdict: communicationJudgeVerdict(checks),
	}
	if err := result.Validate(); err != nil {
		return communicationJudgeRun{}, err
	}
	return communicationJudgeRun{result: result}, nil
}

func validateCommunicationJudgeInputs(
	ctx context.Context,
	scenario Scenario,
	transcript ScenarioTranscript,
	verification evalverifier.Result,
) error {
	if ctx == nil {
		return errors.New("communication judge context is required")
	}
	if err := scenario.Validate(); err != nil {
		return err
	}
	if err := transcript.Validate(); err != nil {
		return fmt.Errorf("validate communication judge transcript: %w", err)
	}
	if !transcript.EvidenceAvailable || transcript.ScenarioID != scenario.ID {
		return errors.New("communication judge requires the complete matching transcript")
	}
	if err := verification.Validate(); err != nil {
		return fmt.Errorf("validate communication judge verifier result: %w", err)
	}
	if verification.Verifier != scenario.Verifier {
		return fmt.Errorf("communication judge verifier is %s, want %s", verification.Verifier, scenario.Verifier)
	}
	return nil
}

func prepareCommunicationJudgeCall(
	repoRoot string,
	scenario Scenario,
	transcript ScenarioTranscript,
	verification evalverifier.Result,
) (communicationJudgePreparedCall, error) {
	rubric, err := readCommunicationRubric(repoRoot)
	if err != nil {
		return communicationJudgePreparedCall{}, err
	}
	input, err := communicationJudgeInputJSON(scenario, transcript, verification)
	if err != nil {
		return communicationJudgePreparedCall{}, err
	}
	outputSchema, err := communicationJudgeOutputSchema()
	if err != nil {
		return communicationJudgePreparedCall{}, err
	}
	invocationID, err := phase0RandomHex(16)
	if err != nil {
		return communicationJudgePreparedCall{}, fmt.Errorf("create communication judge invocation id: %w", err)
	}
	return communicationJudgePreparedCall{
		rubric:       rubric,
		input:        input,
		outputSchema: outputSchema,
		invocationID: "judge-" + invocationID,
	}, nil
}

func newCommunicationJudgeRuntime(
	codexCommand string,
	observer agent.TokenUsageObserver,
) *agent.Runtime {
	return agent.NewRuntime(agent.Config{
		Command: codexCommand,
		Args: []string{
			"app-server",
			"--listen", "stdio://",
			"--strict-config",
			"-c", `shell_environment_policy.inherit="none"`,
			"-c", `shell_environment_policy.set={ HOME = "/tmp", LANG = "C.UTF-8", PATH = "/usr/local/bin:/usr/bin:/bin", SHELL = "/bin/zsh" }`,
		},
		ExcludedEnv:        phase1ProviderExcludedEnvironmentNames(),
		TokenUsageObserver: observer,
		Version:            "setta-eval-judge",
	})
}

func resolveFixedCommunicationJudge(
	ctx context.Context,
	runtime *agent.Runtime,
	requested agent.Invocation,
) error {
	resolved, err := runtime.ResolveInvocation(ctx, requested)
	if err != nil {
		return fmt.Errorf("preflight fixed communication judge: %w", err)
	}
	if resolved.Model != JudgeModel || resolved.ReasoningEffort != JudgeReasoningEffort {
		return fmt.Errorf(
			"fixed communication judge resolved as %s/%s, want %s/%s",
			resolved.Model,
			resolved.ReasoningEffort,
			JudgeModel,
			JudgeReasoningEffort,
		)
	}
	return nil
}

func removeCommunicationJudgeWorkspace(path string, returnErr *error) {
	if err := os.RemoveAll(path); err != nil {
		*returnErr = errors.Join(*returnErr, fmt.Errorf("remove communication judge workspace: %w", err))
	}
}

func shutdownCommunicationJudgeRuntime(runtime *agent.Runtime, returnErr *error) {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), judgeShutdownTimeout)
	defer cancel()
	if err := runtime.Shutdown(shutdownCtx); err != nil {
		*returnErr = errors.Join(*returnErr, fmt.Errorf("stop communication judge provider: %w", err))
	}
}

func readCommunicationRubric(repoRoot string) (string, error) {
	path := filepath.Join(repoRoot, filepath.FromSlash(judgeRubricRelativePath))
	info, err := os.Lstat(path)
	if err != nil {
		return "", fmt.Errorf("inspect communication judge rubric: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > judgeRubricMaximumBytes {
		return "", fmt.Errorf("communication judge rubric must be a 1-%d byte regular file", judgeRubricMaximumBytes)
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read communication judge rubric: %w", err)
	}
	rubric := strings.TrimSpace(string(payload))
	if rubric == "" {
		return "", errors.New("communication judge rubric is empty")
	}
	return rubric, nil
}

func communicationJudgeInputJSON(
	scenario Scenario,
	transcript ScenarioTranscript,
	verification evalverifier.Result,
) (json.RawMessage, error) {
	messages := make([]communicationJudgeMessage, len(transcript.Entries))
	for index, entry := range transcript.Entries {
		messages[index] = communicationJudgeMessage{
			Speaker: entry.Speaker,
			Kind:    entry.Kind,
			Text:    entry.Text,
		}
	}
	payload, err := json.Marshal(communicationJudgeInput{
		Messages:              messages,
		CommunicationContract: scenario.Communication,
		DeterministicVerifier: verification,
	})
	if err != nil {
		return nil, fmt.Errorf("encode communication judge input: %w", err)
	}
	return payload, nil
}

func communicationJudgeOutputSchema() (json.RawMessage, error) {
	boolean := map[string]any{"type": "boolean"}
	properties := map[string]any{
		"progressSufficient":         boolean,
		"progressRestrained":         boolean,
		"questionsNecessary":         boolean,
		"finalTruthfulAndActionable": boolean,
		"internalMechanicsHidden":    boolean,
	}
	required := []string{
		"progressSufficient",
		"progressRestrained",
		"questionsNecessary",
		"finalTruthfulAndActionable",
		"internalMechanicsHidden",
	}
	payload, err := json.Marshal(map[string]any{
		"type":                 "object",
		"properties":           properties,
		"required":             required,
		"additionalProperties": false,
	})
	if err != nil {
		return nil, fmt.Errorf("encode communication judge output schema: %w", err)
	}
	return payload, nil
}

func decodeCommunicationJudgeChecks(payload json.RawMessage) (communicationJudgeChecks, error) {
	var checks communicationJudgeChecks
	if err := jsonio.DecodeSingle(bytes.NewReader(payload), &checks); err != nil {
		return communicationJudgeChecks{}, fmt.Errorf("decode communication judge verdict: %w", err)
	}
	return checks, nil
}

func communicationJudgeVerdict(checks communicationJudgeChecks) *CommunicationJudgeVerdict {
	verdict := &CommunicationJudgeVerdict{
		ProgressSufficient:      checks.ProgressSufficient,
		ProgressRestrained:      checks.ProgressRestrained,
		QuestionsNecessary:      checks.QuestionsNecessary,
		FinalTruthfulActionable: checks.FinalTruthfulActionable,
		InternalMechanicsHidden: checks.InternalMechanicsHidden,
		FailureTags:             []CommunicationFailureTag{},
	}
	if !checks.ProgressSufficient {
		verdict.FailureTags = append(verdict.FailureTags, CommunicationFailureProgressInsufficient)
	}
	if !checks.ProgressRestrained {
		verdict.FailureTags = append(verdict.FailureTags, CommunicationFailureProgressExcessive)
	}
	if !checks.QuestionsNecessary {
		verdict.FailureTags = append(verdict.FailureTags, CommunicationFailureQuestionUnnecessary)
	}
	if !checks.FinalTruthfulActionable {
		verdict.FailureTags = append(verdict.FailureTags, CommunicationFailureFinalUntruthful)
	}
	if !checks.InternalMechanicsHidden {
		verdict.FailureTags = append(verdict.FailureTags, CommunicationFailureMechanicsExposed)
	}
	verdict.OverallPass = len(verdict.FailureTags) == 0
	return verdict
}

func unavailableScenarioJudgeResult(
	scenarioID string,
	diagnostic *ScenarioDiagnostic,
) (ScenarioJudgeResult, error) {
	if diagnostic == nil {
		var err error
		diagnostic, err = NewScenarioDiagnostic(
			"judge_unavailable",
			"The scenario did not produce the complete deterministic evidence required by the communication judge.",
		)
		if err != nil {
			return ScenarioJudgeResult{}, err
		}
	}
	result := ScenarioJudgeResult{
		ScenarioID:        scenarioID,
		EvidenceAvailable: false,
		Diagnostic:        cloneScenarioDiagnostic(diagnostic),
	}
	if err := result.Validate(); err != nil {
		return ScenarioJudgeResult{}, err
	}
	return result, nil
}

func NewJudgeArtifact(scenarios []ScenarioJudgeResult) (JudgeArtifact, error) {
	artifact := JudgeArtifact{
		SchemaVersion: JudgeSchemaVersion,
		Configuration: FixedJudgeConfiguration(),
		Scenarios:     append([]ScenarioJudgeResult{}, scenarios...),
	}
	if err := artifact.Validate(); err != nil {
		return JudgeArtifact{}, err
	}
	return artifact, nil
}

func (configuration JudgeConfiguration) Validate() error {
	if !reflect.DeepEqual(configuration, FixedJudgeConfiguration()) {
		return errors.New("communication judge configuration does not match the fixed contract")
	}
	return nil
}

func (artifact JudgeArtifact) Validate() error {
	if artifact.SchemaVersion != JudgeSchemaVersion {
		return fmt.Errorf("judge artifact schemaVersion is %d, want %d", artifact.SchemaVersion, JudgeSchemaVersion)
	}
	if err := artifact.Configuration.Validate(); err != nil {
		return err
	}
	if artifact.Scenarios == nil || len(artifact.Scenarios) == 0 || len(artifact.Scenarios) > ResultMaximumScenarios {
		return fmt.Errorf("judge artifact contains %d scenarios, want 1-%d", len(artifact.Scenarios), ResultMaximumScenarios)
	}
	seen := map[string]bool{}
	for index, scenario := range artifact.Scenarios {
		if err := scenario.Validate(); err != nil {
			return fmt.Errorf("judge scenario[%d]: %w", index, err)
		}
		if seen[scenario.ScenarioID] {
			return fmt.Errorf("judge artifact repeats scenario %q", scenario.ScenarioID)
		}
		seen[scenario.ScenarioID] = true
	}
	return nil
}

func (result ScenarioJudgeResult) Validate() error {
	if err := validateScenarioIdentifier("judge scenario id", result.ScenarioID); err != nil {
		return err
	}
	if result.EvidenceAvailable {
		if result.Invocation == nil || result.Verdict == nil || result.Diagnostic != nil {
			return errors.New("available judge result requires invocation and verdict only")
		}
		if err := result.Invocation.Validate(); err != nil {
			return err
		}
		return result.Verdict.Validate()
	}
	if result.Invocation != nil || result.Verdict != nil || result.Diagnostic == nil {
		return errors.New("unavailable judge result requires only a diagnostic")
	}
	return result.Diagnostic.Validate()
}

func (invocation JudgeInvocation) Validate() error {
	for label, value := range map[string]string{
		"id":                 invocation.ID,
		"provider thread id": invocation.ProviderThreadID,
		"provider turn id":   invocation.ProviderTurnID,
	} {
		if strings.TrimSpace(value) == "" || strings.TrimSpace(value) != value {
			return fmt.Errorf("judge invocation %s is required without surrounding whitespace", label)
		}
	}
	return nil
}

func (verdict CommunicationJudgeVerdict) Validate() error {
	want := communicationJudgeVerdict(communicationJudgeChecks{
		ProgressSufficient:      verdict.ProgressSufficient,
		ProgressRestrained:      verdict.ProgressRestrained,
		QuestionsNecessary:      verdict.QuestionsNecessary,
		FinalTruthfulActionable: verdict.FinalTruthfulActionable,
		InternalMechanicsHidden: verdict.InternalMechanicsHidden,
	})
	if verdict.OverallPass != want.OverallPass || len(verdict.FailureTags) != len(want.FailureTags) {
		return errors.New("communication judge aggregate does not match its five checks")
	}
	for index := range want.FailureTags {
		if verdict.FailureTags[index] != want.FailureTags[index] {
			return errors.New("communication judge failure tags do not match its five checks")
		}
	}
	return nil
}

func (observer *judgeTokenObserver) ObserveTokenUsage(observation agent.TokenUsageObservation) error {
	observer.mutex.Lock()
	defer observer.mutex.Unlock()
	if observer.err != nil {
		return observer.err
	}
	if err := observation.Validate(); err != nil {
		observer.err = err
		return err
	}
	if observation.Attribution.Bucket != agent.TokenUsageBucketJudge ||
		observation.Attribution.Role != agent.TokenUsageRoleJudge {
		observer.err = errors.New("communication judge observer received non-judge accounting")
		return observer.err
	}
	observer.observations = append(observer.observations, observation)
	return nil
}

func (observer *judgeTokenObserver) snapshotOptional() ([]agent.TokenUsageObservation, error) {
	observer.mutex.Lock()
	defer observer.mutex.Unlock()
	if observer.err != nil {
		return nil, observer.err
	}
	return append([]agent.TokenUsageObservation{}, observer.observations...), nil
}

func (observer *judgeTokenObserver) finalize(
	scenarioID string,
	run *communicationJudgeRun,
	returnErr *error,
) {
	observations, observationErr := observer.snapshotOptional()
	if observationErr != nil {
		*returnErr = errors.Join(*returnErr, observationErr)
		return
	}
	run.observations = observations
	if len(observations) == 0 {
		if *returnErr == nil {
			*returnErr = errors.New("communication judge returned no token evidence")
		}
		return
	}
	usage, usageErr := AggregateScenarioTokenUsage(scenarioID, observations)
	if usageErr != nil {
		*returnErr = errors.Join(
			*returnErr,
			fmt.Errorf("aggregate communication judge token evidence: %w", usageErr),
		)
		return
	}
	if usage.System.EvidenceAvailable || !usage.Judge.EvidenceAvailable {
		*returnErr = errors.Join(
			*returnErr,
			errors.New("communication judge accounting did not stay in the judge bucket"),
		)
		return
	}
	run.judgeUsage = usage.Judge
}
