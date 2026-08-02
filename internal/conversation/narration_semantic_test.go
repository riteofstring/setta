package conversation

import "testing"

func TestNarratorSemanticEventsForLiveCommitUseTypedSources(t *testing.T) {
	conversation := semanticTestConversation()
	turn := validConversationTurn(TurnStatusCompleted)
	activity := semanticTestActivity()
	approval := semanticTestApproval()
	artifact := semanticTestArtifact(turn.ID, 5)
	events := []TrajectoryEvent{
		semanticTestTrajectory(TrajectoryEventAgentPublicTextDelta, 1, func(event *TrajectoryEvent) {
			event.AgentPublicTextDelta = &TrajectoryAgentPublicTextDelta{
				ProviderItemID: "provider-item-message",
				Delta:          "partial",
			}
		}),
		semanticTestTrajectory(TrajectoryEventAgentMessageCompleted, 2, func(event *TrajectoryEvent) {
			event.AgentMessageCompleted = &TrajectoryAgentMessageCompleted{
				ProviderItemID: "provider-item-message",
				Text:           "The implementation is ready.",
			}
		}),
		semanticTestTrajectory(TrajectoryEventApprovalRequested, 3, func(event *TrajectoryEvent) {
			event.ApprovalRequested = &TrajectoryApprovalRequested{Approval: approval}
		}),
		semanticTestTrajectory(TrajectoryEventActivityCompleted, 4, func(event *TrajectoryEvent) {
			event.ActivityCompleted = &TrajectoryActivityCompleted{
				Activity: activity,
				Summary:  "Focused tests passed.",
			}
		}),
		semanticTestTrajectory(TrajectoryEventArtifactEmitted, 5, func(event *TrajectoryEvent) {
			event.ArtifactEmitted = &TrajectoryArtifactEmitted{
				ArtifactID: artifact.ID,
				Title:      artifact.Title,
			}
		}),
		semanticTestTrajectory(TrajectoryEventTurnCompleted, 6, func(event *TrajectoryEvent) {
			event.TurnCompleted = &TrajectoryTurnCompleted{}
		}),
	}

	semantic := narratorSemanticEventsForLiveCommit(
		conversation,
		turn,
		events,
		[]ArtifactMetadata{artifact},
		true,
	)

	wantKinds := []NarratorSemanticEventKind{
		NarratorSemanticEventMeaningfulProgress,
		NarratorSemanticEventApprovalNeeded,
		NarratorSemanticEventMeaningfulProgress,
		NarratorSemanticEventArtifactOrResultEmitted,
		NarratorSemanticEventTaskCompleted,
	}
	if len(semantic) != len(wantKinds) {
		t.Fatalf("semantic event count = %d, want %d: %+v", len(semantic), len(wantKinds), semantic)
	}
	for index, event := range semantic {
		if event.Kind != wantKinds[index] {
			t.Fatalf("semantic kind %d = %s, want %s", index, event.Kind, wantKinds[index])
		}
		if err := event.Validate(); err != nil {
			t.Fatalf("semantic event %d is invalid: %v", index, err)
		}
	}
	if semantic[0].SourceTrajectoryRange.Start != 2 ||
		semantic[0].MeaningfulProgress.AssistantMessage.Text != "The implementation is ready." {
		t.Fatalf("assistant message semantic did not collapse delta noise: %+v", semantic[0])
	}
	result := semantic[3].ArtifactOrResultEmitted
	if result.Artifact == nil || result.Artifact.ID != artifact.ID || result.Artifact.Title != artifact.Title {
		t.Fatalf("artifact semantic payload = %+v, want metadata %+v", result, artifact)
	}
	if got := semantic[4].TaskCompleted.Artifacts; len(got) != 1 || got[0].ID != artifact.ID {
		t.Fatalf("terminal semantic artifacts = %+v, want %+v", got, artifact)
	}
}

func TestNarratorSemanticQueuedTurnStartsWhenPromoted(t *testing.T) {
	conversation := semanticTestConversation()
	turn := validConversationTurn(TurnStatusRunning)
	turn.Delivery = TurnDeliveryQueued
	started := semanticTestTrajectory(TrajectoryEventTurnStarted, 8, func(event *TrajectoryEvent) {
		event.TurnStarted = &TrajectoryTurnStarted{Invocation: validInvocation(RoleAgent, InvocationOutcomeRunning)}
	})

	semantic := narratorSemanticEventsForLiveCommit(conversation, turn, []TrajectoryEvent{started}, nil, false)

	if len(semantic) != 1 || semantic[0].Kind != NarratorSemanticEventTaskStarted {
		t.Fatalf("queued start semantic = %+v", semantic)
	}
	if err := semantic[0].Validate(); err != nil {
		t.Fatalf("queued start semantic is invalid: %v", err)
	}
	if semantic[0].TaskStarted.Objective.Text != turn.AuthoredInput.Text ||
		semantic[0].TaskStarted.Delivery != TurnDeliveryQueued {
		t.Fatalf("queued start payload = %+v, turn = %+v", semantic[0].TaskStarted, turn)
	}
}

func semanticTestConversation() TopicConversation {
	return TopicConversation{
		ID:                     "conversation-1",
		WorkspaceID:            stringPointer("workspace-1"),
		Title:                  "Semantic narration",
		Status:                 ConversationStatusWorking,
		CreatedAt:              testTimeStarted,
		UpdatedAt:              testTimeStarted,
		LastTrajectorySequence: 8,
	}
}

func semanticTestTrajectory(
	kind TrajectoryEventKind,
	sequence int,
	apply func(*TrajectoryEvent),
) TrajectoryEvent {
	event := baseTrajectoryEvent(kind)
	event.ID = "trajectory-semantic-" + string(kind)
	event.Sequence = sequence
	apply(&event)
	return event
}

func semanticTestActivity() TrajectoryActivity {
	command := "./scripts/go.sh test ./internal/conversation"
	cwd := "/workspace"
	return TrajectoryActivity{
		ID:      "activity-semantic",
		Kind:    TrajectoryActivityCommand,
		Title:   "Run focused tests",
		Command: &command,
		CWD:     &cwd,
	}
}

func semanticTestApproval() TrajectoryApprovalRequest {
	command := "./scripts/go.sh test ./internal/conversation"
	cwd := "/workspace"
	return TrajectoryApprovalRequest{
		ID:             "approval-semantic",
		ProviderItemID: "provider-item-approval-semantic",
		Kind:           TrajectoryApprovalKindCommand,
		Title:          "Run command",
		Body:           "Allow the focused test command.",
		Command:        &command,
		CWD:            &cwd,
		FilePaths:      []string{},
		Questions:      []TrajectoryApprovalQuestion{},
		RequestedAt:    testTimeStarted,
	}
}

func semanticTestArtifact(turnID string, sequence int) ArtifactMetadata {
	return ArtifactMetadata{
		ID:                 "artifact-semantic",
		ConversationID:     "conversation-1",
		TurnID:             &turnID,
		TrajectorySequence: &sequence,
		Title:              "Result file",
		Kind:               "Report",
		Summary:            "What the semantic fixture artifact claims.",
		CreatedAt:          testTimeStarted,
	}
}
