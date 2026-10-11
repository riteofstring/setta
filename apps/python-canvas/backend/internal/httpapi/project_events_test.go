package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/contracts"
)

func TestProjectEventsPushesCurrentAndLaterCanonicalSnapshotsOnOneRequest(t *testing.T) {
	publications := make(chan contracts.ProjectSnapshotV2, 2)
	initial := contracts.FixtureProjectSnapshotV2()
	publications <- initial
	service := &stubProjectService{
		snapshot: initial,
		subscribeProjectSnapshots: func(context.Context) <-chan contracts.ProjectSnapshotV2 {
			return publications
		},
	}
	handler := newHandlerForTest(t, service)
	server := httptest.NewServer(handler)
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL+contracts.ProjectEventsPathV2, nil)
	if err != nil {
		t.Fatalf("create event request: %v", err)
	}
	request.Header.Set("Accept", "text/event-stream")
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatalf("open event stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	if contentType := response.Header.Get("Content-Type"); !strings.HasPrefix(contentType, "text/event-stream") {
		t.Fatalf("content type = %q, want text/event-stream", contentType)
	}

	reader := bufio.NewReader(response.Body)
	if got := readSnapshotEvent(t, reader); got.Project.Revision != initial.Project.Revision {
		t.Fatalf("initial event revision = %d, want %d", got.Project.Revision, initial.Project.Revision)
	}

	next := initial
	next.Project.Revision++
	next.DiagnosticsRevision = next.Project.Revision
	publications <- next
	if got := readSnapshotEvent(t, reader); got.Project.Revision != next.Project.Revision {
		t.Fatalf("pushed event revision = %d, want %d", got.Project.Revision, next.Project.Revision)
	}

	readDone := make(chan error, 1)
	go func() {
		_, err := reader.ReadByte()
		readDone <- err
	}()
	cancel()
	select {
	case <-time.After(time.Second):
		t.Fatal("event request did not close after cancellation")
	case err := <-readDone:
		if err == nil {
			t.Fatal("event request ended without a stream read error")
		}
	}
}

func TestProjectEventsRejectsNonGetAndQueryRequests(t *testing.T) {
	handler := newHandlerForTest(t, &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()})
	for _, test := range []struct {
		name   string
		method string
		target string
	}{
		{name: "method", method: http.MethodPost, target: contracts.ProjectEventsPathV2},
		{name: "query", method: http.MethodGet, target: contracts.ProjectEventsPathV2 + "?since=1"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(test.method, test.target, nil))
			if response.Code == http.StatusOK {
				t.Fatalf("status = %d, want rejection", response.Code)
			}
		})
	}
}

func readSnapshotEvent(t *testing.T, reader *bufio.Reader) contracts.ProjectSnapshotV2 {
	t.Helper()
	line, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("read event data: %v", err)
	}
	if !strings.HasPrefix(line, "data: ") {
		t.Fatalf("event line = %q, want data field", line)
	}
	separator, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("read event separator: %v", err)
	}
	if separator != "\n" {
		t.Fatalf("event separator = %q, want blank line", separator)
	}
	var snapshot contracts.ProjectSnapshotV2
	if err := json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "data: "))), &snapshot); err != nil {
		t.Fatalf("decode event snapshot: %v", err)
	}
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("validate event snapshot: %v", err)
	}
	return snapshot
}
