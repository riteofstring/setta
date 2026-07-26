package httpapi

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/conversation"
	"setta/internal/conversation/conversationpalette"
	"setta/internal/speech"
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
		ReadConversationSnapshotRequest{
			WorkspaceID:    httpTestStringPointer("workspace-api"),
			ConversationID: "conversation-api",
		},
		http.StatusOK,
	)
	if response.Conversation.ID != "conversation-api" || response.EventCursor.StreamID != "conversation:conversation-api" {
		t.Fatalf("snapshot response = %+v", response)
	}
	if service.readWorkspaceID != "workspace-api" || service.readConversationID != "conversation-api" {
		t.Fatalf("snapshot service request = %q/%q", service.readWorkspaceID, service.readConversationID)
	}
}

func TestReadConversationArtifactUsesTypedServiceBoundary(t *testing.T) {
	service := newHTTPTestConversationService(t)
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationService: service,
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
	})

	workspaceID := "workspace-api"
	response := postJSON[conversation.Artifact](
		t,
		handler,
		"/conversations/artifacts/read",
		ReadConversationArtifactRequest{
			WorkspaceID:    &workspaceID,
			ConversationID: "conversation-api",
			ArtifactID:     "artifact-api",
		},
		http.StatusOK,
	)
	if response.ID != "artifact-api" || response.Document.Source != httpConversationTestArtifactSource {
		t.Fatalf("artifact response = %+v", response)
	}
	if service.readWorkspaceID != "workspace-api" ||
		service.readConversationID != "conversation-api" ||
		service.readArtifactID != "artifact-api" {
		t.Fatalf("artifact service request = %q/%q/%q", service.readWorkspaceID, service.readConversationID, service.readArtifactID)
	}

	// An artifact published by a conversation with no folder is addressed by the
	// conversation that published it, so the rail can open it like any other.
	unbound := postJSON[conversation.Artifact](
		t,
		handler,
		"/conversations/artifacts/read",
		ReadConversationArtifactRequest{
			WorkspaceID:    nil,
			ConversationID: "conversation-unbound",
			ArtifactID:     "artifact-unbound",
		},
		http.StatusOK,
	)
	if unbound.ID != "artifact-unbound" || unbound.Document.Source != httpConversationTestArtifactSource {
		t.Fatalf("unbound artifact response = %+v", unbound)
	}
	if service.readWorkspaceID != "" ||
		service.readConversationID != "conversation-unbound" ||
		service.readArtifactID != "artifact-unbound" {
		t.Fatalf("unbound artifact service request = %q/%q/%q", service.readWorkspaceID, service.readConversationID, service.readArtifactID)
	}
}

func TestTopicConversationCommandsUseTypedServiceBoundary(t *testing.T) {
	service := newHTTPTestConversationService(t)
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationService: service,
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
	})

	created := postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/create",
		CreateTopicConversationRequest{WorkspaceID: httpTestStringPointer("workspace-api"), Title: "Created topic"},
		http.StatusOK,
	)
	if service.command != "create" || created.Conversation.Title != "Created topic" {
		t.Fatalf("create command = %q snapshot = %+v", service.command, created.Conversation)
	}

	archived := postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/archive",
		ArchiveTopicConversationRequest{
			WorkspaceID:    "workspace-api",
			ConversationID: "conversation-api",
		},
		http.StatusOK,
	)
	if service.command != "archive" || archived.Conversation.ArchivedAt == nil {
		t.Fatalf("archive command = %q snapshot = %+v", service.command, archived.Conversation)
	}

	assertBindFolderConversationCommand(t, handler, service)
	assertSideConversationCommands(t, handler, service)

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

}

func assertBindFolderConversationCommand(t *testing.T, handler http.Handler, service *httpTestConversationService) {
	t.Helper()
	bound := postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/resources/folder/bind",
		BindTopicConversationFolderRequest{
			WorkspaceID:    "workspace-api",
			ConversationID: "conversation-api",
		},
		http.StatusOK,
	)
	if service.command != "bind_folder" ||
		bound.Conversation.WorkspaceID == nil ||
		*bound.Conversation.WorkspaceID != "workspace-api" {
		t.Fatalf("bind folder command = %q snapshot = %+v", service.command, bound.Conversation)
	}
}

func TestCreateTopicConversationAllowsFolderlessRequest(t *testing.T) {
	service := newHTTPTestConversationService(t)
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationService: service,
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
	})

	created := postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/create",
		CreateTopicConversationRequest{Title: "App-level request"},
		http.StatusOK,
	)
	if service.command != "create" || service.commandWorkspaceID != "" {
		t.Fatalf("folderless create service command = %q workspace %q", service.command, service.commandWorkspaceID)
	}
	if created.Conversation.WorkspaceID != nil || created.Conversation.Title != "App-level request" {
		t.Fatalf("folderless create snapshot = %+v", created.Conversation)
	}
}

func TestConversationResourceRequiredErrorsUseStableAPICode(t *testing.T) {
	service := newHTTPTestConversationService(t)
	service.archiveErr = &conversation.ResourceRequiredError{
		ConversationID: "conversation-api",
		ResourceKind:   "folder",
	}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationService: service,
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
	})

	response := postJSON[ErrorResponse](
		t,
		handler,
		"/conversations/archive",
		ArchiveTopicConversationRequest{
			WorkspaceID:    "workspace-api",
			ConversationID: "conversation-api",
		},
		http.StatusConflict,
	)
	if response.Error.Code != "conversation_resource_required" {
		t.Fatalf("resource required error code = %q", response.Error.Code)
	}
}

func assertSideConversationCommands(t *testing.T, handler http.Handler, service *httpTestConversationService) {
	t.Helper()
	postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/sides/turns/send",
		SendSideConversationTurnRequest{
			WorkspaceID:          "workspace-api",
			ParentConversationID: "conversation-api",
			SideConversationID:   "side-api",
			Text:                 "side question",
		},
		http.StatusOK,
	)
	if service.command != "send_side" || service.commandConversationID != "side-api" || service.commandText != "side question" {
		t.Fatalf("send side command = %q side = %q text = %q", service.command, service.commandConversationID, service.commandText)
	}

	postJSON[conversation.ConversationSnapshot](
		t,
		handler,
		"/conversations/sides/dispose",
		DisposeSideConversationRequest{
			WorkspaceID:          "workspace-api",
			ParentConversationID: "conversation-api",
			SideConversationID:   "side-api",
		},
		http.StatusOK,
	)
	if service.command != "dispose_side" || service.commandConversationID != "side-api" {
		t.Fatalf("dispose side command = %q side = %q", service.command, service.commandConversationID)
	}
}

func TestArchiveTopicConversationMapsActiveWorkToConflict(t *testing.T) {
	service := newHTTPTestConversationService(t)
	service.archiveErr = &conversation.CommandConflictError{
		ConversationID: "conversation-api",
		Reason:         "active conversation work must finish or be stopped before archiving",
	}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationService: service,
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
	})

	response := postJSON[ErrorResponse](
		t,
		handler,
		"/conversations/archive",
		ArchiveTopicConversationRequest{
			WorkspaceID:    "workspace-api",
			ConversationID: "conversation-api",
		},
		http.StatusConflict,
	)
	if response.Error.Code != "archive_topic_conversation_failed" {
		t.Fatalf("archive error = %+v", response.Error)
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
		ReadConversationSnapshotRequest{WorkspaceID: httpTestStringPointer("workspace-api")},
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
		WorkspaceID:    httpTestStringPointer("workspace-api"),
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

const (
	httpConversationTestTime           = "2026-07-11T20:00:00Z"
	httpConversationTestArtifactSource = `root = Document([Table([{key: "metric", label: "Metric"}], [["Rows"]])])`
)

type httpTestConversationService struct {
	snapshot                conversation.ConversationSnapshot
	archiveErr              error
	events                  []conversation.ConversationEvent
	eventsChannel           <-chan conversation.ConversationEvent
	readWorkspaceID         string
	readConversationID      string
	readArtifactID          string
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
	commandText             string
	approval                conversation.ConversationApprovalResponse
}

func (service *httpTestConversationService) CreateTopic(
	_ context.Context,
	workspaceID string,
	title string,
) (conversation.ConversationSnapshot, error) {
	return service.CreateTopicWithOptionalWorkspace(context.Background(), &workspaceID, title)
}

func (service *httpTestConversationService) CreateTopicWithOptionalWorkspace(
	_ context.Context,
	workspaceID *string,
	title string,
) (conversation.ConversationSnapshot, error) {
	service.command = "create"
	if workspaceID != nil {
		service.commandWorkspaceID = *workspaceID
		copied := *workspaceID
		service.snapshot.Conversation.WorkspaceID = &copied
	} else {
		service.commandWorkspaceID = ""
		service.snapshot.Conversation.WorkspaceID = nil
	}
	service.snapshot.Conversation.Title = title
	return service.snapshot, nil
}

func (service *httpTestConversationService) ArchiveTopic(
	_ context.Context,
	workspaceID string,
	conversationID string,
) (conversation.ConversationSnapshot, error) {
	service.recordCommand("archive", workspaceID, conversationID, "")
	if service.archiveErr != nil {
		return conversation.ConversationSnapshot{}, service.archiveErr
	}
	snapshot := service.snapshot
	archivedAt := httpConversationTestTime
	snapshot.Conversation.ArchivedAt = &archivedAt
	return snapshot, nil
}

func (service *httpTestConversationService) BindFolderResource(
	_ context.Context,
	workspaceID string,
	conversationID string,
) (conversation.ConversationSnapshot, error) {
	service.recordCommand("bind_folder", workspaceID, conversationID, "")
	snapshot := service.snapshot
	workspace := workspaceID
	snapshot.Conversation.WorkspaceID = &workspace
	return snapshot, nil
}

func (service *httpTestConversationService) SendSideConversationTurn(
	_ context.Context,
	workspaceID string,
	parentConversationID string,
	sideConversationID string,
	text string,
) (conversation.ConversationSnapshot, error) {
	service.recordCommand("send_side", workspaceID, sideConversationID, text)
	return service.snapshot, nil
}

func (service *httpTestConversationService) DisposeSideConversation(
	_ context.Context,
	workspaceID string,
	parentConversationID string,
	sideConversationID string,
) (conversation.ConversationSnapshot, error) {
	service.recordCommand("dispose_side", workspaceID, sideConversationID, "")
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
			WorkspaceID: httpTestStringPointer("workspace-api"),
			Title:       "HTTP conversation contracts",
			Status:      conversation.ConversationStatusIdle,
			CreatedAt:   httpConversationTestTime,
			UpdatedAt:   httpConversationTestTime,
		},
		Turns:                conversation.ConversationTurnWindow{Turns: []conversation.ConversationTurn{}},
		Queue:                []conversation.QueuedConversationTurn{},
		Trajectory:           conversation.ConversationTrajectoryWindow{Events: []conversation.TrajectoryEvent{}},
		Artifacts:            conversation.ConversationArtifactWindow{Artifacts: []conversation.ArtifactMetadata{}},
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
		SideEvents: conversation.ConversationSideEventWindow{
			Events: []conversation.SideConversationEvent{},
			Limit:  conversation.MaxSnapshotSideEvents,
		},
		EventCursor: conversation.ConversationEventCursor{StreamID: streamID},
	}}
}

func voiceIDPointerForHTTPTest(value speech.SpeechVoiceID) *speech.SpeechVoiceID {
	return &value
}

func httpTestStringPointer(value string) *string {
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

func (service *httpTestConversationService) ReadSnapshotByID(
	_ context.Context,
	conversationID string,
) (conversation.ConversationSnapshot, error) {
	service.readWorkspaceID = ""
	service.readConversationID = conversationID
	return service.snapshot, nil
}

func (service *httpTestConversationService) ReadArtifact(
	_ context.Context,
	workspaceID *string,
	conversationID string,
	artifactID string,
) (conversation.Artifact, error) {
	service.readWorkspaceID = ""
	if workspaceID != nil {
		service.readWorkspaceID = *workspaceID
	}
	return service.recordArtifactRead(conversationID, artifactID), nil
}

func (service *httpTestConversationService) recordArtifactRead(
	conversationID string,
	artifactID string,
) conversation.Artifact {
	service.readConversationID = conversationID
	service.readArtifactID = artifactID
	return conversation.Artifact{
		ID:                 artifactID,
		ConversationID:     conversationID,
		TurnID:             nil,
		Title:              "HTTP artifact",
		CreatedAt:          httpConversationTestTime,
		TrajectorySequence: nil,
		Document: conversation.ArtifactDocument{
			Language:  conversation.ArtifactDocumentLanguageOpenUI,
			CatalogID: conversation.ArtifactCatalogSettaV1,
			Source:    httpConversationTestArtifactSource,
		},
	}
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
	return service.subscribeEvents(cursor, workspaceID, conversationID)
}

func (service *httpTestConversationService) SubscribeEventsByID(
	cursor conversation.ConversationEventCursor,
	conversationID string,
) (conversation.ConversationEventSubscription, error) {
	return service.subscribeEvents(cursor, "", conversationID)
}

func (service *httpTestConversationService) subscribeEvents(
	cursor conversation.ConversationEventCursor,
	workspaceID string,
	conversationID string,
) (conversation.ConversationEventSubscription, error) {
	service.subscribed = true
	service.subscribeCursor = cursor
	service.subscribeWorkspaceID = workspaceID
	service.subscribeConversationID = conversationID
	if service.eventsChannel != nil {
		return &httpTestConversationSubscription{events: service.eventsChannel}, nil
	}
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
