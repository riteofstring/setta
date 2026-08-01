package evalharness

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"time"
)

type EvaluationConfig struct {
	RepoRoot         string
	RecordingsRoot   string
	CodexLinuxBundle string
	DockerCommand    string
	CodexCommand     string
	PNPMCommand      string
	ScenarioIDs      []string
	CandidatePath    string
}

type EvaluationOutput struct {
	Results      Results
	JudgeResults JudgeArtifact
	Artifacts    ResultArtifactPaths
}

type evaluationScenarioRun struct {
	scenario   Scenario
	startedAt  time.Time
	finishedAt time.Time
	state      phase1RunState
}

type evaluationScenarioArtifacts struct {
	result     ScenarioResult
	transcript ScenarioTranscript
	tokenUsage ScenarioTokenUsage
	verifier   ScenarioVerifierResult
	judge      ScenarioJudgeResult
	events     []EvaluationEvent
}

// RunEvaluation owns the complete live-evaluation lifecycle, including the
// committed Phase 0 PASS gate. It runs the complete scenario catalog by
// default, accepts an ordered subset, and never supplies an unsandboxed
// fallback.
func RunEvaluation(ctx context.Context, config EvaluationConfig) (EvaluationOutput, error) {
	if ctx == nil {
		return EvaluationOutput{}, errors.New("live evaluation context is required")
	}
	repoRoot, err := resolvePhase1RepoRoot(config.RepoRoot)
	if err != nil {
		return EvaluationOutput{}, err
	}
	if err := requireCommittedPhase0Pass(ctx, repoRoot); err != nil {
		return EvaluationOutput{}, err
	}
	config.RepoRoot = repoRoot
	normalized, err := normalizeEvaluationConfig(config)
	if err != nil {
		return EvaluationOutput{}, err
	}
	phase0Evidence, err := readCommittedPhase0PassEvidence(ctx, repoRoot)
	if err != nil {
		return EvaluationOutput{}, fmt.Errorf("read committed Phase 0 proof: %w", err)
	}
	normalized.phase0Codex = phase0Evidence.Codex
	scenarios, err := LoadScenarios(
		filepath.Join(normalized.repoRoot, "evals", "scenarios"),
		normalized.scenarioIDs,
	)
	if err != nil {
		return EvaluationOutput{}, err
	}
	repository, err := inspectPhase0Repository(ctx, normalized.repoRoot)
	if err != nil {
		return EvaluationOutput{}, fmt.Errorf("inspect live-evaluation repository: %w", err)
	}
	startedAt := time.Now().UTC()
	runs, sandbox := runEvaluationScenarios(ctx, normalized, scenarios)
	finishedAt := time.Now().UTC()
	manifest, err := buildEvaluationManifest(
		normalized.repoRoot,
		repository.Commit,
		normalized.phase0Codex,
		runs,
		startedAt,
		finishedAt,
		sandbox,
		normalized.candidate,
	)
	if err != nil {
		return EvaluationOutput{}, fmt.Errorf("build live-evaluation manifest: %w", err)
	}
	return publishEvaluation(
		normalized.recordingsRoot,
		manifest,
		runs,
		startedAt,
		finishedAt,
	)
}

func runEvaluationScenarios(
	ctx context.Context,
	config phase1NormalizedConfig,
	scenarios []Scenario,
) ([]evaluationScenarioRun, *ManifestSandbox) {
	client := phase0DockerClient{command: config.dockerCommand, repoRoot: config.repoRoot}
	if _, err := inspectPhase0Docker(ctx, client); err != nil {
		return failedEvaluationRuns(scenarios, "docker_preflight_failed", err, nil), nil
	}
	images, sandbox, err := prepareEvaluationImages(ctx, config, client)
	if err != nil {
		return failedEvaluationRuns(scenarios, "sandbox_image_failed", err, nil), nil
	}
	runs := make([]evaluationScenarioRun, 0, len(scenarios))
	for _, scenario := range scenarios {
		startedAt := time.Now().UTC()
		state := runEvaluationScenario(ctx, config, client, images, sandbox, scenario)
		finishedAt := time.Now().UTC()
		state = completePhase2Judge(ctx, config, scenario, state)
		runs = append(runs, evaluationScenarioRun{
			scenario:   scenario,
			startedAt:  startedAt,
			finishedAt: finishedAt,
			state:      state,
		})
	}
	cleanupContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
	cleanupErr := images.cleanup(cleanupContext)
	cancel()
	if cleanupErr != nil {
		markEvaluationRunsFailed(runs, "sandbox_image_teardown_failed", cleanupErr, sandbox)
	}
	return runs, sandbox
}

func prepareEvaluationImages(
	ctx context.Context,
	config phase1NormalizedConfig,
	client phase0DockerClient,
) (*phase1Images, *ManifestSandbox, error) {
	suffix, err := phase0RandomHex(6)
	if err != nil {
		return nil, nil, fmt.Errorf("create sandbox image identity: %w", err)
	}
	images, err := preparePhase1Images(ctx, client, suffix, phase1ImageConfig{
		repoRoot:         config.repoRoot,
		codexLinuxBundle: config.codexLinuxBundle,
		codexCommand:     config.codexCommand,
		pnpmCommand:      config.pnpmCommand,
		phase0Codex:      config.phase0Codex,
	})
	if err != nil {
		return nil, nil, err
	}
	sandbox, err := newManifestSandbox(config.repoRoot, images)
	if err == nil {
		return images, sandbox, nil
	}
	cleanupContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
	cleanupErr := images.cleanup(cleanupContext)
	cancel()
	return nil, nil, errors.Join(err, cleanupErr)
}

func failedEvaluationRuns(
	scenarios []Scenario,
	code string,
	cause error,
	sandbox *ManifestSandbox,
) []evaluationScenarioRun {
	runs := make([]evaluationScenarioRun, 0, len(scenarios))
	for _, scenario := range scenarios {
		startedAt := time.Now().UTC()
		state := phase1InfrastructureFailure(code, cause, nil)
		state.sandbox = cloneManifestSandbox(sandbox)
		runs = append(runs, evaluationScenarioRun{
			scenario:   scenario,
			startedAt:  startedAt,
			finishedAt: time.Now().UTC(),
			state:      state,
		})
	}
	return runs
}

func markEvaluationRunsFailed(
	runs []evaluationScenarioRun,
	code string,
	cause error,
	sandbox *ManifestSandbox,
) {
	for index := range runs {
		state := phase1InfrastructureFailure(code, cause, runs[index].state.roles)
		state.sandbox = cloneManifestSandbox(sandbox)
		runs[index].state = state
	}
}

func publishEvaluation(
	recordingsRoot string,
	manifest EvaluationManifest,
	runs []evaluationScenarioRun,
	startedAt time.Time,
	finishedAt time.Time,
) (EvaluationOutput, error) {
	artifacts, err := buildEvaluationArtifactSet(manifest, runs, startedAt, finishedAt)
	if err != nil {
		return EvaluationOutput{}, err
	}
	paths, err := WriteResultArtifacts(recordingsRoot, artifacts)
	if err != nil {
		return EvaluationOutput{}, fmt.Errorf("publish live-evaluation results: %w", err)
	}
	return EvaluationOutput{
		Results:      artifacts.Results,
		JudgeResults: artifacts.JudgeResults,
		Artifacts:    paths,
	}, nil
}

func buildEvaluationArtifactSet(
	manifest EvaluationManifest,
	runs []evaluationScenarioRun,
	startedAt time.Time,
	finishedAt time.Time,
) (EvaluationArtifactSet, error) {
	scenarios := make([]Scenario, 0, len(runs))
	results := make([]ScenarioResult, 0, len(runs))
	transcripts := make([]ScenarioTranscript, 0, len(runs))
	tokenUsage := make([]ScenarioTokenUsage, 0, len(runs))
	verifiers := make([]ScenarioVerifierResult, 0, len(runs))
	judges := make([]ScenarioJudgeResult, 0, len(runs))
	events := make([]EvaluationEvent, 0)
	for _, run := range runs {
		artifacts, err := buildEvaluationScenarioArtifacts(run)
		if err != nil {
			return EvaluationArtifactSet{}, err
		}
		scenarios = append(scenarios, run.scenario)
		results = append(results, artifacts.result)
		transcripts = append(transcripts, artifacts.transcript)
		tokenUsage = append(tokenUsage, artifacts.tokenUsage)
		verifiers = append(verifiers, artifacts.verifier)
		judges = append(judges, artifacts.judge)
		events = append(events, artifacts.events...)
	}
	return newEvaluationArtifactSet(
		manifest,
		scenarios,
		results,
		transcripts,
		tokenUsage,
		verifiers,
		judges,
		events,
		startedAt,
		finishedAt,
	)
}

func buildEvaluationScenarioArtifacts(
	run evaluationScenarioRun,
) (evaluationScenarioArtifacts, error) {
	control, err := buildScenarioControlResult(
		run.scenario,
		run.state.outcome,
		run.state.events,
		run.state.verifier,
		run.state.diagnostic,
	)
	if err != nil {
		return evaluationScenarioArtifacts{}, fmt.Errorf("grade scenario %s user control: %w", run.scenario.ID, err)
	}
	result, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         run.scenario,
		ExecutionOutcome: run.state.outcome,
		StartedAt:        run.startedAt,
		FinishedAt:       run.finishedAt,
		Roles:            run.state.roles,
		Control:          control,
		Verifier:         run.state.verifier,
		Diagnostic:       run.state.diagnostic,
	})
	if err != nil {
		return evaluationScenarioArtifacts{}, fmt.Errorf("classify scenario %s: %w", run.scenario.ID, err)
	}
	transcript, err := scenarioTranscriptEvidence(run.scenario.ID, run.state)
	if err != nil {
		return evaluationScenarioArtifacts{}, err
	}
	verifier, err := scenarioVerifierResult(result)
	if err != nil {
		return evaluationScenarioArtifacts{}, err
	}
	judge, err := scenarioJudgeEvidence(run.scenario.ID, run.state)
	if err != nil {
		return evaluationScenarioArtifacts{}, err
	}
	usage := EmptyScenarioTokenUsage(run.scenario.ID)
	if run.state.tokenUsage != nil {
		usage = *run.state.tokenUsage
	}
	return evaluationScenarioArtifacts{
		result:     result,
		transcript: transcript,
		tokenUsage: usage,
		verifier:   verifier,
		judge:      judge,
		events:     append([]EvaluationEvent{}, run.state.events...),
	}, nil
}

func newEvaluationArtifactSet(
	manifest EvaluationManifest,
	scenarios []Scenario,
	scenarioResults []ScenarioResult,
	transcripts []ScenarioTranscript,
	tokenUsage []ScenarioTokenUsage,
	verifiers []ScenarioVerifierResult,
	judges []ScenarioJudgeResult,
	events []EvaluationEvent,
	startedAt time.Time,
	finishedAt time.Time,
) (EvaluationArtifactSet, error) {
	results, err := NewResults(manifest.SettaCommit, startedAt, finishedAt, scenarioResults)
	if err != nil {
		return EvaluationArtifactSet{}, fmt.Errorf("create live-evaluation results: %w", err)
	}
	transcriptArtifact, err := NewTranscriptArtifact(transcripts)
	if err != nil {
		return EvaluationArtifactSet{}, fmt.Errorf("create transcript artifact: %w", err)
	}
	tokenArtifact, err := NewTokenUsageArtifact(tokenUsage)
	if err != nil {
		return EvaluationArtifactSet{}, fmt.Errorf("create token-usage artifact: %w", err)
	}
	verifierArtifact, err := NewVerifierArtifact(verifiers)
	if err != nil {
		return EvaluationArtifactSet{}, fmt.Errorf("create verifier artifact: %w", err)
	}
	judgeArtifact, err := NewJudgeArtifact(judges)
	if err != nil {
		return EvaluationArtifactSet{}, fmt.Errorf("create judge artifact: %w", err)
	}
	return EvaluationArtifactSet{
		Scenarios:       append([]Scenario{}, scenarios...),
		Manifest:        manifest,
		Events:          append([]EvaluationEvent{}, events...),
		Transcript:      transcriptArtifact,
		TokenUsage:      tokenArtifact,
		VerifierResults: verifierArtifact,
		JudgeResults:    judgeArtifact,
		Results:         results,
	}, nil
}

func scenarioTranscriptEvidence(
	scenarioID string,
	state phase1RunState,
) (ScenarioTranscript, error) {
	if state.transcript != nil {
		return *cloneScenarioTranscript(state.transcript), nil
	}
	return unavailableScenarioTranscript(scenarioID, state.diagnostic)
}

func scenarioJudgeEvidence(
	scenarioID string,
	state phase1RunState,
) (ScenarioJudgeResult, error) {
	if state.judge != nil {
		return *state.judge, nil
	}
	return unavailableScenarioJudgeResult(scenarioID, state.diagnostic)
}
