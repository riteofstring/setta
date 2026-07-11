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
	service := requireConversationService(response, handler.conversationService)
	if service == nil {
		return
	}
	var payload ListTopicConversationsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	page, err := service.List(request.Context(), payload.WorkspaceID, payload.Cursor, payload.Limit)
	if err != nil {
		writeConversationError(response, "list_topic_conversations_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) createTopicConversation(response http.ResponseWriter, request *http.Request) {
	service := requireConversationService(response, handler.conversationService)
	if service == nil {
		return
	}
	var payload CreateTopicConversationRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	snapshot, err := service.Create(request.Context(), conversation.CreateConversationRequest{
		WorkspaceID: payload.WorkspaceID, Title: payload.Title, InitialInput: payload.InitialInput,
	})
	writeConversationSnapshotResult(response, snapshot, err, "create_topic_conversation_failed")
}

func (handler handler) sendConversationInput(response http.ResponseWriter, request *http.Request) {
	service := requireConversationService(response, handler.conversationService)
	if service == nil {
		return
	}
	var payload SendConversationInputRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	snapshot, err := service.Send(request.Context(), conversation.SendConversationInputRequest{
		WorkspaceID: payload.WorkspaceID, ConversationID: payload.ConversationID, Input: payload.Input,
	})
	writeConversationSnapshotResult(response, snapshot, err, "send_conversation_input_failed")
}

func (handler handler) steerConversationInput(response http.ResponseWriter, request *http.Request) {
	service := requireConversationService(response, handler.conversationService)
	if service == nil {
		return
	}
	var payload SteerConversationInputRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	snapshot, err := service.Steer(request.Context(), conversation.SteerConversationRequest{
		WorkspaceID: payload.WorkspaceID, ConversationID: payload.ConversationID, Input: payload.Input,
	})
	writeConversationSnapshotResult(response, snapshot, err, "steer_conversation_input_failed")
}

func (handler handler) stopConversationTurn(response http.ResponseWriter, request *http.Request) {
	service := requireConversationService(response, handler.conversationService)
	if service == nil {
		return
	}
	var payload StopConversationTurnRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	snapshot, err := service.Stop(request.Context(), conversation.StopConversationRequest{
		WorkspaceID: payload.WorkspaceID, ConversationID: payload.ConversationID,
	})
	writeConversationSnapshotResult(response, snapshot, err, "stop_conversation_turn_failed")
}

func (handler handler) submitConversationApproval(response http.ResponseWriter, request *http.Request) {
	service := requireConversationService(response, handler.conversationService)
	if service == nil {
		return
	}
	var payload SubmitConversationApprovalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	snapshot, err := service.SubmitApproval(request.Context(), conversation.SubmitConversationApprovalRequest{
		WorkspaceID: payload.WorkspaceID, ConversationID: payload.ConversationID,
		ApprovalID: payload.ApprovalID, Decision: payload.Decision, Answers: payload.Answers,
	})
	writeConversationSnapshotResult(response, snapshot, err, "submit_conversation_approval_failed")
}

func writeConversationSnapshotResult(response http.ResponseWriter, snapshot conversation.ConversationSnapshot, err error, code string) {
	if err != nil {
		writeConversationError(response, code, err)
		return
	}
	if err := snapshot.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_conversation_snapshot", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
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
