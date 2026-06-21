package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/workspaceactivity"
)

func TestWorkspaceActivitySnapshotEndpoint(t *testing.T) {
	service := &fakeWorkspaceActivityService{
		snapshot: workspaceactivity.WorkspaceActivitySnapshot{
			Activities:    []workspaceactivity.WorkspaceActivityRecord{},
			Revision:      4,
			SchemaVersion: workspaceactivity.SchemaVersion,
			Sequence:      6,
			StreamID:      "workspace_activity_stream",
			WorkspaceID:   "workspace_activity",
		},
	}
	handler := NewHandler(HandlerConfig{
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
		WorkspaceActivityService: service,
	})

	response := postJSON[ReadWorkspaceActivitySnapshotResponse](t, handler, "/workspace-activity/snapshot", ReadWorkspaceActivitySnapshotRequest{
		Limit:       50,
		WorkspaceID: "workspace_activity",
	}, http.StatusOK)

	if service.snapshotWorkspaceID != "workspace_activity" || service.snapshotLimit != 50 {
		t.Fatalf("snapshot request = %q/%d", service.snapshotWorkspaceID, service.snapshotLimit)
	}
	if response.Snapshot.Revision != 4 || response.Snapshot.StreamID != "workspace_activity_stream" {
		t.Fatalf("snapshot response = %+v", response.Snapshot)
	}
}

func TestWorkflowExecutionActivityEndpoint(t *testing.T) {
	service := &fakeWorkspaceActivityService{
		executionSnapshot: workspaceactivity.WorkspaceActivitySnapshot{
			Activities: []workspaceactivity.WorkspaceActivityRecord{{
				ActivityID:    "workflow_node_state:execution_run/node_a",
				Kind:          workspaceactivity.ActivityKindWorkflowStatus,
				SchemaVersion: workspaceactivity.SchemaVersion,
				Status:        workspaceactivity.ActivityStatusCancelled,
				WorkspaceID:   "workspace_activity",
			}},
			Revision:      7,
			SchemaVersion: workspaceactivity.SchemaVersion,
			Sequence:      9,
			StreamID:      "workspace_activity_stream",
			WorkspaceID:   "workspace_activity",
		},
	}
	handler := NewHandler(HandlerConfig{
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
		WorkspaceActivityService: service,
	})

	response := postJSON[ReadWorkflowExecutionActivityResponse](t, handler, "/workspace-activity/execution-snapshot", ReadWorkflowExecutionActivityRequest{
		ExecutionID: "execution_run",
		Limit:       25,
		WorkspaceID: "workspace_activity",
	}, http.StatusOK)

	if service.executionSnapshotWorkspaceID != "workspace_activity" ||
		service.executionSnapshotExecutionID != "execution_run" ||
		service.executionSnapshotLimit != 25 {
		t.Fatalf("execution snapshot request = %q/%q/%d", service.executionSnapshotWorkspaceID, service.executionSnapshotExecutionID, service.executionSnapshotLimit)
	}
	if len(response.Snapshot.Activities) != 1 ||
		response.Snapshot.Activities[0].Status != workspaceactivity.ActivityStatusCancelled {
		t.Fatalf("execution snapshot response = %+v", response.Snapshot)
	}
}

func TestWorkspaceActivityEventStreamWritesTypedSSEAndWorkspaceFilter(t *testing.T) {
	event := workspaceactivity.WorkspaceActivityEvent{
		Delta:         nil,
		EmittedAt:     "2026-06-21T12:00:00Z",
		EventID:       "workspace_activity_stream:2",
		Revision:      2,
		SchemaVersion: workspaceactivity.SchemaVersion,
		Sequence:      2,
		StreamID:      "workspace_activity_stream",
		Type:          workspaceactivity.EventTypeResyncRequired,
		WorkspaceID:   "workspace_activity",
		Resync: &workspaceactivity.WorkspaceActivityResyncRequired{
			CurrentRevision:   2,
			CurrentSequence:   2,
			CurrentStreamID:   "workspace_activity_stream",
			EarliestSequence:  1,
			Reason:            "workspace activity replay is no longer available",
			RequestedSequence: 1,
			RequestedStreamID: "old_stream",
		},
	}
	events := make(chan workspaceactivity.WorkspaceActivityEvent, 1)
	events <- event
	close(events)
	service := &fakeWorkspaceActivityService{events: events}
	handler := NewHandler(HandlerConfig{
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
		WorkspaceActivityService: service,
	})
	server := httptest.NewServer(handler)
	defer server.Close()

	request, err := http.NewRequest(http.MethodGet, server.URL+"/workspace-activity/events?workspaceId=workspace_activity", nil)
	if err != nil {
		t.Fatalf("create event request: %v", err)
	}
	request.Header.Set("Last-Event-ID", "workspace_activity_stream:1")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("get event stream: %v", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read event stream: %v", err)
	}
	text := string(body)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.StatusCode, text)
	}
	if service.subscribeWorkspaceID != "workspace_activity" || service.subscribeCursor.Sequence != 1 {
		t.Fatalf("subscribe request = %+v workspace=%q", service.subscribeCursor, service.subscribeWorkspaceID)
	}
	if !strings.Contains(text, "id: workspace_activity_stream:2") ||
		!strings.Contains(text, "event: workspace_activity.resync_required") ||
		!strings.Contains(text, `"currentRevision":2`) {
		t.Fatalf("event stream body = %s", text)
	}
}

func TestWorkspaceActivityEventStreamRejectsInvalidCursor(t *testing.T) {
	handler := NewHandler(HandlerConfig{
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
		WorkspaceActivityService: &fakeWorkspaceActivityService{},
	})
	request := httptest.NewRequest(http.MethodGet, "/workspace-activity/events?lastEventId=bad", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

type fakeWorkspaceActivityService struct {
	events            chan workspaceactivity.WorkspaceActivityEvent
	snapshot          workspaceactivity.WorkspaceActivitySnapshot
	executionSnapshot workspaceactivity.WorkspaceActivitySnapshot

	snapshotLimit                int
	snapshotWorkspaceID          string
	executionSnapshotWorkspaceID string
	executionSnapshotExecutionID string
	executionSnapshotLimit       int
	subscribeCursor              workspaceactivity.EventCursor
	subscribeWorkspaceID         string
}

func (service *fakeWorkspaceActivityService) ReadSnapshot(workspaceID string, limit int) (workspaceactivity.WorkspaceActivitySnapshot, error) {
	service.snapshotWorkspaceID = workspaceID
	service.snapshotLimit = limit
	return service.snapshot, nil
}

func (service *fakeWorkspaceActivityService) ReadExecutionSnapshot(workspaceID string, executionID string, limit int) (workspaceactivity.WorkspaceActivitySnapshot, error) {
	service.executionSnapshotWorkspaceID = workspaceID
	service.executionSnapshotExecutionID = executionID
	service.executionSnapshotLimit = limit
	return service.executionSnapshot, nil
}

func (service *fakeWorkspaceActivityService) SubscribeEvents(cursor workspaceactivity.EventCursor, workspaceID string) (*workspaceactivity.EventSubscription, error) {
	service.subscribeCursor = cursor
	service.subscribeWorkspaceID = workspaceID
	events := service.events
	if events == nil {
		events = make(chan workspaceactivity.WorkspaceActivityEvent)
		close(events)
	}
	return &workspaceactivity.EventSubscription{Events: events}, nil
}
