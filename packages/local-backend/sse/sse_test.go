package sse

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type eventValue struct {
	Revision int `json:"revision"`
}

func TestServeFramesNamedAndUnnamedEvents(t *testing.T) {
	for _, testCase := range []struct {
		name  string
		event string
		want  string
	}{
		{name: "named", event: "snapshot", want: "event: snapshot\ndata: {\"revision\":7}\n\n"},
		{name: "unnamed", want: "data: {\"revision\":7}\n\n"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			stream := make(chan eventValue, 1)
			stream <- eventValue{Revision: 7}
			close(stream)
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/events", nil)
			if err := Serve(response, request, stream, testCase.event); err != nil {
				t.Fatalf("Serve() error = %v", err)
			}
			if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "text/event-stream" || response.Body.String() != testCase.want {
				t.Fatalf("response = %d, %q, %q", response.Code, response.Header().Get("Content-Type"), response.Body.String())
			}
		})
	}
}

func TestServeRejectsUnsupportedWriterAndInvalidEventBeforeWriting(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/events", nil)
	stream := make(chan eventValue)
	response := &plainResponse{header: make(http.Header)}
	if Supported(response) {
		t.Fatal("Supported() = true")
	}
	if err := Serve(response, request, stream, "snapshot"); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("Serve(unsupported) error = %v", err)
	}
	if response.status != 0 || response.header.Get("Content-Type") != "" {
		t.Fatalf("unsupported response = %d, %#v", response.status, response.header)
	}
	recorder := httptest.NewRecorder()
	if err := Serve(recorder, request, stream, "bad\nevent"); err == nil {
		t.Fatal("Serve(invalid event) error = nil")
	}
	if recorder.Header().Get("Content-Type") != "" {
		t.Fatalf("invalid event content type = %q", recorder.Header().Get("Content-Type"))
	}
}

func TestServeReturnsEncodingFailureAfterStartingStream(t *testing.T) {
	stream := make(chan any, 1)
	stream <- make(chan int)
	close(stream)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/events", nil)
	err := Serve(response, request, stream, "")
	if err == nil || !strings.Contains(err.Error(), "encode event") {
		t.Fatalf("Serve() error = %v", err)
	}
	if response.Code != http.StatusOK || response.Body.Len() != 0 {
		t.Fatalf("response = %d, %q", response.Code, response.Body.String())
	}
}

type plainResponse struct {
	header http.Header
	status int
}

func (response *plainResponse) Header() http.Header {
	return response.header
}

func (response *plainResponse) Write(data []byte) (int, error) {
	return len(data), nil
}

func (response *plainResponse) WriteHeader(status int) {
	response.status = status
}
