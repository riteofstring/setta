package evalharness

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	evalverifier "setta/internal/evalharness/verifier"
)

const phase1CleanupTimeout = 90 * time.Second

type Phase1EvaluationConfig struct {
	RepoRoot         string
	RecordingsRoot   string
	CodexLinuxBundle string
	ToolchainImageID string
	DockerCommand    string
	CodexCommand     string
}

type Phase1EvaluationOutput struct {
	Results   Results
	Artifacts ResultArtifactPaths
}

type phase1NormalizedConfig struct {
	repoRoot         string
	recordingsRoot   string
	codexLinuxBundle string
	toolchainImageID string
	dockerCommand    string
	codexCommand     string
}

type phase1RunState struct {
	outcome    ScenarioExecutionOutcome
	roles      []EvaluatedRoleConfiguration
	verifier   *evalverifier.Result
	diagnostic *ScenarioDiagnostic
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
	finishedAt := time.Now().UTC()
	scenarioResult, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         scenarios[0],
		ExecutionOutcome: state.outcome,
		StartedAt:        startedAt,
		FinishedAt:       finishedAt,
		Roles:            state.roles,
		Verifier:         state.verifier,
		Diagnostic:       state.diagnostic,
	})
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("classify Phase 1 scenario: %w", err)
	}
	results, err := NewResults(repository.Commit, startedAt, finishedAt, []ScenarioResult{scenarioResult})
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("create Phase 1 results: %w", err)
	}
	artifacts, err := WriteResultArtifacts(normalized.recordingsRoot, results)
	if err != nil {
		return Phase1EvaluationOutput{}, fmt.Errorf("publish Phase 1 results: %w", err)
	}
	return Phase1EvaluationOutput{Results: results, Artifacts: artifacts}, nil
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
		toolchainImageID: config.toolchainImageID,
	})
	if err != nil {
		cleanupErr := fixture.cleanup()
		return phase1InfrastructureFailure("sandbox_image_failed", errors.Join(err, cleanupErr), nil)
	}
	resources := newPhase1DockerResources(client, suffix, images, fixture)
	state := executePhase1Scenario(ctx, config, resources, scenario)
	cleanupContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
	cleanupErr := resources.cleanup(cleanupContext)
	cancel()
	if cleanupErr != nil {
		return phase1InfrastructureFailure("sandbox_teardown_failed", cleanupErr, state.roles)
	}
	return state
}

func executePhase1Scenario(
	ctx context.Context,
	config phase1NormalizedConfig,
	resources *phase1DockerResources,
	scenario Scenario,
) phase1RunState {
	backend, err := resources.start(ctx, config.codexCommand)
	if err != nil {
		return phase1InfrastructureFailure("sandbox_start_failed", err, nil)
	}
	observation, err := RunPhase1ScenarioOverHTTP(
		ctx,
		backend,
		scenario,
		phase1WorkspaceRoot,
	)
	state := phase1StateFromObservation(observation)
	if err != nil {
		state = phase1InfrastructureFailure("scenario_orchestration_failed", err, observation.Roles)
	}
	stopContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
	stopErr := resources.stopController(stopContext)
	cancel()
	if stopErr != nil {
		return phase1InfrastructureFailure("controller_teardown_failed", stopErr, state.roles)
	}
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
	}
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
	return phase1RunState{
		outcome:    ScenarioExecutionInfrastructureFailed,
		roles:      cloneEvaluatedRoleConfigurations(roles),
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
	if !validPhase1ImageID(config.ToolchainImageID) {
		return phase1NormalizedConfig{}, errors.New("Phase 1 toolchain image must be an exact local sha256 image id")
	}
	dockerCommand := strings.TrimSpace(config.DockerCommand)
	if dockerCommand == "" {
		dockerCommand = "docker"
	}
	codexCommand := strings.TrimSpace(config.CodexCommand)
	if codexCommand == "" {
		codexCommand = "codex"
	}
	return phase1NormalizedConfig{
		repoRoot:         repoRoot,
		recordingsRoot:   recordingsRoot,
		codexLinuxBundle: bundle,
		toolchainImageID: config.ToolchainImageID,
		dockerCommand:    dockerCommand,
		codexCommand:     codexCommand,
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
