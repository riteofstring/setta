package narration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/speech"
	"setta/internal/workspace"
	"setta/internal/workspaceui/conversationpalette"
)

const serviceTestTimestamp = "2026-07-12T12:00:00Z"

func TestServiceAskRoutedStatusPersistsReadOnlyReply(t *testing.T) {
	fixture := newStatusServiceFixture(t, nil)
	question := "What is happening with this topic?"
	before := readStatusServiceSnapshot(t, fixture)

	snapshot, err := fixture.service.AskRoutedStatus(
		context.Background(),
		fixture.workspace.ID,
		fixture.conversationID,
		"narrator_status_test",
		question,
	)
	if err != nil {
		t.Fatalf("AskRoutedStatus: %v", err)
	}
	assertStatusPreservesPrimaryAgent(t, before, snapshot)
	assertStatusNarrationReply(t, snapshot, question)
	assertStatusProviderRequest(t, fixture, question)
}

func readStatusServiceSnapshot(t *testing.T, fixture statusServiceFixture) conversation.ConversationSnapshot {
	t.Helper()
	snapshot, err := fixture.store.ReadSnapshot(
		context.Background(),
		fixture.workspace.ID,
		fixture.conversationID,
	)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	return snapshot
}

func assertStatusPreservesPrimaryAgent(
	t *testing.T,
	before conversation.ConversationSnapshot,
	after conversation.ConversationSnapshot,
) {
	t.Helper()
	if after.Conversation.Status != conversation.ConversationStatusWorking ||
		after.Conversation.LastTrajectorySequence != before.Conversation.LastTrajectorySequence ||
		len(after.Trajectory.Events) != len(before.Trajectory.Events) {
		t.Fatalf("status call changed primary agent state: before=%+v after=%+v", before, after)
	}
	if len(after.Turns.Turns) != 1 || len(before.Turns.Turns) != 1 {
		t.Fatalf("status call changed primary turns: before=%+v after=%+v", before.Turns, after.Turns)
	}
	afterTurn := after.Turns.Turns[0]
	beforeTurn := before.Turns.Turns[0]
	if afterTurn.Status != conversation.TurnStatusRunning || afterTurn.ID != beforeTurn.ID ||
		!sameOptionalString(afterTurn.ProviderTurnID, beforeTurn.ProviderTurnID) {
		t.Fatalf("status call changed primary turn: before=%+v after=%+v", beforeTurn, afterTurn)
	}
	if after.NarratorState.ObservedThroughSequence != 0 ||
		after.NarratorState.CheckpointThroughSequence != 0 ||
		after.NarratorState.CurrentFocusRevision != 0 {
		t.Fatalf("status call changed narrator projection cursor: %+v", after.NarratorState)
	}
}

func assertStatusNarrationReply(
	t *testing.T,
	snapshot conversation.ConversationSnapshot,
	question string,
) {
	t.Helper()
	if len(snapshot.Narration.Events) != 1 {
		t.Fatalf("narration events = %+v, want one status reply", snapshot.Narration.Events)
	}
	reply := snapshot.Narration.Events[0]
	if reply.Kind != conversation.NarrationEventKindStatusReply || reply.StatusReply == nil ||
		reply.StatusReply.Question != question || reply.StatusReply.Text != "The primary agent turn is still running." ||
		reply.Trigger != conversation.NarrationTriggerExplicitStatusRequested || reply.TurnID == nil ||
		*reply.TurnID != snapshot.Turns.Turns[0].ID {
		t.Fatalf("status narration event = %+v", reply)
	}
	if reply.ResolvedInvocation.Role != conversation.RoleNarrator ||
		reply.ResolvedInvocation.Resolved.ModelID != "gpt-5.4-mini" {
		t.Fatalf("status invocation audit = %+v", reply.ResolvedInvocation)
	}
}

func assertStatusProviderRequest(
	t *testing.T,
	fixture statusServiceFixture,
	question string,
) {
	t.Helper()
	request := fixture.provider.lastRequest
	if request.Invocation.PermissionMode != agent.PermissionModeReadOnly ||
		request.Invocation.ApprovalMode != agent.ApprovalModeNever ||
		request.WorkspaceRoot != fixture.workspace.RootPath {
		t.Fatalf("structured status request = %+v", request)
	}
	var contextBundle StatusContextBundle
	if err := json.Unmarshal(request.Input, &contextBundle); err != nil {
		t.Fatalf("decode structured status input: %v", err)
	}
	if contextBundle.Question != question ||
		contextBundle.Authoritative.Conversation.ConversationID != fixture.conversationID ||
		contextBundle.Authoritative.CurrentInstructions == nil ||
		contextBundle.Authoritative.CurrentInstructions.TurnStatus != conversation.TurnStatusRunning {
		t.Fatalf("structured status context = %+v", contextBundle)
	}
}

func TestServiceAskRoutedStatusReturnsCommittedDegradation(t *testing.T) {
	fixture := newStatusServiceFixture(t, errors.New("provider is unavailable"))

	_, err := fixture.service.AskRoutedStatus(
		context.Background(),
		fixture.workspace.ID,
		fixture.conversationID,
		"narrator_status_test",
		"Can the narrator report status?",
	)
	var degraded *DegradedError
	if !errors.As(err, &degraded) {
		t.Fatalf("AskRoutedStatus error = %T %v, want DegradedError", err, err)
	}
	if degraded.Degradation.Code != string(FailureKindProviderUnavailable) ||
		degraded.Degradation.DiagnosticReference == "" {
		t.Fatalf("degradation = %+v", degraded.Degradation)
	}
	snapshot, readErr := fixture.store.ReadSnapshot(
		context.Background(),
		fixture.workspace.ID,
		fixture.conversationID,
	)
	if readErr != nil {
		t.Fatalf("ReadSnapshot after degradation: %v", readErr)
	}
	if snapshot.NarratorState.Status != conversation.NarratorStatusDegraded ||
		snapshot.NarratorState.Degradation == nil || len(snapshot.Narration.Events) != 0 ||
		snapshot.Conversation.Status != conversation.ConversationStatusWorking ||
		len(snapshot.Turns.Turns) != 1 || snapshot.Turns.Turns[0].Status != conversation.TurnStatusRunning {
		t.Fatalf("degraded status snapshot = %+v", snapshot)
	}
}

func TestValidateStatusQuestion(t *testing.T) {
	for _, question := range []string{"", " status ", strings.Repeat("x", MaxStatusQuestionBytes+1)} {
		if err := ValidateStatusQuestion(question); err == nil {
			t.Fatalf("ValidateStatusQuestion(%q) error = nil", question)
		}
	}
	if err := ValidateStatusQuestion("What is the current status?"); err != nil {
		t.Fatalf("ValidateStatusQuestion valid question: %v", err)
	}
}

type statusServiceFixture struct {
	conversationID string
	provider       *statusServiceAgentRuntime
	service        *Service
	store          *conversation.Store
	workspace      workspace.WorkspaceSummary
}

func newStatusServiceFixture(t *testing.T, providerErr error) statusServiceFixture {
	t.Helper()
	store, err := conversation.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	conversationID := "conversation-status-service"
	seedStatusServiceConversation(t, store, conversationID)
	workspaceSummary := workspace.WorkspaceSummary{
		ID:       "workspace-status-service",
		RootPath: filepath.Clean(t.TempDir()),
	}
	provider := &statusServiceAgentRuntime{providerErr: providerErr}
	service, err := NewService(
		store,
		statusServiceWorkspaceResolver{summary: workspaceSummary},
		provider,
		WithServiceIDGenerator(func(prefix string) (string, error) {
			return prefix + "-request", nil
		}),
	)
	if err != nil {
		_ = store.Close()
		t.Fatalf("NewService: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := service.Shutdown(ctx); err != nil {
			t.Errorf("Shutdown: %v", err)
		}
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})
	return statusServiceFixture{
		conversationID: conversationID,
		provider:       provider,
		service:        service,
		store:          store,
		workspace:      workspaceSummary,
	}
}

func newBlankStatusServiceFixture(t *testing.T) statusServiceFixture {
	t.Helper()
	store, err := conversation.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	conversationID := "conversation-blank-route"
	seedBlankStatusServiceConversation(t, store, conversationID)
	workspaceSummary := workspace.WorkspaceSummary{
		ID:       "workspace-status-service",
		RootPath: filepath.Clean(t.TempDir()),
	}
	provider := &statusServiceAgentRuntime{}
	service, err := NewService(
		store,
		statusServiceWorkspaceResolver{summary: workspaceSummary},
		provider,
		WithServiceIDGenerator(func(prefix string) (string, error) {
			return prefix + "-request", nil
		}),
	)
	if err != nil {
		_ = store.Close()
		t.Fatalf("NewService: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := service.Shutdown(ctx); err != nil {
			t.Errorf("Shutdown: %v", err)
		}
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})
	return statusServiceFixture{
		conversationID: conversationID,
		provider:       provider,
		service:        service,
		store:          store,
		workspace:      workspaceSummary,
	}
}

func seedStatusServiceConversation(t *testing.T, store *conversation.Store, conversationID string) {
	t.Helper()
	record := conversation.TopicConversation{
		ID:              conversationID,
		WorkspaceID:     stringPointerForServiceTest("workspace-status-service"),
		Title:           "Status service topic",
		TopicDescriptor: "Status service topic",
		Status:          conversation.ConversationStatusWorking,
		CreatedAt:       serviceTestTimestamp,
		UpdatedAt:       serviceTestTimestamp,
	}
	narratorState := conversation.NarratorState{
		ConversationID:  conversationID,
		TopicDescriptor: record.TopicDescriptor,
		Status:          conversation.NarratorStatusReady,
		UpdatedAt:       serviceTestTimestamp,
	}
	presentation := conversation.ConversationPresentationProfile{
		ConversationID:          conversationID,
		PaletteSelection:        conversation.PresentationSelectionAutoDistinct,
		ResolvedPaletteID:       conversationpalette.ConversationPaletteSky,
		NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
		ResolvedNarratorVoiceID: narrationTestVoiceIDPointer(speech.SpeechVoiceAlloy),
		NarratorSpeechEnabled:   true,
		UpdatedAt:               serviceTestTimestamp,
	}
	turn, binding, trajectory := statusServiceActiveTurn(conversationID)
	_, err := store.Transact(context.Background(), "seed narrator status service", func(tx *conversation.WriteTransaction) error {
		if err := tx.InsertConversation(record); err != nil {
			return err
		}
		if err := tx.InsertNarratorState(narratorState); err != nil {
			return err
		}
		if err := tx.InsertTurn(turn); err != nil {
			return err
		}
		if err := tx.UpsertAgentThreadBinding(binding); err != nil {
			return err
		}
		for _, event := range trajectory {
			if err := tx.AppendTrajectoryEvent(event); err != nil {
				return err
			}
		}
		if err := tx.UpsertConversationPresentationProfile(presentation); err != nil {
			return err
		}
		_, err := tx.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          "conversation-status-seed-event",
			StreamID:    "conversation:" + conversationID,
			Kind:        string(conversation.ConversationEventTypeConversationUpdated),
			Payload:     map[string]string{"conversationId": conversationID},
			CommittedAt: serviceTestTimestamp,
		})
		return err
	})
	if err != nil {
		t.Fatalf("seed status service conversation: %v", err)
	}
}

func seedBlankStatusServiceConversation(
	t *testing.T,
	store *conversation.Store,
	conversationID string,
) {
	t.Helper()
	record := conversation.TopicConversation{
		ID:              conversationID,
		WorkspaceID:     stringPointerForServiceTest("workspace-status-service"),
		Title:           "New conversation",
		TopicDescriptor: "New conversation",
		Status:          conversation.ConversationStatusIdle,
		CreatedAt:       serviceTestTimestamp,
		UpdatedAt:       serviceTestTimestamp,
	}
	narratorState := conversation.NarratorState{
		ConversationID:  conversationID,
		TopicDescriptor: record.TopicDescriptor,
		Status:          conversation.NarratorStatusReady,
		UpdatedAt:       serviceTestTimestamp,
	}
	presentation := conversation.ConversationPresentationProfile{
		ConversationID:          conversationID,
		PaletteSelection:        conversation.PresentationSelectionAutoDistinct,
		ResolvedPaletteID:       conversationpalette.ConversationPaletteGreen,
		NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
		ResolvedNarratorVoiceID: narrationTestVoiceIDPointer(speech.SpeechVoiceAlloy),
		NarratorSpeechEnabled:   true,
		UpdatedAt:               serviceTestTimestamp,
	}
	_, err := store.Transact(context.Background(), "seed blank routed conversation", func(tx *conversation.WriteTransaction) error {
		if err := tx.InsertConversation(record); err != nil {
			return err
		}
		if err := tx.InsertNarratorState(narratorState); err != nil {
			return err
		}
		if err := tx.UpsertConversationPresentationProfile(presentation); err != nil {
			return err
		}
		_, err := tx.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          "conversation-blank-seed-event",
			StreamID:    "conversation:" + conversationID,
			Kind:        string(conversation.ConversationEventTypeConversationUpdated),
			Payload:     map[string]string{"conversationId": conversationID},
			CommittedAt: serviceTestTimestamp,
		})
		return err
	})
	if err != nil {
		t.Fatalf("seed blank conversation: %v", err)
	}
}

func stringPointerForServiceTest(value string) *string {
	return &value
}

func narrationTestVoiceIDPointer(value speech.SpeechVoiceID) *speech.SpeechVoiceID {
	return &value
}

func statusServiceActiveTurn(
	conversationID string,
) (conversation.ConversationTurn, conversation.AgentThreadBinding, []conversation.TrajectoryEvent) {
	profile := conversation.DefaultAgentRoleProfile()
	providerThreadID := "provider-primary-thread"
	providerTurnID := "provider-primary-turn"
	startedAt := serviceTestTimestamp
	invocation := conversation.ResolvedInvocation{
		ID:        "primary-agent-invocation",
		Role:      conversation.RoleAgent,
		Provider:  conversation.ProviderCodex,
		Requested: profile,
		Resolved: conversation.ResolvedInvocationSettings{
			ModelID:           "gpt-5.6-sol",
			ReasoningEffort:   conversation.ReasoningEffortHigh,
			PermissionProfile: profile.PermissionProfile,
		},
		ProviderReferences: conversation.InvocationProviderReferences{
			ThreadID: &providerThreadID,
			TurnID:   &providerTurnID,
		},
		ModelReroutes: []conversation.InvocationModelReroute{},
		StartedAt:     serviceTestTimestamp,
		Outcome:       conversation.InvocationOutcomeRunning,
	}
	turn := conversation.ConversationTurn{
		ID:                   "primary-agent-turn",
		ConversationID:       conversationID,
		AuthoredInput:        conversation.AuthoredInput{Text: "Keep the primary turn running."},
		Delivery:             conversation.TurnDeliveryNormal,
		Status:               conversation.TurnStatusRunning,
		AcceptedAt:           serviceTestTimestamp,
		StartedAt:            &startedAt,
		RequestedRoleProfile: profile,
		ResolvedInvocation:   &invocation,
		ProviderTurnID:       &providerTurnID,
	}
	binding := conversation.AgentThreadBinding{
		ConversationID: conversationID,
		Provider:       conversation.ProviderCodex,
		ThreadID:       providerThreadID,
		Status:         conversation.ThreadBindingStatusLinked,
		CreatedAt:      serviceTestTimestamp,
		LastTurnID:     &turn.ID,
		ProviderMetadata: map[string]string{
			"model": "gpt-5.6-sol",
		},
	}
	turnID := turn.ID
	trajectory := []conversation.TrajectoryEvent{
		{
			ID:             "primary-user-input",
			ConversationID: conversationID,
			TurnID:         &turnID,
			Sequence:       1,
			EmittedAt:      serviceTestTimestamp,
			Kind:           conversation.TrajectoryEventUserInputAccepted,
			Actor:          conversation.TrajectoryActorUser,
			UserInputAccepted: &conversation.TrajectoryUserInputAccepted{
				Input:    turn.AuthoredInput,
				Delivery: turn.Delivery,
			},
		},
		{
			ID:             "primary-turn-started",
			ConversationID: conversationID,
			TurnID:         &turnID,
			Sequence:       2,
			EmittedAt:      serviceTestTimestamp,
			Kind:           conversation.TrajectoryEventTurnStarted,
			Actor:          conversation.TrajectoryActorAgent,
			TurnStarted:    &conversation.TrajectoryTurnStarted{Invocation: invocation},
		},
	}
	return turn, binding, trajectory
}

type statusServiceWorkspaceResolver struct {
	summary workspace.WorkspaceSummary
}

func (resolver statusServiceWorkspaceResolver) ResolveActiveWorkspace(
	id string,
) (workspace.WorkspaceSummary, error) {
	if id != resolver.summary.ID {
		return workspace.WorkspaceSummary{}, fmt.Errorf("workspace not active: %s", id)
	}
	return resolver.summary, nil
}

type statusServiceAgentRuntime struct {
	mu                           sync.Mutex
	lastRequest                  agent.FreshStructuredCallRequest
	providerErr                  error
	routeKinds                   []conversation.ConversationRouteDecisionKind
	routeRequests                []agent.FreshStructuredCallRequest
	invalidRouteOutputsRemaining int
}

func (*statusServiceAgentRuntime) ResolveInvocation(
	_ context.Context,
	request agent.Invocation,
) (agent.ResolvedInvocation, error) {
	return agent.ResolvedInvocation{
		Requested:       request,
		Model:           request.Model,
		ReasoningEffort: request.ReasoningEffort,
		ServiceTier:     request.ServiceTier,
		PermissionMode:  request.PermissionMode,
		ApprovalMode:    request.ApprovalMode,
	}, nil
}

func (runtime *statusServiceAgentRuntime) RunFreshStructuredCall(
	_ context.Context,
	request agent.FreshStructuredCallRequest,
) (agent.FreshStructuredCallResult, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.lastRequest = request
	if runtime.providerErr != nil {
		return agent.FreshStructuredCallResult{}, runtime.providerErr
	}
	var envelope struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(request.Input, &envelope); err != nil {
		return agent.FreshStructuredCallResult{}, err
	}
	if envelope.Kind == ConversationRouteContextKind {
		return runtime.runConversationRouteCall(request)
	}
	var contextBundle StatusContextBundle
	if err := json.Unmarshal(request.Input, &contextBundle); err != nil {
		return agent.FreshStructuredCallResult{}, err
	}
	output, err := json.Marshal(map[string]any{
		"kind":                  string(CallOutputStatusReply),
		"sourceThroughSequence": contextBundle.SourceThroughSequence,
		"statusReply":           "The primary agent turn is still running.",
	})
	if err != nil {
		return agent.FreshStructuredCallResult{}, err
	}
	return agent.FreshStructuredCallResult{
		ProviderThreadID: "provider-narrator-thread",
		ProviderTurnID:   "provider-narrator-turn",
		Output:           output,
	}, nil
}

func (runtime *statusServiceAgentRuntime) runConversationRouteCall(
	request agent.FreshStructuredCallRequest,
) (agent.FreshStructuredCallResult, error) {
	runtime.routeRequests = append(runtime.routeRequests, request)
	if runtime.invalidRouteOutputsRemaining > 0 {
		runtime.invalidRouteOutputsRemaining--
		return agent.FreshStructuredCallResult{
			ProviderThreadID: "provider-router-thread",
			ProviderTurnID:   "provider-router-turn",
			Output:           json.RawMessage(`{"decision":{"kind":"unsupported"}}`),
		}, nil
	}
	var contextBundle ConversationRouteContextBundle
	if err := json.Unmarshal(request.Input, &contextBundle); err != nil {
		return agent.FreshStructuredCallResult{}, err
	}
	kind := conversation.ConversationRouteDecisionKindQueueParentTurn
	if len(runtime.routeKinds) > 0 {
		kind = runtime.routeKinds[0]
		runtime.routeKinds = runtime.routeKinds[1:]
	}
	text := contextBundle.Input.Input.Text
	if contextBundle.Input.ClarificationReply != nil {
		text = contextBundle.Input.ClarificationReply.Text
	}
	decision := map[string]any{
		"authoredInput":  nil,
		"forkedAtTurnId": nil,
		"kind":           string(kind),
		"proposedTitle":  nil,
		"question":       nil,
	}
	switch kind {
	case conversation.ConversationRouteDecisionKindAnswerAsNarrator:
		decision["question"] = text
	case conversation.ConversationRouteDecisionKindClarify:
		decision["question"] = "Should this update steer the active turn or wait in the queue?"
	case conversation.ConversationRouteDecisionKindForkConversation:
		decision["authoredInput"] = text
		decision["forkedAtTurnId"] = contextBundle.ValidCompletedForkPoints[0].TurnID
		decision["proposedTitle"] = "Routed durable fork"
	default:
		decision["authoredInput"] = text
	}
	encoded, err := json.Marshal(map[string]any{"decision": decision})
	if err != nil {
		return agent.FreshStructuredCallResult{}, err
	}
	return agent.FreshStructuredCallResult{
		ProviderThreadID: "provider-router-thread",
		ProviderTurnID:   "provider-router-turn",
		Output:           encoded,
	}, nil
}
