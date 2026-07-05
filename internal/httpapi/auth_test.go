package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
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

func TestUpdateRuntimeDisplayNameRequiresAuthAndUpdatesRuntimeInfo(t *testing.T) {
	store, token := newTestRuntimeAuthStore(t)
	identityService := &fakeRuntimeIdentityService{
		identity: RuntimeIdentity{ID: "runtime_test", DisplayName: "Test Runtime"},
	}
	handler := NewHandler(HandlerConfig{
		Metadata:               BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeAuthService:     store,
		RuntimeIdentityService: identityService,
	})

	unauthorized := postJSON[ErrorResponse](t, handler, "/runtime/display-name/update", UpdateRuntimeDisplayNameRequest{
		DisplayName: "setta-copper-lantern",
	}, http.StatusUnauthorized)
	if unauthorized.Error.Code != "unauthorized" {
		t.Fatalf("unauthorized error code = %q, want unauthorized", unauthorized.Error.Code)
	}

	updated := postJSONWithToken[RuntimeInfoResponse](t, handler, "/runtime/display-name/update", UpdateRuntimeDisplayNameRequest{
		DisplayName: "  setta-copper-lantern  ",
	}, token, http.StatusOK)
	if updated.RuntimeID != "runtime_test" || updated.DisplayName != "setta-copper-lantern" {
		t.Fatalf("updated runtime info = %+v", updated)
	}

	info := getJSON[RuntimeInfoResponse](t, handler, "/runtime/info", http.StatusOK)
	if info.DisplayName != "setta-copper-lantern" {
		t.Fatalf("runtime info display name = %q, want setta-copper-lantern", info.DisplayName)
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

func TestCreateDevicePairingRequiresAuth(t *testing.T) {
	store, _ := newTestRuntimeAuthStore(t)
	handler := NewHandler(HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeAuthService: store,
		RuntimeMetadata:    RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
	})

	response := postJSON[ErrorResponse](t, handler, "/pairing/create-device", CreateDevicePairingRequest{
		RuntimeBaseURL: "https://setta-runtime.tailnet.ts.net",
	}, http.StatusUnauthorized)

	if response.Error.Code != "unauthorized" {
		t.Fatalf("error code = %q, want unauthorized", response.Error.Code)
	}
}

func TestCreateDevicePairingMintsPhoneURLAndUsableToken(t *testing.T) {
	store, token := newTestRuntimeAuthStore(t)
	handler := NewHandler(HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeAuthService: store,
		RuntimeMetadata:    RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
	})

	created := postJSONWithToken[CreateDevicePairingResponse](t, handler, "/pairing/create-device", CreateDevicePairingRequest{
		RuntimeBaseURL: "https://setta-runtime.tailnet.ts.net",
	}, token, http.StatusOK)
	if created.ExpiresAt == "" {
		t.Fatal("pairing response did not include expiresAt")
	}
	parsed, err := url.Parse(created.PairingURL)
	if err != nil {
		t.Fatalf("parse pairing URL: %v", err)
	}
	if parsed.Scheme != "https" || parsed.Host != "setta-runtime.tailnet.ts.net" || parsed.Path != "/" || parsed.RawQuery != "" {
		t.Fatalf("pairing URL = %s, want https ts.net origin with fragment only", created.PairingURL)
	}
	pairingToken := requiredFragmentValue(t, parsed, "pair")
	if strings.Contains(created.PairingURL, "?") || strings.Contains(parsed.EscapedPath(), pairingToken) {
		t.Fatalf("pairing URL leaked token outside fragment: %s", created.PairingURL)
	}

	paired := postJSON[CompletePairingResponse](t, handler, "/pairing/complete", CompletePairingRequest{
		ClientDisplayName: "Phone",
		PairingToken:      pairingToken,
	}, http.StatusOK)
	if paired.DeviceID == "" || paired.DeviceToken == "" || paired.RuntimeID != "runtime_test" {
		t.Fatalf("pairing response = %+v", paired)
	}
}

func TestCreateDevicePairingRequiresTailscaleHTTPSBaseURL(t *testing.T) {
	store, token := newTestRuntimeAuthStore(t)
	handler := NewHandler(HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeAuthService: store,
		RuntimeMetadata:    RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
	})

	for _, runtimeBaseURL := range []string{
		"http://setta-runtime.tailnet.ts.net",
		"https://setta-runtime.example.com",
		"https://setta-runtime.tailnet.ts.net/path",
		"https://setta-runtime.tailnet.ts.net?token=bad",
	} {
		response := postJSONWithToken[ErrorResponse](t, handler, "/pairing/create-device", CreateDevicePairingRequest{
			RuntimeBaseURL: runtimeBaseURL,
		}, token, http.StatusBadRequest)
		if response.Error.Code != "invalid_pairing_base_url" {
			t.Fatalf("%s error code = %q, want invalid_pairing_base_url", runtimeBaseURL, response.Error.Code)
		}
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

func postJSONWithToken[T any](t *testing.T, handler http.Handler, path string, payload any, token string, wantStatus int) T {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal request payload: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewBuffer(body))
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != wantStatus {
		t.Fatalf("%s status = %d, want %d, body: %s", path, response.Code, wantStatus, response.Body.String())
	}
	var decoded T
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		t.Fatalf("decode response %s: %v", path, err)
	}
	return decoded
}

func requiredFragmentValue(t *testing.T, parsed *url.URL, name string) string {
	t.Helper()
	values, err := url.ParseQuery(parsed.Fragment)
	if err != nil {
		t.Fatalf("parse fragment: %v", err)
	}
	value := values.Get(name)
	if value == "" {
		t.Fatalf("fragment missing %s: %s", name, parsed.Fragment)
	}
	return value
}

type fakeRuntimeIdentityService struct {
	identity RuntimeIdentity
}

func (service *fakeRuntimeIdentityService) RuntimeIdentity(context.Context) (RuntimeIdentity, error) {
	return service.identity, nil
}

func (service *fakeRuntimeIdentityService) UpdateRuntimeDisplayName(_ context.Context, displayName string) (RuntimeIdentity, error) {
	service.identity.DisplayName = displayName
	return service.identity, nil
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
