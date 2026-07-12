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
	"setta/internal/speech"
	"setta/internal/workspace"
	"setta/internal/workspaceui/conversationpalette"
)

type AgentRuntime interface {
	ResolveInvocation(context.Context, agent.Invocation) (agent.ResolvedInvocation, error)
	StartThread(context.Context, agent.StartThreadRequest) (agent.Thread, error)
	ForkThread(context.Context, agent.ForkThreadRequest) (agent.Thread, error)
	RunTurn(context.Context, agent.TurnRequest, agent.EventSink) (agent.TurnResult, error)
	SteerTurn(context.Context, agent.TurnControlRequest) error
	InterruptTurn(context.Context, agent.TurnControlRequest) error
	SubmitApproval(agent.ApprovalResponse) error
	UnsubscribeThread(context.Context, string) error
}

type WorkspaceResolver interface {
	ResolveActiveWorkspace(string) (workspace.WorkspaceSummary, error)
}

type ServiceOption func(*serviceConfig) error

type serviceConfig struct {
	newID             func(string) (string, error)
	narrationObserver NarrationTrajectoryObserver
	now               func() time.Time
}

type Service struct {
	agent      AgentRuntime
	store      *Store
	workspaces WorkspaceResolver
	newID      func(string) (string, error)
	now        func() time.Time
	narration  NarrationTrajectoryObserver

	createMu sync.Mutex
	locksMu  sync.Mutex
	locks    map[string]*sync.Mutex
	activeMu sync.Mutex
	active   map[string]*activeConversationTurn

	lifecycleCtx    context.Context
	lifecycleCancel context.CancelFunc
	lifecycleMu     sync.Mutex
	closing         bool
	turns           sync.WaitGroup
}

type activeConversationTurn struct {
	conversationID   string
	providerThreadID string
	providerTurnID   string
	queueOrdinal     int
	request          agent.TurnRequest
	roleProfile      RoleProfile
	turnID           string
	workspaceID      string
}

type CommandConflictError struct {
	ConversationID string
	Reason         string
}

func (err *CommandConflictError) Error() string {
	return fmt.Sprintf("conversation %s command conflict: %s", err.ConversationID, err.Reason)
}

func IsCommandConflict(err error) bool {
	var conflict *CommandConflictError
	return errors.As(err, &conflict) || IsStateConflict(err)
}

func WithServiceIDGenerator(generator func(string) (string, error)) ServiceOption {
	return func(config *serviceConfig) error {
		if generator == nil {
			return errors.New("conversation service id generator is required")
		}
		config.newID = generator
		return nil
	}
}

func WithServiceClock(now func() time.Time) ServiceOption {
	return func(config *serviceConfig) error {
		if now == nil {
			return errors.New("conversation service clock is required")
		}
		config.now = now
		return nil
	}
}

func WithNarrationTrajectoryObserver(observer NarrationTrajectoryObserver) ServiceOption {
	return func(config *serviceConfig) error {
		if observer == nil {
			return errors.New("conversation narration trajectory observer is required")
		}
		config.narrationObserver = observer
		return nil
	}
}

func NewService(
	store *Store,
	workspaces WorkspaceResolver,
	agentRuntime AgentRuntime,
	options ...ServiceOption,
) (*Service, error) {
	if store == nil || workspaces == nil || agentRuntime == nil {
		return nil, errors.New("conversation service requires store, workspace resolver, and agent runtime")
	}
	config := serviceConfig{newID: randomServiceID, now: time.Now}
	for _, option := range options {
		if option == nil {
			return nil, errors.New("conversation service option must not be nil")
		}
		if err := option(&config); err != nil {
			return nil, err
		}
	}
	lifecycleCtx, lifecycleCancel := context.WithCancel(context.Background())
	return &Service{
		agent:           agentRuntime,
		store:           store,
		workspaces:      workspaces,
		newID:           config.newID,
		now:             config.now,
		narration:       config.narrationObserver,
		locks:           map[string]*sync.Mutex{},
		active:          map[string]*activeConversationTurn{},
		lifecycleCtx:    lifecycleCtx,
		lifecycleCancel: lifecycleCancel,
	}, nil
}

func (service *Service) ReadSnapshot(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (ConversationSnapshot, error) {
	return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) ListNavigatorPage(
	ctx context.Context,
	workspaceID string,
	query string,
	cursor *NavigatorCursor,
	limit int,
) (NavigatorPage, error) {
	return service.store.ListNavigatorPage(ctx, workspaceID, query, cursor, limit)
}

func (service *Service) SubscribeEvents(
	cursor ConversationEventCursor,
	workspaceID string,
	conversationID string,
) (ConversationEventSubscription, error) {
	return service.store.SubscribeEvents(cursor, workspaceID, conversationID)
}

func (service *Service) CreateTopic(
	ctx context.Context,
	workspaceID string,
	title string,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateTopicTitle(title); err != nil {
		return ConversationSnapshot{}, err
	}
	workspaceSummary, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	profile := DefaultAgentRoleProfile()
	invocation, err := agentInvocation(profile)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if _, err := service.agent.ResolveInvocation(ctx, invocation); err != nil {
		return ConversationSnapshot{}, fmt.Errorf("resolve topic agent profile: %w", err)
	}
	thread, err := service.agent.StartThread(ctx, agent.StartThreadRequest{
		WorkspaceRoot:         workspaceSummary.RootPath,
		Invocation:            invocation,
		DeveloperInstructions: "Act as the durable primary agent for this Setta topic conversation.",
	})
	if err != nil {
		return ConversationSnapshot{}, err
	}
	conversationID, err := service.newID("conversation")
	if err != nil {
		_ = service.agent.UnsubscribeThread(context.Background(), thread.ID)
		return ConversationSnapshot{}, err
	}
	now := service.timestamp()
	conversation := TopicConversation{
		ID:              conversationID,
		WorkspaceID:     workspaceID,
		Title:           title,
		TopicDescriptor: title,
		Status:          ConversationStatusIdle,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	binding := AgentThreadBinding{
		ConversationID:   conversationID,
		Provider:         ProviderCodex,
		ThreadID:         thread.ID,
		Status:           ThreadBindingStatusLinked,
		CreatedAt:        now,
		ProviderMetadata: map[string]string{"model": thread.Model},
	}
	narrator := NarratorState{
		ConversationID:  conversationID,
		TopicDescriptor: title,
		Status:          NarratorStatusReady,
		UpdatedAt:       now,
	}
	service.createMu.Lock()
	var presentation ConversationPresentationProfile
	err = service.store.withVoiceConfigurationLock(func() error {
		var presentationErr error
		presentation, presentationErr = service.initialPresentationProfile(ctx, workspaceID, conversationID, now)
		if presentationErr != nil {
			return presentationErr
		}
		return service.persistCreatedConversation(ctx, conversation, binding, narrator, presentation, nil)
	})
	service.createMu.Unlock()
	if err != nil {
		_ = service.agent.UnsubscribeThread(context.Background(), thread.ID)
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) persistCreatedConversation(
	ctx context.Context,
	conversation TopicConversation,
	binding AgentThreadBinding,
	narrator NarratorState,
	presentation ConversationPresentationProfile,
	branch *ConversationBranch,
) error {
	payloads := []ConversationEventPayload{
		ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: conversation},
		ConversationThreadBindingUpdatedEventPayload{Type: ConversationEventTypeThreadBindingUpdated, Binding: binding},
		ConversationNarratorStateUpdatedEventPayload{Type: ConversationEventTypeNarratorStateUpdated, State: narrator},
		ConversationPresentationProfileUpdatedEventPayload{Type: ConversationEventTypePresentationProfileUpdated, Profile: presentation},
	}
	if branch != nil {
		payloads = append(payloads, ConversationBranchCreatedEventPayload{
			Type:   ConversationEventTypeBranchCreated,
			Branch: *branch,
		})
	}
	publications, err := service.publications(conversation.ID, conversation.UpdatedAt, payloads...)
	if err != nil {
		return err
	}
	_, err = service.store.Transact(ctx, "create topic conversation", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(conversation); err != nil {
			return err
		}
		if branch != nil {
			if err := transaction.InsertConversationBranch(*branch); err != nil {
				return err
			}
		}
		if err := transaction.UpsertAgentThreadBinding(binding); err != nil {
			return err
		}
		if err := transaction.InsertNarratorState(narrator); err != nil {
			return err
		}
		if err := transaction.UpsertConversationPresentationProfile(presentation); err != nil {
			return err
		}
		return appendPublications(transaction, publications)
	})
	return err
}

func (service *Service) initialPresentationProfile(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	updatedAt string,
) (ConversationPresentationProfile, error) {
	usage := map[conversationpalette.ConversationPaletteID][]string{}
	var cursor *NavigatorCursor
	for {
		page, err := service.store.ListNavigatorPage(ctx, workspaceID, "", cursor, MaxNavigatorPageLimit)
		if err != nil {
			return ConversationPresentationProfile{}, err
		}
		for _, item := range page.Items {
			id := item.PresentationProfile.ResolvedPaletteID
			usage[id] = append(usage[id], item.Conversation.ID)
		}
		if page.NextCursor == nil {
			break
		}
		cursor = page.NextCursor
	}
	paletteID, reuse := leastUsedPalette(usage)
	master, err := service.store.ReadMasterVoiceSelection(ctx)
	if err != nil {
		return ConversationPresentationProfile{}, fmt.Errorf("read master voice selection: %w", err)
	}
	if master.ResolvedVoiceID == nil {
		return ConversationPresentationProfile{}, errors.New("master voice selection has no resolved voice")
	}
	presentations, err := service.store.readActiveConversationPresentations(ctx)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	voiceAllocation, err := speech.AllocateNarratorVoice(
		*master.ResolvedVoiceID,
		narratorVoiceAssignments(presentations, nil),
	)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	resolvedVoiceID := voiceAllocation.VoiceID
	return ConversationPresentationProfile{
		ConversationID:          conversationID,
		PaletteSelection:        PresentationSelectionAutoDistinct,
		ResolvedPaletteID:       paletteID,
		PaletteReuse:            reuse,
		NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
		ResolvedNarratorVoiceID: &resolvedVoiceID,
		NarratorVoiceReuse:      presentationReuseFromVoiceAllocation(voiceAllocation),
		NarratorSpeechEnabled:   true,
		UpdatedAt:               updatedAt,
	}, nil
}

func leastUsedPalette(
	usage map[conversationpalette.ConversationPaletteID][]string,
) (conversationpalette.ConversationPaletteID, *PresentationReuse) {
	catalog := conversationpalette.IDs()
	selected := catalog[0]
	for _, candidate := range catalog[1:] {
		if len(usage[candidate]) < len(usage[selected]) {
			selected = candidate
		}
	}
	if len(usage[selected]) == 0 {
		return selected, nil
	}
	return selected, &PresentationReuse{
		Reason:                     PresentationReuseCatalogExhausted,
		ResolvedChoiceID:           string(selected),
		ConflictingConversationIDs: append([]string{}, usage[selected]...),
	}
}

func (service *Service) Shutdown(ctx context.Context) error {
	if ctx == nil {
		return errors.New("conversation service shutdown context is required")
	}
	service.lifecycleMu.Lock()
	if !service.closing {
		service.closing = true
		service.lifecycleCancel()
	}
	service.lifecycleMu.Unlock()
	done := make(chan struct{})
	go func() {
		service.turns.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (service *Service) requireOpen() error {
	service.lifecycleMu.Lock()
	defer service.lifecycleMu.Unlock()
	if service.closing {
		return errors.New("conversation service is shutting down")
	}
	return nil
}

func (service *Service) conversationLock(conversationID string) *sync.Mutex {
	service.locksMu.Lock()
	defer service.locksMu.Unlock()
	lock := service.locks[conversationID]
	if lock == nil {
		lock = &sync.Mutex{}
		service.locks[conversationID] = lock
	}
	return lock
}

func (service *Service) timestamp() string {
	return service.now().UTC().Format(time.RFC3339Nano)
}

func randomServiceID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(bytes), nil
}

func validateTopicTitle(title string) error {
	if err := validateTrimmedText("topic conversation title", title); err != nil {
		return err
	}
	if len(title) > MaxConversationTitleBytes {
		return fmt.Errorf("topic conversation title exceeds %d bytes", MaxConversationTitleBytes)
	}
	return nil
}
