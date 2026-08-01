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
)

const phase1CleanupTimeout = 90 * time.Second

type Phase1EvaluationConfig struct {
	RepoRoot         string
	RecordingsRoot   string
	CodexLinuxBundle string
	DockerCommand    string
	CodexCommand     string
	PNPMCommand      string
}

type Phase1EvaluationOutput struct {
	Results      Results
	JudgeResults JudgeArtifact
	Artifacts    ResultArtifactPaths
}

type phase1NormalizedConfig struct {
	repoRoot         string
	recordingsRoot   string
	codexLinuxBundle string
	dockerCommand    string
	codexCommand     string
	pnpmCommand      string
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

// RunPhase1Evaluation owns the complete Phase 1 lifecycle, including the
// committed Phase 0 PASS gate. It never supplies an unsandboxed fallback.
func RunPhase1Evaluation(
	ctx context.Context,
	config Phase1EvaluationConfig,
) (Phase1EvaluationOutput, error) {
	if ctx == nil {
		return Phase1EvaluationOutput{}, errors.New("Phase 1 evaluation context is required")
	}
	repoRoot, err := resolvePhase1RepoRoot(config.RepoRoot)
	if err != nil {
		return Phase1EvaluationOutput{}, err
	}
	if err := requireCommittedPhase0Pass(ctx, repoRoot); err != nil {
		return Phase1EvaluationOutput{}, err
	}
	config.RepoRoot = repoRoot
	normalized, err := normalizePhase1EvaluationConfig(config)
	if err != nil {
		return Phase1EvaluationOutput{}, err
	}
	phase0Evidence, err := readCommittedPhase0PassEvidence(ctx, repoRoot)
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("read committed Phase 0 proof: %w", err)
	}
	normalized.phase0Codex = phase0Evidence.Codex
	scenarios, err := LoadScenarios(
		filepath.Join(normalized.repoRoot, "evals", "scenarios"),
		[]string{ScenarioVerifierStraightforward},
	)
	if err != nil {
		return Phase1EvaluationOutput{}, err
	}
	if len(scenarios) != 1 {
		return Phase1EvaluationOutput{}, fmt.Errorf("Phase 1 loaded %d scenarios, want one", len(scenarios))
	}
	repository, err := inspectPhase0Repository(ctx, normalized.repoRoot)
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("inspect Phase 1 repository: %w", err)
	}
	startedAt := time.Now().UTC()
	state := runPhase1Evaluation(ctx, normalized, scenarios[0])
	scenarioFinishedAt := time.Now().UTC()
	state = completePhase2Judge(ctx, normalized, scenarios[0], state)
	finishedAt := time.Now().UTC()
	manifest, err := buildEvaluationManifest(
		normalized.repoRoot,
		repository.Commit,
		normalized.phase0Codex,
		scenarios[0],
		startedAt,
		finishedAt,
		state.roles,
		state.sandbox,
	)
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("build Phase 2 manifest: %w", err)
	}
	return publishPhase1Evaluation(
		normalized.recordingsRoot,
		manifest,
		scenarios[0],
		startedAt,
		scenarioFinishedAt,
		finishedAt,
		state,
	)
}

func publishPhase1Evaluation(
	recordingsRoot string,
	manifest EvaluationManifest,
	scenario Scenario,
	startedAt time.Time,
	scenarioFinishedAt time.Time,
	finishedAt time.Time,
	state phase1RunState,
) (Phase1EvaluationOutput, error) {
	scenarioResult, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         scenario,
		ExecutionOutcome: state.outcome,
		StartedAt:        startedAt,
		FinishedAt:       scenarioFinishedAt,
		Roles:            state.roles,
		Verifier:         state.verifier,
		Diagnostic:       state.diagnostic,
	})
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("classify Phase 1 scenario: %w", err)
	}
	results, err := NewResults(manifest.SettaCommit, startedAt, finishedAt, []ScenarioResult{scenarioResult})
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("create Phase 1 results: %w", err)
	}
	tokenUsage := EmptyScenarioTokenUsage(scenario.ID)
	if state.tokenUsage != nil {
		tokenUsage = *state.tokenUsage
	}
	tokenArtifact, err := NewTokenUsageArtifact([]ScenarioTokenUsage{tokenUsage})
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("create Phase 1 token usage artifact: %w", err)
	}
	transcriptArtifact, err := phase2TranscriptArtifact(scenario.ID, state)
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("create Phase 2 transcript artifact: %w", err)
	}
	verifierArtifact, err := phase2VerifierArtifact(scenarioResult)
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("create Phase 2 verifier artifact: %w", err)
	}
	judgeArtifact, err := phase2JudgeArtifact(scenario.ID, state)
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("create Phase 2 judge artifact: %w", err)
	}
	artifactSet := EvaluationArtifactSet{
		Manifest:        manifest,
		Events:          append([]EvaluationEvent{}, state.events...),
		Transcript:      transcriptArtifact,
		TokenUsage:      tokenArtifact,
		VerifierResults: verifierArtifact,
		JudgeResults:    judgeArtifact,
		Results:         results,
	}
	artifacts, err := WriteResultArtifacts(recordingsRoot, artifactSet)
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("publish Phase 1 results: %w", err)
	}
	return Phase1EvaluationOutput{
		Results:      results,
		JudgeResults: judgeArtifact,
		Artifacts:    artifacts,
	}, nil
}

func phase2TranscriptArtifact(
	scenarioID string,
	state phase1RunState,
) (TranscriptArtifact, error) {
	transcript := state.transcript
	if transcript == nil {
		unavailable, err := unavailableScenarioTranscript(scenarioID, state.diagnostic)
		if err != nil {
			return TranscriptArtifact{}, err
		}
		transcript = &unavailable
	}
	return NewTranscriptArtifact([]ScenarioTranscript{*transcript})
}

func phase2VerifierArtifact(result ScenarioResult) (VerifierArtifact, error) {
	verifier, err := scenarioVerifierResult(result)
	if err != nil {
		return VerifierArtifact{}, err
	}
	return NewVerifierArtifact([]ScenarioVerifierResult{verifier})
}

func phase2JudgeArtifact(
	scenarioID string,
	state phase1RunState,
) (JudgeArtifact, error) {
	judge := state.judge
	if judge == nil {
		unavailable, err := unavailableScenarioJudgeResult(scenarioID, state.diagnostic)
		if err != nil {
			return JudgeArtifact{}, err
		}
		judge = &unavailable
	}
	return NewJudgeArtifact([]ScenarioJudgeResult{*judge})
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

func runPhase1Evaluation(
	ctx context.Context,
	config phase1NormalizedConfig,
	scenario Scenario,
) phase1RunState {
	client := phase0DockerClient{command: config.dockerCommand, repoRoot: config.repoRoot}
	if _, err := inspectPhase0Docker(ctx, client); err != nil {
		return phase1InfrastructureFailure("docker_preflight_failed", err, nil)
	}
	fixture, err := preparePhase1Fixture(ctx, config.repoRoot)
	if err != nil {
		return phase1InfrastructureFailure("fixture_preparation_failed", err, nil)
	}
	suffix, err := phase0RandomHex(6)
	if err != nil {
		return phase1InfrastructureFailure(
			"sandbox_identity_failed",
			errors.Join(err, fixture.cleanup()),
			nil,
		)
	}
	images, err := preparePhase1Images(ctx, client, suffix, phase1ImageConfig{
		repoRoot:         config.repoRoot,
		codexLinuxBundle: config.codexLinuxBundle,
		codexCommand:     config.codexCommand,
		pnpmCommand:      config.pnpmCommand,
		phase0Codex:      config.phase0Codex,
	})
	if err != nil {
		cleanupErr := fixture.cleanup()
		return phase1InfrastructureFailure("sandbox_image_failed", errors.Join(err, cleanupErr), nil)
	}
	sandbox, err := newManifestSandbox(config.repoRoot, images)
	if err != nil {
		cleanupContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
		cleanupErr := errors.Join(images.cleanup(cleanupContext), fixture.cleanup())
		cancel()
		return phase1InfrastructureFailure("sandbox_manifest_failed", errors.Join(err, cleanupErr), nil)
	}
	resources := newPhase1DockerResources(client, suffix, images, fixture)
	state := executePhase1Scenario(ctx, config, resources, scenario)
	state.sandbox = cloneManifestSandbox(sandbox)
	cleanupContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
	cleanupErr := resources.cleanup(cleanupContext)
	cancel()
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
	observation, err := RunPhase1ScenarioOverHTTP(
		scenarioContext,
		backend,
		scenario,
		phase1WorkspaceRoot,
	)
	state := phase1StateFromObservation(observation)
	provider := resources.provider
	stopContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
	stopErr := resources.stopController(stopContext)
	if stopErr != nil {
		cancel()
		return phase1InfrastructureFailure("controller_teardown_failed", stopErr, state.roles)
	}
	observations, tokenEvidenceErr := resources.readTokenUsageEvidence(stopContext)
	cancel()
	state = phase1StateAfterProviderEvidence(
		state,
		observation,
		provider,
		scenario.ID,
		observations,
		tokenEvidenceErr,
		err,
	)
	if state.outcome != ScenarioExecutionCompleted {
		return state
	}
	verification, err := resources.verify(ctx)
	if err != nil {
		return phase1InfrastructureFailure("verifier_execution_failed", err, state.roles)
	}
	state.verifier = &verification
	return state
}

func phase1StateAfterProviderEvidence(
	state phase1RunState,
	observation Phase1HTTPObservation,
	provider *phase1ProviderBroker,
	scenarioID string,
	observations []agent.TokenUsageObservation,
	tokenEvidenceErr error,
	orchestrationErr error,
) phase1RunState {
	if budgetFailure := provider.tokenBudgetFailure(); budgetFailure != nil {
		return phase1TokenBudgetFailureState(budgetFailure, observation.Roles)
	}
	if providerFailure := provider.providerFailure(); providerFailure != nil {
		return phase1InfrastructureFailure(
			"provider_boundary_failed",
			providerFailure,
			observation.Roles,
		)
	}
	if orchestrationErr != nil {
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
		observations,
		tokenEvidenceErr,
	)
}

func phase1CompletedTokenState(
	state phase1RunState,
	observation Phase1HTTPObservation,
	provider *phase1ProviderBroker,
	scenarioID string,
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
	tokenUsage, accountingErr := AggregateScenarioTokenUsage(scenarioID, observations)
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
	return phase1RunState{
		outcome:    ScenarioExecutionTimedOut,
		roles:      cloneEvaluatedRoleConfigurations(roles),
		diagnostic: diagnostic,
	}
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
		return phase2JudgeUnavailableState(state, scenario.ID, errors.Join(err, accountingErr))
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
	unavailable, err := unavailableScenarioJudgeResult(scenarioID, diagnostic)
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
	message := "Phase 1 infrastructure failed"
	if err != nil && strings.TrimSpace(err.Error()) != "" {
		message += ": " + err.Error()
	}
	diagnostic, diagnosticErr := NewScenarioDiagnostic(code, boundedResultDiagnostic(message))
	if diagnosticErr != nil {
		panic(fmt.Sprintf("invalid Phase 1 infrastructure diagnostic: %v", diagnosticErr))
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

func normalizePhase1EvaluationConfig(
	config Phase1EvaluationConfig,
) (phase1NormalizedConfig, error) {
	repoRoot := strings.TrimSpace(config.RepoRoot)
	if repoRoot == "" {
		var err error
		repoRoot, err = os.Getwd()
		if err != nil {
			return phase1NormalizedConfig{}, fmt.Errorf("find Phase 1 repository root: %w", err)
		}
	}
	repoRoot, err := cleanExistingPhase1Directory("repository root", repoRoot)
	if err != nil {
		return phase1NormalizedConfig{}, err
	}
	recordingsRoot := strings.TrimSpace(config.RecordingsRoot)
	if recordingsRoot == "" {
		recordingsRoot = filepath.Join(repoRoot, ".recordings", "setta-eval")
	}
	recordingsRoot, err = cleanAbsolutePhase1Path("recordings root", recordingsRoot)
	if err != nil {
		return phase1NormalizedConfig{}, err
	}
	bundle := strings.TrimSpace(config.CodexLinuxBundle)
	if bundle == "" {
		return phase1NormalizedConfig{}, errors.New("Phase 1 Codex Linux bundle is required")
	}
	bundle, err = cleanExistingPhase1Directory("Codex Linux bundle", bundle)
	if err != nil {
		return phase1NormalizedConfig{}, err
	}
	dockerCommand := strings.TrimSpace(config.DockerCommand)
	if dockerCommand == "" {
		dockerCommand = "docker"
	}
	codexCommand := strings.TrimSpace(config.CodexCommand)
	if codexCommand == "" {
		codexCommand = "codex"
	}
	pnpmCommand := strings.TrimSpace(config.PNPMCommand)
	if pnpmCommand == "" {
		pnpmCommand = "pnpm"
	}
	return phase1NormalizedConfig{
		repoRoot:         repoRoot,
		recordingsRoot:   recordingsRoot,
		codexLinuxBundle: bundle,
		dockerCommand:    dockerCommand,
		codexCommand:     codexCommand,
		pnpmCommand:      pnpmCommand,
	}, nil
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
