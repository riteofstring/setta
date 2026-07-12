package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"setta/internal/semanticgraph"
)

func (handler handler) semanticGraphChangeEventStream(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "semantic_graph_change_stream_unavailable", "response writer does not support streaming")
		return
	}
	cursor, err := semanticGraphChangeEventCursor(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_semantic_graph_change_cursor", err.Error())
		return
	}
	subscription, err := service.SubscribeSemanticGraphChanges(cursor)
	if err != nil {
		writeSemanticGraphError(response, "subscribe_semantic_graph_changes_failed", err)
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
			if err := writeSemanticGraphChangeServerSentEvent(response, event); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func semanticGraphChangeEventCursor(request *http.Request) (semanticgraph.SemanticGraphChangeCursor, error) {
	value := request.Header.Get("Last-Event-ID")
	if value == "" {
		value = request.URL.Query().Get("lastEventId")
	}
	if value == "" {
		return semanticgraph.SemanticGraphChangeCursor{}, nil
	}
	streamID, sequenceText, ok := strings.Cut(value, ":")
	if !ok || streamID == "" || sequenceText == "" {
		return semanticgraph.SemanticGraphChangeCursor{}, fmt.Errorf("semantic graph change cursor must be <stream-id>:<sequence>: %s", value)
	}
	sequence, err := strconv.Atoi(sequenceText)
	if err != nil || sequence < 0 {
		return semanticgraph.SemanticGraphChangeCursor{}, fmt.Errorf("semantic graph change cursor sequence must be a non-negative integer: %s", value)
	}
	return semanticgraph.SemanticGraphChangeCursor{StreamID: streamID, Sequence: sequence}, nil
}

func writeSemanticGraphChangeServerSentEvent(response http.ResponseWriter, event semanticgraph.SemanticGraphChangeEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal semantic graph change event %s: %w", event.EventID, err)
	}
	if _, err := fmt.Fprintf(response, "id: %s\nevent: %s\ndata: %s\n\n", event.EventID, event.Type, payload); err != nil {
		return fmt.Errorf("write semantic graph change event %s: %w", event.EventID, err)
	}
	return nil
}
