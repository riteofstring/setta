package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"setta/internal/workspaceui"
)

func (handler handler) workspaceUIEventStream(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceUIService(response, handler.workspaceUIService)
	if service == nil {
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "workspace_ui_event_stream_unavailable", "response writer does not support streaming")
		return
	}
	cursor, err := workspaceUIEventStreamCursor(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_workspace_ui_event_cursor", err.Error())
		return
	}
	workspaceID := request.URL.Query().Get("workspaceId")
	subscription, err := service.SubscribeEvents(cursor, workspaceID)
	if err != nil {
		writeWorkspaceUIError(response, "subscribe_workspace_ui_events_failed", err)
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
			if err := writeWorkspaceUIServerSentEvent(response, event); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func workspaceUIEventStreamCursor(request *http.Request) (workspaceui.EventCursor, error) {
	value := request.Header.Get("Last-Event-ID")
	if value == "" {
		value = request.URL.Query().Get("lastEventId")
	}
	if value == "" {
		return workspaceui.EventCursor{}, nil
	}
	streamID, sequenceText, ok := strings.Cut(value, ":")
	if !ok || streamID == "" || sequenceText == "" {
		return workspaceui.EventCursor{}, fmt.Errorf("workspace UI event cursor must be <stream-id>:<sequence>: %s", value)
	}
	sequence, err := strconv.Atoi(sequenceText)
	if err != nil || sequence < 0 {
		return workspaceui.EventCursor{}, fmt.Errorf("workspace UI event cursor sequence must be a non-negative integer: %s", value)
	}
	return workspaceui.EventCursor{StreamID: streamID, Sequence: sequence}, nil
}

func writeWorkspaceUIServerSentEvent(response http.ResponseWriter, event workspaceui.WorkspaceUIEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal workspace UI event %s: %w", event.EventID, err)
	}
	if _, err := fmt.Fprintf(response, "id: %s\nevent: %s\ndata: %s\n\n", event.EventID, event.Type, payload); err != nil {
		return fmt.Errorf("write workspace UI event %s: %w", event.EventID, err)
	}
	return nil
}
