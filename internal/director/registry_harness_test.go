package director

import (
	"context"
	"fmt"
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
	t          *testing.T
	store      *conversation.Store
	tick       int
	sequences  map[string]int
	workspaces map[string]workspace.WorkspaceSummary
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
		workspaces: map[string]workspace.WorkspaceSummary{
			registryTestWorkspaceID: {
				ID:          registryTestWorkspaceID,
				RootPath:    "/tmp/setta-registry-alpha",
				DisplayName: "alpha",
			},
		},
	}
}

func (harness *registryHarness) lookupWorkspace(workspaceID string) (workspace.WorkspaceSummary, bool, error) {
	summary, found := harness.workspaces[workspaceID]
	return summary, found, nil
}

// start materializes a registry over the harness store. Building a second one
// over the same store is how a restart is tested: the durable log is the only
// thing that survives.
func (harness *registryHarness) start() *Registry {
	harness.t.Helper()
	registry, err := NewRegistry(
		harness.store,
		harness.lookupWorkspace,
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

func (harness *registryHarness) startTurn(conversationID string, turnID string) {
	harness.t.Helper()
	at := harness.now()
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

func (harness *registryHarness) completeTurn(conversationID string, turnID string) {
	harness.t.Helper()
	at := harness.now()
	providerTurnID := "provider-" + turnID
	invocation := fixtureInvocation(turnID)
	invocation.ProviderReferences.TurnID = &providerTurnID
	turn := conversation.ConversationTurn{
		ID:                   turnID,
		ConversationID:       conversationID,
		AuthoredInput:        conversation.AuthoredInput{Text: "do the work"},
		Delivery:             conversation.TurnDeliveryNormal,
		Status:               conversation.TurnStatusCompleted,
		AcceptedAt:           at,
		StartedAt:            &at,
		EndedAt:              &at,
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
		nil,
	)
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

// publishBranch records a fork's parentage. The durable log commits it after the
// child conversation record, which is the ordering the registry has to survive.
func (harness *registryHarness) publishBranch(childConversationID string, parentConversationID string) {
	harness.t.Helper()
	at := harness.now()
	branch := conversation.ConversationBranch{
		ChildConversationID:      childConversationID,
		ParentConversationID:     parentConversationID,
		Kind:                     conversation.BranchKindFork,
		DecisionSource:           conversation.BranchDecisionSourceMaster,
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
