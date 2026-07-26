package httpapi

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/director"
)

const httpDirectorTestStreamID = "director:m12"

func TestDirectorSnapshotEndpointServesTheAppScopedProjection(t *testing.T) {
	service := newHTTPTestDirectorService()
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		DirectorService: service,
		Metadata:        BackendMetadata{Name: BackendName, Version: "test"},
	})

	snapshot := getJSON[director.DirectorSnapshot](t, handler, "/director/snapshot", http.StatusOK)
	if snapshot.EventCursor.StreamID != httpDirectorTestStreamID || snapshot.EventCursor.Sequence != 4 {
		t.Fatalf("snapshot cursor = %+v", snapshot.EventCursor)
	}
	if snapshot.Connection.Status != director.DirectorConnectionConnected {
		t.Fatalf("snapshot connection = %+v", snapshot.Connection)
	}
	if service.snapshotCalls != 1 {
		t.Fatalf("snapshot service calls = %d, want 1", service.snapshotCalls)
	}
}

func TestDirectorIntentEndpointDispatchesTypedIntents(t *testing.T) {
	service := newHTTPTestDirectorService()
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		DirectorService: service,
		Metadata:        BackendMetadata{Name: BackendName, Version: "test"},
	})
	intent := director.DirectorIntent{
		Kind:          director.DirectorIntentMoveSelection,
		MoveSelection: &director.DirectorMoveSelectionIntent{Direction: director.DirectorSelectionNext},
	}

	receipt := postJSON[director.DirectorReceipt](
		t,
		handler,
		"/director/intents/dispatch",
		DispatchDirectorIntentRequest{Intent: intent},
		http.StatusOK,
	)
	if receipt.Kind != director.DirectorIntentMoveSelection {
		t.Fatalf("receipt kind = %q", receipt.Kind)
	}
	if receipt.SelectedWorkstreamID == nil || *receipt.SelectedWorkstreamID != "workstream:conversation-alpha" {
		t.Fatalf("receipt selection = %v", receipt.SelectedWorkstreamID)
	}
	if service.dispatched.Kind != intent.Kind ||
		service.dispatched.MoveSelection == nil ||
		service.dispatched.MoveSelection.Direction != director.DirectorSelectionNext {
		t.Fatalf("service received intent %+v", service.dispatched)
	}
}

// TestDirectorIntentEndpointSeparatesRejectionFromUnavailability proves the two
// failures reach the shell differently: an intent naming something trusted state
// does not hold is the caller's request to fix, and a command center that is not
// running is a runtime condition to retry.
func TestDirectorIntentEndpointSeparatesRejectionFromUnavailability(t *testing.T) {
	for name, testCase := range map[string]struct {
		err        error
		wantStatus int
	}{
		"rejected intent": {
			err:        fmt.Errorf("%w: workstream is not in the registry", director.ErrDirectorIntentRejected),
			wantStatus: http.StatusBadRequest,
		},
		"unavailable command center": {
			err:        fmt.Errorf("%w: the app-scoped registry is not started", director.ErrDirectorUnavailable),
			wantStatus: http.StatusServiceUnavailable,
		},
	} {
		t.Run(name, func(t *testing.T) {
			service := newHTTPTestDirectorService()
			service.dispatchErr = testCase.err
			handler := newAuthenticatedTestHandler(t, HandlerConfig{
				DirectorService: service,
				Metadata:        BackendMetadata{Name: BackendName, Version: "test"},
			})

			postJSON[ErrorResponse](
				t,
				handler,
				"/director/intents/dispatch",
				DispatchDirectorIntentRequest{Intent: director.DirectorIntent{
					Kind:             director.DirectorIntentSelectWorkstream,
					SelectWorkstream: &director.DirectorSelectWorkstreamIntent{WorkstreamID: "workstream:missing"},
				}},
				testCase.wantStatus,
			)
		})
	}
}

func TestDirectorEventStreamResumesFromTheSnapshotCursor(t *testing.T) {
	service := newHTTPTestDirectorService()
	eventID, err := director.DirectorEventID(httpDirectorTestStreamID, 5)
	if err != nil {
		t.Fatalf("event id: %v", err)
	}
	selected := "workstream:conversation-alpha"
	service.events = []director.DirectorEvent{{
		SchemaVersion:    director.DirectorContractSchemaVersion,
		StreamID:         httpDirectorTestStreamID,
		Sequence:         5,
		EventID:          eventID,
		EmittedAt:        "2026-07-24T18:00:00Z",
		Kind:             director.DirectorEventSelectionChanged,
		SelectionChanged: &director.DirectorSelectionChangedPayload{SelectedWorkstreamID: &selected},
	}}
	server := httptest.NewServer(newAuthenticatedTestHandler(t, HandlerConfig{
		DirectorService: service,
		Metadata:        BackendMetadata{Name: BackendName, Version: "test"},
	}))
	defer server.Close()

	text := readDirectorEventStream(t, server.URL, httpDirectorTestStreamID+":4", http.StatusOK)
	if !strings.Contains(text, "id: "+eventID) ||
		!strings.Contains(text, "event: director.selection.changed") ||
		!strings.Contains(text, `"kind":"director.selection.changed"`) {
		t.Fatalf("event stream body = %q", text)
	}
	if service.subscribeCursor != (director.DirectorEventCursor{StreamID: httpDirectorTestStreamID, Sequence: 4}) {
		t.Fatalf("subscribe cursor = %+v", service.subscribeCursor)
	}
}

// TestDirectorEventStreamRequiresACursor proves a subscriber with no cursor is
// refused rather than given a position the app guessed for it: it has no
// snapshot to apply events to, so a stream from anywhere would be wrong.
func TestDirectorEventStreamRequiresACursor(t *testing.T) {
	service := newHTTPTestDirectorService()
	server := httptest.NewServer(newAuthenticatedTestHandler(t, HandlerConfig{
		DirectorService: service,
		Metadata:        BackendMetadata{Name: BackendName, Version: "test"},
	}))
	defer server.Close()

	readDirectorEventStream(t, server.URL, "", http.StatusBadRequest)
	readDirectorEventStream(t, server.URL, "director:m12", http.StatusBadRequest)
	readDirectorEventStream(t, server.URL, "conversation:abc:0", http.StatusBadRequest)
	if service.subscribed {
		t.Fatal("a subscription without a usable cursor reached the command center")
	}
}

func readDirectorEventStream(t *testing.T, baseURL string, cursor string, wantStatus int) string {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, baseURL+"/director/events", nil)
	if err != nil {
		t.Fatalf("create director event request: %v", err)
	}
	if cursor != "" {
		request.Header.Set("Last-Event-ID", cursor)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("read director event stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != wantStatus {
		t.Fatalf("director event stream status = %d, want %d", response.StatusCode, wantStatus)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read director event stream body: %v", err)
	}
	return string(body)
}

type httpTestDirectorService struct {
	snapshot        director.DirectorSnapshot
	snapshotCalls   int
	dispatched      director.DirectorIntent
	dispatchErr     error
	events          []director.DirectorEvent
	subscribed      bool
	subscribeCursor director.DirectorEventCursor
}

func newHTTPTestDirectorService() *httpTestDirectorService {
	return &httpTestDirectorService{
		snapshot: director.DirectorSnapshot{
			SchemaVersion: director.DirectorContractSchemaVersion,
			Workstreams:   []director.DirectorWorkstreamEntry{},
			Graphs: []director.WorkstreamGraph{{
				WorkstreamID: director.DirectorLaneID,
				DetailLevel:  director.WorkstreamDetailSelected,
				Nodes:        []director.SemanticNode{},
				Edges:        []director.SemanticEdge{},
			}},
			UnresolvedApprovals:        []director.ApprovalRequest{},
			UnresolvedResourceRequests: []director.ResourceRequest{},
			Artifacts:                  []director.WorkstreamArtifact{},
			Connection:                 director.DirectorConnectionState{Status: director.DirectorConnectionConnected},
			EventCursor:                director.DirectorEventCursor{StreamID: httpDirectorTestStreamID, Sequence: 4},
		},
	}
}

func (service *httpTestDirectorService) Snapshot() (director.DirectorSnapshot, error) {
	service.snapshotCalls++
	return service.snapshot, nil
}

func (service *httpTestDirectorService) Dispatch(
	_ context.Context,
	intent director.DirectorIntent,
) (director.DirectorReceipt, error) {
	service.dispatched = intent
	if service.dispatchErr != nil {
		return director.DirectorReceipt{}, service.dispatchErr
	}
	selected := "workstream:conversation-alpha"
	return director.DirectorReceipt{Kind: intent.Kind, SelectedWorkstreamID: &selected}, nil
}

func (service *httpTestDirectorService) Subscribe(
	cursor director.DirectorEventCursor,
) (director.DirectorEventSubscription, error) {
	service.subscribed = true
	service.subscribeCursor = cursor
	events := make(chan director.DirectorEvent, len(service.events))
	for _, event := range service.events {
		events <- event
	}
	close(events)
	return httpTestDirectorSubscription{events: events}, nil
}

type httpTestDirectorSubscription struct {
	events chan director.DirectorEvent
}

func (subscription httpTestDirectorSubscription) Events() <-chan director.DirectorEvent {
	return subscription.events
}

func (subscription httpTestDirectorSubscription) Unsubscribe() {}
