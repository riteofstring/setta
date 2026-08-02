package evalharness

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"

	"setta/internal/conversation"
	"setta/internal/director"
	"setta/internal/jsonio"
)

const (
	eventStreamBuffer       = 64
	eventStreamMaximumBytes = 4 * 1024 * 1024
)

type EventStream[T any] struct {
	cancel context.CancelFunc
	body   io.Closer
	done   <-chan struct{}
	events <-chan T
	errors <-chan error
	once   sync.Once
}

func (stream *EventStream[T]) Events() <-chan T {
	if stream == nil {
		return nil
	}
	return stream.events
}

func (stream *EventStream[T]) Errors() <-chan error {
	if stream == nil {
		return nil
	}
	return stream.errors
}

func (stream *EventStream[T]) Close() {
	if stream == nil {
		return
	}
	stream.once.Do(func() {
		stream.cancel()
		_ = stream.body.Close()
		<-stream.done
	})
}

type eventStreamReader[T any] struct {
	label  string
	events <-chan T
	errors <-chan error
}

func newEventStreamReader[T any](label string, stream *EventStream[T]) eventStreamReader[T] {
	return eventStreamReader[T]{
		label:  label,
		events: stream.Events(),
		errors: stream.Errors(),
	}
}

func (reader *eventStreamReader[T]) Next(ctx context.Context) (T, error) {
	var zero T
	for reader.events != nil || reader.errors != nil {
		select {
		case event, open := <-reader.events:
			if !open {
				reader.events = nil
				continue
			}
			return event, nil
		case err, open := <-reader.errors:
			if !open {
				reader.errors = nil
				continue
			}
			if err != nil {
				return zero, err
			}
		case <-ctx.Done():
			return zero, ctx.Err()
		}
	}
	return zero, fmt.Errorf("%s event stream closed before the required state was observed", reader.label)
}

func (client *BackendClient) SubscribeDirectorEvents(
	ctx context.Context,
	cursor director.DirectorEventCursor,
) (*EventStream[director.DirectorEvent], error) {
	if err := cursor.Validate(cursor.StreamID); err != nil {
		return nil, fmt.Errorf("validate Director event cursor: %w", err)
	}
	decoder := directorEventStreamDecoder{
		position: backendEventPosition{streamID: cursor.StreamID, sequence: cursor.Sequence},
	}
	return subscribeBackendEvents(
		ctx,
		client,
		"/director/events",
		formatBackendEventCursor(cursor.StreamID, cursor.Sequence),
		decoder.decode,
	)
}

func (client *BackendClient) SubscribeConversationEvents(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	cursor conversation.ConversationEventCursor,
) (*EventStream[conversation.ConversationEvent], error) {
	if err := cursor.Validate(conversationID); err != nil {
		return nil, fmt.Errorf("validate conversation event cursor: %w", err)
	}
	query := url.Values{
		"conversationId": []string{conversationID},
		"workspaceId":    []string{workspaceID},
	}
	decoder := conversationEventStreamDecoder{
		workspaceID:    workspaceID,
		conversationID: conversationID,
		position:       backendEventPosition{streamID: cursor.StreamID, sequence: cursor.Sequence},
	}
	return subscribeBackendEvents(
		ctx,
		client,
		"/conversations/events?"+query.Encode(),
		formatBackendEventCursor(cursor.StreamID, cursor.Sequence),
		decoder.decode,
	)
}

func formatBackendEventCursor(streamID string, sequence int) string {
	return streamID + ":" + strconv.Itoa(sequence)
}

type backendEventPosition struct {
	streamID string
	sequence int
}

func (position *backendEventPosition) advance(label string, streamID string, sequence int) error {
	if streamID != position.streamID || sequence != position.sequence+1 {
		return fmt.Errorf(
			"%s event cursor changed from %s to %s",
			label,
			formatBackendEventCursor(position.streamID, position.sequence),
			formatBackendEventCursor(streamID, sequence),
		)
	}
	position.sequence = sequence
	return nil
}

type directorEventStreamDecoder struct {
	position backendEventPosition
}

func (decoder *directorEventStreamDecoder) decode(
	id string,
	name string,
	data []byte,
) (director.DirectorEvent, error) {
	event, err := decodeDirectorServerSentEvent(id, name, data)
	if err != nil {
		return director.DirectorEvent{}, err
	}
	if event.Kind == director.DirectorEventResyncRequired {
		return event, nil
	}
	if err := decoder.position.advance("Director", event.StreamID, event.Sequence); err != nil {
		return director.DirectorEvent{}, err
	}
	return event, nil
}

type conversationEventStreamDecoder struct {
	workspaceID    string
	conversationID string
	position       backendEventPosition
}

func (decoder *conversationEventStreamDecoder) decode(
	id string,
	name string,
	data []byte,
) (conversation.ConversationEvent, error) {
	event, err := decodeConversationServerSentEvent(id, name, data)
	if err != nil {
		return conversation.ConversationEvent{}, err
	}
	if event.ConversationID != decoder.conversationID {
		return conversation.ConversationEvent{}, fmt.Errorf(
			"conversation event target %s does not match subscription %s",
			event.ConversationID,
			decoder.conversationID,
		)
	}
	if event.WorkspaceID == nil || *event.WorkspaceID != decoder.workspaceID {
		return conversation.ConversationEvent{}, fmt.Errorf(
			"conversation event workspace does not match subscription %s",
			decoder.workspaceID,
		)
	}
	if event.Type() == conversation.ConversationEventTypeResyncRequired {
		return event, nil
	}
	if err := decoder.position.advance("conversation", event.StreamID, event.Sequence); err != nil {
		return conversation.ConversationEvent{}, err
	}
	return event, nil
}

type serverSentEventDecoder[T any] func(id string, name string, data []byte) (T, error)

func subscribeBackendEvents[T any](
	ctx context.Context,
	client *BackendClient,
	path string,
	cursor string,
	decode serverSentEventDecoder[T],
) (*EventStream[T], error) {
	if ctx == nil {
		return nil, errors.New("backend event stream context is required")
	}
	streamCtx, cancel := context.WithCancel(ctx)
	request, err := client.newRequest(streamCtx, http.MethodGet, path, nil)
	if err != nil {
		cancel()
		return nil, err
	}
	request.Header.Set("Accept", "text/event-stream")
	request.Header.Set("Last-Event-ID", cursor)
	response, err := client.httpClient.Do(request)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("subscribe to backend event stream %s: %w", request.URL.Path, err)
	}
	if response.StatusCode != http.StatusOK {
		failure := backendResponseError(response, http.MethodGet, request.URL.Path)
		_ = response.Body.Close()
		cancel()
		return nil, failure
	}
	if err := requireResponseMediaType(response, "text/event-stream"); err != nil {
		response.Body.Close()
		cancel()
		return nil, err
	}
	events := make(chan T, eventStreamBuffer)
	errorsFound := make(chan error, 1)
	done := make(chan struct{})
	stream := &EventStream[T]{
		cancel: cancel,
		body:   response.Body,
		done:   done,
		events: events,
		errors: errorsFound,
	}
	go runBackendEventStream(streamCtx, response.Body, events, errorsFound, done, decode)
	return stream, nil
}

func runBackendEventStream[T any](
	ctx context.Context,
	body io.ReadCloser,
	events chan<- T,
	errorsFound chan<- error,
	done chan<- struct{},
	decode serverSentEventDecoder[T],
) {
	defer close(done)
	defer close(events)
	defer close(errorsFound)
	defer body.Close()
	err := scanServerSentEvents(ctx, body, events, decode)
	if err != nil && ctx.Err() == nil {
		errorsFound <- err
	}
}

type pendingServerSentEvent struct {
	id       string
	name     string
	data     bytes.Buffer
	idSeen   bool
	nameSeen bool
	dataSeen bool
}

func scanServerSentEvents[T any](
	ctx context.Context,
	reader io.Reader,
	events chan<- T,
	decode serverSentEventDecoder[T],
) error {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), eventStreamMaximumBytes)
	var pending pendingServerSentEvent
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		event, complete, err := consumePendingServerSentEvent(&pending, line, decode)
		if err != nil {
			return err
		}
		if complete {
			select {
			case events <- event:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read backend event stream: %w", err)
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if pending.dataSeen {
		return errors.New("backend event stream ended during an event")
	}
	return errors.New("backend event stream ended")
}

func consumePendingServerSentEvent[T any](
	pending *pendingServerSentEvent,
	line string,
	decode serverSentEventDecoder[T],
) (T, bool, error) {
	var zero T
	if line == "" {
		if !pending.dataSeen {
			return zero, false, nil
		}
		event, err := decode(pending.id, pending.name, pending.data.Bytes())
		if err != nil {
			return zero, false, err
		}
		*pending = pendingServerSentEvent{}
		return event, true, nil
	}
	if strings.HasPrefix(line, ":") {
		return zero, false, nil
	}
	field, value, found := strings.Cut(line, ":")
	if !found {
		return zero, false, fmt.Errorf("backend event stream contains malformed field %q", line)
	}
	if err := pending.appendField(field, strings.TrimPrefix(value, " ")); err != nil {
		return zero, false, err
	}
	if len(pending.id)+len(pending.name)+pending.data.Len() > eventStreamMaximumBytes {
		return zero, false, fmt.Errorf("backend event exceeds %d bytes", eventStreamMaximumBytes)
	}
	return zero, false, nil
}

func (pending *pendingServerSentEvent) appendField(field string, value string) error {
	switch field {
	case "id":
		if pending.idSeen {
			return errors.New("backend event stream repeats event id")
		}
		pending.idSeen = true
		pending.id = value
	case "event":
		if pending.nameSeen {
			return errors.New("backend event stream repeats event name")
		}
		pending.nameSeen = true
		pending.name = value
	case "data":
		if pending.dataSeen {
			pending.data.WriteByte('\n')
		}
		pending.dataSeen = true
		pending.data.WriteString(value)
	default:
		return fmt.Errorf("backend event stream contains unsupported field %q", field)
	}
	return nil
}

func decodeDirectorServerSentEvent(
	id string,
	name string,
	data []byte,
) (director.DirectorEvent, error) {
	var event director.DirectorEvent
	if err := jsonio.DecodeSingle(bytes.NewReader(data), &event); err != nil {
		return director.DirectorEvent{}, fmt.Errorf("decode Director event: %w", err)
	}
	if err := director.ValidateDirectorEvent(event); err != nil {
		return director.DirectorEvent{}, fmt.Errorf("validate Director event: %w", err)
	}
	if event.EventID != id || string(event.Kind) != name {
		return director.DirectorEvent{}, fmt.Errorf(
			"Director event envelope %q/%q does not match payload %q/%q",
			id,
			name,
			event.EventID,
			event.Kind,
		)
	}
	return event, nil
}

func decodeConversationServerSentEvent(
	id string,
	name string,
	data []byte,
) (conversation.ConversationEvent, error) {
	event, err := conversation.DecodeConversationEvent(data)
	if err != nil {
		return conversation.ConversationEvent{}, err
	}
	if event.EventID != id || string(event.Type()) != name {
		return conversation.ConversationEvent{}, fmt.Errorf(
			"conversation event envelope %q/%q does not match payload %q/%q",
			id,
			name,
			event.EventID,
			event.Type(),
		)
	}
	return event, nil
}
