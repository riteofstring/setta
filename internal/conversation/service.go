package conversation

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"setta/internal/agent"
	"setta/internal/workspace"
	"setta/internal/workspaceui/conversationpalette"
)

type AgentRuntime interface {
	ListModels(context.Context, *string, int, bool) (agent.ModelPage, error)
	ResolveInvocation(context.Context, agent.Invocation) (agent.ResolvedInvocation, error)
	StartThread(context.Context, agent.StartThreadRequest) (agent.Thread, error)
	ForkThread(context.Context, agent.ForkThreadRequest) (agent.Thread, error)
	InjectItems(context.Context, string, []agent.InjectedTextItem) error
	UnsubscribeThread(context.Context, string) error
	RunTurn(context.Context, agent.TurnRequest, agent.EventSink) (agent.TurnResult, error)
	ObserveTurn(context.Context, agent.ObserveTurnRequest, agent.EventSink) (agent.TurnResult, error)
	SteerTurn(context.Context, agent.TurnControlRequest) error
	InterruptTurn(context.Context, agent.TurnControlRequest) error
	SubmitApproval(agent.ApprovalResponse) error
	ReconcileTurn(context.Context, string, string) (agent.TurnResult, bool, error)
}

type UpdateRoleProfileOverrideRequest struct {
	Override RoleProfileOverride `json:"override"`
}

func (service *Service) ReadEffectiveRoleProfiles(ctx context.Context, workspaceID string, conversationID string) (EffectiveRoleProfiles, error) {
	profiles, err := service.store.ReadEffectiveRoleProfiles(ctx, workspaceID, conversationID)
	if err != nil {
		return EffectiveRoleProfiles{}, err
	}
	for _, profile := range []RoleProfile{profiles.Master, profiles.Agent, profiles.Narrator, profiles.SideAgent} {
		if _, err := service.agent.ResolveInvocation(ctx, AgentInvocation(profile)); err != nil {
			return EffectiveRoleProfiles{}, fmt.Errorf("resolve %s role profile: %w", profile.Role, err)
		}
	}
	return profiles, nil
}

func (service *Service) ListModels(ctx context.Context, cursor *string, limit int, includeHidden bool) (agent.ModelPage, error) {
	return service.agent.ListModels(ctx, cursor, limit, includeHidden)
}

func (service *Service) UpdateRoleProfileOverride(ctx context.Context, request UpdateRoleProfileOverrideRequest) (EffectiveRoleProfiles, error) {
	override := request.Override
	if err := override.Validate(); err != nil {
		return EffectiveRoleProfiles{}, err
	}
	workspaceID, conversationID, err := service.validateRoleOverrideScope(ctx, override)
	if err != nil {
		return EffectiveRoleProfiles{}, err
	}
	if _, err := service.agent.ResolveInvocation(ctx, AgentInvocation(override.Profile)); err != nil {
		return EffectiveRoleProfiles{}, err
	}
	eventID, err := service.newID("role_profile_event")
	if err != nil {
		return EffectiveRoleProfiles{}, err
	}
	_, err = service.store.Transact(ctx, "update role profile override", func(transaction *WriteTransaction) error {
		if err := transaction.UpsertRoleProfileOverride(override); err != nil {
			return err
		}
		streamID := "configuration:roles"
		kind := "role_profile.updated"
		var payload any = override
		if conversationID != "" {
			streamID, err = ConversationStreamID(conversationID)
			if err != nil {
				return err
			}
			kind = string(ConversationEventTypeRoleProfileOverrideUpdated)
			payload = ConversationRoleProfileOverrideUpdatedEventPayload{Type: ConversationEventTypeRoleProfileOverrideUpdated, Override: override}
		}
		_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
			ID: eventID, StreamID: streamID, Kind: kind, Payload: payload, CommittedAt: override.UpdatedAt,
		})
		return err
	})
	if err != nil {
		return EffectiveRoleProfiles{}, err
	}
	return service.ReadEffectiveRoleProfiles(ctx, workspaceID, conversationID)
}

func (service *Service) validateRoleOverrideScope(ctx context.Context, override RoleProfileOverride) (string, string, error) {
	switch override.ScopeKind {
	case RoleProfileScopeGlobal:
		return "", "", nil
	case RoleProfileScopeWorkspace:
		if _, err := service.workspaceResolver.ResolveWorkspace(override.ScopeID); err != nil {
			return "", "", err
		}
		return override.ScopeID, "", nil
	case RoleProfileScopeConversation:
		record, err := service.store.ReadConversation(ctx, override.ScopeID)
		if err != nil {
			return "", "", err
		}
		return record.WorkspaceID, record.ID, nil
	default:
		return "", "", fmt.Errorf("unsupported role override scope %q", override.ScopeKind)
	}
}

type WorkspaceResolver interface {
	ResolveWorkspace(string) (workspace.WorkspaceSummary, error)
}

type TrajectoryObserver interface {
	ObserveTrajectory(context.Context, TrajectoryEvent) error
}

type ServiceConfig struct {
	Store               *Store
	Agent               AgentRuntime
	WorkspaceResolver   WorkspaceResolver
	Now                 func() time.Time
	NewID               func(string) (string, error)
	RecordObserverError func(error)
}

type Service struct {
	store               *Store
	agent               AgentRuntime
	workspaceResolver   WorkspaceResolver
	now                 func() time.Time
	newID               func(string) (string, error)
	recordObserverError func(error)

	actorsMu   sync.Mutex
	actors     map[string]*conversationActor
	observerMu sync.RWMutex
	observer   TrajectoryObserver

	sidesMu     sync.Mutex
	sideCancels map[string]context.CancelFunc
}

func (service *Service) SetTrajectoryObserver(observer TrajectoryObserver) error {
	if observer == nil {
		return errors.New("conversation trajectory observer is required")
	}
	service.observerMu.Lock()
	service.observer = observer
	service.observerMu.Unlock()
	return nil
}

func (service *Service) observeTrajectory(ctx context.Context, event TrajectoryEvent) {
	service.observerMu.RLock()
	observer := service.observer
	service.observerMu.RUnlock()
	if observer == nil {
		return
	}
	if err := observer.ObserveTrajectory(ctx, event); err != nil {
		service.recordObserverError(err)
	}
}

type conversationActor struct {
	mu       sync.Mutex
	active   bool
	resolved map[string]agent.ResolvedInvocation
}

type CreateConversationRequest struct {
	WorkspaceID  string         `json:"workspaceId"`
	Title        string         `json:"title"`
	InitialInput *AuthoredInput `json:"initialInput"`
}

type SendConversationInputRequest struct {
	WorkspaceID    string        `json:"workspaceId"`
	ConversationID string        `json:"conversationId"`
	Input          AuthoredInput `json:"input"`
}

type SteerConversationRequest struct {
	WorkspaceID    string        `json:"workspaceId"`
	ConversationID string        `json:"conversationId"`
	Input          AuthoredInput `json:"input"`
}

type StopConversationRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type SubmitConversationApprovalRequest struct {
	WorkspaceID    string                     `json:"workspaceId"`
	ConversationID string                     `json:"conversationId"`
	ApprovalID     string                     `json:"approvalId"`
	Decision       ApprovalSubmissionDecision `json:"decision"`
	Answers        []ApprovalSubmissionAnswer `json:"answers"`
}

type ApprovalSubmissionDecision string

const (
	ApprovalSubmissionAccept  ApprovalSubmissionDecision = "accept"
	ApprovalSubmissionDecline ApprovalSubmissionDecision = "decline"
	ApprovalSubmissionCancel  ApprovalSubmissionDecision = "cancel"
)

type ApprovalSubmissionAnswer struct {
	QuestionID string   `json:"questionId"`
	Answers    []string `json:"answers"`
}

func NewService(config ServiceConfig) (*Service, error) {
	if config.Store == nil {
		return nil, errors.New("conversation service store is required")
	}
	if config.Agent == nil {
		return nil, errors.New("conversation service agent runtime is required")
	}
	if config.WorkspaceResolver == nil {
		return nil, errors.New("conversation service workspace resolver is required")
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	newID := config.NewID
	if newID == nil {
		newID = randomConversationID
	}
	recordObserverError := config.RecordObserverError
	if recordObserverError == nil {
		recordObserverError = func(error) {}
	}
	return &Service{
		store:               config.Store,
		agent:               config.Agent,
		workspaceResolver:   config.WorkspaceResolver,
		now:                 now,
		newID:               newID,
		recordObserverError: recordObserverError,
		actors:              map[string]*conversationActor{},
		sideCancels:         map[string]context.CancelFunc{},
	}, nil
}

func (service *Service) Create(ctx context.Context, request CreateConversationRequest) (ConversationSnapshot, error) {
	if err := validateCreateConversationRequest(request); err != nil {
		return ConversationSnapshot{}, err
	}
	workspaceSummary, err := service.workspaceResolver.ResolveWorkspace(request.WorkspaceID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	profile, resolvedAgent, err := service.resolveRole(ctx, RoleAgent, request.WorkspaceID, "")
	if err != nil {
		return ConversationSnapshot{}, err
	}
	thread, err := service.agent.StartThread(ctx, agent.StartThreadRequest{
		WorkspaceRoot: workspaceSummary.RootPath,
		Invocation:    AgentInvocation(profile),
	})
	if err != nil {
		return ConversationSnapshot{}, err
	}
	records, err := service.newConversationRecords(request, profile, resolvedAgent, thread)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.persistNewConversation(ctx, records); err != nil {
		return ConversationSnapshot{}, err
	}
	service.actor(records.conversation.ID)
	if request.InitialInput != nil {
		return service.Send(ctx, SendConversationInputRequest{
			WorkspaceID: request.WorkspaceID, ConversationID: records.conversation.ID, Input: *request.InitialInput,
		})
	}
	return service.ReadSnapshot(ctx, request.WorkspaceID, records.conversation.ID)
}

func (service *Service) ReadSnapshot(ctx context.Context, workspaceID string, conversationID string) (ConversationSnapshot, error) {
	return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) List(ctx context.Context, workspaceID string, cursor *string, limit int) (ConversationListPage, error) {
	if workspaceID != "" {
		if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
			return ConversationListPage{}, err
		}
	}
	return service.store.ListConversations(ctx, workspaceID, cursor, limit)
}

func (service *Service) actor(conversationID string) *conversationActor {
	service.actorsMu.Lock()
	defer service.actorsMu.Unlock()
	actor := service.actors[conversationID]
	if actor == nil {
		actor = &conversationActor{resolved: map[string]agent.ResolvedInvocation{}}
		service.actors[conversationID] = actor
	}
	return actor
}

type newConversationRecords struct {
	conversation TopicConversation
	binding      AgentThreadBinding
	narrator     NarratorState
	presentation ConversationPresentationProfile
	index        TopicIndexDocument
}

func (service *Service) newConversationRecords(request CreateConversationRequest, profile RoleProfile, resolved agent.ResolvedInvocation, thread agent.Thread) (newConversationRecords, error) {
	conversationID, err := service.newID("conversation")
	if err != nil {
		return newConversationRecords{}, err
	}
	now := service.timestamp()
	conversation := TopicConversation{
		ID: conversationID, WorkspaceID: request.WorkspaceID, Title: request.Title,
		Status: ConversationStatusIdle, CreatedAt: now, UpdatedAt: now,
	}
	binding := AgentThreadBinding{
		ConversationID: conversationID, Provider: ProviderCodex, ThreadID: thread.ID,
		Status: ThreadBindingStatusLinked, CreatedAt: now,
		ProviderMetadata: map[string]string{"model": resolved.Model, "sessionId": thread.SessionID},
	}
	narrator := NarratorState{
		ConversationID: conversationID, Status: NarratorStatusReady, UpdatedAt: now,
	}
	presentation := ConversationPresentationProfile{
		ConversationID: conversationID, PaletteSelection: PresentationSelectionAutoDistinct,
		NarratorVoiceSelection: PresentationSelectionAutoDistinct, NarratorSpeechEnabled: true,
		UpdatedAt: now,
	}
	index := TopicIndexDocument{
		ConversationID: conversationID,
		WorkspaceID:    request.WorkspaceID,
		Title:          request.Title,
		UpdatedAt:      now,
	}
	return newConversationRecords{
		conversation: conversation,
		binding:      binding,
		narrator:     narrator,
		presentation: presentation,
		index:        index,
	}, nil
}

func (service *Service) persistNewConversation(ctx context.Context, records newConversationRecords) error {
	_, err := service.store.Transact(ctx, "create topic conversation", func(transaction *WriteTransaction) error {
		profile, err := transaction.allocatePresentation(records.presentation)
		if err != nil {
			return err
		}
		if err := transaction.InsertConversation(records.conversation); err != nil {
			return err
		}
		if err := transaction.UpsertAgentThreadBinding(records.binding); err != nil {
			return err
		}
		if err := transaction.InsertNarratorState(records.narrator); err != nil {
			return err
		}
		if err := transaction.UpsertConversationPresentationProfile(profile); err != nil {
			return err
		}
		if err := transaction.UpsertTopicIndexDocument(records.index); err != nil {
			return err
		}
		return service.appendCommittedPayload(transaction, records.conversation, ConversationUpdatedEventPayload{
			Type: ConversationEventTypeConversationUpdated, Conversation: records.conversation,
		})
	})
	return err
}

func (transaction *WriteTransaction) allocatePresentation(profile ConversationPresentationProfile) (ConversationPresentationProfile, error) {
	rows, err := transaction.tx.QueryContext(transaction.ctx, `
SELECT conversation_id, resolved_palette_id
FROM conversation_presentation_profiles
ORDER BY updated_at ASC, conversation_id ASC
`)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	defer rows.Close()
	used := map[conversationpalette.ConversationPaletteID][]string{}
	for rows.Next() {
		var conversationID string
		var paletteID conversationpalette.ConversationPaletteID
		if err := rows.Scan(&conversationID, &paletteID); err != nil {
			return ConversationPresentationProfile{}, err
		}
		used[paletteID] = append(used[paletteID], conversationID)
	}
	if err := rows.Err(); err != nil {
		return ConversationPresentationProfile{}, err
	}
	profile.ResolvedPaletteID, profile.PaletteReuse = chooseConversationPalette(used)
	return profile, profile.Validate()
}

func chooseConversationPalette(used map[conversationpalette.ConversationPaletteID][]string) (conversationpalette.ConversationPaletteID, *PresentationReuse) {
	ids := conversationpalette.IDs()
	selected := ids[0]
	for _, id := range ids {
		if len(used[id]) == 0 {
			return id, nil
		}
		if len(used[id]) < len(used[selected]) {
			selected = id
		}
	}
	return selected, &PresentationReuse{
		Reason: PresentationReuseCatalogExhausted, ResolvedChoiceID: string(selected),
		ConflictingConversationIDs: append([]string{}, used[selected]...),
	}
}

func validateCreateConversationRequest(request CreateConversationRequest) error {
	if err := validateIdentifier("conversation workspace id", request.WorkspaceID); err != nil {
		return err
	}
	if err := validateTrimmedText("conversation title", request.Title); err != nil {
		return err
	}
	if request.InitialInput != nil {
		return request.InitialInput.Validate()
	}
	return nil
}

func (service *Service) resolveRole(ctx context.Context, role Role, workspaceID string, conversationID string) (RoleProfile, agent.ResolvedInvocation, error) {
	profile, err := service.store.ResolveRoleProfile(ctx, role, workspaceID, conversationID)
	if err != nil {
		return RoleProfile{}, agent.ResolvedInvocation{}, err
	}
	resolved, err := service.agent.ResolveInvocation(ctx, AgentInvocation(profile))
	return profile, resolved, err
}

func AgentInvocation(profile RoleProfile) agent.Invocation {
	invocation := agent.Invocation{
		ReasoningEffort: profile.ReasoningEffort,
		ServiceTier:     cloneStringPointer(profile.ServiceTier),
		PermissionMode:  agent.PermissionModeReadOnly,
		ApprovalMode:    agent.ApprovalModeNever,
	}
	if profile.ModelSelection.Mode == ModelSelectionProviderDefault {
		invocation.ModelSelectionProviderDefault = true
	} else if profile.ModelSelection.ModelID != nil {
		invocation.Model = *profile.ModelSelection.ModelID
	}
	if profile.PermissionProfile.WorkspaceMutation {
		invocation.PermissionMode = agent.PermissionModeWorkspaceWrite
	}
	switch profile.PermissionProfile.ApprovalPolicy {
	case ApprovalPolicyOnRequest:
		invocation.ApprovalMode = agent.ApprovalModeOnRequest
	case ApprovalPolicyUnlessTrusted:
		invocation.ApprovalMode = agent.ApprovalModeUntrusted
	}
	return invocation
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func (service *Service) timestamp() string {
	return service.now().UTC().Format(time.RFC3339Nano)
}

func timestampAfter(value string, candidate string) string {
	previous, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return candidate
	}
	next, err := time.Parse(time.RFC3339Nano, candidate)
	if err != nil || !next.After(previous) {
		return previous.Add(time.Nanosecond).Format(time.RFC3339Nano)
	}
	return candidate
}

func randomConversationID(prefix string) (string, error) {
	if err := validateIdentifier("conversation id prefix", prefix); err != nil {
		return "", err
	}
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(bytes), nil
}
