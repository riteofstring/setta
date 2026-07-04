package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"setta/internal/workspaceactivity"
)

func TestAuthMiddlewareRejectsMissingBadAndRevokedToken(t *testing.T) {
	store, token := newTestRuntimeAuthStore(t)
	handler := NewHandler(HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeAuthService: store,
		RuntimeMetadata:    RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
	})

	assertUnauthorized(t, handler, "")
	assertUnauthorized(t, handler, "Bearer not-"+token)

	session, ok, err := store.ResolveDeviceToken(context.Background(), token)
	if err != nil || !ok {
		t.Fatalf("resolve test token ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.RevokeDeviceSession(context.Background(), session.ID); err != nil || !ok {
		t.Fatalf("revoke test session ok=%v err=%v", ok, err)
	}
	assertUnauthorized(t, handler, "Bearer "+token)
}

func TestUnauthenticatedRuntimeRoutesAreReachable(t *testing.T) {
	store, _ := newTestRuntimeAuthStore(t)
	_, pairingToken, err := store.CreatePairingToken(context.Background())
	if err != nil {
		t.Fatalf("create pairing token: %v", err)
	}
	handler := NewHandler(HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeAuthService: store,
		RuntimeMetadata:    RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
	})

	info := getJSON[RuntimeInfoResponse](t, handler, "/runtime/info", http.StatusOK)
	if info.RuntimeID != "runtime_test" || info.ProtocolVersion != ProtocolVersion {
		t.Fatalf("runtime info = %+v", info)
	}
	health := getJSON[BackendHealth](t, handler, "/health", http.StatusOK)
	if !health.OK || health.ProtocolVersion != ProtocolVersion {
		t.Fatalf("health = %+v", health)
	}
	paired := postJSON[CompletePairingResponse](t, handler, "/pairing/complete", CompletePairingRequest{
		ClientDisplayName: "Unauthed pairing client",
		PairingToken:      pairingToken,
	}, http.StatusOK)
	if paired.DeviceID == "" || paired.DeviceToken == "" || paired.RuntimeID != "runtime_test" {
		t.Fatalf("pairing response = %+v", paired)
	}
}

func TestPairingCompleteUsesGlobalFailureRateLimit(t *testing.T) {
	store, _ := newTestRuntimeAuthStore(t)
	limiter := NewPairingFailureLimiter(2, time.Minute)
	handler := NewHandler(HandlerConfig{
		Metadata:              BackendMetadata{Name: BackendName, Version: "test"},
		PairingFailureLimiter: limiter,
		RuntimeAuthService:    store,
		RuntimeMetadata:       RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
	})
	request := CompletePairingRequest{
		ClientDisplayName: "Rate limited client",
		PairingToken:      "invalid",
	}
	postJSON[ErrorResponse](t, handler, "/pairing/complete", request, http.StatusUnauthorized)
	postJSON[ErrorResponse](t, handler, "/pairing/complete", request, http.StatusUnauthorized)
	response := postJSON[ErrorResponse](t, handler, "/pairing/complete", request, http.StatusTooManyRequests)
	if response.Error.Code != "pairing_rate_limited" {
		t.Fatalf("error code = %q, want pairing_rate_limited", response.Error.Code)
	}
}

func TestAuthenticatedSSEStreamsAndRejectsQueryStringToken(t *testing.T) {
	store, token := newTestRuntimeAuthStore(t)
	event := workspaceActivityTestEvent()
	events := make(chan workspaceactivity.WorkspaceActivityEvent, 1)
	events <- event
	close(events)
	handler := NewHandler(HandlerConfig{
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeAuthService:       store,
		RuntimeMetadata:          RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
		WorkspaceActivityService: &fakeWorkspaceActivityService{events: events},
	})
	server := httptest.NewServer(handler)
	defer server.Close()

	queryRequest, err := http.NewRequest(http.MethodGet, server.URL+"/workspace-activity/events?token="+token, nil)
	if err != nil {
		t.Fatalf("create query token stream request: %v", err)
	}
	queryResponse, err := server.Client().Do(queryRequest)
	if err != nil {
		t.Fatalf("open query token stream: %v", err)
	}
	queryResponse.Body.Close()
	if queryResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf("query token stream status = %d, want 401", queryResponse.StatusCode)
	}

	request, err := http.NewRequest(http.MethodGet, server.URL+"/workspace-activity/events", nil)
	if err != nil {
		t.Fatalf("create stream request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatalf("open stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("stream status = %d, want 200", response.StatusCode)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read stream body: %v", err)
	}
	if !bytes.Contains(body, []byte("event: workspace_activity.resync_required")) {
		t.Fatalf("stream body = %s", body)
	}
}

func TestRevocationSweepClosesLiveSSEStream(t *testing.T) {
	store, token := newTestRuntimeAuthStore(t)
	events := make(chan workspaceactivity.WorkspaceActivityEvent)
	handler := NewHandler(HandlerConfig{
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
		RevocationSweepInterval:  10 * time.Millisecond,
		RuntimeAuthService:       store,
		RuntimeMetadata:          RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
		WorkspaceActivityService: &fakeWorkspaceActivityService{events: events},
	})
	server := httptest.NewServer(handler)
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL+"/workspace-activity/events", nil)
	if err != nil {
		t.Fatalf("create stream request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatalf("open stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("stream status = %d, want 200", response.StatusCode)
	}

	session, ok, err := store.ResolveDeviceToken(context.Background(), token)
	if err != nil || !ok {
		t.Fatalf("resolve stream token ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.RevokeDeviceSession(context.Background(), session.ID); err != nil || !ok {
		t.Fatalf("revoke stream session ok=%v err=%v", ok, err)
	}

	readDone := make(chan error, 1)
	go func() {
		_, err := response.Body.Read(make([]byte, 1))
		readDone <- err
	}()
	select {
	case err := <-readDone:
		if err != nil && !errors.Is(err, io.EOF) {
			t.Fatalf("read after revocation: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("stream did not close after revocation sweep")
	}
}

func assertUnauthorized(t *testing.T, handler http.Handler, authorization string) {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/appearance/settings", nil)
	if authorization != "" {
		request.Header.Set("Authorization", authorization)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", response.Code)
	}
	var payload ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if payload.Error.Code != "unauthorized" {
		t.Fatalf("error code = %q, want unauthorized", payload.Error.Code)
	}
}

func workspaceActivityTestEvent() workspaceactivity.WorkspaceActivityEvent {
	return workspaceactivity.WorkspaceActivityEvent{
		EmittedAt:     "2026-06-21T12:00:00Z",
		EventID:       "workspace_activity_stream:1",
		Revision:      1,
		SchemaVersion: workspaceactivity.SchemaVersion,
		Sequence:      1,
		StreamID:      "workspace_activity_stream",
		Type:          workspaceactivity.EventTypeResyncRequired,
		WorkspaceID:   "workspace_activity",
		Resync: &workspaceactivity.WorkspaceActivityResyncRequired{
			CurrentRevision:   1,
			CurrentSequence:   1,
			CurrentStreamID:   "workspace_activity_stream",
			EarliestSequence:  1,
			Reason:            "test resync",
			RequestedSequence: 0,
			RequestedStreamID: "",
		},
	}
}
