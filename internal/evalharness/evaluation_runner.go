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

type evaluationScenarioAttempt struct {
	attempt    int
	startedAt  time.Time
	finishedAt time.Time
	state      phase1RunState
}

type evaluationScenarioRun struct {
	scenario     Scenario
	firstAttempt evaluationScenarioAttempt
	rerun        *evaluationScenarioAttempt
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
	runs, sandbox, err := runEvaluationScenarios(ctx, normalized, scenarios)
	if err != nil {
		return EvaluationOutput{}, err
	}
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
) ([]evaluationScenarioRun, *ManifestSandbox, error) {
	client := phase0DockerClient{command: config.dockerCommand, repoRoot: config.repoRoot}
	if _, err := inspectPhase0Docker(ctx, client); err != nil {
		return failedEvaluationRuns(scenarios, "docker_preflight_failed", err, nil), nil, nil
	}
	images, sandbox, err := prepareEvaluationImages(ctx, config, client)
	if err != nil {
		return failedEvaluationRuns(scenarios, "sandbox_image_failed", err, nil), nil, nil
	}
	runs := make([]evaluationScenarioRun, 0, len(scenarios))
	var runErr error
	for _, scenario := range scenarios {
		run, err := runEvaluationScenarioWithRerun(
			scenario,
			func(attempt int) evaluationScenarioAttempt {
				return runEvaluationScenarioAttempt(
					ctx,
					config,
					client,
					images,
					sandbox,
					scenario,
					attempt,
				)
			},
		)
		if err != nil {
			runErr = err
			break
		}
		runs = append(runs, run)
	}
	cleanupContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
	cleanupErr := images.cleanup(cleanupContext)
	cancel()
	if runErr != nil {
		return nil, sandbox, errors.Join(runErr, cleanupErr)
	}
	if cleanupErr != nil {
		markEvaluationRunsFailed(runs, "sandbox_image_teardown_failed", cleanupErr, sandbox)
	}
	return runs, sandbox, nil
}

func runEvaluationScenarioWithRerun(
	scenario Scenario,
	execute func(int) evaluationScenarioAttempt,
) (evaluationScenarioRun, error) {
	if execute == nil {
		return evaluationScenarioRun{}, errors.New("evaluation scenario executor is required")
	}
	run := evaluationScenarioRun{
		scenario:     scenario,
		firstAttempt: execute(EvaluationAttemptFirst),
	}
	artifacts, err := buildEvaluationScenarioArtifacts(scenario, run.firstAttempt)
	if err != nil {
		return evaluationScenarioRun{}, fmt.Errorf(
			"classify first attempt for scenario %s: %w",
			scenario.ID,
			err,
		)
	}
	if artifacts.result.Status == ScenarioAttemptStatusFail {
		rerun := execute(EvaluationAttemptRerun)
		run.rerun = &rerun
	}
	return run, nil
}

func runEvaluationScenarioAttempt(
	ctx context.Context,
	config phase1NormalizedConfig,
	client phase0DockerClient,
	images *phase1Images,
	sandbox *ManifestSandbox,
	scenario Scenario,
	attempt int,
) evaluationScenarioAttempt {
	startedAt := time.Now().UTC()
	state := runEvaluationScenario(
		ctx,
		config,
		client,
		images,
		sandbox,
		scenario,
		attempt,
	)
	finishedAt := time.Now().UTC()
	state = completePhase2Judge(ctx, config, scenario, state)
	return evaluationScenarioAttempt{
		attempt:    attempt,
		startedAt:  startedAt,
		finishedAt: finishedAt,
		state:      state,
	}
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
			scenario: scenario,
			firstAttempt: evaluationScenarioAttempt{
				attempt:    EvaluationAttemptFirst,
				startedAt:  startedAt,
				finishedAt: time.Now().UTC(),
				state:      state,
			},
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
		state := phase1InfrastructureFailure(code, cause, runs[index].firstAttempt.state.roles)
		state.sandbox = cloneManifestSandbox(sandbox)
		runs[index].firstAttempt.state = state
		runs[index].firstAttempt.finishedAt = time.Now().UTC()
		runs[index].rerun = nil
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
	results := make([]ScenarioEvaluationResult, 0, len(runs))
	transcripts := make([]ScenarioTranscript, 0, len(runs)*EvaluationAttemptRerun)
	tokenUsage := make([]ScenarioTokenUsage, 0, len(runs)*EvaluationAttemptRerun)
	verifiers := make([]ScenarioVerifierResult, 0, len(runs)*EvaluationAttemptRerun)
	judges := make([]ScenarioJudgeResult, 0, len(runs)*EvaluationAttemptRerun)
	events := make([]EvaluationEvent, 0)
	for _, run := range runs {
		scenarios = append(scenarios, run.scenario)
		attempts := evaluationScenarioAttempts(run)
		attemptResults := make([]ScenarioResult, 0, len(attempts))
		for _, attempt := range attempts {
			artifacts, err := buildEvaluationScenarioArtifacts(run.scenario, attempt)
			if err != nil {
				return EvaluationArtifactSet{}, err
			}
			attemptResults = append(attemptResults, artifacts.result)
			transcripts = append(transcripts, artifacts.transcript)
			tokenUsage = append(tokenUsage, artifacts.tokenUsage)
			verifiers = append(verifiers, artifacts.verifier)
			judges = append(judges, artifacts.judge)
			events = append(events, artifacts.events...)
		}
		var rerun *ScenarioResult
		if len(attemptResults) == EvaluationAttemptRerun {
			rerun = &attemptResults[1]
		}
		result, err := NewScenarioEvaluationResult(run.scenario.ID, attemptResults[0], rerun)
		if err != nil {
			return EvaluationArtifactSet{}, fmt.Errorf("classify scenario %s stability: %w", run.scenario.ID, err)
		}
		results = append(results, result)
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
	scenario Scenario,
	attempt evaluationScenarioAttempt,
) (evaluationScenarioArtifacts, error) {
	control, err := buildScenarioControlResult(
		scenario,
		attempt.state.outcome,
		attempt.state.events,
		attempt.state.verifier,
		attempt.state.diagnostic,
	)
	if err != nil {
		return evaluationScenarioArtifacts{}, fmt.Errorf("grade scenario %s attempt %d user control: %w", scenario.ID, attempt.attempt, err)
	}
	transcript, err := scenarioTranscriptEvidence(scenario.ID, attempt.attempt, attempt.state)
	if err != nil {
		return evaluationScenarioArtifacts{}, err
	}
	judge, err := scenarioJudgeEvidence(scenario.ID, attempt.attempt, attempt.state)
	if err != nil {
		return evaluationScenarioArtifacts{}, err
	}
	result, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         scenario,
		Attempt:          attempt.attempt,
		ExecutionOutcome: attempt.state.outcome,
		StartedAt:        attempt.startedAt,
		FinishedAt:       attempt.finishedAt,
		Roles:            attempt.state.roles,
		Control:          control,
		Verifier:         attempt.state.verifier,
		Diagnostic:       attempt.state.diagnostic,
		Judge:            &judge,
	})
	if err != nil {
		return evaluationScenarioArtifacts{}, fmt.Errorf("classify scenario %s attempt %d: %w", scenario.ID, attempt.attempt, err)
	}
	verifier, err := scenarioVerifierResult(result)
	if err != nil {
		return evaluationScenarioArtifacts{}, err
	}
	usage := EmptyScenarioTokenUsage(scenario.ID, attempt.attempt)
	if attempt.state.tokenUsage != nil {
		usage = *attempt.state.tokenUsage
	}
	return evaluationScenarioArtifacts{
		result:     result,
		transcript: transcript,
		tokenUsage: usage,
		verifier:   verifier,
		judge:      judge,
		events:     append([]EvaluationEvent{}, attempt.state.events...),
	}, nil
}

func newEvaluationArtifactSet(
	manifest EvaluationManifest,
	scenarios []Scenario,
	scenarioResults []ScenarioEvaluationResult,
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
	attempt int,
	state phase1RunState,
) (ScenarioTranscript, error) {
	if state.transcript != nil {
		return *cloneScenarioTranscript(state.transcript), nil
	}
	return unavailableScenarioTranscript(scenarioID, attempt, state.diagnostic)
}

func scenarioJudgeEvidence(
	scenarioID string,
	attempt int,
	state phase1RunState,
) (ScenarioJudgeResult, error) {
	if state.judge != nil {
		return *state.judge, nil
	}
	return unavailableScenarioJudgeResult(scenarioID, attempt, state.diagnostic)
}

func evaluationScenarioAttempts(run evaluationScenarioRun) []evaluationScenarioAttempt {
	attempts := []evaluationScenarioAttempt{run.firstAttempt}
	if run.rerun != nil {
		attempts = append(attempts, *run.rerun)
	}
	return attempts
}
