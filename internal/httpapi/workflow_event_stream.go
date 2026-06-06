package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"setta/internal/orchestrator"
)

func (handler handler) workflowEventStream(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "workflow_event_stream_unavailable", "response writer does not support streaming")
		return
	}
	cursor, err := workflowEventStreamCursor(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_workflow_event_cursor", err.Error())
		return
	}
	subscription, err := service.SubscribeEvents(cursor)
	if err != nil {
		writeWorkflowError(response, "subscribe_workflow_events_failed", err)
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
		case envelope, ok := <-subscription.Events:
			if !ok {
				return
			}
			if err := writeWorkflowServerSentEvent(response, envelope); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func workflowEventStreamCursor(request *http.Request) (orchestrator.WorkflowEventCursor, error) {
	value := request.Header.Get("Last-Event-ID")
	if value == "" {
		value = request.URL.Query().Get("lastEventId")
	}
	if value == "" {
		return orchestrator.WorkflowEventCursor{}, nil
	}
	streamID, sequenceText, ok := strings.Cut(value, ":")
	if !ok || streamID == "" || sequenceText == "" {
		return orchestrator.WorkflowEventCursor{}, fmt.Errorf("workflow event cursor must be <stream-id>:<sequence>: %s", value)
	}
	sequence, err := strconv.Atoi(sequenceText)
	if err != nil || sequence < 0 {
		return orchestrator.WorkflowEventCursor{}, fmt.Errorf("workflow event cursor sequence must be a non-negative integer: %s", value)
	}
	return orchestrator.WorkflowEventCursor{StreamID: streamID, Sequence: sequence}, nil
}

func writeWorkflowServerSentEvent(response http.ResponseWriter, envelope orchestrator.WorkflowEventEnvelope) error {
	event := envelope.Event
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal workflow event %s: %w", event.ID, err)
	}
	eventID := fmt.Sprintf("%s:%d", envelope.StreamID, envelope.Sequence)
	if _, err := fmt.Fprintf(response, "id: %s\nevent: %s\ndata: %s\n\n", eventID, event.Type, payload); err != nil {
		return fmt.Errorf("write workflow event %s: %w", event.ID, err)
	}
	return nil
}
