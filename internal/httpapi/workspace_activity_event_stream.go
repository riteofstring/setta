package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"setta/internal/workspaceactivity"
)

func (handler handler) workspaceActivityEventStream(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceActivityService(response, handler.workspaceActivityService)
	if service == nil {
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "workspace_activity_event_stream_unavailable", "response writer does not support streaming")
		return
	}
	cursor, err := workspaceActivityEventStreamCursor(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_workspace_activity_event_cursor", err.Error())
		return
	}
	workspaceID := request.URL.Query().Get("workspaceId")
	subscription, err := service.SubscribeEvents(cursor, workspaceID)
	if err != nil {
		writeError(response, http.StatusBadRequest, "subscribe_workspace_activity_events_failed", err.Error())
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
			if err := writeWorkspaceActivityServerSentEvent(response, event); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func workspaceActivityEventStreamCursor(request *http.Request) (workspaceactivity.EventCursor, error) {
	value := request.Header.Get("Last-Event-ID")
	if value == "" {
		value = request.URL.Query().Get("lastEventId")
	}
	if value == "" {
		return workspaceactivity.EventCursor{}, nil
	}
	streamID, sequenceText, ok := strings.Cut(value, ":")
	if !ok || streamID == "" || sequenceText == "" {
		return workspaceactivity.EventCursor{}, fmt.Errorf("workspace activity event cursor must be <stream-id>:<sequence>: %s", value)
	}
	sequence, err := strconv.Atoi(sequenceText)
	if err != nil || sequence < 0 {
		return workspaceactivity.EventCursor{}, fmt.Errorf("workspace activity event cursor sequence must be a non-negative integer: %s", value)
	}
	return workspaceactivity.EventCursor{StreamID: streamID, Sequence: sequence}, nil
}

func writeWorkspaceActivityServerSentEvent(response http.ResponseWriter, event workspaceactivity.WorkspaceActivityEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal workspace activity event %s: %w", event.EventID, err)
	}
	if _, err := fmt.Fprintf(response, "id: %s\nevent: %s\ndata: %s\n\n", event.EventID, event.Type, payload); err != nil {
		return fmt.Errorf("write workspace activity event %s: %w", event.EventID, err)
	}
	return nil
}
