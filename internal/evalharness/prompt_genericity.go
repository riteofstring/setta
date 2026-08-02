package evalharness

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/agent"
	"setta/internal/conversation"
)

const (
	PromptGenericitySchemaVersion    = 1
	PromptGenericityMaximumFindings  = 32
	PromptGenericityMaximumTextBytes = 2 * 1024
)

type PromptGenericityCheck string

const (
	PromptGenericityNoScenarioLiterals         PromptGenericityCheck = "no_scenario_literals"
	PromptGenericityNoFixtureSpecificRules     PromptGenericityCheck = "no_fixture_specific_rules"
	PromptGenericityNoExpectedOutcomeLeakage   PromptGenericityCheck = "no_expected_outcome_leakage"
	PromptGenericityPrinciplesCoverEquivalents PromptGenericityCheck = "principles_cover_equivalent_cases"
	PromptGenericityExamplesTransferable       PromptGenericityCheck = "examples_are_transferable"
)

type PromptGenericitySeverity string

const (
	PromptGenericitySeverityHigh   PromptGenericitySeverity = "high"
	PromptGenericitySeverityMedium PromptGenericitySeverity = "medium"
	PromptGenericitySeverityLow    PromptGenericitySeverity = "low"
)

type PromptGenericityChecks struct {
	NoScenarioLiterals         bool `json:"noScenarioLiterals"`
	NoFixtureSpecificRules     bool `json:"noFixtureSpecificRules"`
	NoExpectedOutcomeLeakage   bool `json:"noExpectedOutcomeLeakage"`
	PrinciplesCoverEquivalents bool `json:"principlesCoverEquivalentCases"`
	ExamplesTransferable       bool `json:"examplesAreTransferable"`
}

type PromptGenericityFinding struct {
	Check          PromptGenericityCheck    `json:"check"`
	Severity       PromptGenericitySeverity `json:"severity"`
	Role           conversation.Role        `json:"role"`
	Surface        string                   `json:"surface"`
	PromptExcerpt  string                   `json:"promptExcerpt"`
	ScenarioIDs    []string                 `json:"scenarioIds"`
	Explanation    string                   `json:"explanation"`
	Recommendation string                   `json:"recommendation"`
}

type PromptGenericityVerdict struct {
	Score       int                       `json:"score"`
	OverallPass bool                      `json:"overallPass"`
	Checks      PromptGenericityChecks    `json:"checks"`
	Findings    []PromptGenericityFinding `json:"findings"`
}

type PromptGenericityPromptReference struct {
	Role    conversation.Role `json:"role"`
	Surface string            `json:"surface"`
	SHA256  string            `json:"sha256"`
}

type PromptGenericityScenarioReference struct {
	ScenarioID string `json:"scenarioId"`
	SHA256     string `json:"sha256"`
}

type PromptGenericityArtifact struct {
	SchemaVersion int                                 `json:"schemaVersion"`
	Configuration JudgeConfiguration                  `json:"configuration"`
	RubricSHA256  string                              `json:"rubricSha256"`
	Prompts       []PromptGenericityPromptReference   `json:"prompts"`
	Scenarios     []PromptGenericityScenarioReference `json:"scenarios"`
	Invocation    JudgeInvocation                     `json:"invocation"`
	Verdict       PromptGenericityVerdict             `json:"verdict"`
	TokenUsage    TokenUsageBucketResult              `json:"tokenUsage"`
}

type promptGenericityJudgeOutput struct {
	Checks   PromptGenericityChecks    `json:"checks"`
	Findings []PromptGenericityFinding `json:"findings"`
}

func promptGenericityVerdict(output promptGenericityJudgeOutput) PromptGenericityVerdict {
	score := 0
	for _, passed := range promptGenericityCheckValues(output.Checks) {
		if passed {
			score += 20
		}
	}
	return PromptGenericityVerdict{
		Score:       score,
		OverallPass: score == 100,
		Checks:      output.Checks,
		Findings:    append([]PromptGenericityFinding{}, output.Findings...),
	}
}

func promptGenericityCheckValues(checks PromptGenericityChecks) map[PromptGenericityCheck]bool {
	return map[PromptGenericityCheck]bool{
		PromptGenericityNoScenarioLiterals:         checks.NoScenarioLiterals,
		PromptGenericityNoFixtureSpecificRules:     checks.NoFixtureSpecificRules,
		PromptGenericityNoExpectedOutcomeLeakage:   checks.NoExpectedOutcomeLeakage,
		PromptGenericityPrinciplesCoverEquivalents: checks.PrinciplesCoverEquivalents,
		PromptGenericityExamplesTransferable:       checks.ExamplesTransferable,
	}
}

func (artifact PromptGenericityArtifact) Validate() error {
	if artifact.SchemaVersion != PromptGenericitySchemaVersion {
		return fmt.Errorf(
			"prompt genericity artifact schemaVersion is %d, want %d",
			artifact.SchemaVersion,
			PromptGenericitySchemaVersion,
		)
	}
	if err := artifact.Configuration.Validate(); err != nil {
		return err
	}
	if !validPhase1SHA256(artifact.RubricSHA256) {
		return errors.New("prompt genericity rubricSha256 must be lowercase SHA-256")
	}
	prompts, err := validatePromptGenericityPromptReferences(artifact.Prompts)
	if err != nil {
		return err
	}
	scenarios, err := validatePromptGenericityScenarioReferences(artifact.Scenarios)
	if err != nil {
		return err
	}
	if err := artifact.Invocation.Validate(); err != nil {
		return err
	}
	if err := artifact.Verdict.validate(prompts, scenarios); err != nil {
		return err
	}
	if err := validateTokenUsageBucket(agent.TokenUsageBucketJudge, artifact.TokenUsage); err != nil {
		return fmt.Errorf("prompt genericity token usage: %w", err)
	}
	if !artifact.TokenUsage.EvidenceAvailable || len(artifact.TokenUsage.ProviderTurns) != 1 {
		return errors.New("prompt genericity audit requires one judge provider turn")
	}
	turn := artifact.TokenUsage.ProviderTurns[0]
	if turn.Attribution.InvocationID != artifact.Invocation.ID ||
		turn.ProviderThreadID != artifact.Invocation.ProviderThreadID ||
		turn.ProviderTurnID != artifact.Invocation.ProviderTurnID {
		return errors.New("prompt genericity invocation and token evidence do not match")
	}
	return validateFixedJudgeTokenConfiguration("prompt-genericity", artifact.TokenUsage.ProviderTurns)
}

func validatePromptGenericityPromptReferences(
	references []PromptGenericityPromptReference,
) (map[string]conversation.Role, error) {
	if references == nil || len(references) == 0 {
		return nil, errors.New("prompt genericity prompts must be a non-empty array")
	}
	seen := make(map[string]conversation.Role, len(references))
	roles := map[conversation.Role]bool{}
	for index, reference := range references {
		if !auditedPromptRole(reference.Role) {
			return nil, fmt.Errorf("prompt genericity prompt[%d] has unsupported role %q", index, reference.Role)
		}
		if err := validateScenarioIdentifier("prompt genericity surface", reference.Surface); err != nil {
			return nil, err
		}
		if !validPhase1SHA256(reference.SHA256) {
			return nil, fmt.Errorf("prompt genericity prompt[%d] has invalid sha256", index)
		}
		key := promptGenericitySurfaceKey(reference.Role, reference.Surface)
		if _, exists := seen[key]; exists {
			return nil, fmt.Errorf("prompt genericity prompts repeat %s", key)
		}
		seen[key] = reference.Role
		roles[reference.Role] = true
	}
	for _, role := range []conversation.Role{
		conversation.RoleDirector,
		conversation.RoleAgent,
		conversation.RoleNarrator,
	} {
		if !roles[role] {
			return nil, fmt.Errorf("prompt genericity prompts omit role %s", role)
		}
	}
	return seen, nil
}

func validatePromptGenericityScenarioReferences(
	references []PromptGenericityScenarioReference,
) (map[string]bool, error) {
	if references == nil || len(references) == 0 || len(references) > ResultMaximumScenarios {
		return nil, fmt.Errorf(
			"prompt genericity scenarios contains %d entries, want 1-%d",
			len(references),
			ResultMaximumScenarios,
		)
	}
	seen := make(map[string]bool, len(references))
	for index, reference := range references {
		if err := validateScenarioIdentifier("prompt genericity scenario id", reference.ScenarioID); err != nil {
			return nil, err
		}
		if seen[reference.ScenarioID] {
			return nil, fmt.Errorf("prompt genericity scenarios repeat %s", reference.ScenarioID)
		}
		if !validPhase1SHA256(reference.SHA256) {
			return nil, fmt.Errorf("prompt genericity scenario[%d] has invalid sha256", index)
		}
		seen[reference.ScenarioID] = true
	}
	return seen, nil
}

func (verdict PromptGenericityVerdict) validate(
	prompts map[string]conversation.Role,
	scenarios map[string]bool,
) error {
	want := promptGenericityVerdict(promptGenericityJudgeOutput{
		Checks:   verdict.Checks,
		Findings: verdict.Findings,
	})
	if verdict.Score != want.Score || verdict.OverallPass != want.OverallPass {
		return errors.New("prompt genericity score and pass do not match its five checks")
	}
	if verdict.Findings == nil || len(verdict.Findings) > PromptGenericityMaximumFindings {
		return fmt.Errorf(
			"prompt genericity findings contains %d entries, maximum is %d",
			len(verdict.Findings),
			PromptGenericityMaximumFindings,
		)
	}
	checks := promptGenericityCheckValues(verdict.Checks)
	evidence := map[PromptGenericityCheck]bool{}
	for index, finding := range verdict.Findings {
		if err := finding.validate(prompts, scenarios); err != nil {
			return fmt.Errorf("prompt genericity finding[%d]: %w", index, err)
		}
		if finding.Severity != PromptGenericitySeverityLow {
			if checks[finding.Check] {
				return fmt.Errorf("passing prompt genericity check %s has a blocking finding", finding.Check)
			}
			evidence[finding.Check] = true
		}
	}
	for check, passed := range checks {
		if !passed && !evidence[check] {
			return fmt.Errorf("failed prompt genericity check %s has no blocking finding", check)
		}
	}
	return nil
}

func (finding PromptGenericityFinding) validate(
	prompts map[string]conversation.Role,
	scenarios map[string]bool,
) error {
	if _, exists := promptGenericityCheckValues(PromptGenericityChecks{})[finding.Check]; !exists {
		return fmt.Errorf("unsupported check %q", finding.Check)
	}
	switch finding.Severity {
	case PromptGenericitySeverityHigh,
		PromptGenericitySeverityMedium,
		PromptGenericitySeverityLow:
	default:
		return fmt.Errorf("unsupported severity %q", finding.Severity)
	}
	key := promptGenericitySurfaceKey(finding.Role, finding.Surface)
	role, exists := prompts[key]
	if !exists || role != finding.Role {
		return fmt.Errorf("unknown prompt surface %s", key)
	}
	if finding.ScenarioIDs == nil {
		return errors.New("scenarioIds must be an array")
	}
	seenScenarios := map[string]bool{}
	for _, scenarioID := range finding.ScenarioIDs {
		if !scenarios[scenarioID] {
			return fmt.Errorf("finding references unknown scenario %s", scenarioID)
		}
		if seenScenarios[scenarioID] {
			return fmt.Errorf("finding repeats scenario %s", scenarioID)
		}
		seenScenarios[scenarioID] = true
	}
	for label, value := range map[string]string{
		"promptExcerpt":  finding.PromptExcerpt,
		"explanation":    finding.Explanation,
		"recommendation": finding.Recommendation,
	} {
		if strings.TrimSpace(value) == "" || strings.TrimSpace(value) != value {
			return fmt.Errorf("%s is required without surrounding whitespace", label)
		}
		if len(value) > PromptGenericityMaximumTextBytes {
			return fmt.Errorf("%s is %d bytes, maximum is %d", label, len(value), PromptGenericityMaximumTextBytes)
		}
	}
	return nil
}

func auditedPromptRole(role conversation.Role) bool {
	return role == conversation.RoleDirector ||
		role == conversation.RoleAgent ||
		role == conversation.RoleNarrator
}

func promptGenericitySurfaceKey(role conversation.Role, surface string) string {
	return string(role) + "/" + surface
}
