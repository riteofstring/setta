package conversation

import (
	"bytes"
	"encoding/json"
	"testing"

	"setta/internal/speech"
	"setta/internal/workspaceui/conversationpalette"
)

func TestConversationSnapshotIsBoundedOwnedAndCursorAligned(t *testing.T) {
	snapshot := validConversationSnapshot()
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("valid conversation snapshot: %v", err)
	}

	invalid := snapshot
	invalid.EventCursor.StreamID = "conversation:other"
	assertValidationErrorContains(t, invalid.Validate(), "does not match")

	invalid = snapshot
	invalid.Queue = nil
	assertValidationErrorContains(t, invalid.Validate(), "must be an array, not null")

	invalid = snapshot
	invalid.Queue = append([]QueuedConversationTurn{}, snapshot.Queue...)
	invalid.Queue[0].Ordinal = 2
	assertValidationErrorContains(t, invalid.Validate(), "contiguous queue")

	invalid = snapshot
	invalid.RoleProfileOverrides = append([]RoleProfileOverride{}, snapshot.RoleProfileOverrides...)
	invalid.RoleProfileOverrides[0].ScopeID = "conversation-other"
	assertValidationErrorContains(t, invalid.Validate(), "not owned")

	invalid = snapshot
	invalid.Trajectory.Events = make([]TrajectoryEvent, MaxSnapshotTrajectoryEvents+1)
	assertValidationErrorContains(t, invalid.Validate(), "exceeds")
}

func TestConversationSnapshotPendingApprovalsAreRunningTurnState(t *testing.T) {
	snapshot := validConversationSnapshot()
	turn := validConversationTurn(TurnStatusRunning)
	request := TrajectoryApprovalRequest{
		ID:             "approval-1",
		ProviderItemID: "provider-approval-1",
		Kind:           TrajectoryApprovalKindUserInput,
		Title:          "Scope",
		Body:           "Choose the scope.",
		FilePaths:      []string{},
		Questions: []TrajectoryApprovalQuestion{{
			ID:       "scope",
			Header:   "Scope",
			Question: "Which scope?",
			Options:  []string{"focused"},
		}},
		RequestedAt: testTimeStarted,
	}
	snapshot.Conversation.Status = ConversationStatusWaitingForApproval
	snapshot.Conversation.LastTrajectorySequence = 25
	snapshot.Turns = ConversationTurnWindow{Turns: []ConversationTurn{turn}}
	snapshot.Queue = []QueuedConversationTurn{}
	snapshot.Trajectory = ConversationTrajectoryWindow{
		Events: []TrajectoryEvent{{
			ID:             "trajectory-latest",
			ConversationID: snapshot.Conversation.ID,
			TurnID:         &turn.ID,
			Sequence:       25,
			EmittedAt:      testTimeStarted,
			Kind:           TrajectoryEventAgentPublicTextDelta,
			Actor:          TrajectoryActorAgent,
			AgentPublicTextDelta: &TrajectoryAgentPublicTextDelta{
				ProviderItemID: "provider-text-25",
				Delta:          "Still waiting.",
			},
		}},
		HasEarlier: true,
	}
	snapshot.PendingApprovals = []ConversationPendingApproval{{
		TurnID:         turn.ID,
		SourceSequence: 3,
		Approval:       request,
	}}
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("valid pending approval snapshot: %v", err)
	}

	invalid := snapshot
	invalid.PendingApprovals = nil
	assertValidationErrorContains(t, invalid.Validate(), "pending approvals must be an array")

	invalid = snapshot
	invalid.PendingApprovals = append([]ConversationPendingApproval{}, snapshot.PendingApprovals...)
	invalid.PendingApprovals[0].SourceSequence = 26
	assertValidationErrorContains(t, invalid.Validate(), "invalid source sequence")

	invalid = snapshot
	completedTurn := turn
	completedTurn.Status = TurnStatusCompleted
	completedTurn.EndedAt = stringPointer(testTimeEnded)
	completedTurn.ResolvedInvocation = invocationPointer(validInvocation(RoleAgent, InvocationOutcomeSucceeded))
	invalid.Turns = ConversationTurnWindow{Turns: []ConversationTurn{completedTurn}}
	assertValidationErrorContains(t, invalid.Validate(), "not attached to a running turn")
}

func TestConversationSnapshotTrajectoryIsAContiguousLatestWindow(t *testing.T) {
	snapshot := validConversationSnapshot()
	first := baseTrajectoryEvent(TrajectoryEventUserInputAccepted)
	first.ID = "trajectory-1"
	first.UserInputAccepted = &TrajectoryUserInputAccepted{
		Input:    AuthoredInput{Text: "Implement the contracts."},
		Delivery: TurnDeliveryQueued,
	}
	second := baseTrajectoryEvent(TrajectoryEventTurnQueued)
	second.ID = "trajectory-2"
	second.Sequence = 2
	second.TurnQueued = &TrajectoryTurnQueued{QueueOrdinal: 1}
	snapshot.Conversation.LastTrajectorySequence = 2
	snapshot.Trajectory.Events = []TrajectoryEvent{first, second}
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("valid contiguous trajectory window: %v", err)
	}

	snapshot.Trajectory.Events[1].Sequence = 3
	assertValidationErrorContains(t, snapshot.Validate(), "not contiguous")

	snapshot.Trajectory.Events = []TrajectoryEvent{second}
	snapshot.Trajectory.Events[0].Sequence = 2
	snapshot.Trajectory.HasEarlier = false
	assertValidationErrorContains(t, snapshot.Validate(), "hasEarlier disagrees")
}

func TestEveryConversationEventVariantIsExhaustiveAndOwned(t *testing.T) {
	snapshot := validConversationSnapshot()
	conversationID := snapshot.Conversation.ID
	workspaceID := snapshot.Conversation.WorkspaceID
	streamID, err := ConversationStreamID(conversationID)
	if err != nil {
		t.Fatalf("conversation stream id: %v", err)
	}

	trajectory := baseTrajectoryEvent(TrajectoryEventTurnQueued)
	trajectory.TurnQueued = &TrajectoryTurnQueued{QueueOrdinal: 1}
	narration := baseNarrationEvent(NarrationEventKindMilestone)
	narration.SourceSequenceEnd = 1
	narration.Trigger = NarrationTriggerPhaseActivityCompleted
	narration.Milestone = &NarrationMilestone{Text: "The contract is generated."}
	artifact := ArtifactMetadata{
		ID:             "artifact-1",
		ConversationID: conversationID,
		Kind:           ArtifactKindMarkdown,
		Title:          "Contract report",
		CreatedAt:      testTimeStarted,
	}
	binding := AgentThreadBinding{
		ConversationID:   conversationID,
		Provider:         ProviderCodex,
		ThreadID:         "provider-thread-1",
		Status:           ThreadBindingStatusLinked,
		CreatedAt:        testTimeStarted,
		ProviderMetadata: map[string]string{},
	}
	branch := ConversationBranch{
		ChildConversationID:      conversationID,
		ParentConversationID:     "conversation-parent",
		Kind:                     BranchKindFork,
		DecisionSource:           BranchDecisionSourceConversationRouter,
		ForkedAtTurnID:           "turn-parent",
		SourceTrajectorySequence: 1,
		ProviderMetadata:         map[string]string{},
		CreatedAt:                testTimeStarted,
	}
	side := SideConversation{
		ID:                          "side-1",
		ParentConversationID:        conversationID,
		ParentPaneID:                "pane-1",
		ParentStatus:                snapshot.Conversation.Status,
		DecisionSource:              BranchDecisionSourceConversationRouter,
		ProviderThreadID:            stringPointer("provider-side-thread"),
		SourceProviderThreadID:      "provider-thread-1",
		SourceProviderTurnID:        stringPointer("provider-turn-1"),
		SourceTrajectorySequence:    1,
		Status:                      SideConversationStatusActive,
		ResolvedSideAgentInvocation: validInvocation(RoleSideAgent, InvocationOutcomeRunning),
		CreatedAt:                   testTimeStarted,
		UpdatedAt:                   testTimeStarted,
	}
	side.ResolvedSideAgentInvocation.ProviderReferences.ThreadID = stringPointer("provider-side-thread")
	sideEventTrajectory := trajectory
	sideEventTrajectory.ID = "side-event-1"
	sideEventTrajectory.ConversationID = side.ID
	sideEventTrajectory.Sequence = 1
	side.LastEventSequence = 1
	sideEvent := SideConversationEvent{
		StreamSequence:       1,
		ParentConversationID: conversationID,
		SideConversationID:   side.ID,
		Event:                sideEventTrajectory,
	}
	override := snapshot.RoleProfileOverrides[0]
	payloads := []ConversationEventPayload{
		ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: snapshot.Conversation},
		ConversationTurnUpdatedEventPayload{Type: ConversationEventTypeTurnUpdated, Turn: snapshot.Turns.Turns[0]},
		ConversationQueueUpdatedEventPayload{Type: ConversationEventTypeQueueUpdated, Queue: snapshot.Queue},
		ConversationThreadBindingUpdatedEventPayload{Type: ConversationEventTypeThreadBindingUpdated, Binding: binding},
		ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: trajectory},
		ConversationArtifactCreatedEventPayload{Type: ConversationEventTypeArtifactCreated, Artifact: artifact},
		ConversationNarratorStateUpdatedEventPayload{Type: ConversationEventTypeNarratorStateUpdated, State: snapshot.NarratorState},
		ConversationNarrationCreatedEventPayload{Type: ConversationEventTypeNarrationCreated, Event: narration},
		ConversationRoleProfileOverrideUpdatedEventPayload{Type: ConversationEventTypeRoleProfileOverrideUpdated, Override: override},
		ConversationRoleProfileOverrideRemovedEventPayload{Type: ConversationEventTypeRoleProfileOverrideRemoved, Role: RoleAgent},
		ConversationPresentationProfileUpdatedEventPayload{Type: ConversationEventTypePresentationProfileUpdated, Profile: snapshot.PresentationProfile},
		ConversationBranchCreatedEventPayload{Type: ConversationEventTypeBranchCreated, Branch: branch},
		ConversationSideConversationUpdatedEventPayload{Type: ConversationEventTypeSideConversationUpdated, SideConversation: side},
		ConversationSideEventAppendedEventPayload{Type: ConversationEventTypeSideEventAppended, Event: sideEvent},
		ConversationResyncRequiredEventPayload{
			Type:              ConversationEventTypeResyncRequired,
			Reason:            "The requested cursor does not belong to this conversation.",
			RequestedStreamID: "conversation:other",
			RequestedSequence: 4,
			CurrentStreamID:   streamID,
			CurrentSequence:   7,
		},
	}
	if len(payloads) != len(conversationEventTypeValues) {
		t.Fatalf("event fixture count = %d, owner event type count = %d", len(payloads), len(conversationEventTypeValues))
	}
	seen := map[ConversationEventType]bool{}
	for index, payload := range payloads {
		kind := payload.conversationEventType()
		if seen[kind] {
			t.Fatalf("duplicate event fixture for %s", kind)
		}
		seen[kind] = true
		eventID, err := ConversationEventID(streamID, index+1)
		if err != nil {
			t.Fatalf("event id for %s: %v", kind, err)
		}
		event := ConversationEvent{
			SchemaVersion:  ConversationContractSchemaVersion,
			StreamID:       streamID,
			Sequence:       index + 1,
			EventID:        eventID,
			EmittedAt:      testTimeStarted,
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			Payload:        payload,
		}
		if err := event.Validate(); err != nil {
			t.Errorf("valid %s event: %v", kind, err)
			continue
		}
		encoded, err := json.Marshal(event)
		if err != nil {
			t.Errorf("marshal %s event: %v", kind, err)
			continue
		}
		if !bytes.Contains(encoded, []byte(`"type":"`+string(kind)+`"`)) {
			t.Errorf("marshaled %s event omits its payload discriminator: %s", kind, encoded)
		}
	}
	for _, kind := range conversationEventTypeValues {
		if !seen[kind] {
			t.Errorf("conversation event type %s has no payload fixture", kind)
		}
	}
}

func TestConversationEventRejectsMismatchedDiscriminatorAndOwnership(t *testing.T) {
	snapshot := validConversationSnapshot()
	streamID, err := ConversationStreamID(snapshot.Conversation.ID)
	if err != nil {
		t.Fatalf("conversation stream id: %v", err)
	}
	eventID, err := ConversationEventID(streamID, 1)
	if err != nil {
		t.Fatalf("conversation event id: %v", err)
	}
	event := ConversationEvent{
		SchemaVersion:  ConversationContractSchemaVersion,
		StreamID:       streamID,
		Sequence:       1,
		EventID:        eventID,
		EmittedAt:      testTimeStarted,
		WorkspaceID:    snapshot.Conversation.WorkspaceID,
		ConversationID: snapshot.Conversation.ID,
		Payload: ConversationUpdatedEventPayload{
			Type:         ConversationEventTypeTurnUpdated,
			Conversation: snapshot.Conversation,
		},
	}
	assertValidationErrorContains(t, event.Validate(), "want \"conversation.updated\"")

	payload := event.Payload.(ConversationUpdatedEventPayload)
	payload.Type = ConversationEventTypeConversationUpdated
	payload.Conversation.ID = "conversation-other"
	event.Payload = payload
	assertValidationErrorContains(t, event.Validate(), "ownership does not match")

	event.Payload = (*ConversationUpdatedEventPayload)(nil)
	assertValidationErrorContains(t, event.Validate(), "payload is required")
}

func validConversationSnapshot() ConversationSnapshot {
	conversation := TopicConversation{
		ID:          "conversation-1",
		WorkspaceID: "workspace-1",
		Title:       "Generated conversation contracts",
		Status:      ConversationStatusIdle,
		CreatedAt:   testTimeStarted,
		UpdatedAt:   testTimeStarted,
	}
	turn := validConversationTurn(TurnStatusQueued)
	turn.Delivery = TurnDeliveryQueued
	narratorState := NarratorState{
		ConversationID: conversation.ID,
		Status:         NarratorStatusReady,
		UpdatedAt:      testTimeStarted,
	}
	presentation := ConversationPresentationProfile{
		ConversationID:          conversation.ID,
		PaletteSelection:        PresentationSelectionAutoDistinct,
		ResolvedPaletteID:       conversationpalette.ConversationPaletteSky,
		NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
		ResolvedNarratorVoiceID: speechVoiceIDPointer(speech.SpeechVoiceAlloy),
		NarratorSpeechEnabled:   true,
		UpdatedAt:               testTimeStarted,
	}
	streamID, err := ConversationStreamID(conversation.ID)
	if err != nil {
		panic(err)
	}
	return ConversationSnapshot{
		SchemaVersion: ConversationContractSchemaVersion,
		Conversation:  conversation,
		Turns: ConversationTurnWindow{
			Turns: []ConversationTurn{turn},
		},
		Queue: []QueuedConversationTurn{{
			TurnID:         turn.ID,
			ConversationID: conversation.ID,
			Ordinal:        1,
			QueuedAt:       testTimeStarted,
		}},
		Trajectory:           ConversationTrajectoryWindow{Events: []TrajectoryEvent{}},
		PendingApprovals:     []ConversationPendingApproval{},
		Artifacts:            ConversationArtifactWindow{Artifacts: []ArtifactMetadata{}},
		NarratorState:        narratorState,
		Narration:            ConversationNarrationWindow{Events: []NarrationEvent{}},
		RoleProfileOverrides: []RoleProfileOverride{{ScopeKind: RoleProfileScopeConversation, ScopeID: conversation.ID, Profile: validRoleProfile(RoleAgent), UpdatedAt: testTimeStarted}},
		PresentationProfile:  presentation,
		SideConversations:    []SideConversation{},
		SideEvents:           ConversationSideEventWindow{Events: []SideConversationEvent{}, Limit: MaxSnapshotSideEvents},
		EventCursor:          ConversationEventCursor{StreamID: streamID},
	}
}
