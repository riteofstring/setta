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
	"setta/internal/conversation/conversationpalette"
	"setta/internal/speech"
	"setta/internal/workspace"
)

type AgentRuntime interface {
	ResolveInvocation(context.Context, agent.Invocation) (agent.ResolvedInvocation, error)
	StartThread(context.Context, agent.StartThreadRequest) (agent.Thread, error)
	ResumeThreadWithConfiguration(context.Context, string, agent.StartThreadRequest) (agent.ThreadResumeResult, error)
	MaterializeThread(context.Context, string, string) error
	ForkThread(context.Context, agent.ForkThreadRequest) (agent.Thread, error)
	InjectItems(context.Context, string, []agent.InjectedTextItem) error
	RunTurn(context.Context, agent.TurnRequest, agent.EventSink) (agent.TurnResult, error)
	ReconcileTurn(context.Context, string, string) (agent.TurnResult, bool, error)
	SteerTurn(context.Context, agent.TurnControlRequest) error
	InterruptTurn(context.Context, agent.TurnControlRequest) error
	InterruptProviderTurn(context.Context, string, string) error
	SubmitApproval(agent.ApprovalResponse) error
	UnsubscribeThread(context.Context, string) error
	UnsubscribeThreadWithStatus(context.Context, string) (agent.ThreadUnsubscribeStatus, error)
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

	createMu    sync.Mutex
	locksMu     sync.Mutex
	locks       map[string]*sync.Mutex
	activeMu    sync.Mutex
	active      map[string]*activeConversationTurn
	activeSides map[string]*activeSideConversationTurn

	lifecycleCtx    context.Context
	lifecycleCancel context.CancelFunc
	lifecycleMu     sync.Mutex
	closing         bool
	turns           sync.WaitGroup
}

type activeConversationTurn struct {
	conversationID                string
	interruptionReason            TurnInterruptionReason
	providerThreadID              string
	providerThreadRepairAttempted bool
	providerTurnID                string
	queueOrdinal                  int
	request                       agent.TurnRequest
	roleProfile                   RoleProfile
	turnID                        string
	workspaceID                   string
}

type activeSideConversationTurn struct {
	cancel               context.CancelFunc
	ctx                  context.Context
	done                 chan struct{}
	parentConversationID string
	request              agent.TurnRequest
	sideConversationID   string
	turnID               string
	workspaceID          string
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

type ResourceRequiredError struct {
	ConversationID string
	ResourceKind   string
}

func (err *ResourceRequiredError) Error() string {
	return fmt.Sprintf("conversation %s requires a %s resource", err.ConversationID, err.ResourceKind)
}

func IsResourceRequired(err error) bool {
	var resourceRequired *ResourceRequiredError
	return errors.As(err, &resourceRequired)
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
		activeSides:     map[string]*activeSideConversationTurn{},
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

func (service *Service) ReadSnapshotByID(
	ctx context.Context,
	conversationID string,
) (ConversationSnapshot, error) {
	return service.store.ReadSnapshotByID(ctx, conversationID)
}

func (service *Service) ReadArtifact(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	artifactID string,
) (Artifact, error) {
	return service.store.ReadArtifact(ctx, workspaceID, conversationID, artifactID)
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

func (service *Service) SubscribeEventsByID(
	cursor ConversationEventCursor,
	conversationID string,
) (ConversationEventSubscription, error) {
	return service.store.SubscribeEventsByID(cursor, conversationID)
}

func (service *Service) CreateTopic(
	ctx context.Context,
	workspaceID string,
	title string,
) (ConversationSnapshot, error) {
	return service.CreateTopicWithOptionalWorkspace(ctx, &workspaceID, title)
}

func (service *Service) CreateTopicWithOptionalWorkspace(
	ctx context.Context,
	workspaceID *string,
	title string,
) (ConversationSnapshot, error) {
	conversationID, err := service.newID("conversation")
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return service.createTopic(ctx, workspaceID, title, conversationID)
}

func (service *Service) CreateRoutedTopic(
	ctx context.Context,
	workspaceID string,
	title string,
	conversationID string,
) (ConversationSnapshot, error) {
	return service.CreateRoutedTopicWithOptionalWorkspace(ctx, &workspaceID, title, conversationID)
}

func (service *Service) CreateRoutedTopicWithOptionalWorkspace(
	ctx context.Context,
	workspaceID *string,
	title string,
	conversationID string,
) (ConversationSnapshot, error) {
	if err := validateIdentifier("routed topic conversation id", conversationID); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.createTopic(ctx, workspaceID, title, conversationID)
}

func (service *Service) createTopic(
	ctx context.Context,
	workspaceID *string,
	title string,
	conversationID string,
) (ConversationSnapshot, error) {
	return service.createTopicWithBranch(ctx, workspaceID, title, conversationID, nil)
}

// createTopicWithBranch creates a conversation and, when it has durable
// parentage that carries no provider history, records that parentage in the
// same transaction. A branch committed separately could describe a conversation
// a rejected write never created.
func (service *Service) createTopicWithBranch(
	ctx context.Context,
	workspaceID *string,
	title string,
	conversationID string,
	branch *ConversationBranch,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateTopicTitle(title); err != nil {
		return ConversationSnapshot{}, err
	}
	if workspaceID != nil {
		if _, err := service.workspaces.ResolveActiveWorkspace(*workspaceID); err != nil {
			return ConversationSnapshot{}, err
		}
	}
	now := service.timestamp()
	conversation := TopicConversation{
		ID:              conversationID,
		WorkspaceID:     cloneStringPointer(workspaceID),
		Title:           title,
		TopicDescriptor: title,
		Status:          ConversationStatusIdle,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	narrator := NarratorState{
		ConversationID:  conversationID,
		TopicDescriptor: title,
		Status:          NarratorStatusReady,
		UpdatedAt:       now,
	}
	service.createMu.Lock()
	var presentation ConversationPresentationProfile
	var err error
	err = service.store.withPresentationConfigurationLock(func() error {
		var presentationErr error
		presentation, presentationErr = service.initialPresentationProfile(ctx, conversationID, now)
		if presentationErr != nil {
			return presentationErr
		}
		return service.persistCreatedConversation(ctx, conversation, nil, narrator, presentation, branch)
	})
	service.createMu.Unlock()
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshotByID(ctx, conversationID)
}

func (service *Service) persistCreatedConversation(
	ctx context.Context,
	conversation TopicConversation,
	binding *AgentThreadBinding,
	narrator NarratorState,
	presentation ConversationPresentationProfile,
	branch *ConversationBranch,
) error {
	publications, err := service.prepareCreatedConversationPublications(
		conversation,
		binding,
		narrator,
		presentation,
		branch,
	)
	if err != nil {
		return err
	}
	_, err = service.store.Transact(ctx, "create topic conversation", func(transaction *WriteTransaction) error {
		// A new conversation is immediately a visible workstream, so its
		// presentation identity reconciles against the conversations it now
		// has to stay distinguishable from.
		if err := transaction.capturePresentationActivity(); err != nil {
			return err
		}
		if err := persistCreatedConversationRecords(transaction, conversation, binding, narrator, branch); err != nil {
			return err
		}
		if err := transaction.UpsertConversationPresentationProfile(presentation); err != nil {
			return err
		}
		transaction.presentationActivityUpdatedAt = advanceTimestamp(
			transaction.presentationActivityUpdatedAt,
			conversation.UpdatedAt,
		)
		return appendPublications(transaction, publications)
	})
	return err
}

func (service *Service) prepareCreatedConversationPublications(
	conversation TopicConversation,
	binding *AgentThreadBinding,
	narrator NarratorState,
	presentation ConversationPresentationProfile,
	branch *ConversationBranch,
) ([]preparedPublication, error) {
	payloads := []ConversationEventPayload{
		ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: conversation},
		ConversationNarratorStateUpdatedEventPayload{Type: ConversationEventTypeNarratorStateUpdated, State: narrator},
		ConversationPresentationProfileUpdatedEventPayload{Type: ConversationEventTypePresentationProfileUpdated, Profile: presentation},
	}
	if binding != nil {
		payloads = append(payloads, ConversationThreadBindingUpdatedEventPayload{
			Type:    ConversationEventTypeThreadBindingUpdated,
			Binding: *binding,
		})
	}
	if branch != nil {
		payloads = append(payloads, ConversationBranchCreatedEventPayload{
			Type:   ConversationEventTypeBranchCreated,
			Branch: *branch,
		})
	}
	return service.publications(conversation.ID, conversation.UpdatedAt, payloads...)
}

func persistCreatedConversationRecords(
	transaction *WriteTransaction,
	conversation TopicConversation,
	binding *AgentThreadBinding,
	narrator NarratorState,
	branch *ConversationBranch,
) error {
	if err := transaction.InsertConversation(conversation); err != nil {
		return err
	}
	if branch != nil {
		if err := transaction.InsertConversationBranch(*branch); err != nil {
			return err
		}
	}
	if binding != nil {
		if err := transaction.UpsertAgentThreadBinding(*binding); err != nil {
			return err
		}
	}
	return transaction.InsertNarratorState(narrator)
}

func (service *Service) initialPresentationProfile(
	ctx context.Context,
	conversationID string,
	updatedAt string,
) (ConversationPresentationProfile, error) {
	director, err := service.store.ReadDirectorVoiceSelection(ctx)
	if err != nil {
		return ConversationPresentationProfile{}, fmt.Errorf("read director voice selection: %w", err)
	}
	if director.ResolvedVoiceID == nil {
		return ConversationPresentationProfile{}, errors.New("director voice selection has no resolved voice")
	}
	narratorDefault, err := service.store.ReadNarratorVoiceDefault(ctx)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	resolvedVoiceID := cloneVoiceID(narratorDefault.RequestedVoiceID)
	if narratorDefault.Selection == speech.VoiceSelectionAutoDistinct {
		allocation, allocationErr := speech.AllocateNarratorVoice(*director.ResolvedVoiceID, nil)
		if allocationErr != nil {
			return ConversationPresentationProfile{}, allocationErr
		}
		resolvedVoiceID = voiceIDPointer(allocation.VoiceID)
	}
	profile := ConversationPresentationProfile{
		ConversationID:           conversationID,
		PaletteSelection:         PresentationSelectionAutoDistinct,
		ResolvedPaletteID:        conversationpalette.IDs()[0],
		NarratorVoiceSelection:   narratorDefault.Selection,
		RequestedNarratorVoiceID: cloneVoiceID(narratorDefault.RequestedVoiceID),
		ResolvedNarratorVoiceID:  resolvedVoiceID,
		NarratorSpeechEnabled:    true,
		UpdatedAt:                updatedAt,
	}
	if err := profile.Validate(); err != nil {
		return ConversationPresentationProfile{}, err
	}
	return profile, nil
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
