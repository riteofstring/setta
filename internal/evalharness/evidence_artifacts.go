package evalharness

import (
	"errors"
	"fmt"
	"reflect"

	"setta/internal/agent"
	evalverifier "setta/internal/evalharness/verifier"
)

const VerifierArtifactSchemaVersion = 2

type ScenarioVerifierResult struct {
	ScenarioID        string               `json:"scenarioId"`
	Attempt           int                  `json:"attempt"`
	EvidenceAvailable bool                 `json:"evidenceAvailable"`
	Result            *evalverifier.Result `json:"result"`
	Diagnostic        *ScenarioDiagnostic  `json:"diagnostic"`
}

type VerifierArtifact struct {
	SchemaVersion int                      `json:"schemaVersion"`
	Scenarios     []ScenarioVerifierResult `json:"scenarios"`
}

type EvaluationArtifactSet struct {
	Scenarios       []Scenario
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
		Attempt:           result.Attempt,
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
	if artifact.Scenarios == nil || len(artifact.Scenarios) == 0 || len(artifact.Scenarios) > ResultMaximumAttempts {
		return fmt.Errorf("verifier artifact contains %d attempts, want 1-%d", len(artifact.Scenarios), ResultMaximumAttempts)
	}
	seen := map[evaluationAttemptIdentity]bool{}
	for index, scenario := range artifact.Scenarios {
		if err := scenario.Validate(); err != nil {
			return fmt.Errorf("verifier scenario[%d]: %w", index, err)
		}
		identity := evaluationAttemptIdentity{ScenarioID: scenario.ScenarioID, Attempt: scenario.Attempt}
		if seen[identity] {
			return fmt.Errorf("verifier artifact repeats scenario attempt %s/%d", scenario.ScenarioID, scenario.Attempt)
		}
		seen[identity] = true
	}
	return nil
}

func (result ScenarioVerifierResult) Validate() error {
	if err := validateScenarioIdentifier("verifier scenario id", result.ScenarioID); err != nil {
		return err
	}
	if err := validateEvaluationAttempt(result.Attempt); err != nil {
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
	attempts := resultAttemptReferences(artifacts.Results)
	identities := make([]evaluationAttemptIdentity, len(attempts))
	for index, attempt := range attempts {
		identities[index] = attempt.identity
	}
	if err := validateEvaluationEvents(artifacts.Events, identities); err != nil {
		return err
	}
	if err := validateArtifactInvocationIdentity(
		artifacts,
		len(artifacts.Results.Scenarios),
		len(attempts),
	); err != nil {
		return err
	}
	return validateArtifactScenarios(artifacts, attempts)
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

func validateArtifactInvocationIdentity(
	artifacts EvaluationArtifactSet,
	scenarioCount int,
	attemptCount int,
) error {
	if artifacts.Manifest.SettaCommit != artifacts.Results.SettaCommit ||
		!artifacts.Manifest.StartedAt.Equal(artifacts.Results.StartedAt) ||
		!artifacts.Manifest.FinishedAt.Equal(artifacts.Results.FinishedAt) {
		return errors.New("manifest and results invocation identity do not match")
	}
	scenarioCounts := []int{
		len(artifacts.Scenarios),
		len(artifacts.Manifest.Scenarios),
	}
	for _, count := range scenarioCounts {
		if count != scenarioCount {
			return errors.New("eval artifacts contain different scenario counts")
		}
	}
	attemptCounts := []int{
		len(artifacts.Transcript.Scenarios),
		len(artifacts.TokenUsage.Scenarios),
		len(artifacts.VerifierResults.Scenarios),
		len(artifacts.JudgeResults.Scenarios),
	}
	for _, count := range attemptCounts {
		if count != attemptCount {
			return errors.New("eval artifacts contain different attempt counts")
		}
	}
	manifestAttemptCount := 0
	for _, scenario := range artifacts.Manifest.Scenarios {
		manifestAttemptCount += len(scenario.Attempts)
	}
	if manifestAttemptCount != attemptCount {
		return errors.New("manifest and results contain different attempt counts")
	}
	return nil
}

type resultAttemptReference struct {
	scenarioIndex int
	attemptIndex  int
	identity      evaluationAttemptIdentity
	result        ScenarioResult
}

func resultAttemptReferences(results Results) []resultAttemptReference {
	attempts := make([]resultAttemptReference, 0, len(results.Scenarios)*EvaluationAttemptRerun)
	for scenarioIndex, scenario := range results.Scenarios {
		attempts = append(attempts, resultAttemptReference{
			scenarioIndex: scenarioIndex,
			attemptIndex:  0,
			identity: evaluationAttemptIdentity{
				ScenarioID: scenario.ScenarioID,
				Attempt:    EvaluationAttemptFirst,
			},
			result: scenario.FirstAttempt,
		})
		if scenario.Rerun != nil {
			attempts = append(attempts, resultAttemptReference{
				scenarioIndex: scenarioIndex,
				attemptIndex:  1,
				identity: evaluationAttemptIdentity{
					ScenarioID: scenario.ScenarioID,
					Attempt:    EvaluationAttemptRerun,
				},
				result: *scenario.Rerun,
			})
		}
	}
	return attempts
}

func validateArtifactScenarios(
	artifacts EvaluationArtifactSet,
	attempts []resultAttemptReference,
) error {
	for index, result := range artifacts.Results.Scenarios {
		if err := validateArtifactScenarioIdentity(artifacts, index, result.ScenarioID); err != nil {
			return err
		}
		if len(artifacts.Manifest.Scenarios[index].Attempts) != scenarioResultAttemptCount(result) {
			return fmt.Errorf("scenario %s manifest and results contain different attempt counts", result.ScenarioID)
		}
		if err := artifacts.Scenarios[index].Validate(); err != nil {
			return fmt.Errorf("scenario %s contract is invalid: %w", result.ScenarioID, err)
		}
	}
	for artifactIndex, attempt := range attempts {
		if err := validateArtifactAttemptIdentity(artifacts, artifactIndex, attempt); err != nil {
			return err
		}
		if err := validateArtifactAttemptContracts(artifacts, artifactIndex, attempt); err != nil {
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
		artifacts.Scenarios[index].ID,
		artifacts.Manifest.Scenarios[index].ScenarioID,
	}
	for _, artifactScenarioID := range artifactScenarioIDs {
		if artifactScenarioID != scenarioID {
			return fmt.Errorf("eval artifact scenario[%d] identities do not match", index)
		}
	}
	return nil
}

func validateArtifactAttemptIdentity(
	artifacts EvaluationArtifactSet,
	artifactIndex int,
	attempt resultAttemptReference,
) error {
	manifest := artifacts.Manifest.Scenarios[attempt.scenarioIndex].Attempts[attempt.attemptIndex]
	identities := []evaluationAttemptIdentity{
		{ScenarioID: attempt.result.ScenarioID, Attempt: attempt.result.Attempt},
		{ScenarioID: artifacts.Transcript.Scenarios[artifactIndex].ScenarioID, Attempt: artifacts.Transcript.Scenarios[artifactIndex].Attempt},
		{ScenarioID: artifacts.TokenUsage.Scenarios[artifactIndex].ScenarioID, Attempt: artifacts.TokenUsage.Scenarios[artifactIndex].Attempt},
		{ScenarioID: artifacts.VerifierResults.Scenarios[artifactIndex].ScenarioID, Attempt: artifacts.VerifierResults.Scenarios[artifactIndex].Attempt},
		{ScenarioID: artifacts.JudgeResults.Scenarios[artifactIndex].ScenarioID, Attempt: artifacts.JudgeResults.Scenarios[artifactIndex].Attempt},
		{ScenarioID: artifacts.Manifest.Scenarios[attempt.scenarioIndex].ScenarioID, Attempt: manifest.Attempt},
	}
	for _, identity := range identities {
		if identity != attempt.identity {
			return fmt.Errorf("eval artifact attempt[%d] identities do not match", artifactIndex)
		}
	}
	return nil
}

func validateArtifactAttemptContracts(
	artifacts EvaluationArtifactSet,
	artifactIndex int,
	attempt resultAttemptReference,
) error {
	scenarioID := attempt.identity.ScenarioID
	scenario := artifacts.Scenarios[attempt.scenarioIndex]
	result := attempt.result
	manifest := artifacts.Manifest.Scenarios[attempt.scenarioIndex].Attempts[attempt.attemptIndex]
	transcript := artifacts.Transcript.Scenarios[artifactIndex]
	usage := artifacts.TokenUsage.Scenarios[artifactIndex]
	verifier := artifacts.VerifierResults.Scenarios[artifactIndex]
	judge := artifacts.JudgeResults.Scenarios[artifactIndex]
	events := evaluationAttemptEvents(artifacts.Events, attempt.identity)
	if !reflect.DeepEqual(manifest.Roles, result.Roles) {
		return fmt.Errorf("scenario %s attempt %d manifest roles do not match results", scenarioID, result.Attempt)
	}
	if artifacts.Manifest.Candidate != nil && len(result.Roles) > 0 {
		candidate := CandidateConfiguration{
			SchemaVersion: artifacts.Manifest.Candidate.SchemaVersion,
			ID:            artifacts.Manifest.Candidate.ID,
			Roles:         artifacts.Manifest.Candidate.Roles,
		}
		if err := validateAppliedCandidate(candidate, result.Roles); err != nil {
			return fmt.Errorf("scenario %s attempt %d candidate role evidence is invalid: %w", scenarioID, result.Attempt, err)
		}
	}
	if err := validateResultVerifierEvidence(scenarioID, result, verifier); err != nil {
		return err
	}
	if err := validateResultControlEvidence(events, scenario, result); err != nil {
		return err
	}
	if err := validateTokenEventEvidence(events, scenarioID, result.Attempt, usage, judge); err != nil {
		return err
	}
	if err := validateCompletedScenarioEvidence(
		events,
		artifacts.Manifest.Sandbox,
		scenarioID,
		result,
		transcript,
		usage,
	); err != nil {
		return err
	}
	if err := validateTranscriptEventEvidence(events, scenarioID, transcript); err != nil {
		return err
	}
	if err := validateJudgePrerequisites(scenarioID, result, transcript, verifier, judge); err != nil {
		return err
	}
	wantStatus := classifyScenarioAttemptStatus(result.Classification, &judge)
	if result.Status != wantStatus {
		return fmt.Errorf("scenario %s attempt %d status is %s, want %s from communication evidence", scenarioID, result.Attempt, result.Status, wantStatus)
	}
	return nil
}

func scenarioResultAttemptCount(result ScenarioEvaluationResult) int {
	if result.Rerun != nil {
		return EvaluationAttemptRerun
	}
	return EvaluationAttemptFirst
}

func evaluationAttemptEvents(
	events []EvaluationEvent,
	identity evaluationAttemptIdentity,
) []EvaluationEvent {
	filtered := make([]EvaluationEvent, 0)
	for _, event := range events {
		if event.ScenarioID == identity.ScenarioID && event.Attempt == identity.Attempt {
			filtered = append(filtered, event)
		}
	}
	return filtered
}

func validateResultControlEvidence(
	events []EvaluationEvent,
	scenario Scenario,
	result ScenarioResult,
) error {
	derived, err := buildScenarioControlResult(
		scenario,
		result.ExecutionOutcome,
		events,
		result.Verifier,
		result.Diagnostic,
	)
	if err != nil {
		return fmt.Errorf("scenario %s control event evidence is invalid: %w", scenario.ID, err)
	}
	if !reflect.DeepEqual(derived, result.Control) {
		return fmt.Errorf("scenario %s control result does not match typed event evidence", scenario.ID)
	}
	return nil
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
	attempt int,
	usage ScenarioTokenUsage,
	judge ScenarioJudgeResult,
) error {
	derivedUsage, err := deriveTokenEventUsage(events, scenarioID, attempt)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(derivedUsage, usage) {
		return fmt.Errorf("scenario %s token artifact does not match accounting event evidence", scenarioID)
	}
	if err := validateFixedJudgeTokenConfiguration(scenarioID, usage.Judge.ProviderTurns); err != nil {
		return err
	}
	return validateJudgeTokenIdentity(scenarioID, usage.Judge.ProviderTurns, judge)
}

func deriveTokenEventUsage(
	events []EvaluationEvent,
	scenarioID string,
	attempt int,
) (ScenarioTokenUsage, error) {
	observations := make([]agent.TokenUsageObservation, 0)
	for _, event := range events {
		if event.ScenarioID == scenarioID && event.Attempt == attempt && event.TokenUsage != nil {
			observations = append(observations, *event.TokenUsage)
		}
	}
	if len(observations) == 0 {
		return EmptyScenarioTokenUsage(scenarioID, attempt), nil
	}
	usage, err := AggregateScenarioTokenUsage(scenarioID, attempt, observations)
	if err != nil {
		return ScenarioTokenUsage{}, fmt.Errorf("scenario %s accounting event evidence is invalid: %w", scenarioID, err)
	}
	return usage, nil
}

func validateFixedJudgeTokenConfiguration(
	scenarioID string,
	turns []ProviderTurnTokenUsage,
) error {
	for _, turn := range turns {
		if turn.Attribution.Model != JudgeModel ||
			turn.Attribution.ReasoningEffort != JudgeReasoningEffort ||
			turn.Attribution.ServiceTier != nil {
			return fmt.Errorf("scenario %s judge token evidence does not use the fixed judge configuration", scenarioID)
		}
	}
	return nil
}

func validateJudgeTokenIdentity(
	scenarioID string,
	turns []ProviderTurnTokenUsage,
	judge ScenarioJudgeResult,
) error {
	if !judge.EvidenceAvailable {
		return nil
	}
	if len(turns) != 1 {
		return fmt.Errorf("scenario %s judge verdict requires exactly one judge provider turn", scenarioID)
	}
	turn := turns[0]
	if judge.Invocation == nil ||
		turn.Attribution.InvocationID != judge.Invocation.ID ||
		turn.ProviderThreadID != judge.Invocation.ProviderThreadID ||
		turn.ProviderTurnID != judge.Invocation.ProviderTurnID {
		return fmt.Errorf("scenario %s judge invocation does not match judge token evidence", scenarioID)
	}
	return nil
}

func validateTranscriptEventEvidence(
	events []EvaluationEvent,
	scenarioID string,
	transcript ScenarioTranscript,
) error {
	if !transcript.EvidenceAvailable {
		return nil
	}
	entries := make([]TranscriptEntry, 0, len(transcript.Entries))
	for _, event := range events {
		if event.ScenarioID != scenarioID || event.Attempt != transcript.Attempt {
			continue
		}
		entry, err := transcriptEntryFromEvaluationEvent(event)
		if err != nil {
			return fmt.Errorf("scenario %s public event evidence is invalid: %w", scenarioID, err)
		}
		if entry != nil {
			entry.Sequence = len(entries) + 1
			entries = append(entries, *entry)
		}
	}
	if !reflect.DeepEqual(entries, transcript.Entries) {
		return fmt.Errorf("scenario %s transcript does not match public event evidence", scenarioID)
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
	if !evaluationEventsContainSemanticEvidence(events, scenarioID, result.Attempt) {
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

func evaluationEventsContainSemanticEvidence(
	events []EvaluationEvent,
	scenarioID string,
	attempt int,
) bool {
	for _, event := range events {
		if event.ScenarioID == scenarioID && event.Attempt == attempt &&
			event.Kind != EvaluationEventTokenUsage {
			return true
		}
	}
	return false
}
