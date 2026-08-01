package evalharness

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"setta/internal/conversation"
	evalverifier "setta/internal/evalharness/verifier"
)

const (
	ResultSchemaVersion          = 3
	ResultMaximumScenarios       = 32
	ResultMaximumDiagnosticBytes = 4 * 1024
	EvaluationAttemptFirst       = 1
	EvaluationAttemptRerun       = 2
	ResultMaximumAttempts        = ResultMaximumScenarios * EvaluationAttemptRerun
)

type ScenarioAttemptStatus string

const (
	ScenarioAttemptStatusPass                  ScenarioAttemptStatus = "pass"
	ScenarioAttemptStatusFail                  ScenarioAttemptStatus = "fail"
	ScenarioAttemptStatusInfrastructureFailure ScenarioAttemptStatus = "infrastructure_failure"
)

type ScenarioStability string

type evaluationAttemptIdentity struct {
	ScenarioID string
	Attempt    int
}

const (
	ScenarioStabilityPass                  ScenarioStability = "PASS"
	ScenarioStabilityStableFail            ScenarioStability = "STABLE_FAIL"
	ScenarioStabilityFlaky                 ScenarioStability = "FLAKY"
	ScenarioStabilityInfrastructureFailure ScenarioStability = "INFRASTRUCTURE_FAILURE"
)

type ScenarioClassification string

const (
	ScenarioClassificationPass                  ScenarioClassification = "pass"
	ScenarioClassificationAbilityFailure        ScenarioClassification = "ability_failure"
	ScenarioClassificationControlFailure        ScenarioClassification = "control_failure"
	ScenarioClassificationTimeout               ScenarioClassification = "timeout"
	ScenarioClassificationInfrastructureFailure ScenarioClassification = "infrastructure_failure"
)

type ScenarioExecutionOutcome string

const (
	ScenarioExecutionCompleted            ScenarioExecutionOutcome = "completed"
	ScenarioExecutionCancelled            ScenarioExecutionOutcome = "cancelled"
	ScenarioExecutionFailed               ScenarioExecutionOutcome = "failed"
	ScenarioExecutionControlFailed        ScenarioExecutionOutcome = "control_failed"
	ScenarioExecutionTimedOut             ScenarioExecutionOutcome = "timed_out"
	ScenarioExecutionInfrastructureFailed ScenarioExecutionOutcome = "infrastructure_failed"
)

// EvaluatedRoleConfiguration records the production role profile that was in
// force and the concrete provider settings it resolved to before the scenario
// began. It deliberately reuses the production role contracts rather than
// maintaining an eval-owned mirror of model, permission, or budget settings.
type EvaluatedRoleConfiguration struct {
	Role            conversation.Role                         `json:"role"`
	EffectiveSource conversation.RoleProfileSourceKind        `json:"effectiveSource"`
	Requested       conversation.RoleProfile                  `json:"requested"`
	Resolved        conversation.ResolvedRoleProfileSelection `json:"resolved"`
}

type ScenarioDiagnostic struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ScenarioResult struct {
	ScenarioID           string                       `json:"scenarioId"`
	Attempt              int                          `json:"attempt"`
	Status               ScenarioAttemptStatus        `json:"status"`
	Classification       ScenarioClassification       `json:"classification"`
	ExecutionOutcome     ScenarioExecutionOutcome     `json:"executionOutcome"`
	StartedAt            time.Time                    `json:"startedAt"`
	FinishedAt           time.Time                    `json:"finishedAt"`
	DurationMilliseconds int64                        `json:"durationMilliseconds"`
	Roles                []EvaluatedRoleConfiguration `json:"roles"`
	Control              ScenarioControlResult        `json:"control"`
	Verifier             *evalverifier.Result         `json:"verifier"`
	Diagnostic           *ScenarioDiagnostic          `json:"diagnostic"`
}

type ScenarioEvaluationResult struct {
	ScenarioID   string            `json:"scenarioId"`
	Stability    ScenarioStability `json:"stability"`
	FirstAttempt ScenarioResult    `json:"firstAttempt"`
	Rerun        *ScenarioResult   `json:"rerun"`
}

type Results struct {
	SchemaVersion int                        `json:"schemaVersion"`
	SettaCommit   string                     `json:"settaCommit"`
	StartedAt     time.Time                  `json:"startedAt"`
	FinishedAt    time.Time                  `json:"finishedAt"`
	Scenarios     []ScenarioEvaluationResult `json:"scenarios"`
}

type ScenarioResultInput struct {
	Scenario         Scenario
	Attempt          int
	ExecutionOutcome ScenarioExecutionOutcome
	StartedAt        time.Time
	FinishedAt       time.Time
	Roles            []EvaluatedRoleConfiguration
	Control          ScenarioControlResult
	Verifier         *evalverifier.Result
	Diagnostic       *ScenarioDiagnostic
	Judge            *ScenarioJudgeResult
}

// CaptureBaselineRoleConfigurations combines the app-global Director profile
// with the workspace-effective Agent, Narrator, and Side Agent profiles. Both
// inputs are validated by their production owner before the smaller immutable
// result projection is created.
func CaptureBaselineRoleConfigurations(
	global conversation.RoleConfiguration,
	workspace conversation.RoleConfiguration,
) ([]EvaluatedRoleConfiguration, error) {
	if err := global.Validate(); err != nil {
		return nil, fmt.Errorf("validate global role configuration: %w", err)
	}
	if global.Scope.Kind != conversation.RoleProfileScopeGlobal {
		return nil, fmt.Errorf("global role configuration has scope %s", global.Scope.Kind)
	}
	if err := workspace.Validate(); err != nil {
		return nil, fmt.Errorf("validate workspace role configuration: %w", err)
	}
	if workspace.Scope.Kind != conversation.RoleProfileScopeWorkspace {
		return nil, fmt.Errorf("workspace role configuration has scope %s", workspace.Scope.Kind)
	}

	globalProfiles := roleProfileConfigurationsByRole(global.Profiles)
	workspaceProfiles := roleProfileConfigurationsByRole(workspace.Profiles)
	roles := make([]EvaluatedRoleConfiguration, 0, len(evaluatedRoleOrder))
	for _, role := range evaluatedRoleOrder {
		profiles := workspaceProfiles
		if role == conversation.RoleDirector {
			profiles = globalProfiles
		}
		profile, ok := profiles[role]
		if !ok {
			return nil, fmt.Errorf("role configuration omitted %s", role)
		}
		roles = append(roles, evaluatedRoleConfiguration(profile))
	}
	return roles, nil
}

func NewScenarioDiagnostic(code string, message string) (*ScenarioDiagnostic, error) {
	diagnostic := &ScenarioDiagnostic{Code: code, Message: message}
	if err := diagnostic.Validate(); err != nil {
		return nil, err
	}
	return diagnostic, nil
}

// NewScenarioResult is the single attempt-classification boundary. A completed
// workspace is objectively correct only when its hidden verifier and control
// evidence pass; communication evidence then determines the overall attempt
// status without compensating for an objective failure.
func NewScenarioResult(input ScenarioResultInput) (ScenarioResult, error) {
	if err := input.Scenario.Validate(); err != nil {
		return ScenarioResult{}, fmt.Errorf("validate classified scenario: %w", err)
	}
	if input.Judge != nil {
		if err := input.Judge.Validate(); err != nil {
			return ScenarioResult{}, fmt.Errorf("validate scenario communication evidence: %w", err)
		}
		if input.Judge.ScenarioID != input.Scenario.ID || input.Judge.Attempt != input.Attempt {
			return ScenarioResult{}, errors.New("scenario communication evidence identity does not match the classified attempt")
		}
	}
	classification, err := classifyScenarioExecution(
		input.ExecutionOutcome,
		input.Verifier,
		input.Control,
	)
	if err != nil {
		return ScenarioResult{}, err
	}
	result := ScenarioResult{
		ScenarioID:           input.Scenario.ID,
		Attempt:              input.Attempt,
		Status:               classifyScenarioAttemptStatus(classification, input.Judge),
		Classification:       classification,
		ExecutionOutcome:     input.ExecutionOutcome,
		StartedAt:            input.StartedAt.UTC(),
		FinishedAt:           input.FinishedAt.UTC(),
		DurationMilliseconds: input.FinishedAt.Sub(input.StartedAt).Milliseconds(),
		Roles:                cloneEvaluatedRoleConfigurations(input.Roles),
		Control:              cloneScenarioControlResult(input.Control),
		Verifier:             cloneVerifierResult(input.Verifier),
		Diagnostic:           cloneScenarioDiagnostic(input.Diagnostic),
	}
	if result.Verifier != nil && result.Verifier.Verifier != input.Scenario.Verifier {
		return ScenarioResult{}, fmt.Errorf(
			"scenario %s used verifier %s, want %s",
			input.Scenario.ID,
			result.Verifier.Verifier,
			input.Scenario.Verifier,
		)
	}
	if err := result.Validate(); err != nil {
		return ScenarioResult{}, err
	}
	return result, nil
}

func NewScenarioEvaluationResult(
	scenarioID string,
	firstAttempt ScenarioResult,
	rerun *ScenarioResult,
) (ScenarioEvaluationResult, error) {
	result := ScenarioEvaluationResult{
		ScenarioID:   scenarioID,
		FirstAttempt: cloneScenarioResult(firstAttempt),
		Rerun:        cloneScenarioResultPointer(rerun),
	}
	result.Stability = classifyScenarioStability(result.FirstAttempt.Status, result.Rerun)
	if err := result.Validate(); err != nil {
		return ScenarioEvaluationResult{}, err
	}
	return result, nil
}

func NewResults(
	settaCommit string,
	startedAt time.Time,
	finishedAt time.Time,
	scenarios []ScenarioEvaluationResult,
) (Results, error) {
	results := Results{
		SchemaVersion: ResultSchemaVersion,
		SettaCommit:   settaCommit,
		StartedAt:     startedAt.UTC(),
		FinishedAt:    finishedAt.UTC(),
		Scenarios:     cloneScenarioResults(scenarios),
	}
	if err := results.Validate(); err != nil {
		return Results{}, err
	}
	return results, nil
}

func classifyScenarioAttemptStatus(
	classification ScenarioClassification,
	judge *ScenarioJudgeResult,
) ScenarioAttemptStatus {
	if classification == ScenarioClassificationInfrastructureFailure {
		return ScenarioAttemptStatusInfrastructureFailure
	}
	if classification != ScenarioClassificationPass {
		return ScenarioAttemptStatusFail
	}
	if judge == nil || !judge.EvidenceAvailable || judge.Verdict == nil {
		return ScenarioAttemptStatusInfrastructureFailure
	}
	if judge.Verdict.OverallPass {
		return ScenarioAttemptStatusPass
	}
	return ScenarioAttemptStatusFail
}

func classifyScenarioStability(
	firstStatus ScenarioAttemptStatus,
	rerun *ScenarioResult,
) ScenarioStability {
	switch firstStatus {
	case ScenarioAttemptStatusPass:
		return ScenarioStabilityPass
	case ScenarioAttemptStatusInfrastructureFailure:
		return ScenarioStabilityInfrastructureFailure
	case ScenarioAttemptStatusFail:
		if rerun == nil {
			return ""
		}
		switch rerun.Status {
		case ScenarioAttemptStatusPass:
			return ScenarioStabilityFlaky
		case ScenarioAttemptStatusFail:
			return ScenarioStabilityStableFail
		case ScenarioAttemptStatusInfrastructureFailure:
			return ScenarioStabilityInfrastructureFailure
		}
	}
	return ""
}

func (diagnostic ScenarioDiagnostic) Validate() error {
	if err := validateResultIdentifier("scenario diagnostic code", diagnostic.Code); err != nil {
		return err
	}
	if !utf8.ValidString(diagnostic.Message) {
		return errors.New("scenario diagnostic message must be valid UTF-8")
	}
	if strings.TrimSpace(diagnostic.Message) == "" {
		return errors.New("scenario diagnostic message is required")
	}
	if strings.TrimSpace(diagnostic.Message) != diagnostic.Message {
		return errors.New("scenario diagnostic message must not have surrounding whitespace")
	}
	if len(diagnostic.Message) > ResultMaximumDiagnosticBytes {
		return fmt.Errorf(
			"scenario diagnostic message is %d bytes, maximum is %d",
			len(diagnostic.Message),
			ResultMaximumDiagnosticBytes,
		)
	}
	return nil
}

func (result ScenarioResult) Validate() error {
	if err := validateScenarioIdentifier("scenario result id", result.ScenarioID); err != nil {
		return err
	}
	if err := validateEvaluationAttempt(result.Attempt); err != nil {
		return fmt.Errorf("scenario %s: %w", result.ScenarioID, err)
	}
	if err := validateResultTimes(
		"scenario "+result.ScenarioID,
		result.StartedAt,
		result.FinishedAt,
		result.DurationMilliseconds,
	); err != nil {
		return err
	}
	if err := validateEvaluatedRoleConfigurations(result.Roles, result.ExecutionOutcome); err != nil {
		return fmt.Errorf("scenario %s: %w", result.ScenarioID, err)
	}
	if result.Verifier != nil {
		if err := result.Verifier.Validate(); err != nil {
			return fmt.Errorf("scenario %s verifier: %w", result.ScenarioID, err)
		}
	}
	if err := result.Control.Validate(); err != nil {
		return fmt.Errorf("scenario %s control: %w", result.ScenarioID, err)
	}
	classification, err := classifyScenarioExecution(
		result.ExecutionOutcome,
		result.Verifier,
		result.Control,
	)
	if err != nil {
		return fmt.Errorf("scenario %s: %w", result.ScenarioID, err)
	}
	if result.Classification != classification {
		return fmt.Errorf(
			"scenario %s classification is %s, want %s",
			result.ScenarioID,
			result.Classification,
			classification,
		)
	}
	if err := validateScenarioAttemptStatus(result); err != nil {
		return fmt.Errorf("scenario %s attempt %d: %w", result.ScenarioID, result.Attempt, err)
	}
	return validateScenarioDiagnosticForOutcome(result.ExecutionOutcome, result.Diagnostic)
}

func (result ScenarioEvaluationResult) Validate() error {
	if err := validateScenarioIdentifier("scenario evaluation result id", result.ScenarioID); err != nil {
		return err
	}
	if err := result.FirstAttempt.Validate(); err != nil {
		return fmt.Errorf("scenario %s first attempt: %w", result.ScenarioID, err)
	}
	if result.FirstAttempt.ScenarioID != result.ScenarioID ||
		result.FirstAttempt.Attempt != EvaluationAttemptFirst {
		return fmt.Errorf("scenario %s has an invalid first-attempt identity", result.ScenarioID)
	}
	if result.Rerun != nil {
		if err := result.Rerun.Validate(); err != nil {
			return fmt.Errorf("scenario %s rerun: %w", result.ScenarioID, err)
		}
		if result.Rerun.ScenarioID != result.ScenarioID ||
			result.Rerun.Attempt != EvaluationAttemptRerun {
			return fmt.Errorf("scenario %s has an invalid rerun identity", result.ScenarioID)
		}
		if result.Rerun.StartedAt.Before(result.FirstAttempt.FinishedAt) {
			return fmt.Errorf("scenario %s rerun overlaps its first attempt", result.ScenarioID)
		}
	}
	want := classifyScenarioStability(result.FirstAttempt.Status, result.Rerun)
	if want == "" {
		return fmt.Errorf("scenario %s failed its first attempt without the required rerun", result.ScenarioID)
	}
	if result.FirstAttempt.Status != ScenarioAttemptStatusFail && result.Rerun != nil {
		return fmt.Errorf("scenario %s reran after first-attempt status %s", result.ScenarioID, result.FirstAttempt.Status)
	}
	if result.Stability != want {
		return fmt.Errorf("scenario %s stability is %s, want %s", result.ScenarioID, result.Stability, want)
	}
	return nil
}

func validateScenarioAttemptStatus(result ScenarioResult) error {
	switch result.Status {
	case ScenarioAttemptStatusPass:
		if result.Classification != ScenarioClassificationPass {
			return fmt.Errorf("status %s requires objective classification %s", result.Status, ScenarioClassificationPass)
		}
	case ScenarioAttemptStatusFail:
		if result.Classification == ScenarioClassificationInfrastructureFailure {
			return errors.New("infrastructure classification cannot have fail attempt status")
		}
	case ScenarioAttemptStatusInfrastructureFailure:
		if result.Classification != ScenarioClassificationPass &&
			result.Classification != ScenarioClassificationInfrastructureFailure {
			return fmt.Errorf("status %s is incompatible with classification %s", result.Status, result.Classification)
		}
	default:
		return fmt.Errorf("unsupported attempt status %q", result.Status)
	}
	return nil
}

func validateEvaluationAttempt(attempt int) error {
	if attempt != EvaluationAttemptFirst && attempt != EvaluationAttemptRerun {
		return fmt.Errorf("evaluation attempt is %d, want %d or %d", attempt, EvaluationAttemptFirst, EvaluationAttemptRerun)
	}
	return nil
}

func (results Results) Validate() error {
	if results.SchemaVersion != ResultSchemaVersion {
		return fmt.Errorf(
			"eval results schemaVersion is %d, want %d",
			results.SchemaVersion,
			ResultSchemaVersion,
		)
	}
	if !validGitCommit(results.SettaCommit) {
		return fmt.Errorf("eval results Setta commit %q must be a lowercase 40-character Git object id", results.SettaCommit)
	}
	if err := validateResultTimes("eval results", results.StartedAt, results.FinishedAt, results.FinishedAt.Sub(results.StartedAt).Milliseconds()); err != nil {
		return err
	}
	return validateResultScenarios(results)
}

func validateResultScenarios(results Results) error {
	if results.Scenarios == nil {
		return errors.New("eval results scenarios must be an array, not null")
	}
	if len(results.Scenarios) == 0 || len(results.Scenarios) > ResultMaximumScenarios {
		return fmt.Errorf("eval results contain %d scenarios, want 1-%d", len(results.Scenarios), ResultMaximumScenarios)
	}
	seen := make(map[string]struct{}, len(results.Scenarios))
	for index, scenario := range results.Scenarios {
		if err := scenario.Validate(); err != nil {
			return fmt.Errorf("eval results scenario %d: %w", index, err)
		}
		if _, exists := seen[scenario.ScenarioID]; exists {
			return fmt.Errorf("eval results repeat scenario %q", scenario.ScenarioID)
		}
		seen[scenario.ScenarioID] = struct{}{}
		if scenario.FirstAttempt.StartedAt.Before(results.StartedAt) ||
			scenarioFinishedAt(scenario).After(results.FinishedAt) {
			return fmt.Errorf("eval results scenario %s falls outside the invocation timeline", scenario.ScenarioID)
		}
	}
	return nil
}

var evaluatedRoleOrder = []conversation.Role{
	conversation.RoleDirector,
	conversation.RoleAgent,
	conversation.RoleNarrator,
	conversation.RoleSideAgent,
}

func roleProfileConfigurationsByRole(
	profiles []conversation.RoleProfileConfiguration,
) map[conversation.Role]conversation.RoleProfileConfiguration {
	byRole := make(map[conversation.Role]conversation.RoleProfileConfiguration, len(profiles))
	for _, profile := range profiles {
		byRole[profile.Role] = profile
	}
	return byRole
}

func evaluatedRoleConfiguration(
	profile conversation.RoleProfileConfiguration,
) EvaluatedRoleConfiguration {
	return EvaluatedRoleConfiguration{
		Role:            profile.Role,
		EffectiveSource: profile.EffectiveSource,
		Requested:       cloneRoleProfile(profile.Effective),
		Resolved: conversation.ResolvedRoleProfileSelection{
			ModelID:         profile.Resolved.ModelID,
			ReasoningEffort: profile.Resolved.ReasoningEffort,
			ServiceTier:     cloneStringPointer(profile.Resolved.ServiceTier),
		},
	}
}

func classifyScenarioExecution(
	outcome ScenarioExecutionOutcome,
	verification *evalverifier.Result,
	control ScenarioControlResult,
) (ScenarioClassification, error) {
	if outcome != ScenarioExecutionCompleted && control.EvidenceAvailable {
		return "", fmt.Errorf("%s scenario execution must not carry available control evidence", outcome)
	}
	switch outcome {
	case ScenarioExecutionCompleted:
		return classifyCompletedScenarioExecution(verification, control)
	case ScenarioExecutionCancelled, ScenarioExecutionFailed:
		return classifyUnverifiedScenarioExecution(outcome, verification, ScenarioClassificationAbilityFailure)
	case ScenarioExecutionControlFailed:
		return classifyUnverifiedScenarioExecution(outcome, verification, ScenarioClassificationControlFailure)
	case ScenarioExecutionTimedOut:
		return classifyUnverifiedScenarioExecution(outcome, verification, ScenarioClassificationTimeout)
	case ScenarioExecutionInfrastructureFailed:
		return classifyUnverifiedScenarioExecution(
			outcome,
			verification,
			ScenarioClassificationInfrastructureFailure,
		)
	default:
		return "", fmt.Errorf("unsupported scenario execution outcome %q", outcome)
	}
}

func classifyCompletedScenarioExecution(
	verification *evalverifier.Result,
	control ScenarioControlResult,
) (ScenarioClassification, error) {
	if verification == nil {
		return "", errors.New("completed scenario execution requires a verifier result")
	}
	if !control.EvidenceAvailable {
		return "", errors.New("completed scenario execution requires typed control evidence")
	}
	if !verification.Passed {
		return ScenarioClassificationAbilityFailure, nil
	}
	if !control.Passed {
		return ScenarioClassificationControlFailure, nil
	}
	return ScenarioClassificationPass, nil
}

func classifyUnverifiedScenarioExecution(
	outcome ScenarioExecutionOutcome,
	verification *evalverifier.Result,
	classification ScenarioClassification,
) (ScenarioClassification, error) {
	if verification != nil {
		return "", fmt.Errorf("%s scenario execution must not carry a verifier result", outcome)
	}
	return classification, nil
}

func validateScenarioDiagnosticForOutcome(
	outcome ScenarioExecutionOutcome,
	diagnostic *ScenarioDiagnostic,
) error {
	wantsDiagnostic := outcome != ScenarioExecutionCompleted
	if wantsDiagnostic != (diagnostic != nil) {
		if wantsDiagnostic {
			return fmt.Errorf("scenario outcome %s requires a diagnostic", outcome)
		}
		return fmt.Errorf("scenario outcome %s must not carry a diagnostic", outcome)
	}
	if diagnostic == nil {
		return nil
	}
	return diagnostic.Validate()
}

func validateEvaluatedRoleConfigurations(
	roles []EvaluatedRoleConfiguration,
	outcome ScenarioExecutionOutcome,
) error {
	if roles == nil {
		return errors.New("evaluated roles must be an array, not null")
	}
	if len(roles) == 0 && outcome == ScenarioExecutionInfrastructureFailed {
		return nil
	}
	if len(roles) != len(evaluatedRoleOrder) {
		return fmt.Errorf("evaluated roles contain %d entries, want %d", len(roles), len(evaluatedRoleOrder))
	}
	for index, role := range roles {
		if err := validateEvaluatedRoleConfiguration(index, role); err != nil {
			return err
		}
	}
	return nil
}

func validateEvaluatedRoleConfiguration(index int, role EvaluatedRoleConfiguration) error {
	want := evaluatedRoleOrder[index]
	if role.Role != want || role.Requested.Role != want {
		return fmt.Errorf("evaluated role %d is %s/%s, want %s", index, role.Role, role.Requested.Role, want)
	}
	if role.Requested.Provider != conversation.ProviderCodex {
		return fmt.Errorf("evaluated role %s has provider %s", role.Role, role.Requested.Provider)
	}
	if err := role.Requested.Validate(); err != nil {
		return fmt.Errorf("evaluated role %s requested profile: %w", role.Role, err)
	}
	if strings.TrimSpace(role.Resolved.ModelID) == "" ||
		strings.TrimSpace(string(role.Resolved.ReasoningEffort)) == "" {
		return fmt.Errorf("evaluated role %s omitted resolved model settings", role.Role)
	}
	if role.Resolved.ServiceTier != nil && strings.TrimSpace(*role.Resolved.ServiceTier) == "" {
		return fmt.Errorf("evaluated role %s has an empty resolved service tier", role.Role)
	}
	switch role.EffectiveSource {
	case conversation.RoleProfileSourceBuiltIn,
		conversation.RoleProfileSourceGlobal,
		conversation.RoleProfileSourceWorkspace,
		conversation.RoleProfileSourceConversation:
		return nil
	default:
		return fmt.Errorf("evaluated role %s has source %q", role.Role, role.EffectiveSource)
	}
}

func validateResultTimes(
	label string,
	startedAt time.Time,
	finishedAt time.Time,
	durationMilliseconds int64,
) error {
	if startedAt.IsZero() || finishedAt.IsZero() {
		return fmt.Errorf("%s timestamps are required", label)
	}
	if _, offset := startedAt.Zone(); offset != 0 {
		return fmt.Errorf("%s startedAt must use UTC", label)
	}
	if _, offset := finishedAt.Zone(); offset != 0 {
		return fmt.Errorf("%s finishedAt must use UTC", label)
	}
	if finishedAt.Before(startedAt) {
		return fmt.Errorf("%s finishedAt precedes startedAt", label)
	}
	wantDuration := finishedAt.Sub(startedAt).Milliseconds()
	if durationMilliseconds != wantDuration {
		return fmt.Errorf("%s durationMilliseconds is %d, want %d", label, durationMilliseconds, wantDuration)
	}
	return nil
}

func validGitCommit(value string) bool {
	if len(value) != 40 {
		return false
	}
	for _, character := range value {
		if character >= '0' && character <= '9' || character >= 'a' && character <= 'f' {
			continue
		}
		return false
	}
	return true
}

func validateResultIdentifier(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if len(value) > 64 {
		return fmt.Errorf("%s is %d bytes, maximum is 64", label, len(value))
	}
	for _, character := range value {
		if character >= 'a' && character <= 'z' ||
			character >= '0' && character <= '9' ||
			character == '_' || character == '-' {
			continue
		}
		return fmt.Errorf("%s %q has unsupported characters", label, value)
	}
	return nil
}

func cloneEvaluatedRoleConfigurations(
	roles []EvaluatedRoleConfiguration,
) []EvaluatedRoleConfiguration {
	if roles == nil {
		return nil
	}
	cloned := make([]EvaluatedRoleConfiguration, len(roles))
	for index, role := range roles {
		cloned[index] = role
		cloned[index].Requested = cloneRoleProfile(role.Requested)
		cloned[index].Resolved.ServiceTier = cloneStringPointer(role.Resolved.ServiceTier)
	}
	return cloned
}

func cloneRoleProfile(profile conversation.RoleProfile) conversation.RoleProfile {
	profile.ModelSelection.ModelID = cloneStringPointer(profile.ModelSelection.ModelID)
	profile.ServiceTier = cloneStringPointer(profile.ServiceTier)
	if profile.PermissionProfile.ToolAccess.AllowedTools != nil {
		profile.PermissionProfile.ToolAccess.AllowedTools = append(
			[]string{},
			profile.PermissionProfile.ToolAccess.AllowedTools...,
		)
	}
	return profile
}

func cloneVerifierResult(result *evalverifier.Result) *evalverifier.Result {
	if result == nil {
		return nil
	}
	cloned := *result
	if result.Checks != nil {
		cloned.Checks = append([]evalverifier.Check{}, result.Checks...)
	}
	if result.ChangedFiles != nil {
		cloned.ChangedFiles = append([]string{}, result.ChangedFiles...)
	}
	return &cloned
}

func cloneScenarioDiagnostic(diagnostic *ScenarioDiagnostic) *ScenarioDiagnostic {
	if diagnostic == nil {
		return nil
	}
	cloned := *diagnostic
	return &cloned
}

func cloneScenarioResults(scenarios []ScenarioEvaluationResult) []ScenarioEvaluationResult {
	if scenarios == nil {
		return nil
	}
	cloned := make([]ScenarioEvaluationResult, len(scenarios))
	for index, scenario := range scenarios {
		cloned[index] = ScenarioEvaluationResult{
			ScenarioID:   scenario.ScenarioID,
			Stability:    scenario.Stability,
			FirstAttempt: cloneScenarioResult(scenario.FirstAttempt),
			Rerun:        cloneScenarioResultPointer(scenario.Rerun),
		}
	}
	return cloned
}

func cloneScenarioResult(result ScenarioResult) ScenarioResult {
	cloned := result
	cloned.Roles = cloneEvaluatedRoleConfigurations(result.Roles)
	cloned.Control = cloneScenarioControlResult(result.Control)
	cloned.Verifier = cloneVerifierResult(result.Verifier)
	cloned.Diagnostic = cloneScenarioDiagnostic(result.Diagnostic)
	return cloned
}

func cloneScenarioResultPointer(result *ScenarioResult) *ScenarioResult {
	if result == nil {
		return nil
	}
	cloned := cloneScenarioResult(*result)
	return &cloned
}

func scenarioFinishedAt(result ScenarioEvaluationResult) time.Time {
	if result.Rerun != nil {
		return result.Rerun.FinishedAt
	}
	return result.FirstAttempt.FinishedAt
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
