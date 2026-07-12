package conversation

import (
	"context"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
)

func TestRoleConfigurationServiceReadsAndUpdatesIndependentGlobalProfiles(t *testing.T) {
	store := newTestStore(t)
	catalog := newRoleConfigurationTestCatalog()
	service, err := NewRoleConfigurationService(store, catalog)
	if err != nil {
		t.Fatalf("NewRoleConfigurationService: %v", err)
	}

	configuration, err := service.ReadGlobalConfiguration(context.Background())
	if err != nil {
		t.Fatalf("ReadGlobalConfiguration: %v", err)
	}
	if err := configuration.Validate(); err != nil {
		t.Fatalf("validate global configuration: %v", err)
	}
	if got := roleConfigurationProfile(t, configuration, RoleNarrator); got.EffectiveSource != RoleProfileSourceBuiltIn {
		t.Fatalf("initial narrator source = %s, want built_in", got.EffectiveSource)
	}
	assertVisibleCatalogRequests(t, catalog)

	narrator := DefaultNarratorRoleProfile()
	modelID := "gpt-5.6-luna"
	narrator.ModelSelection = ModelSelection{Mode: ModelSelectionExact, ModelID: &modelID}
	narrator.ReasoningEffort = ReasoningEffortMedium
	configuration, err = service.UpdateGlobalConfiguration(context.Background(), []RoleProfileUpdate{
		{Role: RoleNarrator, Profile: &narrator},
	})
	if err != nil {
		t.Fatalf("UpdateGlobalConfiguration: %v", err)
	}
	configuredNarrator := roleConfigurationProfile(t, configuration, RoleNarrator)
	if configuredNarrator.Override == nil ||
		configuredNarrator.EffectiveSource != RoleProfileSourceGlobal ||
		configuredNarrator.Resolved.ModelID != modelID ||
		configuredNarrator.Resolved.ReasoningEffort != ReasoningEffortMedium {
		t.Fatalf("configured narrator = %+v", configuredNarrator)
	}
	agentProfile := roleConfigurationProfile(t, configuration, RoleAgent)
	if agentProfile.Override != nil || agentProfile.Resolved.ModelID != "gpt-5.6-sol" {
		t.Fatalf("independent agent profile changed with narrator: %+v", agentProfile)
	}

	configuration, err = service.UpdateGlobalConfiguration(context.Background(), []RoleProfileUpdate{
		{Role: RoleNarrator, Profile: nil},
	})
	if err != nil {
		t.Fatalf("reset global narrator: %v", err)
	}
	resetNarrator := roleConfigurationProfile(t, configuration, RoleNarrator)
	if resetNarrator.Override != nil || resetNarrator.EffectiveSource != RoleProfileSourceBuiltIn ||
		resetNarrator.Resolved.ModelID != "gpt-5.4-mini" {
		t.Fatalf("reset narrator = %+v", resetNarrator)
	}
}

func TestRoleConfigurationServiceRejectsUnavailableAndUnsupportedSelectionsAtomically(t *testing.T) {
	store := newTestStore(t)
	service, err := NewRoleConfigurationService(store, newRoleConfigurationTestCatalog())
	if err != nil {
		t.Fatalf("NewRoleConfigurationService: %v", err)
	}

	unavailable := DefaultAgentRoleProfile()
	unavailableID := "gpt-unavailable"
	unavailable.ModelSelection = ModelSelection{Mode: ModelSelectionExact, ModelID: &unavailableID}
	validNarrator := DefaultNarratorRoleProfile()
	_, err = service.UpdateGlobalConfiguration(context.Background(), []RoleProfileUpdate{
		{Role: RoleNarrator, Profile: &validNarrator},
		{Role: RoleAgent, Profile: &unavailable},
	})
	if err == nil || !containsError(err, "configured provider model gpt-unavailable is unavailable") {
		t.Fatalf("unavailable model error = %v", err)
	}

	configuration, readErr := service.ReadGlobalConfiguration(context.Background())
	if readErr != nil {
		t.Fatalf("ReadGlobalConfiguration after rejection: %v", readErr)
	}
	if roleConfigurationProfile(t, configuration, RoleNarrator).Override != nil {
		t.Fatal("valid update committed despite atomic batch rejection")
	}

	unsupported := DefaultNarratorRoleProfile()
	unsupported.ReasoningEffort = ReasoningEffortUltra
	_, err = service.UpdateGlobalConfiguration(context.Background(), []RoleProfileUpdate{
		{Role: RoleNarrator, Profile: &unsupported},
	})
	if err == nil || !containsError(err, "does not support reasoning effort ultra") {
		t.Fatalf("unsupported effort error = %v", err)
	}
}

func TestRoleModelOptionAllowsProviderModelWithoutDescription(t *testing.T) {
	model := roleConfigurationTestModel("gpt-description-optional", ReasoningEffortMedium, true)
	model.Description = ""

	if err := roleModelOption(model).Validate(); err != nil {
		t.Fatalf("validate provider model without description: %v", err)
	}
}

func TestRoleConfigurationServiceAppliesAndPublishesConversationOverrides(t *testing.T) {
	store := newTestStore(t)
	topic := transactionTestConversation("conversation-role-configuration-service")
	persistRoleProfileTestMutation(t, store, "create-role-configuration-topic", func(transaction *WriteTransaction) error {
		return transaction.InsertConversation(topic)
	})
	global := roleConfigurationAgentOverride(RoleProfileScopeGlobal, "", "gpt-5.6-terra", ReasoningEffortMedium)
	workspace := roleConfigurationAgentOverride(
		RoleProfileScopeWorkspace,
		topic.WorkspaceID,
		"gpt-5.6-luna",
		ReasoningEffortMedium,
	)
	persistRoleProfileTestMutation(t, store, "seed-role-configuration-precedence", func(transaction *WriteTransaction) error {
		if err := transaction.UpsertRoleProfileOverride(global); err != nil {
			return err
		}
		return transaction.UpsertRoleProfileOverride(workspace)
	})
	service, err := NewRoleConfigurationService(store, newRoleConfigurationTestCatalog())
	if err != nil {
		t.Fatalf("NewRoleConfigurationService: %v", err)
	}

	configuration, err := service.ReadConversationConfiguration(
		context.Background(),
		topic.WorkspaceID,
		topic.ID,
	)
	if err != nil {
		t.Fatalf("ReadConversationConfiguration: %v", err)
	}
	agentConfiguration := roleConfigurationProfile(t, configuration, RoleAgent)
	if agentConfiguration.Override != nil ||
		agentConfiguration.EffectiveSource != RoleProfileSourceWorkspace ||
		agentConfiguration.Resolved.ModelID != "gpt-5.6-luna" {
		t.Fatalf("workspace-effective agent = %+v", agentConfiguration)
	}
	for _, profile := range configuration.Profiles {
		if profile.Role == RoleMaster {
			t.Fatal("conversation role configuration exposed the app-global master role")
		}
	}

	conversationProfile := DefaultAgentRoleProfile()
	conversationModel := "gpt-5.6-sol"
	conversationProfile.ModelSelection = ModelSelection{
		Mode:    ModelSelectionExact,
		ModelID: &conversationModel,
	}
	configuration, err = service.UpdateConversationConfiguration(
		context.Background(),
		topic.WorkspaceID,
		topic.ID,
		[]RoleProfileUpdate{{Role: RoleAgent, Profile: &conversationProfile}},
	)
	if err != nil {
		t.Fatalf("UpdateConversationConfiguration: %v", err)
	}
	conversationAgent := roleConfigurationProfile(t, configuration, RoleAgent)
	if conversationAgent.Override == nil ||
		conversationAgent.EffectiveSource != RoleProfileSourceConversation ||
		conversationAgent.Resolved.ModelID != conversationModel {
		t.Fatalf("conversation-effective agent = %+v", conversationAgent)
	}
	assertLatestRoleConfigurationEvent(
		t,
		store,
		topic.ID,
		ConversationEventTypeRoleProfileOverrideUpdated,
	)

	configuration, err = service.UpdateConversationConfiguration(
		context.Background(),
		topic.WorkspaceID,
		topic.ID,
		[]RoleProfileUpdate{{Role: RoleAgent, Profile: nil}},
	)
	if err != nil {
		t.Fatalf("reset conversation agent: %v", err)
	}
	resetAgent := roleConfigurationProfile(t, configuration, RoleAgent)
	if resetAgent.Override != nil ||
		resetAgent.EffectiveSource != RoleProfileSourceWorkspace ||
		resetAgent.Resolved.ModelID != "gpt-5.6-luna" {
		t.Fatalf("reset conversation agent = %+v", resetAgent)
	}
	assertLatestRoleConfigurationEvent(
		t,
		store,
		topic.ID,
		ConversationEventTypeRoleProfileOverrideRemoved,
	)
}

func TestPrimaryAgentRoleProfileUsesGlobalWorkspaceConversationPrecedence(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	global := roleConfigurationAgentOverride(
		RoleProfileScopeGlobal,
		"",
		"gpt-agent-global",
		ReasoningEffortMedium,
	)
	persistRoleProfileTestMutation(t, store, "set-global-primary-agent", func(transaction *WriteTransaction) error {
		return transaction.UpsertRoleProfileOverride(global)
	})
	first, err := service.CreateTopic(ctx, workspaceID, "Global agent precedence")
	if err != nil {
		t.Fatalf("CreateTopic with global profile: %v", err)
	}
	assertLastResolvedAgentModel(t, runtime, "gpt-agent-global")

	workspace := roleConfigurationAgentOverride(
		RoleProfileScopeWorkspace,
		workspaceID,
		"gpt-agent-workspace",
		ReasoningEffortHigh,
	)
	persistRoleProfileTestMutation(t, store, "set-workspace-primary-agent", func(transaction *WriteTransaction) error {
		return transaction.UpsertRoleProfileOverride(workspace)
	})
	second, err := service.CreateTopic(ctx, workspaceID, "Workspace agent precedence")
	if err != nil {
		t.Fatalf("CreateTopic with workspace profile: %v", err)
	}
	assertLastResolvedAgentModel(t, runtime, "gpt-agent-workspace")

	conversationOverride := roleConfigurationAgentOverride(
		RoleProfileScopeConversation,
		second.Conversation.ID,
		"gpt-agent-conversation",
		ReasoningEffortXHigh,
	)
	persistRoleProfileTestMutation(t, store, "set-conversation-primary-agent", func(transaction *WriteTransaction) error {
		return transaction.UpsertRoleProfileOverride(conversationOverride)
	})
	completed, err := service.sendTestTurn(
		ctx,
		workspaceID,
		second.Conversation.ID,
		"complete with conversation profile",
	)
	if err != nil {
		t.Fatalf("SendTurn with conversation profile: %v", err)
	}
	completed = assertServiceSnapshot(t, service, workspaceID, second.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	turn := latestSnapshotTurn(completed)
	if turn.RequestedRoleProfile.ModelSelection.ModelID == nil ||
		*turn.RequestedRoleProfile.ModelSelection.ModelID != "gpt-agent-conversation" ||
		turn.RequestedRoleProfile.ReasoningEffort != ReasoningEffortXHigh {
		t.Fatalf("conversation turn requested profile = %+v", turn.RequestedRoleProfile)
	}
	assertLastResolvedAgentModel(t, runtime, "gpt-agent-conversation")

	fork, err := service.forkRouterTopicForTest(
		ctx,
		workspaceID,
		second.Conversation.ID,
		turn.ID,
		"Workspace agent precedence fork",
	)
	if err != nil {
		t.Fatalf("ForkTopic with workspace profile: %v", err)
	}
	requests := runtime.durableForkRequests()
	if len(requests) != 1 ||
		requests[0].Invocation.Model != "gpt-agent-workspace" ||
		requests[0].Invocation.ReasoningEffort != ReasoningEffortHigh {
		t.Fatalf("durable fork agent invocation = %+v, want workspace profile", requests)
	}
	if fork.ThreadBinding == nil || fork.ThreadBinding.ProviderMetadata["model"] != "gpt-agent-workspace" {
		t.Fatalf("durable fork thread binding = %+v, want workspace model", fork.ThreadBinding)
	}

	if first.Conversation.ID == second.Conversation.ID {
		t.Fatal("precedence test topics unexpectedly reused an id")
	}
}

type roleConfigurationTestCatalog struct {
	calls []roleConfigurationCatalogCall
	err   error
}

type roleConfigurationCatalogCall struct {
	includeHidden bool
	limit         int
}

func newRoleConfigurationTestCatalog() *roleConfigurationTestCatalog {
	return &roleConfigurationTestCatalog{}
}

func (catalog *roleConfigurationTestCatalog) ListModels(
	_ context.Context,
	_ *string,
	limit int,
	includeHidden bool,
) (agent.ModelPage, error) {
	catalog.calls = append(catalog.calls, roleConfigurationCatalogCall{
		includeHidden: includeHidden,
		limit:         limit,
	})
	if catalog.err != nil {
		return agent.ModelPage{}, catalog.err
	}
	return agent.ModelPage{Data: []agent.Model{
		roleConfigurationTestModel("gpt-5.6-sol", ReasoningEffortHigh, true),
		roleConfigurationTestModel("gpt-5.6-terra", ReasoningEffortMedium, false),
		roleConfigurationTestModel("gpt-5.6-luna", ReasoningEffortMedium, false),
		roleConfigurationTestModel("gpt-5.4-mini", ReasoningEffortLow, false),
	}}, nil
}

func roleConfigurationTestModel(
	id string,
	defaultEffort ReasoningEffort,
	isDefault bool,
) agent.Model {
	return agent.Model{
		ID:                        id,
		DisplayName:               id,
		Description:               id + " test model",
		DefaultReasoningEffort:    string(defaultEffort),
		SupportedReasoningEfforts: []string{"low", "medium", "high", "xhigh"},
		ServiceTiers:              []string{},
		IsDefault:                 isDefault,
	}
}

func roleConfigurationProfile(
	t *testing.T,
	configuration RoleConfiguration,
	role Role,
) RoleProfileConfiguration {
	t.Helper()
	for _, profile := range configuration.Profiles {
		if profile.Role == role {
			return profile
		}
	}
	t.Fatalf("role configuration does not contain %s", role)
	return RoleProfileConfiguration{}
}

func roleConfigurationAgentOverride(
	scope RoleProfileScopeKind,
	scopeID string,
	modelID string,
	effort ReasoningEffort,
) RoleProfileOverride {
	profile := DefaultAgentRoleProfile()
	profile.ModelSelection = ModelSelection{Mode: ModelSelectionExact, ModelID: &modelID}
	profile.ReasoningEffort = effort
	return RoleProfileOverride{
		ScopeKind: scope,
		ScopeID:   scopeID,
		Profile:   profile,
		UpdatedAt: testTimeStarted,
	}
}

func assertVisibleCatalogRequests(t *testing.T, catalog *roleConfigurationTestCatalog) {
	t.Helper()
	if len(catalog.calls) == 0 {
		t.Fatal("role configuration did not read the model catalog")
	}
	for _, call := range catalog.calls {
		if call.includeHidden || call.limit != agent.MaxThreadPageSize {
			t.Fatalf("role model catalog call = %+v", call)
		}
	}
}

func assertLatestRoleConfigurationEvent(
	t *testing.T,
	store *Store,
	conversationID string,
	want ConversationEventType,
) {
	t.Helper()
	streamID, err := ConversationStreamID(conversationID)
	if err != nil {
		t.Fatalf("ConversationStreamID: %v", err)
	}
	events, err := store.ReadCommittedStreamEvents(
		context.Background(),
		streamID,
		0,
		MaxCommittedEventReadLimit,
	)
	if err != nil {
		t.Fatalf("ReadCommittedStreamEvents: %v", err)
	}
	if len(events) == 0 || events[len(events)-1].Kind != string(want) {
		t.Fatalf("latest role configuration event = %+v, want %s", events, want)
	}
}

func assertLastResolvedAgentModel(
	t *testing.T,
	runtime *serviceTestAgentRuntime,
	want string,
) {
	t.Helper()
	requests := runtime.invocationResolutions()
	if len(requests) == 0 || requests[len(requests)-1].Model != want {
		t.Fatalf("latest primary-agent resolution = %+v, want %s", requests, want)
	}
}

func containsError(err error, text string) bool {
	return err != nil && strings.Contains(err.Error(), text)
}
