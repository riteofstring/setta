package conversation

import (
	"context"
	"encoding/json"
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

func TestRoleConfigurationServiceReadsUpdatesAndAuditsWorkspacePrecedence(t *testing.T) {
	store := newTestStore(t)
	service, err := NewRoleConfigurationService(store, newRoleConfigurationTestCatalog())
	if err != nil {
		t.Fatalf("NewRoleConfigurationService: %v", err)
	}
	workspaceID := "workspace-role-configuration-service"

	globalProfile := DefaultAgentRoleProfile()
	globalModelID := "gpt-5.6-terra"
	globalProfile.ModelSelection = ModelSelection{Mode: ModelSelectionExact, ModelID: &globalModelID}
	globalProfile.ReasoningEffort = ReasoningEffortMedium
	if _, err := service.UpdateGlobalConfiguration(
		context.Background(),
		[]RoleProfileUpdate{{Role: RoleAgent, Profile: &globalProfile}},
	); err != nil {
		t.Fatalf("UpdateGlobalConfiguration: %v", err)
	}

	configuration, err := service.ReadWorkspaceConfiguration(context.Background(), workspaceID)
	if err != nil {
		t.Fatalf("ReadWorkspaceConfiguration: %v", err)
	}
	if err := configuration.Validate(); err != nil {
		t.Fatalf("validate workspace configuration: %v", err)
	}
	assertWorkspaceRoleConfiguration(t, configuration, workspaceID)
	assertEffectiveRoleConfiguration(
		t,
		configuration,
		RoleAgent,
		RoleProfileSourceGlobal,
		globalModelID,
		nil,
		"",
	)

	workspaceProfile := DefaultAgentRoleProfile()
	workspaceModelID := "gpt-5.6-luna"
	workspaceProfile.ModelSelection = ModelSelection{
		Mode:    ModelSelectionExact,
		ModelID: &workspaceModelID,
	}
	workspaceProfile.ReasoningEffort = ReasoningEffortMedium
	configuration, err = service.UpdateWorkspaceConfiguration(
		context.Background(),
		workspaceID,
		[]RoleProfileUpdate{{Role: RoleAgent, Profile: &workspaceProfile}},
	)
	if err != nil {
		t.Fatalf("UpdateWorkspaceConfiguration: %v", err)
	}
	assertEffectiveRoleConfiguration(
		t,
		configuration,
		RoleAgent,
		RoleProfileSourceWorkspace,
		workspaceModelID,
		roleProfileScopeKindPointer(RoleProfileScopeWorkspace),
		workspaceID,
	)
	assertLatestRoleConfigurationAudit(
		t,
		store,
		RoleProfileScopeWorkspace,
		workspaceID,
		RoleAgent,
		false,
	)
	topic := transactionTestConversation("conversation-workspace-role-configuration-service")
	topic.WorkspaceID = &workspaceID
	persistRoleProfileTestMutation(t, store, "create-workspace-role-configuration-topic", func(transaction *WriteTransaction) error {
		return transaction.InsertConversation(topic)
	})
	conversationConfiguration, err := service.ReadConversationConfiguration(
		context.Background(),
		workspaceID,
		topic.ID,
	)
	if err != nil {
		t.Fatalf("ReadConversationConfiguration with workspace override: %v", err)
	}
	assertEffectiveRoleConfiguration(
		t,
		conversationConfiguration,
		RoleAgent,
		RoleProfileSourceWorkspace,
		workspaceModelID,
		nil,
		"",
	)

	if _, err := service.UpdateWorkspaceConfiguration(
		context.Background(),
		workspaceID,
		[]RoleProfileUpdate{{Role: RoleDirector, Profile: nil}},
	); err == nil || !containsError(err, "role director cannot be configured at workspace scope") {
		t.Fatalf("workspace director update error = %v", err)
	}

	configuration, err = service.UpdateWorkspaceConfiguration(
		context.Background(),
		workspaceID,
		[]RoleProfileUpdate{{Role: RoleAgent, Profile: nil}},
	)
	if err != nil {
		t.Fatalf("reset workspace agent: %v", err)
	}
	assertEffectiveRoleConfiguration(
		t,
		configuration,
		RoleAgent,
		RoleProfileSourceGlobal,
		globalModelID,
		nil,
		"",
	)
	assertLatestRoleConfigurationAudit(
		t,
		store,
		RoleProfileScopeWorkspace,
		workspaceID,
		RoleAgent,
		true,
	)
}

func TestRoleConfigurationServiceAppliesAndPublishesConversationOverrides(t *testing.T) {
	store := newTestStore(t)
	topic := transactionTestConversation("conversation-role-configuration-service")
	topicWorkspaceID := *topic.WorkspaceID
	persistRoleProfileTestMutation(t, store, "create-role-configuration-topic", func(transaction *WriteTransaction) error {
		return transaction.InsertConversation(topic)
	})
	global := roleConfigurationAgentOverride(RoleProfileScopeGlobal, "", "gpt-5.6-terra", ReasoningEffortMedium)
	workspace := roleConfigurationAgentOverride(
		RoleProfileScopeWorkspace,
		topicWorkspaceID,
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
		topicWorkspaceID,
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
		if profile.Role == RoleDirector {
			t.Fatal("conversation role configuration exposed the app-global director role")
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
		topicWorkspaceID,
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
		topicWorkspaceID,
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
	if len(runtime.invocationResolutions()) != 0 {
		t.Fatalf("topic creation resolved provider state: resolutions=%+v", runtime.invocationResolutions())
	}
	sendAndAssertPrimaryAgentRoleProfile(
		t,
		service,
		runtime,
		ctx,
		workspaceID,
		first.Conversation.ID,
		"complete with global profile",
		"gpt-agent-global",
		ReasoningEffortMedium,
	)

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
	sendAndAssertPrimaryAgentRoleProfile(
		t,
		service,
		runtime,
		ctx,
		workspaceID,
		second.Conversation.ID,
		"complete with workspace profile",
		"gpt-agent-workspace",
		ReasoningEffortHigh,
	)

	conversationOverride := roleConfigurationAgentOverride(
		RoleProfileScopeConversation,
		second.Conversation.ID,
		"gpt-agent-conversation",
		ReasoningEffortXHigh,
	)
	persistRoleProfileTestMutation(t, store, "set-conversation-primary-agent", func(transaction *WriteTransaction) error {
		return transaction.UpsertRoleProfileOverride(conversationOverride)
	})
	completed := sendAndAssertPrimaryAgentRoleProfile(
		t,
		service,
		runtime,
		ctx,
		workspaceID,
		second.Conversation.ID,
		"complete with conversation profile",
		"gpt-agent-conversation",
		ReasoningEffortXHigh,
	)
	turn := latestSnapshotTurn(completed)

	// A branch inherits the workspace role by resolving it when its own first
	// turn runs. Creating the branch touches no provider at all, so the profile
	// that matters is the one the child's carrier is started with.
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
	sendAndAssertPrimaryAgentRoleProfile(
		t,
		service,
		runtime,
		ctx,
		workspaceID,
		fork.Conversation.ID,
		"complete on the branch",
		"gpt-agent-workspace",
		ReasoningEffortHigh,
	)

	if first.Conversation.ID == second.Conversation.ID {
		t.Fatal("precedence test topics unexpectedly reused an id")
	}
}

func sendAndAssertPrimaryAgentRoleProfile(
	t *testing.T,
	service *Service,
	runtime *serviceTestAgentRuntime,
	ctx context.Context,
	workspaceID string,
	conversationID string,
	input string,
	wantModel string,
	wantEffort ReasoningEffort,
) ConversationSnapshot {
	t.Helper()
	if _, err := service.sendTestTurn(ctx, workspaceID, conversationID, input); err != nil {
		t.Fatalf("SendTurn %q: %v", input, err)
	}
	runtime.waitForStart(t, input)
	completed := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
	turn := latestSnapshotTurn(completed)
	assertPrimaryAgentTurnProfile(t, turn, wantModel, wantEffort)
	assertLastResolvedAgentModel(t, runtime, wantModel)
	return completed
}

func assertPrimaryAgentTurnProfile(
	t *testing.T,
	turn ConversationTurn,
	wantModel string,
	wantEffort ReasoningEffort,
) {
	t.Helper()
	if turn.RequestedRoleProfile.ModelSelection.ModelID == nil ||
		*turn.RequestedRoleProfile.ModelSelection.ModelID != wantModel ||
		turn.RequestedRoleProfile.ReasoningEffort != wantEffort {
		t.Fatalf("turn requested profile = %+v, want model %s effort %s", turn.RequestedRoleProfile, wantModel, wantEffort)
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

func assertWorkspaceRoleConfiguration(
	t *testing.T,
	configuration RoleConfiguration,
	workspaceID string,
) {
	t.Helper()
	if configuration.Scope.Kind != RoleProfileScopeWorkspace ||
		configuration.Scope.WorkspaceID == nil ||
		*configuration.Scope.WorkspaceID != workspaceID ||
		configuration.Scope.ConversationID != nil {
		t.Fatalf("workspace scope = %+v", configuration.Scope)
	}
	if len(configuration.Profiles) != 3 {
		t.Fatalf("workspace profiles = %d, want 3", len(configuration.Profiles))
	}
	for _, profile := range configuration.Profiles {
		if profile.Role == RoleDirector {
			t.Fatal("workspace role configuration exposed the global-only director role")
		}
	}
}

func assertEffectiveRoleConfiguration(
	t *testing.T,
	configuration RoleConfiguration,
	role Role,
	wantSource RoleProfileSourceKind,
	wantModelID string,
	wantOverrideScope *RoleProfileScopeKind,
	wantOverrideID string,
) {
	t.Helper()
	profile := roleConfigurationProfile(t, configuration, role)
	if profile.EffectiveSource != wantSource || profile.Resolved.ModelID != wantModelID {
		t.Fatalf("effective %s role configuration = %+v", role, profile)
	}
	if wantOverrideScope == nil {
		if profile.Override != nil {
			t.Fatalf("effective %s role has unexpected override %+v", role, profile.Override)
		}
		return
	}
	if profile.Override == nil ||
		profile.Override.ScopeKind != *wantOverrideScope ||
		profile.Override.ScopeID != wantOverrideID {
		t.Fatalf("effective %s role override = %+v", role, profile.Override)
	}
}

func roleProfileScopeKindPointer(scope RoleProfileScopeKind) *RoleProfileScopeKind {
	return &scope
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

func assertLatestRoleConfigurationAudit(
	t *testing.T,
	store *Store,
	scopeKind RoleProfileScopeKind,
	scopeID string,
	role Role,
	removed bool,
) {
	t.Helper()
	events, err := store.ReadCommittedStreamEvents(
		context.Background(),
		roleConfigurationAuditStreamID,
		0,
		MaxCommittedEventReadLimit,
	)
	if err != nil {
		t.Fatalf("ReadCommittedStreamEvents: %v", err)
	}
	if len(events) == 0 {
		t.Fatal("role configuration audit stream is empty")
	}
	latest := events[len(events)-1]
	if latest.Kind != "role_profile_configuration.updated" {
		t.Fatalf("latest role configuration audit kind = %s", latest.Kind)
	}
	var payload roleConfigurationAuditPayload
	if err := json.Unmarshal(latest.Payload, &payload); err != nil {
		t.Fatalf("decode role configuration audit: %v", err)
	}
	if payload.ScopeKind != scopeKind || payload.ScopeID != scopeID || len(payload.Changes) != 1 {
		t.Fatalf("role configuration audit payload = %+v", payload)
	}
	change := payload.Changes[0]
	if change.Role != role || change.Removed != removed || (change.Profile == nil) != removed {
		t.Fatalf("role configuration audit change = %+v", change)
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
