package master

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/conversationindex"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

func TestMasterPersistsOneSessionForTextAndVoiceAndStreamsReplies(t *testing.T) {
	store, service, caller := newMasterTestService(t, nil)
	subscription, err := service.SubscribeEvents(0)
	if err != nil {
		t.Fatalf("SubscribeEvents: %v", err)
	}
	defer subscription.Unsubscribe()

	first, err := service.Submit(context.Background(), masterTestInput("input_text", InputModalityText, "Which topic should I open?"))
	if err != nil {
		t.Fatalf("Submit text: %v", err)
	}
	if _, ok := first.Interaction.Decision.(ClarifyDecision); !ok {
		t.Fatalf("text decision = %T", first.Interaction.Decision)
	}
	if len(first.Intents) != 1 {
		t.Fatalf("text intents = %d", len(first.Intents))
	}

	second, err := service.Submit(context.Background(), masterTestInput("input_voice", InputModalityVoice, "There are no topics yet."))
	if err != nil {
		t.Fatalf("Submit voice: %v", err)
	}
	if first.Interaction.ResolvedInvocation.ProviderReferences.ThreadID == nil ||
		second.Interaction.ResolvedInvocation.ProviderReferences.ThreadID == nil ||
		*first.Interaction.ResolvedInvocation.ProviderReferences.ThreadID != *second.Interaction.ResolvedInvocation.ProviderReferences.ThreadID {
		t.Fatal("text and voice submissions did not share the durable master thread")
	}
	if got := caller.providerThreadInputs(); len(got) != 2 || got[0] != "" || got[1] != "master_provider_thread" {
		t.Fatalf("caller provider thread inputs = %v", got)
	}

	state, err := service.ReadState(context.Background())
	if err != nil {
		t.Fatalf("ReadState: %v", err)
	}
	if state.Session == nil || len(state.Interactions) != 2 || state.EventCursor != 8 {
		t.Fatalf("master state = %+v", state)
	}
	if records, err := store.ListMasterRouteDecisions(context.Background(), state.Session.ID, 10); err != nil || len(records) != 2 {
		t.Fatalf("route records = %d, %v", len(records), err)
	}

	events := collectMasterEvents(t, subscription.Events(), 8)
	if events[0].Payload.eventType() != EventTypeSessionUpdated || events[3].Payload.eventType() != EventTypeReply {
		t.Fatalf("master event order = %v, %v", events[0].Payload.eventType(), events[3].Payload.eventType())
	}
}

func TestMasterRouteDecoderRejectsUnknownFieldsAndAmbiguousCreation(t *testing.T) {
	if _, err := decodeRouteDecision(`{"type":"clarify","question":"Which topic?","unexpected":true}`); err == nil {
		t.Fatal("decodeRouteDecision accepted an unknown field")
	}
	rank := 0.1
	candidates := []conversationindex.TopicCandidate{{
		Card: conversationindex.TopicCard{
			ConversationID: "conversation_existing", WorkspaceID: "workspace_test",
			WorkspaceName: "Test", Title: "Existing topic", Status: conversation.ConversationStatusIdle,
			RecentUserRequests: []string{}, RecentFinalSummaries: []string{}, OpenPaneIDs: []string{},
		},
		LexicalRank: &rank, RecencyRank: 1,
	}}
	_, service, _ := newMasterTestService(t, candidates)
	_, err := service.Submit(context.Background(), masterTestInput("input_create", InputModalityText, "Create another topic"))
	if err == nil || !contains(err.Error(), "clarification is required") {
		t.Fatalf("ambiguous create error = %v", err)
	}
}

func TestRestrictedMasterSinkRejectsProviderActivity(t *testing.T) {
	sink := &masterCallSink{}
	err := sink.HandleAgentEvent(agent.Event{Kind: agent.EventKindActivityStarted})
	if err == nil {
		t.Fatal("master sink accepted a provider activity")
	}
}

type masterTestCaller struct {
	mu      sync.Mutex
	threads []string
	calls   int
	create  bool
}

func (caller *masterTestCaller) Call(_ context.Context, request ModelCallRequest) (ModelCallResult, error) {
	caller.mu.Lock()
	thread := ""
	if request.ProviderThreadID != nil {
		thread = *request.ProviderThreadID
	}
	caller.threads = append(caller.threads, thread)
	caller.calls++
	call := caller.calls
	caller.mu.Unlock()
	text := `{"type":"clarify","question":"Which topic do you mean?"}`
	if caller.create {
		text = `{"type":"create_conversation","workspaceId":"workspace_test","initialInput":{"text":"Do the work."},"proposedTitle":"New topic"}`
	} else if call == 2 {
		text = `{"type":"answer_global","text":"There are no topics yet."}`
	}
	return ModelCallResult{
		Text: text,
		ResolvedInvocation: agent.ResolvedInvocation{
			Model: conversation.DefaultMasterModelID, ReasoningEffort: conversation.ReasoningEffortMedium,
			PermissionMode: agent.PermissionModeReadOnly, ApprovalMode: agent.ApprovalModeNever,
		},
		ProviderThreadID: "master_provider_thread", ProviderTurnID: fmt.Sprintf("master_provider_turn_%d", call),
	}, nil
}

func (caller *masterTestCaller) providerThreadInputs() []string {
	caller.mu.Lock()
	defer caller.mu.Unlock()
	return append([]string{}, caller.threads...)
}

type masterTestIndex struct {
	candidates []conversationindex.TopicCandidate
}

func (index masterTestIndex) Search(context.Context, conversationindex.SearchRequest) ([]conversationindex.TopicCandidate, error) {
	return append([]conversationindex.TopicCandidate{}, index.candidates...), nil
}

func (index masterTestIndex) List(context.Context, conversationindex.ListRequest) (conversationindex.TopicCardPage, error) {
	return conversationindex.TopicCardPage{Cards: []conversationindex.TopicCard{}}, nil
}

type masterTestCommands struct{}

func (masterTestCommands) Create(context.Context, conversation.CreateConversationRequest) (conversation.ConversationSnapshot, error) {
	return conversation.ConversationSnapshot{}, errors.New("unexpected create")
}
func (masterTestCommands) Send(context.Context, conversation.SendConversationInputRequest) (conversation.ConversationSnapshot, error) {
	return conversation.ConversationSnapshot{}, errors.New("unexpected send")
}
func (masterTestCommands) ReadSnapshot(context.Context, string, string) (conversation.ConversationSnapshot, error) {
	return conversation.ConversationSnapshot{}, errors.New("unexpected read")
}
func (masterTestCommands) Fork(context.Context, conversation.ForkConversationRequest) (conversation.ConversationSnapshot, error) {
	return conversation.ConversationSnapshot{}, errors.New("unexpected fork")
}
func (masterTestCommands) CreateSide(context.Context, conversation.CreateSideConversationRequest) (conversation.SideConversation, error) {
	return conversation.SideConversation{}, errors.New("unexpected side")
}

type masterTestNarrator struct{}

func (masterTestNarrator) RequestStatus(context.Context, string, string) (conversation.NarrationEvent, error) {
	return conversation.NarrationEvent{}, errors.New("unexpected narrator call")
}

type masterTestWorkspaces struct{ root string }

func (workspaces masterTestWorkspaces) Session() workspacesession.WorkspaceSession {
	return workspacesession.WorkspaceSession{
		SelectedWorkspaceID: "workspace_test",
		ActiveWorkspaces: []workspace.WorkspaceSummary{{
			ID: "workspace_test", RootPath: workspaces.root, DisplayName: "Test",
			LastOpenedAt: "2026-07-11T20:00:00Z",
		}},
		RecentWorkspaces: []workspace.WorkspaceSummary{},
	}
}

func (workspaces masterTestWorkspaces) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	if id != "workspace_test" {
		return workspace.WorkspaceSummary{}, fmt.Errorf("workspace not found: %s", id)
	}
	return workspaces.Session().ActiveWorkspaces[0], nil
}

func newMasterTestService(t *testing.T, candidates []conversationindex.TopicCandidate) (*conversation.Store, *Service, *masterTestCaller) {
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
	caller := &masterTestCaller{create: len(candidates) > 0}
	root := t.TempDir()
	service, err := NewService(Config{
		Store: store, Index: masterTestIndex{candidates: candidates},
		Conversations: masterTestCommands{}, Narrator: masterTestNarrator{},
		Workspaces: masterTestWorkspaces{root: root}, Caller: caller, RuntimeRoot: root,
		Now:   func() time.Time { return time.Date(2026, 7, 11, 20, 0, caller.calls+1, 0, time.UTC) },
		NewID: masterTestIDGenerator(),
	})
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	return store, service, caller
}

func masterTestInput(id string, modality MasterInputModality, text string) Input {
	return Input{ID: id, Text: text, Modality: modality, SubmittedAt: "2026-07-11T20:00:00Z"}
}

func masterTestIDGenerator() func(string) (string, error) {
	counts := map[string]int{}
	return func(prefix string) (string, error) {
		counts[prefix]++
		return fmt.Sprintf("%s_%d", prefix, counts[prefix]), nil
	}
}

func collectMasterEvents(t *testing.T, events <-chan Event, count int) []Event {
	t.Helper()
	result := make([]Event, 0, count)
	deadline := time.NewTimer(3 * time.Second)
	defer deadline.Stop()
	for len(result) < count {
		select {
		case event := <-events:
			result = append(result, event)
		case <-deadline.C:
			t.Fatalf("timed out after %d master events", len(result))
		}
	}
	return result
}

func contains(value string, fragment string) bool {
	return strings.Contains(value, fragment)
}
