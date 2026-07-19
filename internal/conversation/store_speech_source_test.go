package conversation

import (
	"context"
	"fmt"
	"testing"

	"setta/internal/master"
	"setta/internal/speech"
	"setta/internal/workspaceui/conversationpalette"
)

func TestStoreResolvesAuthoritativeNarrationSpeechSourceAndVoice(t *testing.T) {
	store := newTestStore(t)
	seedTransactionConversation(t, store)
	event := transactionMilestoneEvent()
	_, err := store.Transact(context.Background(), "append narration speech source", func(transaction *WriteTransaction) error {
		appended, err := transaction.AppendNarrationEvent(event)
		if err != nil {
			return err
		}
		_, err = transaction.AppendCommittedEvent(transactionTestEventDraft(
			"narration-speech-source-created",
			"conversation:conversation-1",
			appended,
		))
		return err
	})
	if err != nil {
		t.Fatalf("append narration speech source: %v", err)
	}

	conversationID := "conversation-1"
	source := speech.SpeechSource{
		Speaker:        speech.SpeechSpeakerNarrator,
		Kind:           speech.SpeechSourceKindNarrationEvent,
		EventID:        event.ID,
		ConversationID: &conversationID,
	}
	resolved, err := store.ResolveSpeechSource(context.Background(), source)
	if err != nil {
		t.Fatalf("resolve narration speech source: %v", err)
	}
	if resolved.Source != source ||
		resolved.Text != event.Milestone.Text ||
		resolved.ResolvedVoiceID != speech.SpeechVoiceAlloy {
		t.Fatalf("resolved narration speech source = %+v", resolved)
	}

	wrongConversationID := "conversation-other"
	_, err = store.ResolveSpeechSource(context.Background(), speech.SpeechSource{
		Speaker:        speech.SpeechSpeakerNarrator,
		Kind:           speech.SpeechSourceKindNarrationEvent,
		EventID:        event.ID,
		ConversationID: &wrongConversationID,
	})
	assertSpeechSourceUnavailable(t, err)

	disabledProfile := ConversationPresentationProfile{
		ConversationID:          conversationID,
		PaletteSelection:        PresentationSelectionAutoDistinct,
		ResolvedPaletteID:       conversationpalette.ConversationPaletteSky,
		NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
		ResolvedNarratorVoiceID: speechVoiceIDPointer(speech.SpeechVoiceAlloy),
		NarratorSpeechEnabled:   false,
		UpdatedAt:               "2026-07-11T11:00:00Z",
	}
	_, err = store.Transact(context.Background(), "disable narrator speech", func(transaction *WriteTransaction) error {
		if err := transaction.UpsertConversationPresentationProfile(disabledProfile); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			"narrator-speech-disabled",
			"conversation:conversation-1",
			ConversationPresentationProfileUpdatedEventPayload{
				Type:    ConversationEventTypePresentationProfileUpdated,
				Profile: disabledProfile,
			},
		))
		return err
	})
	if err != nil {
		t.Fatalf("disable narrator speech: %v", err)
	}
	_, err = store.ResolveSpeechSource(context.Background(), source)
	assertSpeechSourceUnavailable(t, err)
}

func TestStoreResolvesAuthoritativeMasterAnswerSpeechSourceAndVoice(t *testing.T) {
	store := newTestStore(t)
	initialVoice := speech.DefaultMasterVoiceSelection("2026-07-12T18:00:00Z")
	if _, err := store.EnsureMasterVoiceSelection(context.Background(), initialVoice); err != nil {
		t.Fatalf("EnsureMasterVoiceSelection: %v", err)
	}
	ready := seedMasterRouteState(t, store)
	accepted := acceptMasterRouteTestInput(
		t,
		store,
		"master-input-answer-speech",
		"2026-07-11T20:02:00Z",
	)
	work := claimMasterRouteCommitWork(t, store, accepted)
	answer := "The global master answer is ready."
	commit := masterRouteTestCommit(t, work, ready, master.RouteDecision{
		Kind:         master.RouteDecisionKindAnswerGlobal,
		AnswerGlobal: &master.MasterAnswerGlobalRouteDecision{Text: answer},
	})
	commitMasterRouteTestDecision(t, store, commit, accepted.Input.ID)

	source := speech.SpeechSource{
		Speaker: speech.SpeechSpeakerMaster,
		Kind:    speech.SpeechSourceKindMasterAnswer,
		EventID: accepted.Input.ID,
	}
	resolved, err := store.ResolveSpeechSource(context.Background(), source)
	if err != nil {
		t.Fatalf("ResolveSpeechSource: %v", err)
	}
	if resolved.Source != source ||
		resolved.Text != answer ||
		resolved.ResolvedVoiceID != *initialVoice.ResolvedVoiceID {
		t.Fatalf("resolved master source = %+v, want text=%q voice=%s", resolved, answer, *initialVoice.ResolvedVoiceID)
	}

	cedar := speech.SpeechVoiceCedar
	updated, err := store.UpdateMasterVoiceSelection(
		context.Background(),
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionExact, RequestedVoiceID: &cedar},
		"2026-07-12T18:00:01Z",
	)
	if err != nil {
		t.Fatalf("UpdateMasterVoiceSelection: %v", err)
	}
	resolvedAfterVoiceUpdate, err := store.ResolveSpeechSource(context.Background(), source)
	if err != nil {
		t.Fatalf("ResolveSpeechSource after voice update: %v", err)
	}
	if resolvedAfterVoiceUpdate.ResolvedVoiceID != *updated.ResolvedVoiceID {
		t.Fatalf("resolved master voice after update = %s, want %s", resolvedAfterVoiceUpdate.ResolvedVoiceID, *updated.ResolvedVoiceID)
	}
}

func TestStoreResolvesAuthoritativeProgressHighlightSpeechSources(t *testing.T) {
	store := newTestStore(t)
	seedTransactionConversation(t, store)
	conversationID := "conversation-1"
	turnID := "turn-1"
	running := validConversationTurn(TurnStatusRunning)
	running.Delivery = TurnDeliveryQueued
	approval := TrajectoryApprovalRequest{
		ID:             "approval-1",
		ProviderItemID: "provider-approval-1",
		Kind:           TrajectoryApprovalKindCommand,
		Title:          "Run command?",
		Body:           "Download cloc to /tmp?",
		Command:        stringPointer("curl -L cloc"),
		CWD:            stringPointer("/tmp"),
		FilePaths:      []string{},
		Questions:      []TrajectoryApprovalQuestion{},
		RequestedAt:    testTimeStarted,
	}
	artifactSequence := 5
	artifact := Artifact{
		ID:                 "artifact-1",
		ConversationID:     conversationID,
		TurnID:             &turnID,
		TrajectorySequence: &artifactSequence,
		Kind:               ArtifactKindTable,
		Title:              "Repository LOC table",
		CreatedAt:          testTimeLater,
		Table: &TableArtifactPayload{
			Columns: []ArtifactTableColumn{{Key: "language", Label: "Language"}},
			Rows:    [][]string{{"Go"}},
		},
	}
	events := []TrajectoryEvent{
		progressTrajectoryEvent("trajectory-turn-started", turnID, 2, TrajectoryEventTurnStarted, &TrajectoryTurnStarted{Invocation: validInvocation(RoleAgent, InvocationOutcomeRunning)}),
		progressTrajectoryEvent("trajectory-approval-requested", turnID, 3, TrajectoryEventApprovalRequested, &TrajectoryApprovalRequested{Approval: approval}),
		progressTrajectoryEvent("trajectory-approval-resolved", turnID, 4, TrajectoryEventApprovalResolved, &TrajectoryApprovalResolved{Resolution: TrajectoryApprovalResolution{
			ApprovalID:      approval.ID,
			Decision:        TrajectoryApprovalDecisionApproved,
			Answers:         []ConversationApprovalAnswer{},
			SecretsRedacted: false,
			ResolvedAt:      testTimeLater,
		}}),
		progressTrajectoryEvent("trajectory-artifact-emitted", turnID, artifactSequence, TrajectoryEventArtifactEmitted, &TrajectoryArtifactEmitted{ArtifactID: artifact.ID}),
		progressTrajectoryEvent("trajectory-turn-completed", turnID, 6, TrajectoryEventTurnCompleted, &TrajectoryTurnCompleted{}),
		progressTrajectoryEvent("trajectory-turn-failed", turnID, 7, TrajectoryEventTurnFailed, &TrajectoryTurnFailed{Failure: Failure{
			Code:      "provider_failed",
			Message:   "Provider failed.",
			Retryable: true,
		}}),
		progressTrajectoryEvent("trajectory-turn-interrupted", turnID, 8, TrajectoryEventTurnInterrupted, &TrajectoryTurnInterrupted{Reason: TurnInterruptionUserRequested}),
	}
	if _, err := store.Transact(context.Background(), "append progress highlight speech sources", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateTurn(TurnStatusQueued, running); err != nil {
			return err
		}
		for _, event := range events {
			if err := transaction.AppendTrajectoryEvent(event); err != nil {
				return err
			}
		}
		if err := transaction.InsertArtifact(artifact); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			"progress-highlight-sources-created",
			"conversation:conversation-1",
			events,
		))
		return err
	}); err != nil {
		t.Fatalf("append progress highlight speech sources: %v", err)
	}

	tests := []struct {
		eventID string
		text    string
	}{
		{eventID: "trajectory-turn-started", text: "Working. Implement the next step."},
		{eventID: "trajectory-approval-requested", text: "Needs approval. Download cloc to /tmp?"},
		{eventID: "trajectory-approval-resolved", text: "Approval received. Implement the next step."},
		{eventID: "trajectory-artifact-emitted", text: "Table ready. Repository LOC table"},
		{eventID: "trajectory-turn-completed", text: "Complete. Work completed."},
		{eventID: "trajectory-turn-failed", text: "Failed. Provider failed."},
		{eventID: "trajectory-turn-interrupted", text: "Stopped. Work stopped at your request."},
	}
	for _, test := range tests {
		t.Run(test.eventID, func(t *testing.T) {
			source := speech.SpeechSource{
				Speaker:        speech.SpeechSpeakerNarrator,
				Kind:           speech.SpeechSourceKindProgressHighlight,
				EventID:        test.eventID,
				ConversationID: &conversationID,
			}
			resolved, err := store.ResolveSpeechSource(context.Background(), source)
			if err != nil {
				t.Fatalf("resolve progress highlight speech source: %v", err)
			}
			if resolved.Source != source ||
				resolved.Text != test.text ||
				resolved.ResolvedVoiceID != speech.SpeechVoiceAlloy {
				t.Fatalf("resolved progress highlight source = %+v, want text=%q", resolved, test.text)
			}
		})
	}

	_, err := store.ResolveSpeechSource(context.Background(), speech.SpeechSource{
		Speaker:        speech.SpeechSpeakerNarrator,
		Kind:           speech.SpeechSourceKindProgressHighlight,
		EventID:        "trajectory-accepted",
		ConversationID: &conversationID,
	})
	assertSpeechSourceUnavailable(t, err)
}

func TestStoreRejectsUnavailableMasterAndUnspokenNarrationSources(t *testing.T) {
	store := newTestStore(t)
	seedTransactionConversation(t, store)

	_, err := store.ResolveSpeechSource(context.Background(), speech.SpeechSource{
		Speaker: speech.SpeechSpeakerMaster,
		Kind:    speech.SpeechSourceKindMasterAnswer,
		EventID: "master-reply-missing",
	})
	assertSpeechSourceUnavailable(t, err)

	ready := seedMasterRouteState(t, store)
	accepted := acceptMasterRouteTestInput(
		t,
		store,
		"master-input-clarify-speech",
		"2026-07-11T20:02:00Z",
	)
	work := claimMasterRouteCommitWork(t, store, accepted)
	commit := masterRouteTestCommit(t, work, ready, master.RouteDecision{
		Kind:    master.RouteDecisionKindClarify,
		Clarify: &master.MasterClarifyRouteDecision{Question: "Which topic should handle this?"},
	})
	commitMasterRouteTestDecision(t, store, commit, accepted.Input.ID)
	_, err = store.ResolveSpeechSource(context.Background(), speech.SpeechSource{
		Speaker: speech.SpeechSpeakerMaster,
		Kind:    speech.SpeechSourceKindMasterAnswer,
		EventID: accepted.Input.ID,
	})
	assertSpeechSourceUnavailable(t, err)

	event := transactionMilestoneEvent()
	event.ID = "topic-descriptor-source"
	event.Kind = NarrationEventKindTopicDescriptor
	event.Trigger = NarrationTriggerProgressWindowElapsed
	event.Milestone = nil
	event.TopicDescriptor = &NarrationTopicDescriptor{Text: "Speech architecture"}
	_, err = store.Transact(context.Background(), "append unspoken narration source", func(transaction *WriteTransaction) error {
		appended, err := transaction.AppendNarrationEvent(event)
		if err != nil {
			return err
		}
		_, err = transaction.AppendCommittedEvent(transactionTestEventDraft(
			"topic-descriptor-created",
			"conversation:conversation-1",
			appended,
		))
		return err
	})
	if err != nil {
		t.Fatalf("append topic descriptor source: %v", err)
	}
	conversationID := "conversation-1"
	_, err = store.ResolveSpeechSource(context.Background(), speech.SpeechSource{
		Speaker:        speech.SpeechSpeakerNarrator,
		Kind:           speech.SpeechSourceKindNarrationEvent,
		EventID:        event.ID,
		ConversationID: &conversationID,
	})
	assertSpeechSourceUnavailable(t, err)
}

func TestStoreRejectsCorruptNarrationSpeechSourceState(t *testing.T) {
	tests := []struct {
		name    string
		corrupt func(*testing.T, *Store, string)
	}{
		{
			name: "missing narration payload",
			corrupt: func(t *testing.T, store *Store, eventID string) {
				t.Helper()
				if _, err := store.writer.ExecContext(
					context.Background(),
					`UPDATE narration_events SET payload_json = 'null' WHERE id = ?`,
					eventID,
				); err != nil {
					t.Fatalf("corrupt narration payload: %v", err)
				}
			},
		},
		{
			name: "invalid narrator voice reuse",
			corrupt: func(t *testing.T, store *Store, _ string) {
				t.Helper()
				if _, err := store.writer.ExecContext(
					context.Background(),
					`UPDATE conversation_presentation_profiles
SET narrator_voice_reuse_json = '{"reason":"catalog_exhausted","resolvedChoiceId":"alloy","conflictingConversationIds":[]}'
WHERE conversation_id = 'conversation-1'`,
				); err != nil {
					t.Fatalf("corrupt narrator voice reuse: %v", err)
				}
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := newTestStore(t)
			seedTransactionConversation(t, store)
			event := transactionMilestoneEvent()
			_, err := store.Transact(context.Background(), "append narration speech source", func(transaction *WriteTransaction) error {
				appended, err := transaction.AppendNarrationEvent(event)
				if err != nil {
					return err
				}
				_, err = transaction.AppendCommittedEvent(transactionTestEventDraft(
					"corrupt-narration-speech-source-created",
					"conversation:conversation-1",
					appended,
				))
				return err
			})
			if err != nil {
				t.Fatalf("append narration speech source: %v", err)
			}
			test.corrupt(t, store, event.ID)

			conversationID := "conversation-1"
			_, err = store.ResolveSpeechSource(context.Background(), speech.SpeechSource{
				Speaker:        speech.SpeechSpeakerNarrator,
				Kind:           speech.SpeechSourceKindNarrationEvent,
				EventID:        event.ID,
				ConversationID: &conversationID,
			})
			if !IsCorruptStateError(err) {
				t.Fatalf("ResolveSpeechSource error = %T %v, want CorruptStateError", err, err)
			}
		})
	}
}

func progressTrajectoryEvent(
	id string,
	turnID string,
	sequence int,
	kind TrajectoryEventKind,
	payload any,
) TrajectoryEvent {
	event := TrajectoryEvent{
		ID:             id,
		ConversationID: "conversation-1",
		TurnID:         &turnID,
		Sequence:       sequence,
		EmittedAt:      testTimeLater,
		Kind:           kind,
		Actor:          TrajectoryActorAgent,
		ProviderTurnID: stringPointer("provider-turn-1"),
	}
	switch value := payload.(type) {
	case *TrajectoryTurnStarted:
		event.TurnStarted = value
	case *TrajectoryApprovalRequested:
		event.Actor = TrajectoryActorProvider
		event.ApprovalRequested = value
	case *TrajectoryApprovalResolved:
		event.Actor = TrajectoryActorUser
		event.ApprovalResolved = value
	case *TrajectoryArtifactEmitted:
		event.Actor = TrajectoryActorSystem
		event.ArtifactEmitted = value
	case *TrajectoryTurnCompleted:
		event.TurnCompleted = value
	case *TrajectoryTurnFailed:
		event.TurnFailed = value
	case *TrajectoryTurnInterrupted:
		event.TurnInterrupted = value
	default:
		panic(fmt.Sprintf("unsupported progress trajectory payload %T", payload))
	}
	return event
}

func assertSpeechSourceUnavailable(t *testing.T, err error) {
	t.Helper()
	speechError, ok := speech.AsError(err)
	if !ok || speechError.Code != speech.ErrorSourceUnavailable {
		t.Fatalf("speech source error = %T %v", err, err)
	}
}
