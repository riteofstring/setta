package evalharness

import (
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/codexapp"
	"setta/internal/conversation"
)

func TestAggregateScenarioTokenUsageUsesFinalCumulativeDeltaPerProviderTurn(t *testing.T) {
	directorOne := testTokenAttribution(agent.TokenUsageBucketSystem, agent.TokenUsageRoleDirector, "director-invocation-1", "gpt-director")
	directorTwo := testTokenAttribution(agent.TokenUsageBucketSystem, agent.TokenUsageRoleDirector, "director-invocation-2", "gpt-director")
	agentTurn := testTokenAttribution(agent.TokenUsageBucketSystem, agent.TokenUsageRoleAgent, "agent-invocation-1", "gpt-agent")
	judgeTurn := testTokenAttribution(agent.TokenUsageBucketJudge, agent.TokenUsageRoleJudge, "judge-invocation-1", "gpt-judge")
	observations := []agent.TokenUsageObservation{
		testTokenObservation(directorOne, "thread-director", "provider-director-1", 100, 60, 40),
		// The provider may publish the same cumulative record more than once.
		testTokenObservation(directorOne, "thread-director", "provider-director-1", 100, 60, 40),
		testTokenObservation(directorOne, "thread-director", "provider-director-1", 120, 70, 50),
		testTokenObservation(directorTwo, "thread-director", "provider-director-2", 170, 100, 70),
		testTokenObservation(agentTurn, "thread-agent", "provider-agent-1", 30, 20, 10),
		testTokenObservation(judgeTurn, "thread-judge", "provider-judge-1", 11, 7, 4),
	}

	usage, err := AggregateScenarioTokenUsage(ScenarioVerifierStraightforward, observations)
	if err != nil {
		t.Fatalf("AggregateScenarioTokenUsage: %v", err)
	}
	if usage.System.Total.TotalTokens != 200 {
		t.Fatalf("system total = %d, want 200", usage.System.Total.TotalTokens)
	}
	if usage.Judge.Total.TotalTokens != 11 {
		t.Fatalf("judge total = %d, want 11", usage.Judge.Total.TotalTokens)
	}
	if !usage.System.EvidenceAvailable || !usage.Judge.EvidenceAvailable {
		t.Fatalf("token evidence availability = system:%t judge:%t", usage.System.EvidenceAvailable, usage.Judge.EvidenceAvailable)
	}
	if len(usage.System.ProviderTurns) != 3 ||
		usage.System.ProviderTurns[0].UpdateCount != 3 ||
		usage.System.ProviderTurns[0].Usage.TotalTokens != 120 ||
		usage.System.ProviderTurns[1].Usage.TotalTokens != 50 {
		t.Fatalf("system provider turns = %+v", usage.System.ProviderTurns)
	}

	invocations := []conversation.ResolvedInvocation{
		testResolvedTokenInvocation(conversation.RoleDirector, directorOne, "provider-director-1"),
		testResolvedTokenInvocation(conversation.RoleDirector, directorTwo, "provider-director-2"),
		testResolvedTokenInvocation(conversation.RoleAgent, agentTurn, "provider-agent-1"),
	}
	if err := CorrelateSystemTokenUsage(usage, invocations); err != nil {
		t.Fatalf("CorrelateSystemTokenUsage: %v", err)
	}
	if usage.System.Total.TotalTokens+usage.Judge.Total.TotalTokens != 211 {
		t.Fatal("judge usage was not retained separately from the system total")
	}
}

func TestAggregateScenarioTokenUsageRejectsDecreasingCumulativeEvidence(t *testing.T) {
	attribution := testTokenAttribution(agent.TokenUsageBucketSystem, agent.TokenUsageRoleAgent, "agent-invocation", "gpt-agent")
	_, err := AggregateScenarioTokenUsage(ScenarioVerifierStraightforward, []agent.TokenUsageObservation{
		testTokenObservation(attribution, "thread-agent", "provider-agent", 20, 12, 8),
		testTokenObservation(attribution, "thread-agent", "provider-agent", 19, 12, 7),
	})
	if err == nil {
		t.Fatal("decreasing cumulative token usage was accepted")
	}
}

func TestCorrelateSystemTokenUsageAllowsStateOnlyNarratorCallsButNotOtherUnownedTurns(t *testing.T) {
	narrator := testTokenAttribution(
		agent.TokenUsageBucketSystem,
		agent.TokenUsageRoleNarrator,
		"narrator-invocation",
		"gpt-narrator",
	)
	usage, err := AggregateScenarioTokenUsage(ScenarioVerifierStraightforward, []agent.TokenUsageObservation{
		testTokenObservation(narrator, "thread-narrator", "provider-narrator", 20, 12, 8),
	})
	if err != nil {
		t.Fatalf("AggregateScenarioTokenUsage: %v", err)
	}
	if err := CorrelateSystemTokenUsage(usage, nil); err != nil {
		t.Fatalf("state-only Narrator correlation: %v", err)
	}
	if usage.Judge.EvidenceAvailable {
		t.Fatal("judge evidence was marked available before a judge call")
	}

	agentTurn := testTokenAttribution(
		agent.TokenUsageBucketSystem,
		agent.TokenUsageRoleAgent,
		"agent-invocation",
		"gpt-agent",
	)
	usage, err = AggregateScenarioTokenUsage(ScenarioVerifierStraightforward, []agent.TokenUsageObservation{
		testTokenObservation(agentTurn, "thread-agent", "provider-agent", 20, 12, 8),
	})
	if err != nil {
		t.Fatalf("AggregateScenarioTokenUsage: %v", err)
	}
	if err := CorrelateSystemTokenUsage(usage, nil); err == nil {
		t.Fatal("unowned Agent token turn was accepted")
	}
}

func TestCorrelateSystemTokenUsageUsesSideAgentModelAtTurnStart(t *testing.T) {
	attribution := testTokenAttribution(
		agent.TokenUsageBucketSystem,
		agent.TokenUsageRoleSideAgent,
		"side-invocation",
		"gpt-side-rerouted",
	)
	usage, err := AggregateScenarioTokenUsage(ScenarioVerifierStraightforward, []agent.TokenUsageObservation{
		testTokenObservation(attribution, "thread-side", "provider-side", 20, 12, 8),
	})
	if err != nil {
		t.Fatalf("AggregateScenarioTokenUsage: %v", err)
	}
	invocation := testResolvedTokenInvocation(conversation.RoleSideAgent, attribution, "provider-side")
	invocation.Resolved.ModelID = "gpt-side-original"
	invocation.ModelReroutes = []conversation.InvocationModelReroute{{
		FromModelID: "gpt-side-original",
		ToModelID:   attribution.Model,
		Reason:      conversation.InvocationModelRerouteReasonHighRiskCyberActivity,
	}}
	if err := CorrelateSystemTokenUsage(usage, []conversation.ResolvedInvocation{invocation}); err != nil {
		t.Fatalf("rerouted Side Agent correlation: %v", err)
	}
}

func testTokenAttribution(
	bucket agent.TokenUsageBucket,
	role agent.TokenUsageRole,
	invocationID string,
	model string,
) agent.TokenUsageAttribution {
	return agent.TokenUsageAttribution{
		Bucket:          bucket,
		Role:            role,
		InvocationID:    invocationID,
		Model:           model,
		ReasoningEffort: "high",
	}
}

func testTokenObservation(
	attribution agent.TokenUsageAttribution,
	threadID string,
	turnID string,
	total int,
	input int,
	output int,
) agent.TokenUsageObservation {
	breakdown := codexapp.TokenUsageBreakdown{
		InputTokens:  input,
		OutputTokens: output,
		TotalTokens:  total,
	}
	return agent.TokenUsageObservation{
		Attribution:      attribution,
		ProviderThreadID: threadID,
		ProviderTurnID:   turnID,
		TokenUsage: codexapp.ThreadTokenUsage{
			Last:  breakdown,
			Total: breakdown,
		},
	}
}

func testResolvedTokenInvocation(
	role conversation.Role,
	attribution agent.TokenUsageAttribution,
	providerTurnID string,
) conversation.ResolvedInvocation {
	var profile conversation.RoleProfile
	switch role {
	case conversation.RoleDirector:
		profile = conversation.DefaultDirectorRoleProfile()
	case conversation.RoleAgent:
		profile = conversation.DefaultAgentRoleProfile()
	case conversation.RoleSideAgent:
		profile = conversation.DefaultSideAgentRoleProfile()
	default:
		panic("unsupported test token role")
	}
	startedAt := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(time.Nanosecond).Format(time.RFC3339Nano)
	return conversation.ResolvedInvocation{
		ID:        attribution.InvocationID,
		Role:      role,
		Provider:  conversation.ProviderCodex,
		Requested: profile,
		Resolved: conversation.ResolvedInvocationSettings{
			ModelID:           attribution.Model,
			ReasoningEffort:   attribution.ReasoningEffort,
			ServiceTier:       attribution.ServiceTier,
			PermissionProfile: profile.PermissionProfile,
		},
		ProviderReferences: conversation.InvocationProviderReferences{TurnID: &providerTurnID},
		ModelReroutes:      []conversation.InvocationModelReroute{},
		StartedAt:          startedAt.Format(time.RFC3339Nano),
		EndedAt:            &endedAt,
		Outcome:            conversation.InvocationOutcomeSucceeded,
	}
}
