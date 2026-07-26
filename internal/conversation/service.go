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
	InjectItems(context.Context, string, []agent.InjectedTextItem) error
	RunTurn(context.Context, agent.TurnRequest, agent.EventSink) (agent.TurnResult, error)
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
	// carriers is the process-local map from Setta conversation, side
	// conversation, or Director conversation to the ephemeral provider thread
	// currently carrying it. Nothing persists it, so a restart starts every
	// conversation on a fresh carrier replayed from Setta's own log.
	carriers *CarrierRegistry

	lifecycleCtx    context.Context
	lifecycleCancel context.CancelFunc
	lifecycleMu     sync.Mutex
	closing         bool
	turns           sync.WaitGroup
}

type activeConversationTurn struct {
	conversationID     string
	interruptionReason TurnInterruptionReason
	providerThreadID   string
	providerTurnID     string
	queueOrdinal       int
	request            agent.TurnRequest
	roleProfile        RoleProfile
	// scope is where this turn runs and what it may read. The authorized
	// workspace is optional, so it is the whole scope rather than a workspace id
	// that every path would otherwise have to assume exists.
	scope       conversationExecutionScope
	subagentIDs map[string]string
	// privateStreamTails holds only the suffix of unbound streamed provider text
	// that could become a private-path match when the next delta arrives.
	privateStreamTails map[string]string
	turnID             string
}

type activeSideConversationTurn struct {
	cancel context.CancelFunc
	ctx    context.Context
	done   chan struct{}
	// providerTurnID is the provider's name for this run, learned when the turn
	// starts. It lives here rather than on the durable side record because it is
	// only addressable while this attachment is alive.
	providerTurnID       string
	parentConversationID string
	request              agent.TurnRequest
	sideConversationID   string
	subagentIDs          map[string]string
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
		carriers:        NewCarrierRegistry(),
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

func (service *Service) ReadArtifactByID(
	ctx context.Context,
	conversationID string,
	artifactID string,
) (Artifact, error) {
	return service.store.ReadArtifactByID(ctx, conversationID, artifactID)
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

// createTopic creates a conversation with no durable parentage. Branch
// conversations are created by the branch path instead so their Setta lineage
// and replay boundary are committed with the child.
func (service *Service) createTopic(
	ctx context.Context,
	workspaceID *string,
	title string,
	conversationID string,
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
		return service.persistCreatedConversation(ctx, conversation, narrator, presentation, nil)
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
	narrator NarratorState,
	presentation ConversationPresentationProfile,
	branch *ConversationBranch,
) error {
	publications, err := service.prepareCreatedConversationPublications(
		conversation,
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
		if err := persistCreatedConversationRecords(transaction, conversation, narrator, branch); err != nil {
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
	narrator NarratorState,
	presentation ConversationPresentationProfile,
	branch *ConversationBranch,
) ([]preparedPublication, error) {
	payloads := make([]ConversationEventPayload, 0, 5)
	if branch != nil {
		// Parentage is published ahead of the conversation record it describes.
		// A reader that registers the conversation as app-scoped work would
		// otherwise admit it, and draw it, before knowing where it came from.
		payloads = append(payloads, ConversationBranchCreatedEventPayload{
			Type:   ConversationEventTypeBranchCreated,
			Branch: *branch,
		})
	}
	payloads = append(payloads,
		ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: conversation},
		ConversationNarratorStateUpdatedEventPayload{Type: ConversationEventTypeNarratorStateUpdated, State: narrator},
		ConversationPresentationProfileUpdatedEventPayload{Type: ConversationEventTypePresentationProfileUpdated, Profile: presentation},
	)
	return service.publications(conversation.ID, conversation.UpdatedAt, payloads...)
}

func persistCreatedConversationRecords(
	transaction *WriteTransaction,
	conversation TopicConversation,
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
