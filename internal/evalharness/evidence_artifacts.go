package evalharness

import (
	"errors"
	"fmt"
	"reflect"

	"setta/internal/agent"
	evalverifier "setta/internal/evalharness/verifier"
)

const VerifierArtifactSchemaVersion = 1

type ScenarioVerifierResult struct {
	ScenarioID        string               `json:"scenarioId"`
	EvidenceAvailable bool                 `json:"evidenceAvailable"`
	Result            *evalverifier.Result `json:"result"`
	Diagnostic        *ScenarioDiagnostic  `json:"diagnostic"`
}

type VerifierArtifact struct {
	SchemaVersion int                      `json:"schemaVersion"`
	Scenarios     []ScenarioVerifierResult `json:"scenarios"`
}

type EvaluationArtifactSet struct {
	Manifest        EvaluationManifest
	Events          []EvaluationEvent
	Transcript      TranscriptArtifact
	TokenUsage      TokenUsageArtifact
	VerifierResults VerifierArtifact
	JudgeResults    JudgeArtifact
	Results         Results
}

func NewVerifierArtifact(scenarios []ScenarioVerifierResult) (VerifierArtifact, error) {
	artifact := VerifierArtifact{
		SchemaVersion: VerifierArtifactSchemaVersion,
		Scenarios:     append([]ScenarioVerifierResult{}, scenarios...),
	}
	if err := artifact.Validate(); err != nil {
		return VerifierArtifact{}, err
	}
	return artifact, nil
}

func scenarioVerifierResult(result ScenarioResult) (ScenarioVerifierResult, error) {
	evidence := ScenarioVerifierResult{
		ScenarioID:        result.ScenarioID,
		EvidenceAvailable: result.Verifier != nil,
		Result:            cloneVerifierResult(result.Verifier),
	}
	if result.Verifier == nil {
		evidence.Diagnostic = cloneScenarioDiagnostic(result.Diagnostic)
		if evidence.Diagnostic == nil {
			var err error
			evidence.Diagnostic, err = NewScenarioDiagnostic(
				"verifier_unavailable",
				"The scenario ended before the hidden verifier could run.",
			)
			if err != nil {
				return ScenarioVerifierResult{}, err
			}
		}
	}
	if err := evidence.Validate(); err != nil {
		return ScenarioVerifierResult{}, err
	}
	return evidence, nil
}

func (artifact VerifierArtifact) Validate() error {
	if artifact.SchemaVersion != VerifierArtifactSchemaVersion {
		return fmt.Errorf("verifier artifact schemaVersion is %d, want %d", artifact.SchemaVersion, VerifierArtifactSchemaVersion)
	}
	if artifact.Scenarios == nil || len(artifact.Scenarios) == 0 || len(artifact.Scenarios) > ResultMaximumScenarios {
		return fmt.Errorf("verifier artifact contains %d scenarios, want 1-%d", len(artifact.Scenarios), ResultMaximumScenarios)
	}
	seen := map[string]bool{}
	for index, scenario := range artifact.Scenarios {
		if err := scenario.Validate(); err != nil {
			return fmt.Errorf("verifier scenario[%d]: %w", index, err)
		}
		if seen[scenario.ScenarioID] {
			return fmt.Errorf("verifier artifact repeats scenario %q", scenario.ScenarioID)
		}
		seen[scenario.ScenarioID] = true
	}
	return nil
}

func (result ScenarioVerifierResult) Validate() error {
	if err := validateScenarioIdentifier("verifier scenario id", result.ScenarioID); err != nil {
		return err
	}
	if result.EvidenceAvailable {
		if result.Result == nil || result.Diagnostic != nil {
			return errors.New("available verifier evidence requires only a result")
		}
		return result.Result.Validate()
	}
	if result.Result != nil || result.Diagnostic == nil {
		return errors.New("unavailable verifier evidence requires only a diagnostic")
	}
	return result.Diagnostic.Validate()
}

func (artifacts EvaluationArtifactSet) Validate() error {
	if err := validateEvaluationArtifactComponents(artifacts); err != nil {
		return err
	}
	scenarioIDs := make([]string, len(artifacts.Results.Scenarios))
	for index, scenario := range artifacts.Results.Scenarios {
		scenarioIDs[index] = scenario.ScenarioID
	}
	if err := validateEvaluationEvents(artifacts.Events, scenarioIDs); err != nil {
		return err
	}
	if err := validateArtifactInvocationIdentity(artifacts, len(scenarioIDs)); err != nil {
		return err
	}
	return validateArtifactScenarios(artifacts, scenarioIDs)
}

func validateEvaluationArtifactComponents(artifacts EvaluationArtifactSet) error {
	if err := artifacts.Results.Validate(); err != nil {
		return err
	}
	if err := artifacts.Manifest.Validate(); err != nil {
		return err
	}
	if err := artifacts.Transcript.Validate(); err != nil {
		return err
	}
	if err := artifacts.TokenUsage.Validate(); err != nil {
		return err
	}
	if err := validateResultTokenUsage(artifacts.Results, artifacts.TokenUsage); err != nil {
		return err
	}
	if err := artifacts.VerifierResults.Validate(); err != nil {
		return err
	}
	if err := artifacts.JudgeResults.Validate(); err != nil {
		return err
	}
	return nil
}

func validateArtifactInvocationIdentity(artifacts EvaluationArtifactSet, scenarioCount int) error {
	if artifacts.Manifest.SettaCommit != artifacts.Results.SettaCommit ||
		!artifacts.Manifest.StartedAt.Equal(artifacts.Results.StartedAt) ||
		!artifacts.Manifest.FinishedAt.Equal(artifacts.Results.FinishedAt) {
		return errors.New("manifest and results invocation identity do not match")
	}
	counts := []int{
		len(artifacts.Manifest.Scenarios),
		len(artifacts.Transcript.Scenarios),
		len(artifacts.TokenUsage.Scenarios),
		len(artifacts.VerifierResults.Scenarios),
		len(artifacts.JudgeResults.Scenarios),
	}
	for _, count := range counts {
		if count != scenarioCount {
			return errors.New("eval artifacts contain different scenario counts")
		}
	}
	return nil
}

func validateArtifactScenarios(artifacts EvaluationArtifactSet, scenarioIDs []string) error {
	for index, scenarioID := range scenarioIDs {
		if err := validateArtifactScenarioIdentity(artifacts, index, scenarioID); err != nil {
			return err
		}
		if err := validateArtifactScenarioContracts(artifacts, index, scenarioID); err != nil {
			return err
		}
	}
	return nil
}

func validateArtifactScenarioIdentity(
	artifacts EvaluationArtifactSet,
	index int,
	scenarioID string,
) error {
	artifactScenarioIDs := []string{
		artifacts.Manifest.Scenarios[index].ScenarioID,
		artifacts.Transcript.Scenarios[index].ScenarioID,
		artifacts.TokenUsage.Scenarios[index].ScenarioID,
		artifacts.VerifierResults.Scenarios[index].ScenarioID,
		artifacts.JudgeResults.Scenarios[index].ScenarioID,
	}
	for _, artifactScenarioID := range artifactScenarioIDs {
		if artifactScenarioID != scenarioID {
			return fmt.Errorf("eval artifact scenario[%d] identities do not match", index)
		}
	}
	return nil
}

func validateArtifactScenarioContracts(
	artifacts EvaluationArtifactSet,
	index int,
	scenarioID string,
) error {
	result := artifacts.Results.Scenarios[index]
	manifest := artifacts.Manifest.Scenarios[index]
	transcript := artifacts.Transcript.Scenarios[index]
	usage := artifacts.TokenUsage.Scenarios[index]
	verifier := artifacts.VerifierResults.Scenarios[index]
	judge := artifacts.JudgeResults.Scenarios[index]
	if !reflect.DeepEqual(manifest.Roles, result.Roles) {
		return fmt.Errorf("scenario %s manifest roles do not match results", scenarioID)
	}
	if err := validateResultVerifierEvidence(scenarioID, result, verifier); err != nil {
		return err
	}
	if err := validateTokenEventEvidence(artifacts.Events, scenarioID, usage, judge); err != nil {
		return err
	}
	if err := validateCompletedScenarioEvidence(
		artifacts.Events,
		artifacts.Manifest.Sandbox,
		scenarioID,
		result,
		transcript,
		usage,
	); err != nil {
		return err
	}
	return validateJudgePrerequisites(scenarioID, result, transcript, verifier, judge)
}

func validateResultVerifierEvidence(
	scenarioID string,
	result ScenarioResult,
	verifier ScenarioVerifierResult,
) error {
	if verifier.EvidenceAvailable != (result.Verifier != nil) {
		return fmt.Errorf("scenario %s verifier availability does not match results", scenarioID)
	}
	if !reflect.DeepEqual(verifier.Result, result.Verifier) {
		return fmt.Errorf("scenario %s verifier evidence does not match results", scenarioID)
	}
	return nil
}

func validateTokenEventEvidence(
	events []EvaluationEvent,
	scenarioID string,
	usage ScenarioTokenUsage,
	judge ScenarioJudgeResult,
) error {
	if judge.EvidenceAvailable && !usage.Judge.EvidenceAvailable {
		return fmt.Errorf("scenario %s judge verdict has no judge token evidence", scenarioID)
	}
	if usage.System.EvidenceAvailable &&
		!evaluationEventsContainTokenBucket(events, scenarioID, agent.TokenUsageBucketSystem) {
		return fmt.Errorf("scenario %s system token artifact has no accounting event evidence", scenarioID)
	}
	if usage.Judge.EvidenceAvailable &&
		!evaluationEventsContainTokenBucket(events, scenarioID, agent.TokenUsageBucketJudge) {
		return fmt.Errorf("scenario %s judge token artifact has no accounting event evidence", scenarioID)
	}
	return nil
}

func validateCompletedScenarioEvidence(
	events []EvaluationEvent,
	sandbox *ManifestSandbox,
	scenarioID string,
	result ScenarioResult,
	transcript ScenarioTranscript,
	usage ScenarioTokenUsage,
) error {
	if result.ExecutionOutcome != ScenarioExecutionCompleted {
		return nil
	}
	if sandbox == nil {
		return fmt.Errorf("completed scenario %s omitted sandbox image identities", scenarioID)
	}
	if !transcript.EvidenceAvailable {
		return fmt.Errorf("completed scenario %s omitted its public transcript", scenarioID)
	}
	if !usage.System.EvidenceAvailable {
		return fmt.Errorf("completed scenario %s omitted system token evidence", scenarioID)
	}
	if !evaluationEventsContainScenario(events, scenarioID) {
		return fmt.Errorf("completed scenario %s omitted its semantic event evidence", scenarioID)
	}
	return nil
}

func validateJudgePrerequisites(
	scenarioID string,
	result ScenarioResult,
	transcript ScenarioTranscript,
	verifier ScenarioVerifierResult,
	judge ScenarioJudgeResult,
) error {
	if judge.EvidenceAvailable &&
		(result.ExecutionOutcome != ScenarioExecutionCompleted ||
			!transcript.EvidenceAvailable || !verifier.EvidenceAvailable) {
		return fmt.Errorf("scenario %s judge verdict lacks its required completed evidence", scenarioID)
	}
	return nil
}

func evaluationEventsContainScenario(events []EvaluationEvent, scenarioID string) bool {
	for _, event := range events {
		if event.ScenarioID == scenarioID {
			return true
		}
	}
	return false
}

func evaluationEventsContainTokenBucket(
	events []EvaluationEvent,
	scenarioID string,
	bucket agent.TokenUsageBucket,
) bool {
	for _, event := range events {
		if event.ScenarioID == scenarioID && event.TokenUsage != nil &&
			event.TokenUsage.Attribution.Bucket == bucket {
			return true
		}
	}
	return false
}
