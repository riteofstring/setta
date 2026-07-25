package director

import (
	"context"
	"fmt"
	"sort"
	"testing"
	"time"

	"setta/internal/conversation"
	"setta/internal/workspace"
)

// The registry's test harness writes the same durable transactions production
// writes: a record plus the committed event that publishes it. The registry
// reads nothing else, so a test here exercises the real durable path rather than
// a stand-in for it.

const registryTestWorkspaceID = "workspace-alpha"

var registryTestEpoch = time.Date(2026, time.July, 24, 9, 0, 0, 0, time.UTC)

type registryHarness struct {
	t         *testing.T
	store     *conversation.Store
	tick      int
	sequences map[string]int
	// accepted records when each turn was accepted. The durable update matches
	// on the accepted record, so ending a turn has to name the one that started.
	accepted   map[string]string
	workspaces map[string]workspace.WorkspaceSummary
	records    map[string]conversation.TopicConversation
}

func newRegistryHarness(t *testing.T) *registryHarness {
	t.Helper()
	store, err := conversation.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("close conversation store: %v", err)
		}
	})
	return &registryHarness{
		t:         t,
		store:     store,
		sequences: map[string]int{},
		accepted:  map[string]string{},
		records:   map[string]conversation.TopicConversation{},
		workspaces: map[string]workspace.WorkspaceSummary{
			registryTestWorkspaceID: {
				ID:          registryTestWorkspaceID,
				RootPath:    "/tmp/setta-registry-alpha",
				DisplayName: "alpha",
			},
		},
	}
}

func (harness *registryHarness) LookupWorkspace(workspaceID string) (workspace.WorkspaceSummary, bool, error) {
	summary, found := harness.workspaces[workspaceID]
	return summary, found, nil
}

// AvailableWorkspaces offers the harness workspaces in id order, which is the
// stable ordering a durable session list gives the decision context.
func (harness *registryHarness) AvailableWorkspaces() ([]workspace.WorkspaceSummary, error) {
	ids := make([]string, 0, len(harness.workspaces))
	for id := range harness.workspaces {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	summaries := make([]workspace.WorkspaceSummary, 0, len(ids))
	for _, id := range ids {
		summaries = append(summaries, harness.workspaces[id])
	}
	return summaries, nil
}

// start materializes a registry over the harness store. Building a second one
// over the same store is how a restart is tested: the durable log is the only
// thing that survives.
func (harness *registryHarness) start() *Registry {
	harness.t.Helper()
	registry, err := NewRegistry(
		harness.store,
		harness,
		WithRegistryClock(harness.clock),
		WithRegistryIdentity(harness.identity),
	)
	if err != nil {
		harness.t.Fatalf("NewRegistry: %v", err)
	}
	if err := registry.Start(context.Background()); err != nil {
		harness.t.Fatalf("Start registry: %v", err)
	}
	harness.t.Cleanup(func() {
		if err := registry.Close(); err != nil {
			harness.t.Errorf("close registry: %v", err)
		}
	})
	return registry
}

func (harness *registryHarness) clock() time.Time {
	harness.tick++
	return registryTestEpoch.Add(time.Duration(harness.tick) * time.Second)
}

func (harness *registryHarness) identity(prefix string) (string, error) {
	harness.tick++
	return fmt.Sprintf("%s_%03d", prefix, harness.tick), nil
}

func (harness *registryHarness) now() string {
	return harness.clock().UTC().Format(time.RFC3339Nano)
}

func (harness *registryHarness) transact(operation string, run func(*conversation.WriteTransaction) error) {
	harness.t.Helper()
	if _, err := harness.store.Transact(context.Background(), operation, run); err != nil {
		harness.t.Fatalf("%s: %v", operation, err)
	}
}

func (harness *registryHarness) publish(
	conversationID string,
	payload conversation.ConversationEventPayload,
	kind conversation.ConversationEventType,
	at string,
	mutate func(*conversation.WriteTransaction) error,
) {
	harness.t.Helper()
	streamID, err := conversation.ConversationStreamID(conversationID)
	if err != nil {
		harness.t.Fatalf("ConversationStreamID: %v", err)
	}
	harness.transact(string(kind), func(transaction *conversation.WriteTransaction) error {
		if mutate != nil {
			if err := mutate(transaction); err != nil {
				return err
			}
		}
		eventID, err := harness.identity("event")
		if err != nil {
			return err
		}
		_, err = transaction.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          eventID,
			StreamID:    streamID,
			Kind:        string(kind),
			Payload:     payload,
			CommittedAt: at,
		})
		return err
	})
}

// createConversation writes the durable conversation record and publishes it,
// which is the only thing the registry needs to admit a workstream.
func (harness *registryHarness) createConversation(id string, title string, workspaceID *string) string {
	harness.t.Helper()
	at := harness.now()
	record := conversation.TopicConversation{
		ID:          id,
		WorkspaceID: workspaceID,
		Title:       title,
		Status:      conversation.ConversationStatusIdle,
		CreatedAt:   at,
		UpdatedAt:   at,
	}
	harness.records[id] = record
	harness.publish(
		id,
		conversation.ConversationUpdatedEventPayload{
			Type:         conversation.ConversationEventTypeConversationUpdated,
			Conversation: record,
		},
		conversation.ConversationEventTypeConversationUpdated,
		at,
		func(transaction *conversation.WriteTransaction) error {
			return transaction.InsertConversation(record)
		},
	)
	workstreamID, err := WorkstreamIDForConversation(id)
	if err != nil {
		harness.t.Fatalf("WorkstreamIDForConversation: %v", err)
	}
	return workstreamID
}

// archiveConversation republishes the durable record as archived, which is how
// a workstream stops being a routing target.
func (harness *registryHarness) archiveConversation(id string, title string) string {
	harness.t.Helper()
	at := harness.now()
	archivedAt := at
	record, known := harness.records[id]
	if !known {
		harness.t.Fatalf("archive unknown conversation %s", id)
	}
	record.Title = title
	record.UpdatedAt = at
	record.ArchivedAt = &archivedAt
	harness.records[id] = record
	harness.publish(
		id,
		conversation.ConversationUpdatedEventPayload{
			Type:         conversation.ConversationEventTypeConversationUpdated,
			Conversation: record,
		},
		conversation.ConversationEventTypeConversationUpdated,
		at,
		nil,
	)
	workstreamID, err := WorkstreamIDForConversation(id)
	if err != nil {
		harness.t.Fatalf("WorkstreamIDForConversation: %v", err)
	}
	return workstreamID
}

func (harness *registryHarness) updateConversationTitle(id string, title string) string {
	harness.t.Helper()
	record, known := harness.records[id]
	if !known {
		harness.t.Fatalf("update unknown conversation %s", id)
	}
	record.Title = title
	record.UpdatedAt = harness.now()
	harness.records[id] = record
	harness.publish(
		id,
		conversation.ConversationUpdatedEventPayload{
			Type:         conversation.ConversationEventTypeConversationUpdated,
			Conversation: record,
		},
		conversation.ConversationEventTypeConversationUpdated,
		record.UpdatedAt,
		nil,
	)
	workstreamID, err := WorkstreamIDForConversation(id)
	if err != nil {
		harness.t.Fatalf("WorkstreamIDForConversation: %v", err)
	}
	return workstreamID
}

func (harness *registryHarness) publishQueue(conversationID string, turnIDs ...string) {
	harness.t.Helper()
	at := harness.now()
	queue := make([]conversation.QueuedConversationTurn, 0, len(turnIDs))
	for index, turnID := range turnIDs {
		queue = append(queue, conversation.QueuedConversationTurn{
			TurnID:         turnID,
			ConversationID: conversationID,
			Ordinal:        index + 1,
			QueuedAt:       at,
		})
	}
	harness.publish(
		conversationID,
		conversation.ConversationQueueUpdatedEventPayload{
			Type:  conversation.ConversationEventTypeQueueUpdated,
			Queue: queue,
		},
		conversation.ConversationEventTypeQueueUpdated,
		at,
		nil,
	)
}

func (harness *registryHarness) startTurn(conversationID string, turnID string) {
	harness.t.Helper()
	at := harness.now()
	harness.accepted[turnID] = at
	startedAt := at
	providerTurnID := "provider-" + turnID
	invocation := fixtureInvocation(turnID)
	invocation.ProviderReferences.TurnID = &providerTurnID
	turn := conversation.ConversationTurn{
		ID:                   turnID,
		ConversationID:       conversationID,
		AuthoredInput:        conversation.AuthoredInput{Text: "do the work"},
		Delivery:             conversation.TurnDeliveryNormal,
		Status:               conversation.TurnStatusRunning,
		AcceptedAt:           at,
		StartedAt:            &startedAt,
		RequestedRoleProfile: invocation.Requested,
		ResolvedInvocation:   &invocation,
		ProviderTurnID:       &providerTurnID,
	}
	harness.publish(
		conversationID,
		conversation.ConversationTurnUpdatedEventPayload{
			Type: conversation.ConversationEventTypeTurnUpdated,
			Turn: turn,
		},
		conversation.ConversationEventTypeTurnUpdated,
		at,
		func(transaction *conversation.WriteTransaction) error {
			return transaction.InsertTurn(turn)
		},
	)
}

// endTurn moves the durable turn row to its terminal state and publishes it.
// Production writes both, and the store only allows one running turn per
// conversation, so a test that publishes the event without updating the row
// could never start a second run.
func (harness *registryHarness) endTurn(
	conversationID string,
	turnID string,
	status conversation.TurnStatus,
	failure *conversation.Failure,
) {
	harness.t.Helper()
	at := harness.now()
	acceptedAt, started := harness.accepted[turnID]
	if !started {
		harness.t.Fatalf("turn %s ended before it started", turnID)
	}
	providerTurnID := "provider-" + turnID
	invocation := fixtureInvocation(turnID)
	invocation.ProviderReferences.TurnID = &providerTurnID
	invocation.StartedAt = acceptedAt
	invocation.EndedAt = &at
	invocation.Outcome = terminalInvocationOutcome(status)
	invocation.Failure = failure
	turn := conversation.ConversationTurn{
		ID:                   turnID,
		ConversationID:       conversationID,
		AuthoredInput:        conversation.AuthoredInput{Text: "do the work"},
		Delivery:             conversation.TurnDeliveryNormal,
		Status:               status,
		AcceptedAt:           acceptedAt,
		StartedAt:            &acceptedAt,
		EndedAt:              &at,
		RequestedRoleProfile: invocation.Requested,
		ResolvedInvocation:   &invocation,
		ProviderTurnID:       &providerTurnID,
		Error:                failure,
	}
	harness.publish(
		conversationID,
		conversation.ConversationTurnUpdatedEventPayload{
			Type: conversation.ConversationEventTypeTurnUpdated,
			Turn: turn,
		},
		conversation.ConversationEventTypeTurnUpdated,
		at,
		func(transaction *conversation.WriteTransaction) error {
			return transaction.UpdateTurn(conversation.TurnStatusRunning, turn)
		},
	)
}

func terminalInvocationOutcome(status conversation.TurnStatus) conversation.InvocationOutcome {
	switch status {
	case conversation.TurnStatusCompleted:
		return conversation.InvocationOutcomeSucceeded
	case conversation.TurnStatusFailed:
		return conversation.InvocationOutcomeFailed
	default:
		return conversation.InvocationOutcomeCancelled
	}
}

func (harness *registryHarness) completeTurn(conversationID string, turnID string) {
	harness.t.Helper()
	harness.endTurn(conversationID, turnID, conversation.TurnStatusCompleted, nil)
}

// appendTrajectory publishes one durable trajectory fact. Sequence numbering is
// per conversation, exactly as the durable store assigns it.
func (harness *registryHarness) appendTrajectory(
	conversationID string,
	turnID *string,
	kind conversation.TrajectoryEventKind,
	actor conversation.TrajectoryActor,
	apply func(*conversation.TrajectoryEvent),
) conversation.TrajectoryEvent {
	harness.t.Helper()
	at := harness.now()
	harness.sequences[conversationID]++
	eventID, err := harness.identity("trajectory")
	if err != nil {
		harness.t.Fatalf("identity: %v", err)
	}
	event := conversation.TrajectoryEvent{
		ID:             eventID,
		ConversationID: conversationID,
		TurnID:         turnID,
		Sequence:       harness.sequences[conversationID],
		EmittedAt:      at,
		Kind:           kind,
		Actor:          actor,
	}
	apply(&event)
	harness.publish(
		conversationID,
		conversation.ConversationTrajectoryAppendedEventPayload{
			Type:  conversation.ConversationEventTypeTrajectoryAppended,
			Event: event,
		},
		conversation.ConversationEventTypeTrajectoryAppended,
		at,
		nil,
	)
	return event
}

func (harness *registryHarness) acceptInput(conversationID string, turnID string, text string) conversation.TrajectoryEvent {
	return harness.appendTrajectory(
		conversationID,
		&turnID,
		conversation.TrajectoryEventUserInputAccepted,
		conversation.TrajectoryActorUser,
		func(event *conversation.TrajectoryEvent) {
			event.UserInputAccepted = &conversation.TrajectoryUserInputAccepted{
				Input:    conversation.AuthoredInput{Text: text},
				Delivery: conversation.TurnDeliveryNormal,
			}
		},
	)
}

func (harness *registryHarness) requestApproval(
	conversationID string,
	turnID string,
	approvalID string,
) conversation.TrajectoryEvent {
	approvalCommand := "cargo run --bin migrate"
	approvalWorkingDirectory := "/tmp/setta-registry-alpha"
	return harness.appendTrajectory(
		conversationID,
		&turnID,
		conversation.TrajectoryEventApprovalRequested,
		conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.ApprovalRequested = &conversation.TrajectoryApprovalRequested{
				Approval: conversation.TrajectoryApprovalRequest{
					ID:             approvalID,
					ProviderItemID: "item-" + approvalID,
					Kind:           conversation.TrajectoryApprovalKindCommand,
					Title:          "Run the migration",
					Body:           "cargo run --bin migrate",
					Command:        &approvalCommand,
					CWD:            &approvalWorkingDirectory,
					FilePaths:      []string{},
					Questions:      []conversation.TrajectoryApprovalQuestion{},
					RequestedAt:    event.EmittedAt,
				},
			}
		},
	)
}

// requestStructuredApproval asks a question the run cannot continue without, and
// asks it as a secret. It is the approval shape that proves the command center
// can answer at all: an approve/deny boundary would leave it outstanding forever.
func (harness *registryHarness) requestStructuredApproval(
	conversationID string,
	turnID string,
	approvalID string,
) conversation.TrajectoryEvent {
	return harness.appendTrajectory(
		conversationID,
		&turnID,
		conversation.TrajectoryEventApprovalRequested,
		conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.ApprovalRequested = &conversation.TrajectoryApprovalRequested{
				Approval: conversation.TrajectoryApprovalRequest{
					ID:             approvalID,
					ProviderItemID: "item-" + approvalID,
					Kind:           conversation.TrajectoryApprovalKindStructuredInput,
					Title:          "Supply the deploy token",
					Body:           "The deploy needs a token before it can continue.",
					FilePaths:      []string{},
					Questions: []conversation.TrajectoryApprovalQuestion{{
						ID:          "question-token",
						Header:      "Deploy token",
						Question:    "Which token should the deploy use?",
						Options:     []string{},
						AllowsOther: true,
						Secret:      true,
					}},
					RequestedAt: event.EmittedAt,
				},
			}
		},
	)
}

func (harness *registryHarness) resolveApproval(
	conversationID string,
	turnID string,
	approvalID string,
) conversation.TrajectoryEvent {
	return harness.appendTrajectory(
		conversationID,
		&turnID,
		conversation.TrajectoryEventApprovalResolved,
		conversation.TrajectoryActorUser,
		func(event *conversation.TrajectoryEvent) {
			event.ApprovalResolved = &conversation.TrajectoryApprovalResolved{
				Resolution: conversation.TrajectoryApprovalResolution{
					ApprovalID: approvalID,
					Decision:   conversation.TrajectoryApprovalDecisionApproved,
					Answers:    []conversation.ConversationApprovalAnswer{},
					ResolvedAt: event.EmittedAt,
				},
			}
		},
	)
}

// failTurn commits the durable run failure a recovery decision may name, and
// ends the turn row with the same public failure.
func (harness *registryHarness) failTurn(
	conversationID string,
	turnID string,
	message string,
) conversation.TrajectoryEvent {
	harness.t.Helper()
	harness.endTurn(conversationID, turnID, conversation.TurnStatusFailed, &conversation.Failure{
		Code:                "run_failed",
		Message:             message,
		Retryable:           true,
		DiagnosticReference: "diagnostic-" + turnID,
	})
	return harness.appendTrajectory(
		conversationID,
		&turnID,
		conversation.TrajectoryEventTurnFailed,
		conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.TurnFailed = &conversation.TrajectoryTurnFailed{
				Failure: conversation.Failure{
					Code:                "run_failed",
					Message:             message,
					Retryable:           true,
					DiagnosticReference: "diagnostic-" + turnID,
				},
			}
		},
	)
}

func (harness *registryHarness) completeTurnTrajectory(
	conversationID string,
	turnID string,
) conversation.TrajectoryEvent {
	return harness.appendTrajectory(
		conversationID,
		&turnID,
		conversation.TrajectoryEventTurnCompleted,
		conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.TurnCompleted = &conversation.TrajectoryTurnCompleted{}
		},
	)
}

// appendFact commits one durable Director fact through the same append the
// registry uses in production.
func (harness *registryHarness) appendFact(fact DirectorFactEvent) DirectorFactEvent {
	harness.t.Helper()
	factID, err := harness.identity("director-fact")
	if err != nil {
		harness.t.Fatalf("identity: %v", err)
	}
	fact.ID = factID
	fact.EmittedAt = harness.now()
	if _, err := AppendDirectorFact(context.Background(), harness.store, fact); err != nil {
		harness.t.Fatalf("AppendDirectorFact: %v", err)
	}
	return fact
}

// publishBranch records a fork's parentage. The durable log commits it ahead of
// the child conversation record, so the registry knows where a workstream came
// from before it admits and anchors it.
func (harness *registryHarness) publishBranch(childConversationID string, parentConversationID string) {
	harness.t.Helper()
	at := harness.now()
	branch := conversation.ConversationBranch{
		ChildConversationID:      childConversationID,
		ParentConversationID:     parentConversationID,
		Kind:                     conversation.BranchKindFork,
		DecisionSource:           conversation.BranchDecisionSourceDirector,
		ForkedAtTurnID:           "turn-parent",
		SourceTrajectorySequence: 1,
		ProviderMetadata:         map[string]string{},
		CreatedAt:                at,
	}
	harness.publish(
		childConversationID,
		conversation.ConversationBranchCreatedEventPayload{
			Type:   conversation.ConversationEventTypeBranchCreated,
			Branch: branch,
		},
		conversation.ConversationEventTypeBranchCreated,
		at,
		nil,
	)
}

// subscribeFromSnapshot starts a subscription at the cursor a fresh snapshot
// names, which is exactly how a renderer connects.
func subscribeFromSnapshot(t *testing.T, registry *Registry) DirectorEventSubscription {
	t.Helper()
	snapshot := requireSnapshot(t, registry)
	subscription, err := registry.Subscribe(snapshot.EventCursor)
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	return subscription
}

// awaitEvent reads the subscription until an event of the requested kind
// arrives. Pushed events are the only signal the registry gives, so a test that
// waits on them is waiting the way the renderer does.
func awaitEvent(
	t *testing.T,
	subscription DirectorEventSubscription,
	kind DirectorEventKind,
) DirectorEvent {
	t.Helper()
	deadline := time.After(10 * time.Second)
	for {
		select {
		case event, open := <-subscription.Events():
			if !open {
				t.Fatalf("subscription closed before a %s event arrived", kind)
			}
			if event.Kind == kind {
				return event
			}
		case <-deadline:
			t.Fatalf("timed out waiting for a %s event", kind)
		}
	}
}

func awaitWorkstreamStatus(
	t *testing.T,
	subscription DirectorEventSubscription,
	workstreamID string,
	status WorkstreamStatus,
) Workstream {
	t.Helper()
	deadline := time.After(10 * time.Second)
	for {
		select {
		case event, open := <-subscription.Events():
			if !open {
				t.Fatalf("subscription closed before workstream %s reached %s", workstreamID, status)
			}
			if event.Kind != DirectorEventWorkstreamUpdated {
				continue
			}
			entry := event.WorkstreamUpdated.Entry.Workstream
			if entry.ID == workstreamID && entry.Status == status {
				return entry
			}
		case <-deadline:
			t.Fatalf("timed out waiting for workstream %s to reach %s", workstreamID, status)
		}
	}
}

func requireSnapshot(t *testing.T, registry *Registry) DirectorSnapshot {
	t.Helper()
	snapshot, err := registry.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	return snapshot
}

// requireWorkstreamGraph finds one workstream's graph in a snapshot that also
// carries the Director's own lane.
func requireWorkstreamGraph(
	t *testing.T,
	snapshot DirectorSnapshot,
	workstreamID string,
) WorkstreamGraph {
	t.Helper()
	for _, graph := range snapshot.Graphs {
		if graph.WorkstreamID == workstreamID {
			return graph
		}
	}
	t.Fatalf("snapshot holds no graph for workstream %q: %+v", workstreamID, snapshot.Graphs)
	return WorkstreamGraph{}
}

func findEntry(t *testing.T, snapshot DirectorSnapshot, workstreamID string) DirectorWorkstreamEntry {
	t.Helper()
	for _, entry := range snapshot.Workstreams {
		if entry.Workstream.ID == workstreamID {
			return entry
		}
	}
	t.Fatalf("snapshot has no workstream %s", workstreamID)
	return DirectorWorkstreamEntry{}
}
