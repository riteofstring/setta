package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/easyrun"
)

func TestReadEasyRunSnapshotUsesWorkspaceQueryAndReturnsEmptySnapshot(t *testing.T) {
	service := newHTTPTestEasyRunService(t)
	server := httptest.NewServer(newAuthenticatedTestHandler(t, HandlerConfig{
		EasyRunService: service,
		Metadata:       BackendMetadata{Name: BackendName, Version: "test"},
	}))
	defer server.Close()

	response, err := http.Get(server.URL + "/easy-runs/snapshot?workspaceId=workspace_api")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.StatusCode)
	}

	var snapshot easyrun.EasyRunSnapshot
	if err := json.NewDecoder(response.Body).Decode(&snapshot); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	if snapshot.LatestRun != nil || len(snapshot.Highlights) != 0 || len(snapshot.Artifacts) != 0 {
		t.Fatalf("snapshot = %+v, want empty latest run and rails", snapshot)
	}
	if !strings.HasPrefix(snapshot.EventStreamCursor.StreamID, easyrun.EasyRunEventStreamID+"_") {
		t.Fatalf("snapshot cursor = %+v, want easy-run stream", snapshot.EventStreamCursor)
	}
}

func TestReadEasyRunSnapshotRejectsMissingWorkspaceQuery(t *testing.T) {
	service := newHTTPTestEasyRunService(t)
	server := httptest.NewServer(newAuthenticatedTestHandler(t, HandlerConfig{
		EasyRunService: service,
		Metadata:       BackendMetadata{Name: BackendName, Version: "test"},
	}))
	defer server.Close()

	response, err := http.Get(server.URL + "/easy-runs/snapshot")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", response.StatusCode)
	}
}

func TestEasyRunEventStreamRejectsMalformedCursor(t *testing.T) {
	service := newHTTPTestEasyRunService(t)
	server := httptest.NewServer(newAuthenticatedTestHandler(t, HandlerConfig{
		EasyRunService: service,
		Metadata:       BackendMetadata{Name: BackendName, Version: "test"},
	}))
	defer server.Close()

	request, err := http.NewRequest(http.MethodGet, server.URL+"/easy-runs/events", nil)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	request.Header.Set("Last-Event-ID", "not-a-cursor")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("request stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", response.StatusCode)
	}
}

type httpTestEasyRunService struct {
	*easyrun.Service
}

func newHTTPTestEasyRunService(t *testing.T) *httpTestEasyRunService {
	t.Helper()
	store, err := easyrun.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("create easy-run store: %v", err)
	}
	service, err := easyrun.NewService(store)
	if err != nil {
		t.Fatalf("create easy-run service: %v", err)
	}
	t.Cleanup(service.CloseEvents)
	return &httpTestEasyRunService{Service: service}
}
