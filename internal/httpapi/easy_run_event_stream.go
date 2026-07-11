package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"setta/internal/easyrun"
)

func (handler handler) easyRunEventStream(response http.ResponseWriter, request *http.Request) {
	service := requireEasyRunService(response, handler.easyRunService)
	if service == nil {
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "easy_run_event_stream_unavailable", "response writer does not support streaming")
		return
	}
	cursor, err := easyRunEventStreamCursor(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_easy_run_event_cursor", err.Error())
		return
	}
	subscription, err := service.SubscribeEvents(cursor)
	if err != nil {
		writeEasyRunError(response, "subscribe_easy_run_events_failed", err)
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
			if err := writeEasyRunServerSentEvent(response, event); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func easyRunEventStreamCursor(request *http.Request) (easyrun.EasyRunEventCursor, error) {
	value := request.Header.Get("Last-Event-ID")
	if value == "" {
		value = request.URL.Query().Get("lastEventId")
	}
	if value == "" {
		return easyrun.EasyRunEventCursor{}, nil
	}
	streamID, sequenceText, ok := strings.Cut(value, ":")
	if !ok || streamID == "" || sequenceText == "" {
		return easyrun.EasyRunEventCursor{}, fmt.Errorf("easy-run event cursor must be <stream-id>:<sequence>: %s", value)
	}
	sequence, err := strconv.Atoi(sequenceText)
	if err != nil || sequence < 0 {
		return easyrun.EasyRunEventCursor{}, fmt.Errorf("easy-run event cursor sequence must be a non-negative integer: %s", value)
	}
	return easyrun.EasyRunEventCursor{StreamID: streamID, Sequence: sequence}, nil
}

func writeEasyRunServerSentEvent(response http.ResponseWriter, event easyrun.EasyRunEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal easy-run event %s: %w", event.EventID, err)
	}
	if _, err := fmt.Fprintf(response, "id: %s\nevent: %s\ndata: %s\n\n", event.EventID, event.Type, payload); err != nil {
		return fmt.Errorf("write easy-run event %s: %w", event.EventID, err)
	}
	return nil
}
