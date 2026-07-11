package narration

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/workspace"
	"setta/internal/workspaceui/conversationpalette"
)

func TestNarratorSerializesProjectionStatusAndTerminalWithoutStatusCursorAdvance(t *testing.T) {
	store, latest := seedNarrationTestConversation(t)
	caller := &narrationTestCaller{calls: make(chan ModelCallRequest, 16)}
	records := make(chan InvocationRecord, 16)
	service, err := NewService(Config{
		Store: store, Caller: caller, WorkspaceResolver: narrationTestWorkspaceResolver{root: t.TempDir()},
		ProgressDelay: time.Hour, CheckpointEventThreshold: 100,
		NewID: narrationTestIDGenerator(), RecordInvocation: func(record InvocationRecord) { records <- record },
	})
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		if err := service.Shutdown(ctx); err != nil {
			t.Errorf("Shutdown: %v", err)
		}
	})

	status, err := service.RequestStatus(context.Background(), "conversation_narration", "What is happening now?")
	if err != nil {
		t.Fatalf("RequestStatus: %v", err)
	}
	if status.StatusReply == nil || status.StatusReply.Text != "The agent is preparing the implementation." {
		t.Fatalf("status reply = %+v", status)
	}
	afterStatus := readNarrationSnapshot(t, store)
	if afterStatus.NarratorState.ObservedThroughSequence != 0 {
		t.Fatalf("status advanced narrator cursor to %d", afterStatus.NarratorState.ObservedThroughSequence)
	}

	if err := service.ObserveTrajectory(context.Background(), latest); err != nil {
		t.Fatalf("ObserveTrajectory working: %v", err)
	}
	waitNarrationRecord(t, records, CallKindWorking, "committed")
	afterWorking := readNarrationSnapshot(t, store)
	if afterWorking.NarratorState.ObservedThroughSequence != latest.Sequence {
		t.Fatalf("working cursor = %d, want %d", afterWorking.NarratorState.ObservedThroughSequence, latest.Sequence)
	}
	if got := narrationTexts(afterWorking, conversation.NarrationEventKindMilestone); len(got) != 1 || got[0] != "Implementation has started." {
		t.Fatalf("milestones = %v", got)
	}

	terminal := appendNarrationTestTerminal(t, store, latest.Sequence+1)
	if err := service.ObserveTrajectory(context.Background(), terminal); err != nil {
		t.Fatalf("ObserveTrajectory terminal: %v", err)
	}
	waitNarrationRecord(t, records, CallKindTerminal, "committed")
	afterTerminal := readNarrationSnapshot(t, store)
	if afterTerminal.NarratorState.ObservedThroughSequence != terminal.Sequence {
		t.Fatalf("terminal cursor = %d, want %d", afterTerminal.NarratorState.ObservedThroughSequence, terminal.Sequence)
	}
	if got := narrationTexts(afterTerminal, conversation.NarrationEventKindFinalSummary); len(got) != 1 || got[0] != "The implementation completed successfully." {
		t.Fatalf("final summaries = %v", got)
	}
	if !caller.terminalReceivedPriorMilestone() {
		t.Fatal("terminal narrator context omitted the prior milestone")
	}
}

type narrationTestCaller struct {
	mu                     sync.Mutex
	calls                  chan ModelCallRequest
	terminalPriorMilestone bool
}

func (caller *narrationTestCaller) Call(_ context.Context, request ModelCallRequest) (ModelCallResult, error) {
	caller.calls <- request
	text, err := caller.output(request)
	if err != nil {
		return ModelCallResult{}, err
	}
	return ModelCallResult{
		Text: text,
		ResolvedInvocation: agent.ResolvedInvocation{
			Model: conversation.DefaultNarratorModelID, ReasoningEffort: conversation.ReasoningEffortLow,
			PermissionMode: agent.PermissionModeReadOnly, ApprovalMode: agent.ApprovalModeNever,
		},
		ProviderThreadID: "narrator_thread", ProviderTurnID: "narrator_turn",
	}, nil
}

func (caller *narrationTestCaller) output(request ModelCallRequest) (string, error) {
	switch request.Kind {
	case CallKindStatus:
		var status StatusContext
		if err := decodeNarrationTestPrompt(request.Prompt, &status); err != nil {
			return "", err
		}
		return marshalNarrationTestOutput(map[string]any{
			"type": string(CallKindStatus), "sourceThroughSequence": status.SourceThroughSequence,
			"statusReply": "The agent is preparing the implementation.",
		})
	case CallKindWorking:
		var projection ProjectionContext
		if err := decodeNarrationTestPrompt(request.Prompt, &projection); err != nil {
			return "", err
		}
		return marshalNarrationTestOutput(map[string]any{
			"type": string(CallKindWorking), "observedThroughSequence": projection.IncludedRange.End,
			"currentFocus": "Implementing the requested change.", "milestones": []string{"Implementation has started."},
			"topicDescriptor": nil,
		})
	case CallKindTerminal:
		var projection ProjectionContext
		if err := decodeNarrationTestPrompt(request.Prompt, &projection); err != nil {
			return "", err
		}
		caller.mu.Lock()
		caller.terminalPriorMilestone = containsNarrationText(projection.PriorMilestones, "Implementation has started.")
		caller.mu.Unlock()
		return marshalNarrationTestOutput(map[string]any{
			"type": string(CallKindTerminal), "observedThroughSequence": projection.IncludedRange.End,
			"currentFocus": "The requested change is complete.", "milestones": []string{},
			"finalSummary": "The implementation completed successfully.", "topicDescriptor": nil,
		})
	default:
		return "", fmt.Errorf("unexpected narrator call kind %s", request.Kind)
	}
}

func (caller *narrationTestCaller) terminalReceivedPriorMilestone() bool {
	caller.mu.Lock()
	defer caller.mu.Unlock()
	return caller.terminalPriorMilestone
}

func decodeNarrationTestPrompt(prompt string, target any) error {
	_, payload, ok := strings.Cut(prompt, "\n")
	if !ok {
		return fmt.Errorf("narrator prompt has no JSON payload")
	}
	return json.Unmarshal([]byte(payload), target)
}

func marshalNarrationTestOutput(value any) (string, error) {
	encoded, err := json.Marshal(value)
	return string(encoded), err
}

func seedNarrationTestConversation(t *testing.T) (*conversation.Store, conversation.TrajectoryEvent) {
	t.Helper()
	store, err := conversation.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})
	createdAt := "2026-07-11T21:00:00Z"
	profile, err := conversation.DefaultRoleProfile(conversation.RoleAgent)
	if err != nil {
		t.Fatalf("DefaultRoleProfile: %v", err)
	}
	invocation := narrationTestInvocation(profile, createdAt)
	turnID := "turn_narration"
	conversationRecord := conversation.TopicConversation{
		ID: "conversation_narration", WorkspaceID: "workspace_narration", Title: "Narration topic",
		Status: conversation.ConversationStatusWorking, CreatedAt: createdAt, UpdatedAt: createdAt,
	}
	turn := conversation.ConversationTurn{
		ID: turnID, ConversationID: conversationRecord.ID, AuthoredInput: conversation.AuthoredInput{Text: "Implement the requested change."},
		Delivery: conversation.TurnDeliveryNormal, Status: conversation.TurnStatusRunning,
		AcceptedAt: createdAt, StartedAt: &createdAt, RequestedRoleProfile: profile,
		ResolvedInvocation: &invocation, ProviderTurnID: stringPointer("provider_turn_narration"),
	}
	userEvent := conversation.TrajectoryEvent{
		ID: "trajectory_narration_1", ConversationID: conversationRecord.ID, TurnID: &turnID,
		Sequence: 1, EmittedAt: createdAt, Kind: conversation.TrajectoryEventUserInputAccepted, Actor: conversation.TrajectoryActorUser,
		UserInputAccepted: &conversation.TrajectoryUserInputAccepted{Input: turn.AuthoredInput, Delivery: turn.Delivery},
	}
	planEvent := conversation.TrajectoryEvent{
		ID: "trajectory_narration_2", ConversationID: conversationRecord.ID, TurnID: &turnID,
		Sequence: 2, EmittedAt: "2026-07-11T21:00:01Z", Kind: conversation.TrajectoryEventPlanChanged, Actor: conversation.TrajectoryActorAgent,
		ProviderThreadID: stringPointer("provider_thread_narration"), ProviderTurnID: stringPointer("provider_turn_narration"),
		PlanChanged: &conversation.TrajectoryPlanChanged{Steps: []conversation.PlanStep{{Text: "Implement", Status: conversation.PlanStepStatusInProgress}}},
	}
	_, err = store.Transact(context.Background(), "seed narrator test", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.InsertConversation(conversationRecord); err != nil {
			return err
		}
		if err := transaction.InsertTurn(turn); err != nil {
			return err
		}
		if err := transaction.UpsertAgentThreadBinding(conversation.AgentThreadBinding{
			ConversationID: conversationRecord.ID, Provider: conversation.ProviderCodex, ThreadID: "provider_thread_narration",
			Status: conversation.ThreadBindingStatusLinked, CreatedAt: createdAt, LastTurnID: &turnID, ProviderMetadata: map[string]string{},
		}); err != nil {
			return err
		}
		if err := transaction.InsertNarratorState(conversation.NarratorState{ConversationID: conversationRecord.ID, Status: conversation.NarratorStatusReady, UpdatedAt: createdAt}); err != nil {
			return err
		}
		if err := transaction.UpsertConversationPresentationProfile(conversation.ConversationPresentationProfile{
			ConversationID: conversationRecord.ID, PaletteSelection: conversation.PresentationSelectionAutoDistinct,
			ResolvedPaletteID:      conversationpalette.ConversationPaletteSky,
			NarratorVoiceSelection: conversation.PresentationSelectionAutoDistinct,
			NarratorSpeechEnabled:  true, UpdatedAt: createdAt,
		}); err != nil {
			return err
		}
		if err := transaction.UpsertTopicIndexDocument(conversation.TopicIndexDocument{
			ConversationID: conversationRecord.ID,
			WorkspaceID:    conversationRecord.WorkspaceID,
			Title:          conversationRecord.Title,
			UpdatedAt:      createdAt,
		}); err != nil {
			return err
		}
		if err := transaction.AppendTrajectoryEvent(userEvent); err != nil {
			return err
		}
		if err := transaction.AppendTrajectoryEvent(planEvent); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID: "seed_narrator_event", StreamID: "conversation:" + conversationRecord.ID,
			Kind: "seed", Payload: map[string]bool{"seed": true}, CommittedAt: createdAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("seed transaction: %v", err)
	}
	return store, planEvent
}

func narrationTestInvocation(profile conversation.RoleProfile, startedAt string) conversation.ResolvedInvocation {
	return conversation.ResolvedInvocation{
		ID: "invocation_narration", Role: conversation.RoleAgent, Provider: conversation.ProviderCodex,
		Requested: profile,
		Resolved: conversation.ResolvedInvocationSettings{
			ModelID: conversation.DefaultAgentModelID, ReasoningEffort: conversation.ReasoningEffortHigh,
			PermissionProfile: profile.PermissionProfile,
		},
		ProviderReferences: conversation.InvocationProviderReferences{
			ThreadID: stringPointer("provider_thread_narration"), TurnID: stringPointer("provider_turn_narration"),
		},
		ModelReroutes: []conversation.InvocationModelReroute{}, StartedAt: startedAt,
		Outcome: conversation.InvocationOutcomeRunning,
	}
}

func appendNarrationTestTerminal(t *testing.T, store *conversation.Store, sequence int) conversation.TrajectoryEvent {
	t.Helper()
	turnID := "turn_narration"
	event := conversation.TrajectoryEvent{
		ID: fmt.Sprintf("trajectory_narration_%d", sequence), ConversationID: "conversation_narration", TurnID: &turnID,
		Sequence: sequence, EmittedAt: "2026-07-11T21:00:02Z", Kind: conversation.TrajectoryEventTurnCompleted,
		Actor: conversation.TrajectoryActorAgent, ProviderThreadID: stringPointer("provider_thread_narration"),
		ProviderTurnID: stringPointer("provider_turn_narration"), TurnCompleted: &conversation.TrajectoryTurnCompleted{Usage: conversation.TokenUsage{}},
	}
	_, err := store.Transact(context.Background(), "append narrator terminal", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.AppendTrajectoryEvent(event); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID: fmt.Sprintf("seed_terminal_event_%d", sequence), StreamID: "conversation:conversation_narration",
			Kind: "seed_terminal", Payload: map[string]int{"sequence": sequence}, CommittedAt: event.EmittedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("append terminal: %v", err)
	}
	return event
}

func readNarrationSnapshot(t *testing.T, store *conversation.Store) conversation.ConversationSnapshot {
	t.Helper()
	snapshot, err := store.ReadSnapshot(context.Background(), "workspace_narration", "conversation_narration")
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	return snapshot
}

func narrationTexts(snapshot conversation.ConversationSnapshot, kind conversation.NarrationEventKind) []string {
	result := []string{}
	for _, event := range snapshot.Narration.Events {
		switch kind {
		case conversation.NarrationEventKindMilestone:
			if event.Milestone != nil {
				result = append(result, event.Milestone.Text)
			}
		case conversation.NarrationEventKindFinalSummary:
			if event.FinalSummary != nil {
				result = append(result, event.FinalSummary.Text)
			}
		}
	}
	return result
}

func waitNarrationRecord(t *testing.T, records <-chan InvocationRecord, kind CallKind, outcome string) InvocationRecord {
	t.Helper()
	deadline := time.NewTimer(3 * time.Second)
	defer deadline.Stop()
	for {
		select {
		case record := <-records:
			if record.CallKind == kind && record.Outcome == outcome {
				return record
			}
		case <-deadline.C:
			t.Fatalf("timed out waiting for %s narrator record", kind)
		}
	}
}

func containsNarrationText(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func narrationTestIDGenerator() func(string) (string, error) {
	counts := map[string]int{}
	return func(prefix string) (string, error) {
		counts[prefix]++
		return fmt.Sprintf("%s_test_%d", prefix, counts[prefix]), nil
	}
}

type narrationTestWorkspaceResolver struct{ root string }

func (resolver narrationTestWorkspaceResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	if id != "workspace_narration" {
		return workspace.WorkspaceSummary{}, fmt.Errorf("workspace not found: %s", id)
	}
	return workspace.WorkspaceSummary{ID: id, RootPath: resolver.root, DisplayName: "Narration"}, nil
}
