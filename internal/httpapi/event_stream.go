package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"setta/internal/chat"
)

func (handler handler) eventStream(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	cursor, err := eventStreamCursor(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_event_cursor", err.Error())
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "event_stream_unavailable", "response writer does not support streaming")
		return
	}
	subscription, err := service.SubscribeEvents(cursor)
	if err != nil {
		writeChatError(response, "subscribe_events_failed", err)
		return
	}
	defer subscription.Unsubscribe()

	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("X-Accel-Buffering", "no")
	response.WriteHeader(http.StatusOK)
	flusher.Flush()

	for {
		select {
		case event, ok := <-subscription.Events:
			if !ok {
				return
			}
			if err := writeServerSentEvent(response, event); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func eventStreamCursor(request *http.Request) (chat.EventCursor, error) {
	value := request.Header.Get("Last-Event-ID")
	if value == "" {
		value = request.URL.Query().Get("lastEventId")
	}
	if value == "" {
		return chat.EventCursor{}, nil
	}
	streamID, sequenceText, ok := strings.Cut(value, ":")
	if !ok || streamID == "" || sequenceText == "" {
		return chat.EventCursor{}, fmt.Errorf("event cursor must be <stream-id>:<sequence>: %s", value)
	}
	sequence, err := strconv.Atoi(sequenceText)
	if err != nil || sequence < 0 {
		return chat.EventCursor{}, fmt.Errorf("event cursor sequence must be a non-negative integer: %s", value)
	}
	return chat.EventCursor{StreamID: streamID, Sequence: sequence}, nil
}

func writeServerSentEvent(response http.ResponseWriter, event chat.Event) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event %d: %w", event.Sequence, err)
	}
	if _, err := fmt.Fprintf(response, "id: %s\nevent: %s\ndata: %s\n\n", event.EventID, event.Type, payload); err != nil {
		return fmt.Errorf("write event %d: %w", event.Sequence, err)
	}
	return nil
}
