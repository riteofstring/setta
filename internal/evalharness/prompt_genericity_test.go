package evalharness

import (
	"strings"
	"testing"

	"setta/internal/agent"
	"setta/internal/conversation"
)

func TestPromptGenericityVerdictRequiresEveryCheckToPass(t *testing.T) {
	checks := PromptGenericityChecks{
		NoScenarioLiterals:         true,
		NoFixtureSpecificRules:     true,
		NoExpectedOutcomeLeakage:   true,
		PrinciplesCoverEquivalents: true,
		ExamplesTransferable:       true,
	}
	verdict := promptGenericityVerdict(promptGenericityJudgeOutput{
		Checks:   checks,
		Findings: []PromptGenericityFinding{},
	})
	if verdict.Score != 100 || !verdict.OverallPass {
		t.Fatalf("passing prompt verdict = %#v", verdict)
	}

	checks.ExamplesTransferable = false
	verdict = promptGenericityVerdict(promptGenericityJudgeOutput{
		Checks: checks,
		Findings: []PromptGenericityFinding{{
			Check:          PromptGenericityExamplesTransferable,
			Severity:       PromptGenericitySeverityMedium,
			Role:           conversation.RoleAgent,
			Surface:        "topic-conversation",
			PromptExcerpt:  "A narrow example.",
			ScenarioIDs:    []string{ScenarioVerifierStraightforward},
			Explanation:    "The example encodes one checked scenario.",
			Recommendation: "State the general invariant instead.",
		}},
	})
	if verdict.Score != 80 || verdict.OverallPass {
		t.Fatalf("failing prompt verdict = %#v", verdict)
	}
}

func TestPromptGenericityArtifactRequiresEvidenceForEveryFailedCheck(t *testing.T) {
	artifact := validTestPromptGenericityArtifact(t)
	artifact.Verdict.Checks.ExamplesTransferable = false
	artifact.Verdict = promptGenericityVerdict(promptGenericityJudgeOutput{
		Checks:   artifact.Verdict.Checks,
		Findings: []PromptGenericityFinding{},
	})
	if err := artifact.Validate(); err == nil || !strings.Contains(err.Error(), "has no blocking finding") {
		t.Fatalf("missing finding validation error = %v", err)
	}

	artifact.Verdict.Findings = []PromptGenericityFinding{{
		Check:          PromptGenericityExamplesTransferable,
		Severity:       PromptGenericitySeverityMedium,
		Role:           conversation.RoleAgent,
		Surface:        "topic-conversation",
		PromptExcerpt:  "A narrow example.",
		ScenarioIDs:    []string{ScenarioVerifierStraightforward},
		Explanation:    "The example encodes one checked scenario.",
		Recommendation: "State the general invariant instead.",
	}}
	if err := artifact.Validate(); err != nil {
		t.Fatalf("validate evidenced prompt failure: %v", err)
	}
}

func TestPromptGenericityFindingExcerptMustComeFromTheNamedPrompt(t *testing.T) {
	prompts := []promptGenericityPromptInput{{
		Role:    conversation.RoleAgent,
		Surface: "topic-conversation",
		Prompt:  "Keep work scoped to the current objective.",
	}}
	findings := []PromptGenericityFinding{{
		Role:          conversation.RoleAgent,
		Surface:       "topic-conversation",
		PromptExcerpt: "An invented excerpt.",
	}}
	if err := validatePromptGenericityFindingExcerpts(findings, prompts); err == nil ||
		!strings.Contains(err.Error(), "not exact production prompt text") {
		t.Fatalf("invented excerpt error = %v", err)
	}
	findings[0].PromptExcerpt = "work scoped to the current objective"
	if err := validatePromptGenericityFindingExcerpts(findings, prompts); err != nil {
		t.Fatalf("validate exact excerpt: %v", err)
	}
}

func validTestPromptGenericityArtifact(t *testing.T, scenarioIDs ...string) PromptGenericityArtifact {
	t.Helper()
	if len(scenarioIDs) == 0 {
		scenarioIDs = []string{ScenarioVerifierStraightforward}
	}
	invocationID := "prompt-audit-test"
	threadID := "prompt-audit-thread"
	turnID := "prompt-audit-turn"
	attribution := testTokenAttribution(
		agent.TokenUsageBucketJudge,
		agent.TokenUsageRoleJudge,
		invocationID,
		JudgeModel,
	)
	attribution.ReasoningEffort = JudgeReasoningEffort
	usage, err := AggregateScenarioTokenUsage(
		promptGenericitySyntheticScenarioID,
		EvaluationAttemptFirst,
		[]agent.TokenUsageObservation{
			testTokenObservation(attribution, threadID, turnID, 30, 20, 10),
		},
	)
	if err != nil {
		t.Fatalf("aggregate prompt audit token usage: %v", err)
	}
	scenarioReferences := make([]PromptGenericityScenarioReference, len(scenarioIDs))
	for index, scenarioID := range scenarioIDs {
		scenarioReferences[index] = PromptGenericityScenarioReference{
			ScenarioID: scenarioID,
			SHA256:     strings.Repeat("e", 64),
		}
	}
	artifact := PromptGenericityArtifact{
		SchemaVersion: PromptGenericitySchemaVersion,
		Configuration: FixedJudgeConfiguration(),
		RubricSHA256:  strings.Repeat("a", 64),
		Prompts: []PromptGenericityPromptReference{
			{Role: conversation.RoleDirector, Surface: "conversation", SHA256: strings.Repeat("b", 64)},
			{Role: conversation.RoleAgent, Surface: "topic-conversation", SHA256: strings.Repeat("c", 64)},
			{Role: conversation.RoleNarrator, Surface: "focus", SHA256: strings.Repeat("d", 64)},
		},
		Scenarios: scenarioReferences,
		Invocation: JudgeInvocation{
			ID:               invocationID,
			ProviderThreadID: threadID,
			ProviderTurnID:   turnID,
		},
		Verdict: promptGenericityVerdict(promptGenericityJudgeOutput{
			Checks: PromptGenericityChecks{
				NoScenarioLiterals:         true,
				NoFixtureSpecificRules:     true,
				NoExpectedOutcomeLeakage:   true,
				PrinciplesCoverEquivalents: true,
				ExamplesTransferable:       true,
			},
			Findings: []PromptGenericityFinding{},
		}),
		TokenUsage: usage.Judge,
	}
	if err := artifact.Validate(); err != nil {
		t.Fatalf("validate prompt genericity test artifact: %v", err)
	}
	return artifact
}
