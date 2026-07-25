package director

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"

	"setta/internal/conversation"
)

// The app-scoped workstream registry.
//
// This is the application-level owner the Setta 4 command center selects,
// delegates to, and receives results from. It replaces pane observation,
// pane-scene routing context, and persisted layout as the answer to "what work
// exists, what does it need, and which one is the user looking at".
//
// It is push-driven end to end. The registry follows the durable committed log,
// folds each fact once, and publishes the change. Waiting on the log is an
// event-driven sleep, not a poll, and a subscriber that cannot be replayed from
// the retained window is told to resync rather than left to refresh.

// Registry is the app-scoped registry and its derived event stream.
type Registry struct {
	facts      DirectorFactStore
	workspaces WorkspaceResources
	now        func() time.Time
	newID      func(string) (string, error)

	mutex               sync.Mutex
	state               *registryState
	streamID            string
	sequence            int
	retained            []DirectorEvent
	subscribers         map[*registrySubscription]bool
	adjacent            map[string]bool
	publishedApprovals  map[string]bool
	publishedArtifacts  map[string]bool
	publishedAggregates DirectorAggregates
	publishedLevels     map[string]WorkstreamDetailLevel
	publishedResources  map[string]bool
	publishedWindow     map[string]bool
	started             bool
	stopped             bool
	failure             error

	// selectMutex serializes selection writes. The durable selection fact names
	// the selection it replaces, so two concurrent selections must not race into
	// the log in the opposite order to the one they were decided in.
	selectMutex      sync.Mutex
	pendingSelection *string

	cancel  context.CancelFunc
	done    chan struct{}
	applied chan struct{}
}

// RegistryOption configures a registry.
type RegistryOption func(*Registry) error

// WithRegistryClock replaces the clock the registry stamps its own facts and
// pushed events with.
func WithRegistryClock(now func() time.Time) RegistryOption {
	return func(registry *Registry) error {
		if now == nil {
			return errors.New("director registry clock must not be nil")
		}
		registry.now = now
		return nil
	}
}

// WithRegistryIdentity replaces the identifier generator for Director facts the
// registry writes.
func WithRegistryIdentity(newID func(string) (string, error)) RegistryOption {
	return func(registry *Registry) error {
		if newID == nil {
			return errors.New("director registry identity generator must not be nil")
		}
		registry.newID = newID
		return nil
	}
}

// NewRegistry builds a registry over the durable log. The workspace resources
// resolve the folder a conversation's workspace id names and list the folders a
// new workstream may be scoped to; a folderless conversation needs neither,
// because folderless is a first-class scope.
func NewRegistry(facts DirectorFactStore, workspaces WorkspaceResources, options ...RegistryOption) (*Registry, error) {
	if facts == nil {
		return nil, errors.New("director registry requires a durable fact store")
	}
	registry := &Registry{
		facts:              facts,
		workspaces:         workspaces,
		now:                time.Now,
		newID:              randomDirectorFactID,
		state:              newRegistryState(),
		subscribers:        map[*registrySubscription]bool{},
		adjacent:           map[string]bool{},
		publishedApprovals: map[string]bool{},
		publishedArtifacts: map[string]bool{},
		publishedLevels:    map[string]WorkstreamDetailLevel{},
		publishedResources: map[string]bool{},
		publishedWindow:    map[string]bool{},
		done:               make(chan struct{}),
		applied:            make(chan struct{}),
	}
	for _, option := range options {
		if option == nil {
			return nil, errors.New("director registry option must not be nil")
		}
		if err := option(registry); err != nil {
			return nil, err
		}
	}
	return registry, nil
}

// Start materializes the registry from the durable log and then follows it.
// Materialization is a replay of the same fold the live path runs, so the state
// a restart lands on is the state the app was in.
func (registry *Registry) Start(ctx context.Context) error {
	if ctx == nil {
		return errors.New("director registry start context is required")
	}
	registry.mutex.Lock()
	if registry.started {
		registry.mutex.Unlock()
		return errors.New("director registry is already started")
	}
	registry.started = true
	registry.mutex.Unlock()

	if err := registry.materialize(ctx); err != nil {
		registry.mutex.Lock()
		registry.stopped = true
		registry.failure = err
		registry.mutex.Unlock()
		return err
	}

	followCtx, cancel := context.WithCancel(context.WithoutCancel(ctx))
	registry.mutex.Lock()
	registry.cancel = cancel
	registry.mutex.Unlock()
	go registry.follow(followCtx)
	return nil
}

func (registry *Registry) materialize(ctx context.Context) error {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	for {
		events, err := registry.facts.ReadCommittedEvents(
			ctx,
			registry.state.cursor,
			conversation.MaxCommittedEventReadLimit,
		)
		if err != nil {
			return err
		}
		if len(events) == 0 {
			break
		}
		for _, event := range events {
			if _, err := registry.state.applyCommitted(event, registry.workspaces); err != nil {
				return fmt.Errorf("materialize director registry at commit %d: %w", event.CommitSequence, err)
			}
		}
	}
	// The stream epoch is the durable position this materialization started
	// from. A renderer holding a cursor from an earlier epoch is recognized as
	// addressing a stream that no longer exists instead of silently replaying
	// the wrong history.
	streamID, err := DirectorStreamID("m" + strconv.FormatInt(registry.state.cursor.CommitSequence, 10))
	if err != nil {
		return err
	}
	registry.streamID = streamID
	registry.pendingSelection = copyOptionalString(registry.state.selected)
	registry.publishedAggregates = registry.state.aggregates
	registry.refreshDetailLevels()
	registry.recordPublishedLevels()
	registry.recordPublishedCollections()
	return nil
}

// follow blocks on the durable log and folds what arrives. The wait is the
// store's committed-event wake, so an idle app does no work at all.
func (registry *Registry) follow(ctx context.Context) {
	defer close(registry.done)
	for {
		registry.mutex.Lock()
		cursor := registry.state.cursor
		registry.mutex.Unlock()
		events, err := registry.facts.WaitForCommittedEvents(ctx, cursor, conversation.MaxCommittedEventReadLimit)
		if err != nil {
			registry.stop(err)
			return
		}
		if err := registry.applyBatch(events); err != nil {
			registry.stop(err)
			return
		}
	}
}

// applyBatch folds one batch of durable facts and publishes what changed. A
// backlog of pushed facts produces one fold per fact and one event per change,
// never a rebuild of the whole app state.
func (registry *Registry) applyBatch(events []conversation.CommittedEvent) error {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	for _, event := range events {
		effects, err := registry.state.applyCommitted(event, registry.workspaces)
		if err != nil {
			return fmt.Errorf("apply director fact at commit %d: %w", event.CommitSequence, err)
		}
		if len(effects) == 0 {
			registry.signalAppliedLocked()
			continue
		}
		if registry.needsLevelRefresh(effects) {
			registry.refreshDetailLevels()
			levelEffects, replacedGraphs, err := registry.levelChangeEffects(effects)
			if err != nil {
				return err
			}
			effects = withoutGraphEffects(effects, replacedGraphs)
			effects = append(effects, levelEffects...)
		}
		effects, collectionResync := registry.prepareCollectionEffects(effects)
		published, err := registry.eventsForEffects(effects)
		if err != nil {
			return err
		}
		for _, event := range published {
			if err := registry.publish(event); err != nil {
				return err
			}
		}
		if collectionResync {
			registry.resyncSubscribers(DirectorResyncCollectionWindowOverflow)
		}
		registry.signalAppliedLocked()
	}
	return nil
}

// stop ends the follower. A durable-log failure is not something the user can
// act on, so the registry reports it as a connection that stopped and a resync
// requirement rather than as an error in the product surface.
func (registry *Registry) stop(cause error) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	registry.stopped = true
	if cause != nil &&
		!errors.Is(cause, context.Canceled) &&
		!errors.Is(cause, conversation.ErrStoreClosed) {
		registry.failure = cause
		event := registry.resyncEvent(DirectorResyncServerRequired, DirectorEventCursor{
			StreamID: registry.streamID,
			Sequence: registry.sequence,
		})
		registry.sequence++
		registry.retain(event)
		for subscription := range registry.subscribers {
			subscription.enqueue(event)
		}
	}
	for subscription := range registry.subscribers {
		subscription.close()
	}
	registry.subscribers = map[*registrySubscription]bool{}
	registry.signalAppliedLocked()
}

// Close stops following the durable log and ends every subscription.
func (registry *Registry) Close() error {
	registry.mutex.Lock()
	cancel := registry.cancel
	started := registry.started
	registry.mutex.Unlock()
	if !started {
		return nil
	}
	if cancel != nil {
		cancel()
		<-registry.done
	}
	registry.stop(nil)
	return nil
}

// Err reports the durable-log failure that stopped the registry, if any.
func (registry *Registry) Err() error {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	return registry.failure
}

func (registry *Registry) requireAvailable() error {
	if registry == nil {
		return ErrDirectorUnavailable
	}
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	return registry.requireAvailableLocked()
}

func (registry *Registry) requireAvailableLocked() error {
	if !registry.started {
		return fmt.Errorf("%w: the app-scoped registry is not started", ErrDirectorUnavailable)
	}
	if registry.stopped {
		return fmt.Errorf("%w: the app-scoped registry is stopped", ErrDirectorUnavailable)
	}
	return nil
}

// awaitCommit waits for the live fold to observe a Director fact the caller
// just appended. A dispatch that returned before its own fact reached the
// registry could race a repeated command against stale lifecycle state.
func (registry *Registry) awaitCommit(ctx context.Context, commitSequence int64) error {
	if ctx == nil {
		return errors.New("director commit wait context is required")
	}
	for {
		registry.mutex.Lock()
		if registry.state.cursor.CommitSequence >= commitSequence {
			registry.mutex.Unlock()
			return nil
		}
		if err := registry.requireAvailableLocked(); err != nil {
			registry.mutex.Unlock()
			return err
		}
		applied := registry.applied
		registry.mutex.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-applied:
		}
	}
}

func (registry *Registry) awaitWorkstream(ctx context.Context, workstreamID string) error {
	if ctx == nil {
		return errors.New("director workstream wait context is required")
	}
	if err := validateIdentifier("director wait workstream id", workstreamID); err != nil {
		return err
	}
	for {
		registry.mutex.Lock()
		if _, known := registry.state.workstreams[workstreamID]; known {
			registry.mutex.Unlock()
			return nil
		}
		if err := registry.requireAvailableLocked(); err != nil {
			registry.mutex.Unlock()
			return err
		}
		applied := registry.applied
		registry.mutex.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-applied:
		}
	}
}

// AwaitConversationEvent waits until the live app-scoped fold has observed the
// durable conversation cursor an execution adapter just received. This is the
// execution-port handoff that makes sequential Director tool calls honest: a
// successful call returns only after the next call can authorize against its
// effect. A per-stream sequence is used because some lifecycle mutations do not
// retitle or otherwise advance the conversation record itself.
func (registry *Registry) AwaitConversationEvent(
	ctx context.Context,
	conversationID string,
	streamSequence int,
) error {
	if ctx == nil {
		return errors.New("director conversation event wait context is required")
	}
	streamID, err := conversation.ConversationStreamID(conversationID)
	if err != nil {
		return err
	}
	if streamSequence <= 0 {
		return fmt.Errorf("director conversation event wait sequence must be positive: %d", streamSequence)
	}
	for {
		registry.mutex.Lock()
		if registry.state.streamSequences[streamID] >= streamSequence {
			registry.mutex.Unlock()
			return nil
		}
		if err := registry.requireAvailableLocked(); err != nil {
			registry.mutex.Unlock()
			return err
		}
		applied := registry.applied
		registry.mutex.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-applied:
		}
	}
}

// AwaitRunTerminal waits until the registry has observed both the durable
// cursor returned by a cancellation command and the terminal turn update that
// retires the named run. The provider acknowledges an interrupt before it emits
// that terminal update, so waiting for the command cursor alone would let a
// same-turn tool call authorize against a run that is still projected active.
// A promoted successor is allowed: the named run, not the whole workstream, is
// what must have stopped.
func (registry *Registry) AwaitRunTerminal(
	ctx context.Context,
	conversationID string,
	runID string,
	streamSequence int,
) error {
	if ctx == nil {
		return errors.New("director terminal run wait context is required")
	}
	if err := validateIdentifier("director terminal run id", runID); err != nil {
		return err
	}
	streamID, err := conversation.ConversationStreamID(conversationID)
	if err != nil {
		return err
	}
	if streamSequence <= 0 {
		return fmt.Errorf("director terminal run wait sequence must be positive: %d", streamSequence)
	}
	for {
		registry.mutex.Lock()
		workstreamID, known := registry.state.byConversation[conversationID]
		workstream := registry.state.workstreams[workstreamID]
		cursorObserved := registry.state.streamSequences[streamID] >= streamSequence
		runRetired := known &&
			workstream != nil &&
			(workstream.activeRunID == nil || *workstream.activeRunID != runID)
		if cursorObserved && runRetired {
			registry.mutex.Unlock()
			return nil
		}
		if err := registry.requireAvailableLocked(); err != nil {
			registry.mutex.Unlock()
			return err
		}
		applied := registry.applied
		registry.mutex.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-applied:
		}
	}
}

func (registry *Registry) signalAppliedLocked() {
	close(registry.applied)
	registry.applied = make(chan struct{})
}

// Snapshot returns the bounded app-scoped projection and the cursor its
// subscription must continue from.
func (registry *Registry) Snapshot() (DirectorSnapshot, error) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	if !registry.started {
		return DirectorSnapshot{}, fmt.Errorf("%w: the app-scoped registry is not started", ErrDirectorUnavailable)
	}
	return registry.state.registrySnapshot(
		registry.connectionState(),
		DirectorEventCursor{StreamID: registry.streamID, Sequence: registry.sequence},
	)
}

func (registry *Registry) connectionState() DirectorConnectionState {
	status := DirectorConnectionConnected
	if registry.stopped {
		status = DirectorConnectionDisconnected
	}
	return DirectorConnectionState{Status: status, LastEventAt: copyOptionalString(registry.state.lastEventAt)}
}

// Subscribe continues the derived stream from a cursor. A cursor the retained
// window cannot cover, or one addressing an earlier stream epoch, receives the
// typed resync it needs to take a fresh snapshot instead of a partial history.
func (registry *Registry) Subscribe(cursor DirectorEventCursor) (DirectorEventSubscription, error) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	if !registry.started {
		return nil, fmt.Errorf("%w: the app-scoped registry is not started", ErrDirectorUnavailable)
	}
	if err := cursor.Validate(cursor.StreamID); err != nil {
		return nil, err
	}
	subscription := newRegistrySubscription(registry)
	if reason, required := registry.resyncReasonFor(cursor); required {
		subscription.enqueue(registry.resyncEvent(reason, cursor))
		subscription.close()
		return subscription, nil
	}
	for _, event := range registry.retained {
		if event.Sequence > cursor.Sequence {
			subscription.enqueue(event)
		}
	}
	if registry.stopped {
		subscription.close()
		return subscription, nil
	}
	registry.subscribers[subscription] = true
	return subscription, nil
}

func (registry *Registry) resyncReasonFor(cursor DirectorEventCursor) (DirectorResyncReason, bool) {
	if cursor.StreamID != registry.streamID {
		return DirectorResyncEventStreamChanged, true
	}
	if cursor.Sequence > registry.sequence {
		return DirectorResyncEventBeforeSnapshot, true
	}
	if cursor.Sequence+1 < registry.retainedFrom() {
		return DirectorResyncServerRequired, true
	}
	return "", false
}

func (registry *Registry) removeSubscription(subscription *registrySubscription) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	delete(registry.subscribers, subscription)
}

func (registry *Registry) timestamp() string {
	return registry.now().UTC().Format(time.RFC3339Nano)
}

func randomDirectorFactID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(bytes), nil
}
