package httpapi

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/conversation"
	"setta/internal/narration"
	"setta/internal/speech"
	"setta/internal/workspaceui/conversationpalette"
)

func TestReadConversationSnapshotUsesTypedServiceBoundary(t *testing.T) {
	service := newHTTPTestConversationService(t)
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationService: service,
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
	})

	response := postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/snapshot/read",
		ReadConversationSnapshotRequest{WorkspaceID: "workspace-api", ConversationID: "conversation-api"},
		http.StatusOK,
	)
	if response.Conversation.ID != "conversation-api" || response.EventCursor.StreamID != "conversation:conversation-api" {
		t.Fatalf("snapshot response = %+v", response)
	}
	if service.readWorkspaceID != "workspace-api" || service.readConversationID != "conversation-api" {
		t.Fatalf("snapshot service request = %q/%q", service.readWorkspaceID, service.readConversationID)
	}
}

func TestTopicConversationCommandsUseTypedServiceBoundary(t *testing.T) {
	service := newHTTPTestConversationService(t)
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationService:   service,
		NarratorStatusService: service,
		Metadata:              BackendMetadata{Name: BackendName, Version: "test"},
	})

	created := postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/create",
		CreateTopicConversationRequest{WorkspaceID: "workspace-api", Title: "Created topic"},
		http.StatusOK,
	)
	if service.command != "create" || created.Conversation.Title != "Created topic" {
		t.Fatalf("create command = %q snapshot = %+v", service.command, created.Conversation)
	}

	forked := postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/forks/create",
		ForkTopicConversationRequest{
			WorkspaceID:          "workspace-api",
			ParentConversationID: "conversation-api",
			ForkedAtTurnID:       "turn-api",
			Title:                "Forked topic",
		},
		http.StatusOK,
	)
	assertForkTopicCommand(t, service, forked)

	postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/sides/create",
		CreateSideConversationRequest{
			WorkspaceID:          "workspace-api",
			ParentConversationID: "conversation-api",
			ParentPaneID:         "pane-api",
		},
		http.StatusOK,
	)
	if service.command != "create_side" || service.commandParentPaneID != "pane-api" {
		t.Fatalf("side command = %q pane = %q", service.command, service.commandParentPaneID)
	}

	for _, command := range []struct {
		name string
		path string
	}{
		{name: "send", path: "/conversations/turns/send"},
		{name: "queue", path: "/conversations/turns/queue"},
		{name: "steer", path: "/conversations/turns/steer"},
	} {
		postJSON[conversation.ConversationSnapshot](
			t,
			handler,
			command.path,
			SendTopicConversationTurnRequest{
				WorkspaceID:    "workspace-api",
				ConversationID: "conversation-api",
				Text:           command.name + " text",
			},
			http.StatusOK,
		)
		if service.command != command.name || service.commandText != command.name+" text" {
			t.Fatalf("%s service command = %q text = %q", command.name, service.command, service.commandText)
		}
	}

	postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/turns/stop",
		StopTopicConversationTurnRequest{WorkspaceID: "workspace-api", ConversationID: "conversation-api"},
		http.StatusOK,
	)
	if service.command != "stop" {
		t.Fatalf("stop service command = %q", service.command)
	}

	approval := conversation.ConversationApprovalResponse{
		ApprovalID: "approval-api",
		Decision:   conversation.TrajectoryApprovalDecisionApproved,
		Answers:    []conversation.ConversationApprovalAnswer{},
	}
	postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/approvals/submit",
		SubmitTopicConversationApprovalRequest{
			WorkspaceID:    "workspace-api",
			ConversationID: "conversation-api",
			Response:       approval,
		},
		http.StatusOK,
	)
	if service.command != "approval" || service.approval.ApprovalID != approval.ApprovalID {
		t.Fatalf("approval service command = %q response = %+v", service.command, service.approval)
	}
	if service.commandWorkspaceID != "workspace-api" || service.commandConversationID != "conversation-api" {
		t.Fatalf("last command scope = %q/%q", service.commandWorkspaceID, service.commandConversationID)
	}

	postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/narrator/status",
		AskTopicConversationNarratorStatusRequest{
			WorkspaceID:    "workspace-api",
			ConversationID: "conversation-api",
			Question:       "What is happening now?",
		},
		http.StatusOK,
	)
	if service.command != "status" || service.commandText != "What is happening now?" {
		t.Fatalf("status service command = %q question = %q", service.command, service.commandText)
	}

	alloy := speech.SpeechVoiceAlloy
	profile := postJSON[conversation.ConversationPresentationProfile](
		t,
		handler,
		"/conversations/presentation/narrator-voice/update",
		UpdateTopicConversationNarratorVoiceRequest{
			WorkspaceID:    "workspace-api",
			ConversationID: "conversation-api",
			Selection: speech.VoiceSelectionRequest{
				Selection:        speech.VoiceSelectionExact,
				RequestedVoiceID: &alloy,
			},
		},
		http.StatusOK,
	)
	if service.command != "update_narrator_voice" ||
		service.voiceSelection.RequestedVoiceID == nil ||
		*service.voiceSelection.RequestedVoiceID != alloy ||
		profile.ResolvedNarratorVoiceID == nil {
		t.Fatalf("narrator voice command=%q selection=%+v profile=%+v", service.command, service.voiceSelection, profile)
	}
}

func assertForkTopicCommand(
	t *testing.T,
	service *httpTestConversationService,
	forked conversation.ConversationSnapshot,
) {
	t.Helper()
	if service.command != "fork" ||
		service.commandForkedAtTurnID != "turn-api" ||
		service.commandTitle != "Forked topic" ||
		forked.Branch == nil ||
		forked.Branch.ParentConversationID != "conversation-api" {
		t.Fatalf("fork command = %q snapshot = %+v", service.command, forked)
	}
}

func TestTopicConversationNarratorVoiceMapsUnavailableExactSelection(t *testing.T) {
	service := newHTTPTestConversationService(t)
	missing := speech.SpeechVoiceID("retired")
	service.voiceSelectionErr = &speech.Error{
		Code:    speech.ErrorVoiceUnavailable,
		Message: "Speech voice retired is unavailable.",
	}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationService: service,
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
	})
	response := postJSON[ErrorResponse](
		t,
		handler,
		"/conversations/presentation/narrator-voice/update",
		UpdateTopicConversationNarratorVoiceRequest{
			WorkspaceID:    "workspace-api",
			ConversationID: "conversation-api",
			Selection: speech.VoiceSelectionRequest{
				Selection:        speech.VoiceSelectionExact,
				RequestedVoiceID: &missing,
			},
		},
		http.StatusUnprocessableEntity,
	)
	if response.Error.Code != string(speech.ErrorVoiceUnavailable) {
		t.Fatalf("narrator voice error = %+v", response.Error)
	}
}

func TestAskNarratorStatusRejectsInvalidQuestionBeforeService(t *testing.T) {
	service := newHTTPTestConversationService(t)
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		NarratorStatusService: service,
		Metadata:              BackendMetadata{Name: BackendName, Version: "test"},
	})

	response := postJSON[ErrorResponse](
		t,
		handler,
		"/conversations/narrator/status",
		AskTopicConversationNarratorStatusRequest{
			WorkspaceID:    "workspace-api",
			ConversationID: "conversation-api",
			Question:       " status with whitespace ",
		},
		http.StatusBadRequest,
	)
	if response.Error.Code != "invalid_topic_conversation_narrator_status_request" {
		t.Fatalf("narrator status error code = %q", response.Error.Code)
	}
	if service.statusCalled {
		t.Fatal("invalid narrator status request reached service")
	}
}

func TestAskNarratorStatusReturnsTypedDegradation(t *testing.T) {
	service := newHTTPTestConversationService(t)
	service.statusErr = &narration.DegradedError{
		RequestID:  "narrator-status-request",
		Generation: 1,
		Degradation: conversation.NarratorDegradation{
			Code:                "provider_unavailable",
			Message:             "Narration is temporarily unavailable.",
			Retryable:           true,
			DiagnosticReference: "narrator-diagnostic",
			DegradedAt:          httpConversationTestTime,
		},
	}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		NarratorStatusService: service,
		Metadata:              BackendMetadata{Name: BackendName, Version: "test"},
	})

	response := postJSON[ErrorResponse](
		t,
		handler,
		"/conversations/narrator/status",
		AskTopicConversationNarratorStatusRequest{
			WorkspaceID:    "workspace-api",
			ConversationID: "conversation-api",
			Question:       "What is happening?",
		},
		http.StatusServiceUnavailable,
	)
	if response.Error.Code != "narrator_status_unavailable" ||
		!strings.Contains(response.Error.Message, "narrator-diagnostic") {
		t.Fatalf("narrator degradation response = %+v", response.Error)
	}
}

func TestReadConversationSnapshotRejectsMissingIdentityBeforeService(t *testing.T) {
	service := newHTTPTestConversationService(t)
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationService: service,
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
	})

	response := postJSON[ErrorResponse](
		t,
		handler,
		"/conversations/snapshot/read",
		ReadConversationSnapshotRequest{WorkspaceID: "workspace-api"},
		http.StatusBadRequest,
	)
	if response.Error.Code != "invalid_conversation_snapshot_request" {
		t.Fatalf("error code = %q, want invalid_conversation_snapshot_request", response.Error.Code)
	}
	if service.readWorkspaceID != "" || service.readConversationID != "" {
		t.Fatalf("invalid snapshot reached service: %q/%q", service.readWorkspaceID, service.readConversationID)
	}
}

func TestListTopicConversationsUsesTypedPaginatedServiceBoundary(t *testing.T) {
	service := newHTTPTestConversationService(t)
	service.navigatorPage = conversation.NavigatorPage{
		Items: []conversation.NavigatorItem{{
			Conversation:        service.snapshot.Conversation,
			PresentationProfile: service.snapshot.PresentationProfile,
		}},
	}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationNavigatorService: service,
		Metadata:                     BackendMetadata{Name: BackendName, Version: "test"},
	})
	cursor := &conversation.NavigatorCursor{
		UpdatedAt:      "2026-07-11T19:59:00Z",
		ConversationID: "conversation-before",
	}

	response := postJSON[conversation.NavigatorPage](
		t,
		handler,
		"/conversations/navigator/list",
		ListTopicConversationsRequest{
			WorkspaceID: "workspace-api",
			Query:       "contracts",
			Cursor:      cursor,
			Limit:       40,
		},
		http.StatusOK,
	)
	if len(response.Items) != 1 || response.Items[0].Conversation.ID != "conversation-api" {
		t.Fatalf("navigator response = %+v", response)
	}
	if service.navigatorWorkspaceID != "workspace-api" || service.navigatorQuery != "contracts" ||
		service.navigatorLimit != 40 || service.navigatorCursor == nil ||
		service.navigatorCursor.ConversationID != cursor.ConversationID {
		t.Fatalf("navigator service request = workspace %q query %q cursor %+v limit %d", service.navigatorWorkspaceID, service.navigatorQuery, service.navigatorCursor, service.navigatorLimit)
	}
}

func TestListTopicConversationsRejectsInvalidLimitBeforeService(t *testing.T) {
	service := newHTTPTestConversationService(t)
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationNavigatorService: service,
		Metadata:                     BackendMetadata{Name: BackendName, Version: "test"},
	})

	response := postJSON[ErrorResponse](
		t,
		handler,
		"/conversations/navigator/list",
		ListTopicConversationsRequest{WorkspaceID: "workspace-api", Limit: 0},
		http.StatusBadRequest,
	)
	if response.Error.Code != "invalid_conversation_navigator_request" {
		t.Fatalf("navigator error code = %q", response.Error.Code)
	}
	if service.navigatorCalled {
		t.Fatal("invalid navigator request reached service")
	}
}

func TestConversationEventStreamUsesConversationScopedCursorAndTypedEvent(t *testing.T) {
	service := newHTTPTestConversationService(t)
	streamID, err := conversation.ConversationStreamID("conversation-api")
	if err != nil {
		t.Fatalf("stream id: %v", err)
	}
	eventID, err := conversation.ConversationEventID(streamID, 3)
	if err != nil {
		t.Fatalf("event id: %v", err)
	}
	service.events = []conversation.ConversationEvent{{
		SchemaVersion:  conversation.ConversationContractSchemaVersion,
		StreamID:       streamID,
		Sequence:       3,
		EventID:        eventID,
		EmittedAt:      httpConversationTestTime,
		WorkspaceID:    "workspace-api",
		ConversationID: "conversation-api",
		Payload: conversation.ConversationUpdatedEventPayload{
			Type:         conversation.ConversationEventTypeConversationUpdated,
			Conversation: service.snapshot.Conversation,
		},
	}}
	server := httptest.NewServer(newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationService: service,
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
	}))
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodGet,
		server.URL+"/conversations/events?workspaceId=workspace-api&conversationId=conversation-api",
		nil,
	)
	if err != nil {
		t.Fatalf("create event request: %v", err)
	}
	request.Header.Set("Last-Event-ID", streamID+":2")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("read event stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("event stream status = %d, want 200", response.StatusCode)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read event stream body: %v", err)
	}
	text := string(body)
	if !strings.Contains(text, "id: "+eventID) ||
		!strings.Contains(text, "event: conversation.updated") ||
		!strings.Contains(text, `"type":"conversation.updated"`) {
		t.Fatalf("event stream body = %q", text)
	}
	if service.subscribeCursor != (conversation.ConversationEventCursor{StreamID: streamID, Sequence: 2}) {
		t.Fatalf("subscribe cursor = %+v", service.subscribeCursor)
	}
	if service.subscribeWorkspaceID != "workspace-api" || service.subscribeConversationID != "conversation-api" {
		t.Fatalf("event service request = %q/%q", service.subscribeWorkspaceID, service.subscribeConversationID)
	}
}

func TestConversationEventStreamRejectsAnotherConversationCursor(t *testing.T) {
	service := newHTTPTestConversationService(t)
	server := httptest.NewServer(newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationService: service,
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
	}))
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodGet,
		server.URL+"/conversations/events?workspaceId=workspace-api&conversationId=conversation-api",
		nil,
	)
	if err != nil {
		t.Fatalf("create event request: %v", err)
	}
	request.Header.Set("Last-Event-ID", "conversation:other:2")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("read event response: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("event stream status = %d, want 400", response.StatusCode)
	}
	if service.subscribed {
		t.Fatal("invalid cross-conversation cursor reached service")
	}
}

const httpConversationTestTime = "2026-07-11T20:00:00Z"

type httpTestConversationService struct {
	snapshot                conversation.ConversationSnapshot
	events                  []conversation.ConversationEvent
	readWorkspaceID         string
	readConversationID      string
	subscribeCursor         conversation.ConversationEventCursor
	subscribeWorkspaceID    string
	subscribeConversationID string
	subscribed              bool
	navigatorPage           conversation.NavigatorPage
	navigatorWorkspaceID    string
	navigatorQuery          string
	navigatorCursor         *conversation.NavigatorCursor
	navigatorLimit          int
	navigatorCalled         bool
	command                 string
	commandWorkspaceID      string
	commandConversationID   string
	commandForkedAtTurnID   string
	commandParentPaneID     string
	commandText             string
	commandTitle            string
	approval                conversation.ConversationApprovalResponse
	statusCalled            bool
	statusErr               error
	voiceSelection          speech.VoiceSelectionRequest
	voiceSelectionErr       error
}

func (service *httpTestConversationService) AskStatus(
	_ context.Context,
	workspaceID string,
	conversationID string,
	question string,
) (conversation.ConversationSnapshot, error) {
	service.statusCalled = true
	service.recordCommand("status", workspaceID, conversationID, question)
	return service.snapshot, service.statusErr
}

func (service *httpTestConversationService) CreateTopic(
	_ context.Context,
	workspaceID string,
	title string,
) (conversation.ConversationSnapshot, error) {
	service.command = "create"
	service.commandWorkspaceID = workspaceID
	service.snapshot.Conversation.WorkspaceID = workspaceID
	service.snapshot.Conversation.Title = title
	return service.snapshot, nil
}

func (service *httpTestConversationService) ForkTopic(
	_ context.Context,
	workspaceID string,
	parentConversationID string,
	forkedAtTurnID string,
	title string,
) (conversation.ConversationSnapshot, error) {
	service.recordCommand("fork", workspaceID, parentConversationID, "")
	service.commandForkedAtTurnID = forkedAtTurnID
	service.commandTitle = title
	forked := service.snapshot
	forked.Conversation.ID = "conversation-fork-api"
	forked.Conversation.Title = title
	forked.Conversation.TopicDescriptor = title
	forked.NarratorState.ConversationID = forked.Conversation.ID
	forked.NarratorState.TopicDescriptor = title
	forked.PresentationProfile.ConversationID = forked.Conversation.ID
	forked.Branch = &conversation.ConversationBranch{
		ChildConversationID:      forked.Conversation.ID,
		ParentConversationID:     parentConversationID,
		Kind:                     conversation.BranchKindFork,
		ForkedAtTurnID:           forkedAtTurnID,
		SourceTrajectorySequence: 0,
		ProviderMetadata:         map[string]string{"decisionSource": "explicit"},
		CreatedAt:                httpConversationTestTime,
	}
	forked.EventCursor.StreamID = "conversation:" + forked.Conversation.ID
	return forked, nil
}

func (service *httpTestConversationService) CreateSideConversation(
	_ context.Context,
	workspaceID string,
	parentConversationID string,
	parentPaneID string,
) (conversation.ConversationSnapshot, error) {
	service.recordCommand("create_side", workspaceID, parentConversationID, "")
	service.commandParentPaneID = parentPaneID
	return service.snapshot, nil
}

func (service *httpTestConversationService) UpdateNarratorVoiceSelection(
	_ context.Context,
	workspaceID string,
	conversationID string,
	selection speech.VoiceSelectionRequest,
) (conversation.ConversationPresentationProfile, error) {
	service.recordCommand("update_narrator_voice", workspaceID, conversationID, "")
	service.voiceSelection = selection
	return service.snapshot.PresentationProfile, service.voiceSelectionErr
}

func (service *httpTestConversationService) SendTurn(
	_ context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (conversation.ConversationSnapshot, error) {
	service.recordCommand("send", workspaceID, conversationID, text)
	return service.snapshot, nil
}

func (service *httpTestConversationService) QueueTurn(
	_ context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (conversation.ConversationSnapshot, error) {
	service.recordCommand("queue", workspaceID, conversationID, text)
	return service.snapshot, nil
}

func (service *httpTestConversationService) SteerTurn(
	_ context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (conversation.ConversationSnapshot, error) {
	service.recordCommand("steer", workspaceID, conversationID, text)
	return service.snapshot, nil
}

func (service *httpTestConversationService) StopTurn(
	_ context.Context,
	workspaceID string,
	conversationID string,
) (conversation.ConversationSnapshot, error) {
	service.recordCommand("stop", workspaceID, conversationID, "")
	return service.snapshot, nil
}

func (service *httpTestConversationService) SubmitApproval(
	_ context.Context,
	workspaceID string,
	conversationID string,
	response conversation.ConversationApprovalResponse,
) (conversation.ConversationSnapshot, error) {
	service.recordCommand("approval", workspaceID, conversationID, "")
	service.approval = response
	return service.snapshot, nil
}

func (service *httpTestConversationService) recordCommand(
	command string,
	workspaceID string,
	conversationID string,
	text string,
) {
	service.command = command
	service.commandWorkspaceID = workspaceID
	service.commandConversationID = conversationID
	service.commandText = text
}

func newHTTPTestConversationService(t *testing.T) *httpTestConversationService {
	t.Helper()
	streamID, err := conversation.ConversationStreamID("conversation-api")
	if err != nil {
		t.Fatalf("stream id: %v", err)
	}
	return &httpTestConversationService{snapshot: conversation.ConversationSnapshot{
		SchemaVersion: conversation.ConversationContractSchemaVersion,
		Conversation: conversation.TopicConversation{
			ID:          "conversation-api",
			WorkspaceID: "workspace-api",
			Title:       "HTTP conversation contracts",
			Status:      conversation.ConversationStatusIdle,
			CreatedAt:   httpConversationTestTime,
			UpdatedAt:   httpConversationTestTime,
		},
		Turns:                conversation.ConversationTurnWindow{Turns: []conversation.ConversationTurn{}},
		Queue:                []conversation.QueuedConversationTurn{},
		Trajectory:           conversation.ConversationTrajectoryWindow{Events: []conversation.TrajectoryEvent{}},
		Artifacts:            conversation.ConversationArtifactWindow{Artifacts: []conversation.Artifact{}},
		NarratorState:        conversation.NarratorState{ConversationID: "conversation-api", Status: conversation.NarratorStatusReady, UpdatedAt: httpConversationTestTime},
		Narration:            conversation.ConversationNarrationWindow{Events: []conversation.NarrationEvent{}},
		RoleProfileOverrides: []conversation.RoleProfileOverride{},
		PresentationProfile: conversation.ConversationPresentationProfile{
			ConversationID:          "conversation-api",
			PaletteSelection:        conversation.PresentationSelectionAutoDistinct,
			ResolvedPaletteID:       conversationpalette.ConversationPaletteSky,
			NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
			ResolvedNarratorVoiceID: voiceIDPointerForHTTPTest(speech.SpeechVoiceAlloy),
			NarratorSpeechEnabled:   true,
			UpdatedAt:               httpConversationTestTime,
		},
		SideConversations: []conversation.SideConversation{},
		EventCursor:       conversation.ConversationEventCursor{StreamID: streamID},
	}}
}

func voiceIDPointerForHTTPTest(value speech.SpeechVoiceID) *speech.SpeechVoiceID {
	return &value
}

func (service *httpTestConversationService) ReadSnapshot(
	_ context.Context,
	workspaceID string,
	conversationID string,
) (conversation.ConversationSnapshot, error) {
	service.readWorkspaceID = workspaceID
	service.readConversationID = conversationID
	return service.snapshot, nil
}

func (service *httpTestConversationService) ListNavigatorPage(
	_ context.Context,
	workspaceID string,
	query string,
	cursor *conversation.NavigatorCursor,
	limit int,
) (conversation.NavigatorPage, error) {
	service.navigatorCalled = true
	service.navigatorWorkspaceID = workspaceID
	service.navigatorQuery = query
	service.navigatorCursor = cursor
	service.navigatorLimit = limit
	return service.navigatorPage, nil
}

func (service *httpTestConversationService) SubscribeEvents(
	cursor conversation.ConversationEventCursor,
	workspaceID string,
	conversationID string,
) (conversation.ConversationEventSubscription, error) {
	service.subscribed = true
	service.subscribeCursor = cursor
	service.subscribeWorkspaceID = workspaceID
	service.subscribeConversationID = conversationID
	channel := make(chan conversation.ConversationEvent, len(service.events))
	for _, event := range service.events {
		channel <- event
	}
	close(channel)
	return &httpTestConversationSubscription{events: channel}, nil
}

type httpTestConversationSubscription struct {
	events <-chan conversation.ConversationEvent
}

func (subscription *httpTestConversationSubscription) Events() <-chan conversation.ConversationEvent {
	return subscription.events
}

func (subscription *httpTestConversationSubscription) Unsubscribe() {}
