package evalharness

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/agent"
	evalverifier "setta/internal/evalharness/verifier"
	"setta/internal/evalharness/workspaceevidence"
)

const phase1CleanupTimeout = 90 * time.Second

type phase1NormalizedConfig struct {
	repoRoot         string
	recordingsRoot   string
	codexLinuxBundle string
	dockerCommand    string
	codexCommand     string
	pnpmCommand      string
	scenarioIDs      []string
	candidate        *loadedCandidateConfiguration
	phase0Codex      Phase0CodexEvidence
}

type phase1RunState struct {
	outcome    ScenarioExecutionOutcome
	roles      []EvaluatedRoleConfiguration
	verifier   *evalverifier.Result
	tokenUsage *ScenarioTokenUsage
	diagnostic *ScenarioDiagnostic
	transcript *ScenarioTranscript
	events     []EvaluationEvent
	sandbox    *ManifestSandbox
	judge      *ScenarioJudgeResult
}

func resolvePhase1RepoRoot(value string) (string, error) {
	repoRoot := strings.TrimSpace(value)
	if repoRoot == "" {
		var err error
		repoRoot, err = os.Getwd()
		if err != nil {
			return "", fmt.Errorf("find Phase 1 repository root: %w", err)
		}
	}
	absolute, err := filepath.Abs(repoRoot)
	if err != nil {
		return "", fmt.Errorf("resolve Phase 1 repository root: %w", err)
	}
	return cleanExistingPhase1Directory("repository root", absolute)
}

func runEvaluationScenario(
	ctx context.Context,
	config phase1NormalizedConfig,
	client phase0DockerClient,
	images *phase1Images,
	sandbox *ManifestSandbox,
	scenario Scenario,
	attempt int,
) phase1RunState {
	fixture, err := preparePhase1Fixture(ctx, config.repoRoot)
	if err != nil {
		state := phase1InfrastructureFailure("fixture_preparation_failed", err, nil)
		state.sandbox = cloneManifestSandbox(sandbox)
		return state
	}
	suffix, err := phase0RandomHex(6)
	if err != nil {
		state := phase1InfrastructureFailure(
			"sandbox_identity_failed",
			errors.Join(err, fixture.cleanup()),
			nil,
		)
		state.sandbox = cloneManifestSandbox(sandbox)
		return state
	}
	resources := newPhase1DockerResources(client, suffix, images, fixture)
	state := executePhase1Scenario(ctx, config, resources, scenario, attempt)
	state.sandbox = cloneManifestSandbox(sandbox)
	cleanupErr := resources.cleanupScenario()
	if cleanupErr != nil {
		failed := phase1InfrastructureFailure("sandbox_teardown_failed", cleanupErr, state.roles)
		failed.sandbox = cloneManifestSandbox(sandbox)
		return failed
	}
	return state
}

func executePhase1Scenario(
	ctx context.Context,
	config phase1NormalizedConfig,
	resources *phase1DockerResources,
	scenario Scenario,
	attempt int,
) phase1RunState {
	scenarioContext, abortScenario := context.WithCancel(ctx)
	defer abortScenario()
	backend, err := resources.start(
		ctx,
		config.codexCommand,
		scenario.Budget.HardTotalTokens,
		abortScenario,
	)
	if err != nil {
		return phase1InfrastructureFailure("sandbox_start_failed", err, nil)
	}
	workspaceObserver := newEvaluationWorkspaceObserverWithReader(func() (workspaceevidence.Digest, error) {
		return resources.readWorkspaceDigest(scenarioContext)
	})
	observation, err := RunPhase1ScenarioOverHTTP(
		scenarioContext,
		backend,
		scenario,
		attempt,
		phase1WorkspaceRoot,
		workspaceObserver,
		config.candidate,
	)
	state := phase1StateFromObservation(observation)
	provider := resources.provider
	controlRelay := resources.controlRelay
	controlFailure := controlRelay.beginHealthyShutdown()
	stopErr := resources.stopController()
	if stopErr != nil {
		return phase1InfrastructureFailure("controller_teardown_failed", stopErr, state.roles)
	}
	if controlFailure == nil {
		controlFailure = controlRelay.failure()
	}
	evidenceContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
	observations, tokenEvidenceErr := resources.readTokenUsageEvidence(evidenceContext)
	cancel()
	state = phase1StateAfterProviderEvidence(
		state,
		observation,
		provider,
		controlFailure,
		scenario.ID,
		attempt,
		observations,
		tokenEvidenceErr,
		err,
	)
	if state.outcome != ScenarioExecutionCompleted {
		return state
	}
	verification, err := resources.verify(ctx, scenario.Verifier)
	if err != nil {
		return phase1InfrastructureFailure("verifier_execution_failed", err, state.roles)
	}
	state.verifier = &verification
	return state
}

func runPhase1Cleanup(operation func(context.Context) error) error {
	ctx, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
	defer cancel()
	return operation(ctx)
}

func phase1StateAfterProviderEvidence(
	state phase1RunState,
	observation Phase1HTTPObservation,
	provider *phase1ProviderBroker,
	controlFailure error,
	scenarioID string,
	attempt int,
	observations []agent.TokenUsageObservation,
	tokenEvidenceErr error,
	orchestrationErr error,
) phase1RunState {
	if controlFailure != nil {
		return phase1InfrastructureFailure(
			"agent_control_transport_failed",
			controlFailure,
			observation.Roles,
		)
	}
	if budgetFailure := provider.tokenBudgetFailure(); budgetFailure != nil {
		return phase1TokenBudgetFailureState(
			budgetFailure,
			observation.Roles,
			scenarioID,
			attempt,
			observations,
			tokenEvidenceErr,
			provider.tokenBudget.snapshot(),
		)
	}
	if providerFailure := provider.providerFailure(); providerFailure != nil {
		return phase1InfrastructureFailure(
			"provider_boundary_failed",
			providerFailure,
			observation.Roles,
		)
	}
	if orchestrationErr != nil {
		var candidateFailure *candidateConfigurationError
		if errors.As(orchestrationErr, &candidateFailure) {
			return phase1InfrastructureFailure(
				"candidate_configuration_failed",
				candidateFailure,
				observation.Roles,
			)
		}
		return phase1InfrastructureFailure("scenario_orchestration_failed", orchestrationErr, observation.Roles)
	}
	if state.outcome != ScenarioExecutionInfrastructureFailed &&
		!provider.observedTokenUsage() {
		return phase1InfrastructureFailure(
			"token_budget_evidence_missing",
			errors.New("provider returned no thread/tokenUsage/updated evidence for the evaluated scenario"),
			observation.Roles,
		)
	}
	if state.outcome != ScenarioExecutionCompleted {
		return state
	}
	return phase1CompletedTokenState(
		state,
		observation,
		provider,
		scenarioID,
		attempt,
		observations,
		tokenEvidenceErr,
	)
}

func phase1CompletedTokenState(
	state phase1RunState,
	observation Phase1HTTPObservation,
	provider *phase1ProviderBroker,
	scenarioID string,
	attempt int,
	observations []agent.TokenUsageObservation,
	tokenEvidenceErr error,
) phase1RunState {
	if tokenEvidenceErr != nil {
		return phase1InfrastructureFailure(
			"token_usage_evidence_failed",
			tokenEvidenceErr,
			observation.Roles,
		)
	}
	tokenUsage, accountingErr := AggregateScenarioTokenUsage(scenarioID, attempt, observations)
	if accountingErr == nil {
		accountingErr = CorrelateSystemTokenUsage(tokenUsage, observation.ResolvedInvocations)
	}
	if accountingErr == nil {
		accountingErr = validatePhase1TokenAccounting(provider.tokenBudget.snapshot(), tokenUsage)
	}
	if accountingErr != nil {
		return phase1InfrastructureFailure(
			"token_usage_evidence_failed",
			accountingErr,
			observation.Roles,
		)
	}
	state.tokenUsage = &tokenUsage
	events, eventsErr := appendTokenUsageEvents(
		state.events,
		scenarioID,
		attempt,
		observations,
		time.Now().UTC(),
	)
	if eventsErr != nil {
		return phase1InfrastructureFailure(
			"event_artifact_failed",
			eventsErr,
			observation.Roles,
		)
	}
	state.events = events
	return state
}

func phase1TokenBudgetFailureState(
	failure *phase1TokenBudgetFailure,
	roles []EvaluatedRoleConfiguration,
	scenarioID string,
	attempt int,
	observations []agent.TokenUsageObservation,
	tokenEvidenceErr error,
	budget phase1TokenBudgetSnapshot,
) phase1RunState {
	if failure == nil || failure.kind != phase1TokenBudgetExceeded {
		return phase1InfrastructureFailure("token_budget_evidence_failed", failure, roles)
	}
	diagnostic, err := NewScenarioDiagnostic(
		"hard_total_tokens_exceeded",
		boundedResultDiagnostic(failure.Error()),
	)
	if err != nil {
		panic(fmt.Sprintf("invalid Phase 1 token-budget diagnostic: %v", err))
	}
	state := phase1RunState{
		outcome:    ScenarioExecutionTimedOut,
		roles:      cloneEvaluatedRoleConfigurations(roles),
		diagnostic: diagnostic,
	}
	if tokenEvidenceErr != nil {
		return phase1InfrastructureFailure("token_budget_evidence_failed", tokenEvidenceErr, roles)
	}
	tokenUsage, err := AggregateScenarioTokenUsage(scenarioID, attempt, observations)
	if err == nil {
		err = validatePhase1TokenAccounting(budget, tokenUsage)
	}
	if err != nil {
		return phase1InfrastructureFailure("token_budget_evidence_failed", err, roles)
	}
	state.tokenUsage = &tokenUsage
	state.events, err = appendTokenUsageEvents(
		nil,
		scenarioID,
		attempt,
		observations,
		time.Now().UTC(),
	)
	if err != nil {
		return phase1InfrastructureFailure("event_artifact_failed", err, roles)
	}
	return state
}

func phase1StateFromObservation(observation Phase1HTTPObservation) phase1RunState {
	if observation.ExecutionOutcome == "" {
		return phase1InfrastructureFailure(
			"scenario_outcome_missing",
			errors.New("Phase 1 HTTP orchestration returned no execution outcome"),
			observation.Roles,
		)
	}
	return phase1RunState{
		outcome:    observation.ExecutionOutcome,
		roles:      cloneEvaluatedRoleConfigurations(observation.Roles),
		diagnostic: cloneScenarioDiagnostic(observation.ScenarioDiagnostic),
		transcript: cloneScenarioTranscript(observation.transcript),
		events:     append([]EvaluationEvent{}, observation.events...),
	}
}

func completePhase2Judge(
	ctx context.Context,
	config phase1NormalizedConfig,
	scenario Scenario,
	state phase1RunState,
) phase1RunState {
	if state.outcome != ScenarioExecutionCompleted || state.verifier == nil || state.transcript == nil {
		return state
	}
	run, err := runCommunicationJudge(
		ctx,
		config.repoRoot,
		config.codexCommand,
		scenario,
		*state.transcript,
		*state.verifier,
	)
	state, accountingErr := applyPhase2JudgeAccounting(state, scenario.ID, run)
	if err != nil || accountingErr != nil {
		return phase2JudgeUnavailableState(
			state,
			scenario.ID,
			state.transcript.Attempt,
			errors.Join(err, accountingErr),
		)
	}
	state.judge = &run.result
	return state
}

func applyPhase2JudgeAccounting(
	state phase1RunState,
	scenarioID string,
	run communicationJudgeRun,
) (phase1RunState, error) {
	if !run.judgeUsage.EvidenceAvailable {
		if run.result.EvidenceAvailable {
			return state, errors.New("completed communication judge has no judge token artifact")
		}
		return state, nil
	}
	if state.tokenUsage == nil {
		return state, errors.New("communication judge has no system token artifact to accompany it")
	}
	usage := *state.tokenUsage
	usage.Judge = run.judgeUsage
	if err := usage.Validate(); err != nil {
		return state, err
	}
	events, err := appendTokenUsageEvents(
		state.events,
		scenarioID,
		usage.Attempt,
		run.observations,
		time.Now().UTC(),
	)
	if err != nil {
		return state, err
	}
	state.tokenUsage = &usage
	state.events = events
	return state, nil
}

func phase2JudgeUnavailableState(
	state phase1RunState,
	scenarioID string,
	attempt int,
	cause error,
) phase1RunState {
	message := "Communication judge evidence is unavailable"
	if cause != nil && strings.TrimSpace(cause.Error()) != "" {
		message += ": " + cause.Error()
	}
	diagnostic, err := NewScenarioDiagnostic(
		"communication_judge_failed",
		boundedResultDiagnostic(message),
	)
	if err != nil {
		panic(fmt.Sprintf("invalid communication judge diagnostic: %v", err))
	}
	unavailable, err := unavailableScenarioJudgeResult(scenarioID, attempt, diagnostic)
	if err != nil {
		panic(fmt.Sprintf("invalid unavailable communication judge result: %v", err))
	}
	state.judge = &unavailable
	return state
}

func cloneScenarioTranscript(value *ScenarioTranscript) *ScenarioTranscript {
	if value == nil {
		return nil
	}
	cloned := *value
	cloned.Entries = append([]TranscriptEntry{}, value.Entries...)
	cloned.Diagnostic = cloneScenarioDiagnostic(value.Diagnostic)
	return &cloned
}

func phase1InfrastructureFailure(
	code string,
	err error,
	roles []EvaluatedRoleConfiguration,
) phase1RunState {
	message := "Live evaluation infrastructure failed"
	if err != nil && strings.TrimSpace(err.Error()) != "" {
		message += ": " + err.Error()
	}
	diagnostic, diagnosticErr := NewScenarioDiagnostic(code, boundedResultDiagnostic(message))
	if diagnosticErr != nil {
		panic(fmt.Sprintf("invalid live-evaluation infrastructure diagnostic: %v", diagnosticErr))
	}
	normalizedRoles := cloneEvaluatedRoleConfigurations(roles)
	if normalizedRoles == nil {
		normalizedRoles = []EvaluatedRoleConfiguration{}
	}
	return phase1RunState{
		outcome:    ScenarioExecutionInfrastructureFailed,
		roles:      normalizedRoles,
		diagnostic: diagnostic,
	}
}

func normalizeEvaluationConfig(
	config EvaluationConfig,
) (phase1NormalizedConfig, error) {
	repoRoot, err := resolvePhase1RepoRoot(config.RepoRoot)
	if err != nil {
		return phase1NormalizedConfig{}, err
	}
	recordingsRoot, err := normalizeEvaluationRecordingsRoot(repoRoot, config.RecordingsRoot)
	if err != nil {
		return phase1NormalizedConfig{}, err
	}
	bundle, err := normalizeEvaluationBundle(config.CodexLinuxBundle)
	if err != nil {
		return phase1NormalizedConfig{}, err
	}
	candidate, err := normalizeCandidateConfiguration(repoRoot, config.CandidatePath)
	if err != nil {
		return phase1NormalizedConfig{}, err
	}
	return phase1NormalizedConfig{
		repoRoot:         repoRoot,
		recordingsRoot:   recordingsRoot,
		codexLinuxBundle: bundle,
		dockerCommand:    evaluationCommand(config.DockerCommand, "docker"),
		codexCommand:     evaluationCommand(config.CodexCommand, "codex"),
		pnpmCommand:      evaluationCommand(config.PNPMCommand, "pnpm"),
		scenarioIDs:      append([]string{}, config.ScenarioIDs...),
		candidate:        candidate,
	}, nil
}

func normalizeEvaluationRecordingsRoot(repoRoot string, value string) (string, error) {
	recordingsRoot := strings.TrimSpace(value)
	if recordingsRoot == "" {
		recordingsRoot = filepath.Join(repoRoot, ".recordings", "setta-eval")
	}
	return cleanAbsolutePhase1Path("recordings root", recordingsRoot)
}

func normalizeEvaluationBundle(value string) (string, error) {
	bundle := strings.TrimSpace(value)
	if bundle == "" {
		return "", errors.New("Phase 1 Codex Linux bundle is required")
	}
	return cleanExistingPhase1Directory("Codex Linux bundle", bundle)
}

func evaluationCommand(value string, fallback string) string {
	command := strings.TrimSpace(value)
	if command == "" {
		return fallback
	}
	return command
}

func normalizeCandidateConfiguration(
	repoRoot string,
	value string,
) (*loadedCandidateConfiguration, error) {
	if strings.TrimSpace(value) != value {
		return nil, errors.New("eval candidate path must not have surrounding whitespace")
	}
	if value == "" {
		return nil, nil
	}
	path := value
	if !filepath.IsAbs(path) {
		path = filepath.Join(repoRoot, path)
	}
	path, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve eval candidate path: %w", err)
	}
	loaded, err := loadCandidateConfiguration(filepath.Clean(path))
	if err != nil {
		return nil, err
	}
	return &loaded, nil
}

func cleanExistingPhase1Directory(label string, value string) (string, error) {
	path, err := cleanAbsolutePhase1Path(label, value)
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", fmt.Errorf("resolve Phase 1 %s: %w", label, err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("inspect Phase 1 %s: %w", label, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("Phase 1 %s must be a directory: %s", label, resolved)
	}
	return resolved, nil
}

func cleanAbsolutePhase1Path(label string, value string) (string, error) {
	path, err := filepath.Abs(value)
	if err != nil {
		return "", fmt.Errorf("resolve Phase 1 %s: %w", label, err)
	}
	if path != filepath.Clean(value) {
		return "", fmt.Errorf("Phase 1 %s must be an absolute clean path: %s", label, value)
	}
	return path, nil
}
