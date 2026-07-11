package httpapi

import (
	"encoding/json"
	"errors"
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

func TestSteerEasyRunEndpointReturnsTypedError(t *testing.T) {
	service := newHTTPTestEasyRunService(t)
	server := httptest.NewServer(newAuthenticatedTestHandler(t, HandlerConfig{
		EasyRunService: service,
		Metadata:       BackendMetadata{Name: BackendName, Version: "test"},
	}))
	defer server.Close()

	response, err := http.Post(
		server.URL+"/easy-runs/steer",
		"application/json",
		strings.NewReader(`{"workspaceId":"workspace_api","text":"keep going"}`),
	)
	if err != nil {
		t.Fatalf("post steer: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", response.StatusCode)
	}
	var body ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if body.Error.Code != "steer_easy_run_failed" {
		t.Fatalf("error code = %s, want steer_easy_run_failed", body.Error.Code)
	}
}

func TestSteerEasyRunEndpointClassifiesAcceptedFocusUpdatePartialOutcome(t *testing.T) {
	service := &partialFocusHTTPTestEasyRunService{
		httpTestEasyRunService: newHTTPTestEasyRunService(t),
	}
	server := httptest.NewServer(newAuthenticatedTestHandler(t, HandlerConfig{
		EasyRunService: service,
		Metadata:       BackendMetadata{Name: BackendName, Version: "test"},
	}))
	defer server.Close()

	response, err := http.Post(
		server.URL+"/easy-runs/steer",
		"application/json",
		strings.NewReader(`{"workspaceId":"workspace_api","text":"already delivered"}`),
	)
	if err != nil {
		t.Fatalf("post accepted steering partial outcome: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", response.StatusCode)
	}
	var body ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode partial-outcome error: %v", err)
	}
	if body.Error.Code != "steer_easy_run_focus_update_failed" ||
		!strings.Contains(body.Error.Message, "steering accepted but focus update failed") {
		t.Fatalf("partial-outcome error = %+v, want typed accepted-focus code", body.Error)
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

type partialFocusHTTPTestEasyRunService struct {
	*httpTestEasyRunService
}

func (service *partialFocusHTTPTestEasyRunService) Steer(string, string) (easyrun.EasyRun, error) {
	return easyrun.EasyRun{}, &easyrun.AcceptedSteeringFocusUpdateError{Err: errors.New("event stream is unavailable")}
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
