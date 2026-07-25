package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"setta/internal/director"
)

// The Director command center's transport.
//
// Three endpoints carry the whole boundary: read one bounded app-scoped
// snapshot with its durable cursor, subscribe from that cursor, and dispatch one
// intent. There is no refresh endpoint and no list endpoint to poll, because the
// subscription is the only way app state changes reach the shell.

// DispatchDirectorIntentRequest carries one dispatched user intent.
type DispatchDirectorIntentRequest struct {
	Intent director.DirectorIntent `json:"intent"`
}

func (handler handler) readDirectorSnapshot(response http.ResponseWriter, request *http.Request) {
	service := requireDirectorService(response, handler.directorService)
	if service == nil {
		return
	}
	snapshot, err := service.Snapshot()
	if err != nil {
		writeDirectorError(response, "read_director_snapshot_failed", err)
		return
	}
	if err := director.ValidateDirectorSnapshot(snapshot); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_director_snapshot", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}

func (handler handler) dispatchDirectorIntent(response http.ResponseWriter, request *http.Request) {
	service := requireDirectorService(response, handler.directorService)
	if service == nil {
		return
	}
	var payload DispatchDirectorIntentRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	receipt, err := service.Dispatch(request.Context(), payload.Intent)
	if err != nil {
		writeDirectorError(response, "dispatch_director_intent_failed", err)
		return
	}
	if err := director.ValidateDirectorReceipt(receipt); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_director_receipt", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, receipt)
}

func (handler handler) directorEventStream(response http.ResponseWriter, request *http.Request) {
	service := requireDirectorService(response, handler.directorService)
	if service == nil {
		return
	}
	cursor, err := directorEventStreamCursor(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_director_event_cursor", err.Error())
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "director_event_stream_unavailable", "response writer does not support streaming")
		return
	}
	subscription, err := service.Subscribe(cursor)
	if err != nil {
		writeDirectorError(response, "subscribe_director_events_failed", err)
		return
	}
	serveDirectorEventSubscription(response, request, flusher, subscription)
}

func serveDirectorEventSubscription(
	response http.ResponseWriter,
	request *http.Request,
	flusher http.Flusher,
	subscription director.DirectorEventSubscription,
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
		case event, open := <-events:
			if !open {
				return
			}
			if director.ValidateDirectorEvent(event) != nil {
				return
			}
			if writeDirectorServerSentEvent(response, event) != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

// directorEventStreamCursor reads the cursor the subscription resumes from. It
// arrives as a Last-Event-ID so a reconnect carries it the way every other
// server-sent stream in the app does.
func directorEventStreamCursor(request *http.Request) (director.DirectorEventCursor, error) {
	value := request.Header.Get("Last-Event-ID")
	if value == "" {
		value = request.URL.Query().Get("lastEventId")
	}
	if value == "" {
		return director.DirectorEventCursor{}, fmt.Errorf("director event cursor is required")
	}
	separator := strings.LastIndexByte(value, ':')
	if separator <= 0 || separator == len(value)-1 {
		return director.DirectorEventCursor{}, fmt.Errorf("director event cursor must be <stream-id>:<sequence>: %s", value)
	}
	sequence, err := strconv.Atoi(value[separator+1:])
	if err != nil || sequence < 0 {
		return director.DirectorEventCursor{}, fmt.Errorf("director event cursor sequence must be a non-negative integer: %s", value)
	}
	return director.DirectorEventCursor{StreamID: value[:separator], Sequence: sequence}, nil
}

func writeDirectorServerSentEvent(response http.ResponseWriter, event director.DirectorEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal director event %s: %w", event.EventID, err)
	}
	if _, err := fmt.Fprintf(
		response,
		"id: %s\nevent: %s\ndata: %s\n\n",
		event.EventID,
		event.Kind,
		payload,
	); err != nil {
		return fmt.Errorf("write director event %s: %w", event.EventID, err)
	}
	return nil
}
