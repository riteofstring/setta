package evalharness

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestFormatBackendEventCursorPreservesInitialPosition(t *testing.T) {
	if cursor := formatBackendEventCursor("director:eval", 0); cursor != "director:eval:0" {
		t.Fatalf("initial event cursor = %q", cursor)
	}
}

func TestBackendEventPositionRequiresContiguousEvents(t *testing.T) {
	position := backendEventPosition{streamID: "director:eval", sequence: 0}
	if err := position.advance("Director", "director:eval", 1); err != nil {
		t.Fatalf("advance initial event position: %v", err)
	}
	if err := position.advance("Director", "director:eval", 3); err == nil {
		t.Fatal("event sequence gap was accepted")
	}
	if err := position.advance("Director", "director:other", 2); err == nil {
		t.Fatal("event stream change was accepted")
	}
}

func TestSubscribeBackendEventsCarriesAuthAndJoinsOnClose(t *testing.T) {
	type requestObservation struct {
		path    string
		headers http.Header
	}
	requests := make(chan requestObservation, 1)
	requestDone := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		defer close(requestDone)
		requests <- requestObservation{path: request.URL.Path, headers: request.Header.Clone()}
		response.Header().Set("Content-Type", "text/event-stream")
		response.WriteHeader(http.StatusOK)
		flusher, available := response.(http.Flusher)
		if !available {
			return
		}
		flusher.Flush()
		_, _ = io.WriteString(response, "id: director:eval:1\nevent: example.updated\ndata: {}\n\n")
		flusher.Flush()
		<-request.Context().Done()
	}))
	defer server.Close()

	client, err := NewBackendClient(BackendClientConfig{BaseURL: server.URL, Token: "stream-token"})
	if err != nil {
		t.Fatalf("create backend client: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	stream, err := subscribeBackendEvents(
		ctx,
		client,
		"/events",
		"director:eval:0",
		func(id string, _ string, _ []byte) (string, error) { return id, nil },
	)
	if err != nil {
		t.Fatalf("subscribe to backend events: %v", err)
	}
	if event := <-stream.Events(); event != "director:eval:1" {
		t.Fatalf("stream event = %q", event)
	}
	stream.Close()
	<-requestDone

	request := <-requests
	if request.path != "/events" ||
		request.headers.Get("Authorization") != "Bearer stream-token" ||
		request.headers.Get("Accept") != "text/event-stream" ||
		request.headers.Get("Last-Event-ID") != "director:eval:0" {
		t.Fatalf("stream request = %s %#v", request.path, request.headers)
	}
}

func TestScanServerSentEventsDeliversOneStrictFrame(t *testing.T) {
	events := make(chan string, 1)
	err := scanServerSentEvents(
		context.Background(),
		strings.NewReader(": connected\nid: stream:1\nevent: example.updated\ndata: {\"value\":true}\n\n"),
		events,
		func(id string, name string, data []byte) (string, error) {
			if id != "stream:1" || name != "example.updated" || string(data) != `{"value":true}` {
				return "", errors.New("unexpected server-sent event envelope")
			}
			return id, nil
		},
	)
	if err == nil || !strings.Contains(err.Error(), "stream ended") {
		t.Fatalf("closed stream error = %v", err)
	}
	if event := <-events; event != "stream:1" {
		t.Fatalf("decoded event = %q", event)
	}
}

func TestScanServerSentEventsRejectsUnsupportedFraming(t *testing.T) {
	for name, input := range map[string]string{
		"unsupported field": "retry: 1000\n\n",
		"repeated id":       "id: first\nid: second\ndata: {}\n\n",
		"unfinished event":  "id: first\nevent: example\ndata: {}",
	} {
		t.Run(name, func(t *testing.T) {
			events := make(chan string, 1)
			err := scanServerSentEvents(
				context.Background(),
				strings.NewReader(input),
				events,
				func(id string, _ string, _ []byte) (string, error) { return id, nil },
			)
			if err == nil {
				t.Fatal("unsupported server-sent event framing was accepted")
			}
		})
	}
}
