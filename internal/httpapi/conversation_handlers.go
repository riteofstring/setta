package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"setta/internal/conversation"
)

func (handler handler) listTopicConversations(response http.ResponseWriter, request *http.Request) {
	service := requireConversationNavigatorService(response, handler.conversationNavigatorService)
	if service == nil {
		return
	}
	var payload ListTopicConversationsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	if err := validateListTopicConversationsRequest(payload); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_conversation_navigator_request", err.Error())
		return
	}
	page, err := service.ListNavigatorPage(
		request.Context(),
		payload.WorkspaceID,
		payload.Query,
		payload.Cursor,
		payload.Limit,
	)
	if err != nil {
		writeConversationError(response, "list_topic_conversations_failed", err)
		return
	}
	if err := page.Validate(payload.WorkspaceID, payload.Limit); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_conversation_navigator_page", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func validateListTopicConversationsRequest(payload ListTopicConversationsRequest) error {
	if strings.TrimSpace(payload.WorkspaceID) == "" {
		return fmt.Errorf("workspace id is required")
	}
	if payload.WorkspaceID != strings.TrimSpace(payload.WorkspaceID) {
		return fmt.Errorf("workspace id must not have surrounding whitespace")
	}
	if payload.Cursor != nil {
		if err := payload.Cursor.Validate(); err != nil {
			return err
		}
	}
	if payload.Limit <= 0 || payload.Limit > conversation.MaxNavigatorPageLimit {
		return fmt.Errorf(
			"limit must be between 1 and %d",
			conversation.MaxNavigatorPageLimit,
		)
	}
	return nil
}

func (handler handler) readConversationSnapshot(response http.ResponseWriter, request *http.Request) {
	service := requireConversationService(response, handler.conversationService)
	if service == nil {
		return
	}
	var payload ReadConversationSnapshotRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	if err := validateConversationRequestIdentity(payload.WorkspaceID, payload.ConversationID); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_conversation_snapshot_request", err.Error())
		return
	}
	snapshot, err := service.ReadSnapshot(request.Context(), payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeConversationError(response, "read_conversation_snapshot_failed", err)
		return
	}
	if err := snapshot.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_conversation_snapshot", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}

func (handler handler) conversationEventStream(response http.ResponseWriter, request *http.Request) {
	service := requireConversationService(response, handler.conversationService)
	if service == nil {
		return
	}
	payload := SubscribeConversationEventsRequest{
		WorkspaceID:    request.URL.Query().Get("workspaceId"),
		ConversationID: request.URL.Query().Get("conversationId"),
	}
	if err := validateConversationRequestIdentity(payload.WorkspaceID, payload.ConversationID); err != nil {
		writeError(response, http.StatusBadRequest, "invalid_conversation_event_request", err.Error())
		return
	}
	cursor, err := conversationEventStreamCursor(request, payload.ConversationID)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_conversation_event_cursor", err.Error())
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "conversation_event_stream_unavailable", "response writer does not support streaming")
		return
	}
	subscription, err := service.SubscribeEvents(cursor, payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeConversationError(response, "subscribe_conversation_events_failed", err)
		return
	}
	serveConversationEventSubscription(response, request, flusher, subscription)
}

func serveConversationEventSubscription(
	response http.ResponseWriter,
	request *http.Request,
	flusher http.Flusher,
	subscription conversation.ConversationEventSubscription,
) {
	defer subscription.Unsubscribe()

	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("X-Accel-Buffering", "no")
	response.WriteHeader(http.StatusOK)
	flusher.Flush()

	events := subscription.Events()
	for {
		select {
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := event.Validate(); err != nil {
				return
			}
			if err := writeConversationServerSentEvent(response, event); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func conversationEventStreamCursor(request *http.Request, conversationID string) (conversation.ConversationEventCursor, error) {
	streamID, err := conversation.ConversationStreamID(conversationID)
	if err != nil {
		return conversation.ConversationEventCursor{}, err
	}
	value := request.Header.Get("Last-Event-ID")
	if value == "" {
		value = request.URL.Query().Get("lastEventId")
	}
	if value == "" {
		return conversation.ConversationEventCursor{StreamID: streamID}, nil
	}
	separator := strings.LastIndexByte(value, ':')
	if separator <= 0 || separator == len(value)-1 {
		return conversation.ConversationEventCursor{}, fmt.Errorf("conversation event cursor must be <stream-id>:<sequence>: %s", value)
	}
	sequence, err := strconv.Atoi(value[separator+1:])
	if err != nil || sequence < 0 {
		return conversation.ConversationEventCursor{}, fmt.Errorf("conversation event cursor sequence must be a non-negative integer: %s", value)
	}
	cursor := conversation.ConversationEventCursor{StreamID: value[:separator], Sequence: sequence}
	if err := cursor.Validate(conversationID); err != nil {
		return conversation.ConversationEventCursor{}, err
	}
	return cursor, nil
}

func writeConversationServerSentEvent(response http.ResponseWriter, event conversation.ConversationEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal conversation event %s: %w", event.EventID, err)
	}
	if _, err := fmt.Fprintf(
		response,
		"id: %s\nevent: %s\ndata: %s\n\n",
		event.EventID,
		event.Type(),
		payload,
	); err != nil {
		return fmt.Errorf("write conversation event %s: %w", event.EventID, err)
	}
	return nil
}

func validateConversationRequestIdentity(workspaceID string, conversationID string) error {
	if strings.TrimSpace(workspaceID) == "" {
		return fmt.Errorf("workspace id is required")
	}
	if strings.TrimSpace(conversationID) == "" {
		return fmt.Errorf("conversation id is required")
	}
	if workspaceID != strings.TrimSpace(workspaceID) || conversationID != strings.TrimSpace(conversationID) {
		return fmt.Errorf("workspace and conversation ids must not have surrounding whitespace")
	}
	return nil
}
