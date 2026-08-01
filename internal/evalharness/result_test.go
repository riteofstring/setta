package evalharness

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
	evalverifier "setta/internal/evalharness/verifier"
)

func TestScenarioResultClassifiesObjectiveOutcomes(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 0, 0, 0, time.UTC)
	passingVerifier := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	failingVerifier := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: false, Detail: "Workspace failed."}},
		[]string{"README.md"},
	)
	timeoutDiagnostic := mustTestDiagnostic(t, "scenario_timeout", "The scenario reached its runaway ceiling.")
	executionDiagnostic := mustTestDiagnostic(t, "agent_turn_failed", "The Agent turn failed.")
	infrastructureDiagnostic := mustTestDiagnostic(t, "docker_unavailable", "Docker Desktop is stopped.")

	tests := []struct {
		name           string
		outcome        ScenarioExecutionOutcome
		verifier       *evalverifier.Result
		diagnostic     *ScenarioDiagnostic
		roles          []EvaluatedRoleConfiguration
		classification ScenarioClassification
	}{
		{
			name:           "pass",
			outcome:        ScenarioExecutionCompleted,
			verifier:       &passingVerifier,
			roles:          validTestEvaluatedRoles(),
			classification: ScenarioClassificationPass,
		},
		{
			name:           "incorrect workspace",
			outcome:        ScenarioExecutionCompleted,
			verifier:       &failingVerifier,
			roles:          validTestEvaluatedRoles(),
			classification: ScenarioClassificationAbilityFailure,
		},
		{
			name:           "failed execution",
			outcome:        ScenarioExecutionFailed,
			diagnostic:     executionDiagnostic,
			roles:          validTestEvaluatedRoles(),
			classification: ScenarioClassificationAbilityFailure,
		},
		{
			name:           "timeout",
			outcome:        ScenarioExecutionTimedOut,
			diagnostic:     timeoutDiagnostic,
			roles:          validTestEvaluatedRoles(),
			classification: ScenarioClassificationTimeout,
		},
		{
			name:           "infrastructure",
			outcome:        ScenarioExecutionInfrastructureFailed,
			diagnostic:     infrastructureDiagnostic,
			roles:          []EvaluatedRoleConfiguration{},
			classification: ScenarioClassificationInfrastructureFailure,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result, err := NewScenarioResult(ScenarioResultInput{
				Scenario:         validTestScenario(),
				ExecutionOutcome: test.outcome,
				StartedAt:        startedAt,
				FinishedAt:       startedAt.Add(2 * time.Second),
				Roles:            test.roles,
				Verifier:         test.verifier,
				Diagnostic:       test.diagnostic,
			})
			if err != nil {
				t.Fatalf("classify scenario result: %v", err)
			}
			if result.Classification != test.classification {
				t.Fatalf("classification = %s, want %s", result.Classification, test.classification)
			}
			if err := result.Validate(); err != nil {
				t.Fatalf("validate classified result: %v", err)
			}
		})
	}
}

func TestScenarioResultRejectsAmbiguousClassificationInputs(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 0, 0, 0, time.UTC)
	_, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         validTestScenario(),
		ExecutionOutcome: ScenarioExecutionCompleted,
		StartedAt:        startedAt,
		FinishedAt:       startedAt.Add(time.Second),
		Roles:            validTestEvaluatedRoles(),
	})
	if err == nil || !strings.Contains(err.Error(), "requires a verifier") {
		t.Fatalf("missing verifier error = %v", err)
	}
	verifier := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	for _, outcome := range []ScenarioExecutionOutcome{
		ScenarioExecutionCancelled,
		ScenarioExecutionFailed,
	} {
		_, err := NewScenarioResult(ScenarioResultInput{
			Scenario:         validTestScenario(),
			ExecutionOutcome: outcome,
			StartedAt:        startedAt,
			FinishedAt:       startedAt.Add(time.Second),
			Roles:            validTestEvaluatedRoles(),
			Verifier:         &verifier,
			Diagnostic:       mustTestDiagnostic(t, "execution_failed", "Execution did not complete."),
		})
		if err == nil || !strings.Contains(err.Error(), "must not carry a verifier") {
			t.Fatalf("%s verifier error = %v", outcome, err)
		}
	}
}

func TestScenarioResultRejectsInvalidRequestedRoleProfile(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 0, 0, 0, time.UTC)
	roles := validTestEvaluatedRoles()
	roles[0].Requested.ContextBudget.MaxInputBytes = 0
	verifier := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	_, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         validTestScenario(),
		ExecutionOutcome: ScenarioExecutionCompleted,
		StartedAt:        startedAt,
		FinishedAt:       startedAt.Add(time.Second),
		Roles:            roles,
		Verifier:         &verifier,
	})
	if err == nil || !strings.Contains(err.Error(), "requested profile") {
		t.Fatalf("invalid requested profile error = %v", err)
	}
}

func TestCaptureBaselineRoleConfigurationsUsesWorkspaceEffectiveProfiles(t *testing.T) {
	global, workspace := validTestRoleConfigurations()
	roles, err := CaptureBaselineRoleConfigurations(global, workspace)
	if err != nil {
		t.Fatalf("capture baseline roles: %v", err)
	}
	if len(roles) != len(evaluatedRoleOrder) {
		t.Fatalf("captured roles = %d, want %d", len(roles), len(evaluatedRoleOrder))
	}
	for index, role := range roles {
		if role.Role != evaluatedRoleOrder[index] {
			t.Fatalf("captured role %d = %s, want %s", index, role.Role, evaluatedRoleOrder[index])
		}
	}
}

func TestWriteResultArtifactsPublishesValidatedSet(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 19, 0, 0, 123, time.UTC)
	verifierResult := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	scenario, err := NewScenarioResult(ScenarioResultInput{
		Scenario:         validTestScenario(),
		ExecutionOutcome: ScenarioExecutionCompleted,
		StartedAt:        startedAt,
		FinishedAt:       startedAt.Add(1500 * time.Millisecond),
		Roles:            validTestEvaluatedRoles(),
		Verifier:         &verifierResult,
	})
	if err != nil {
		t.Fatalf("classify scenario: %v", err)
	}
	results, err := NewResults(
		strings.Repeat("a", 40),
		startedAt,
		startedAt.Add(2*time.Second),
		[]ScenarioResult{scenario},
	)
	if err != nil {
		t.Fatalf("build results: %v", err)
	}

	recordingsRoot := t.TempDir()
	scenarioUsage, err := AggregateScenarioTokenUsage(scenario.ScenarioID, []agent.TokenUsageObservation{
		testTokenObservation(
			testTokenAttribution(agent.TokenUsageBucketSystem, agent.TokenUsageRoleAgent, "artifact-agent", "gpt-agent"),
			"artifact-agent-thread",
			"artifact-agent-turn",
			42,
			30,
			12,
		),
		testTokenObservation(
			testTokenAttribution(agent.TokenUsageBucketJudge, agent.TokenUsageRoleJudge, "artifact-judge", "gpt-judge"),
			"artifact-judge-thread",
			"artifact-judge-turn",
			99,
			70,
			29,
		),
	})
	if err != nil {
		t.Fatalf("aggregate token usage: %v", err)
	}
	tokenUsage, err := NewTokenUsageArtifact([]ScenarioTokenUsage{scenarioUsage})
	if err != nil {
		t.Fatalf("build token usage: %v", err)
	}
	paths, err := WriteResultArtifacts(recordingsRoot, results, tokenUsage)
	if err != nil {
		t.Fatalf("write result artifacts: %v", err)
	}
	payload, err := os.ReadFile(paths.ResultsJSON)
	if err != nil {
		t.Fatalf("read results artifact: %v", err)
	}
	var decoded Results
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode results artifact: %v", err)
	}
	if err := decoded.Validate(); err != nil {
		t.Fatalf("validate decoded results: %v", err)
	}
	tokenPayload, err := os.ReadFile(paths.TokenUsageJSON)
	if err != nil {
		t.Fatalf("read token usage artifact: %v", err)
	}
	var decodedTokens TokenUsageArtifact
	if err := json.Unmarshal(tokenPayload, &decodedTokens); err != nil {
		t.Fatalf("decode token usage artifact: %v", err)
	}
	if err := decodedTokens.Validate(); err != nil {
		t.Fatalf("validate decoded token usage: %v", err)
	}
	report, err := os.ReadFile(paths.ReportMarkdown)
	if err != nil {
		t.Fatalf("read report artifact: %v", err)
	}
	for _, section := range []string{"## Ability", "## User Control", "## AI Communication", "## Efficiency"} {
		if !strings.Contains(string(report), section) {
			t.Fatalf("report omitted %s: %s", section, report)
		}
	}
	if !strings.Contains(string(report), "agent=42") || strings.Contains(string(report), "judge=99") {
		t.Fatalf("report system/judge token separation = %s", report)
	}
	if _, err := WriteResultArtifacts(recordingsRoot, results, tokenUsage); err == nil {
		t.Fatal("second artifact publication unexpectedly replaced the first")
	}
}

func mustTestDiagnostic(t *testing.T, code string, message string) *ScenarioDiagnostic {
	t.Helper()
	diagnostic, err := NewScenarioDiagnostic(code, message)
	if err != nil {
		t.Fatalf("create diagnostic: %v", err)
	}
	return diagnostic
}

func validTestEvaluatedRoles() []EvaluatedRoleConfiguration {
	profiles := []conversation.RoleProfile{
		conversation.DefaultDirectorRoleProfile(),
		conversation.DefaultAgentRoleProfile(),
		conversation.DefaultNarratorRoleProfile(),
		conversation.DefaultSideAgentRoleProfile(),
	}
	roles := make([]EvaluatedRoleConfiguration, 0, len(profiles))
	for _, profile := range profiles {
		roles = append(roles, EvaluatedRoleConfiguration{
			Role:            profile.Role,
			EffectiveSource: conversation.RoleProfileSourceBuiltIn,
			Requested:       profile,
			Resolved: conversation.ResolvedRoleProfileSelection{
				ModelID:         *profile.ModelSelection.ModelID,
				ReasoningEffort: profile.ReasoningEffort,
				ServiceTier:     profile.ServiceTier,
			},
		})
	}
	return roles
}

func validTestRoleConfigurations() (conversation.RoleConfiguration, conversation.RoleConfiguration) {
	profiles := map[conversation.Role]conversation.RoleProfile{
		conversation.RoleDirector:  conversation.DefaultDirectorRoleProfile(),
		conversation.RoleAgent:     conversation.DefaultAgentRoleProfile(),
		conversation.RoleNarrator:  conversation.DefaultNarratorRoleProfile(),
		conversation.RoleSideAgent: conversation.DefaultSideAgentRoleProfile(),
	}
	catalog := conversation.RoleModelCatalog{
		Provider:       conversation.ProviderCodex,
		DefaultModelID: *profiles[conversation.RoleAgent].ModelSelection.ModelID,
		Models:         []conversation.RoleModelOption{},
	}
	for index, role := range []conversation.Role{
		conversation.RoleAgent,
		conversation.RoleNarrator,
		conversation.RoleDirector,
		conversation.RoleSideAgent,
	} {
		profile := profiles[role]
		catalog.Models = append(catalog.Models, conversation.RoleModelOption{
			Provider:                  conversation.ProviderCodex,
			ModelID:                   *profile.ModelSelection.ModelID,
			DisplayName:               string(role) + " model",
			DefaultReasoningEffort:    profile.ReasoningEffort,
			SupportedReasoningEfforts: []conversation.ReasoningEffort{profile.ReasoningEffort},
			ServiceTiers:              []string{},
			IsDefault:                 index == 0,
		})
	}
	configurationProfiles := func(roles []conversation.Role) []conversation.RoleProfileConfiguration {
		result := make([]conversation.RoleProfileConfiguration, 0, len(roles))
		for _, role := range roles {
			profile := profiles[role]
			result = append(result, conversation.RoleProfileConfiguration{
				Role:            role,
				BuiltIn:         profile,
				Effective:       profile,
				EffectiveSource: conversation.RoleProfileSourceBuiltIn,
				Resolved: conversation.ResolvedRoleProfileSelection{
					ModelID:         *profile.ModelSelection.ModelID,
					ReasoningEffort: profile.ReasoningEffort,
				},
			})
		}
		return result
	}
	workspaceID := "workspace-eval"
	global := conversation.RoleConfiguration{
		SchemaVersion: conversation.RoleConfigurationSchemaVersion,
		Scope:         conversation.RoleConfigurationScope{Kind: conversation.RoleProfileScopeGlobal},
		Profiles: configurationProfiles([]conversation.Role{
			conversation.RoleAgent,
			conversation.RoleNarrator,
			conversation.RoleDirector,
			conversation.RoleSideAgent,
		}),
		ModelCatalog: catalog,
	}
	workspace := conversation.RoleConfiguration{
		SchemaVersion: conversation.RoleConfigurationSchemaVersion,
		Scope: conversation.RoleConfigurationScope{
			Kind:        conversation.RoleProfileScopeWorkspace,
			WorkspaceID: &workspaceID,
		},
		Profiles: configurationProfiles([]conversation.Role{
			conversation.RoleAgent,
			conversation.RoleNarrator,
			conversation.RoleSideAgent,
		}),
		ModelCatalog: catalog,
	}
	return global, workspace
}
