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

	"setta/internal/credissuer"
	"setta/internal/runtimecapability"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimesetup"
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
	if !runtimecapability.EqualRuntimeFeatureSet(info.FeatureSet, runtimecapability.RuntimeFeatureSetIdentity()) {
		t.Fatalf("runtime info feature set = %+v, want %+v", info.FeatureSet, runtimecapability.RuntimeFeatureSetIdentity())
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

func TestRuntimeInfoIncludesStructuredDiagnostics(t *testing.T) {
	handler := NewHandler(HandlerConfig{
		Metadata:        BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeMetadata: RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
		RuntimeDiagnosticsService: fakeRuntimeDiagnosticsService{
			diagnostics: runtimecapability.RuntimeDiagnostics{
				SettaRelease: runtimecapability.SettaReleaseDiagnostic{
					Status:         runtimecapability.DiagnosticStatusOK,
					RuntimeVersion: "test",
				},
				Codex: runtimecapability.CodexDiagnostic{
					Status: runtimecapability.DiagnosticStatusUnavailable,
					Binary: runtimecapability.CodexBinaryDiagnostic{
						Status: runtimecapability.DiagnosticStatusUnavailable,
					},
					Authentication: runtimecapability.CodexAuthenticationDiagnostic{
						Status: runtimecapability.DiagnosticStatusUnavailable,
					},
				},
				WorkloadLease: runtimecapability.WorkloadLeaseDiagnostic{
					Status: runtimecapability.DiagnosticStatusOK,
				},
				Policy: runtimecapability.PolicyDiagnostic{
					Status: runtimecapability.DiagnosticStatusUnknown,
				},
				DiskSpace: runtimecapability.DiskSpaceDiagnostic{
					Status: runtimecapability.DiagnosticStatusOK,
				},
				ProtectedState: runtimecapability.ProtectedStateDiagnostic{
					Status: runtimecapability.DiagnosticStatusOK,
				},
			},
		},
	})

	info := getJSON[RuntimeInfoResponse](t, handler, "/runtime/info", http.StatusOK)
	if info.Diagnostics.SettaRelease.Status != runtimecapability.DiagnosticStatusOK ||
		info.Diagnostics.Codex.Authentication.Status != runtimecapability.DiagnosticStatusUnavailable ||
		info.Diagnostics.Policy.Status != runtimecapability.DiagnosticStatusUnknown {
		t.Fatalf("runtime diagnostics = %+v", info.Diagnostics)
	}
}

func TestRuntimeInfoWarmWakeKeepsIdentityAndDiagnosticsConsistent(t *testing.T) {
	handler := NewHandler(HandlerConfig{
		Metadata: BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeIdentityService: &fakeRuntimeIdentityService{
			identity: RuntimeIdentity{
				ID:          "0123456789abcdef0123456789abcdef",
				DisplayName: "setta-copper-lantern",
			},
		},
		RuntimeDiagnosticsService: fakeRuntimeDiagnosticsService{
			diagnostics: runtimecapability.RuntimeDiagnostics{
				SettaRelease: runtimecapability.SettaReleaseDiagnostic{
					Status:         runtimecapability.DiagnosticStatusOK,
					RuntimeVersion: "test",
				},
				WorkloadLease: runtimecapability.WorkloadLeaseDiagnostic{
					Status: runtimecapability.DiagnosticStatusOK,
				},
				ProtectedState: runtimecapability.ProtectedStateDiagnostic{
					Status: runtimecapability.DiagnosticStatusOK,
				},
			},
		},
	})
	server := httptest.NewServer(handler)
	defer server.Close()
	client := server.Client()

	first := getHTTPJSON[RuntimeInfoResponse](t, client, server.URL+"/runtime/info", http.StatusOK)
	client.CloseIdleConnections()
	second := getHTTPJSON[RuntimeInfoResponse](t, client, server.URL+"/runtime/info", http.StatusOK)

	if first.RuntimeID != second.RuntimeID ||
		first.DisplayName != second.DisplayName ||
		first.BackendVersion != second.BackendVersion ||
		first.Diagnostics.SettaRelease.Status != second.Diagnostics.SettaRelease.Status ||
		first.Diagnostics.WorkloadLease.Status != second.Diagnostics.WorkloadLease.Status {
		t.Fatalf("runtime info changed across warm wake simulation:\nfirst=%+v\nsecond=%+v", first, second)
	}
	if !runtimecapability.EqualRuntimeFeatureSet(second.FeatureSet, runtimecapability.RuntimeFeatureSetIdentity()) {
		t.Fatalf("warm wake feature set = %+v", second.FeatureSet)
	}
}

func TestSetupAttestationUnauthenticatedWithBoundedSeed(t *testing.T) {
	now := time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
	setupStore, seed := newTestRuntimeSetupStore(t, now)
	handler := NewHandler(HandlerConfig{
		Metadata:            BackendMetadata{Name: BackendName, Version: seed.ReleaseVersion},
		RuntimeMetadata:     RuntimeMetadata{ID: "0123456789abcdef0123456789abcdef", DisplayName: "Test Runtime"},
		RuntimeSetupService: setupStore,
	})

	request := SetupAttestationRequest{
		SetupID: seed.SetupID,
		Nonce:   "nonce-3333333333333333",
	}
	attestation := postJSON[SetupAttestationResponse](t, handler, "/setup/attestation", request, http.StatusOK)
	if attestation.RuntimeID != "0123456789abcdef0123456789abcdef" ||
		attestation.RuntimeName != seed.RuntimeName ||
		attestation.SetupID != seed.SetupID ||
		attestation.CredentialEpoch != int(seed.CredentialEpoch) ||
		attestation.Nonce != request.Nonce ||
		attestation.Algorithm != runtimesetup.AttestationAlgorithm {
		t.Fatalf("setup attestation response = %+v", attestation)
	}
	if !runtimecapability.EqualRuntimeFeatureSet(attestation.FeatureSet, runtimecapability.RuntimeFeatureSetIdentity()) {
		t.Fatalf("setup attestation feature set = %+v", attestation.FeatureSet)
	}
	if err := runtimesetup.VerifyAttestation(runtimesetup.Attestation{
		Algorithm:       attestation.Algorithm,
		BackendName:     attestation.BackendName,
		RuntimeID:       attestation.RuntimeID,
		RuntimeName:     attestation.RuntimeName,
		SetupID:         attestation.SetupID,
		ReleaseVersion:  attestation.ReleaseVersion,
		CredentialEpoch: uint64(attestation.CredentialEpoch),
		FeatureSet:      attestation.FeatureSet,
		Nonce:           attestation.Nonce,
		ExpiresAt:       attestation.ExpiresAt,
		Attestation:     attestation.Attestation,
	}, seed.AttestationKey); err != nil {
		t.Fatalf("VerifyAttestation: %v", err)
	}

	replay := postJSON[ErrorResponse](t, handler, "/setup/attestation", request, http.StatusUnauthorized)
	if replay.Error.Code != "setup_attestation_replayed_nonce" {
		t.Fatalf("replay error code = %q, want setup_attestation_replayed_nonce", replay.Error.Code)
	}
}

func TestSetupAttestationRejectsRestoredStaleSeedReleaseMismatch(t *testing.T) {
	now := time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
	setupStore, seed := newTestRuntimeSetupStore(t, now)
	handler := NewHandler(HandlerConfig{
		Metadata:            BackendMetadata{Name: BackendName, Version: "v2.0.0"},
		RuntimeMetadata:     RuntimeMetadata{ID: "0123456789abcdef0123456789abcdef", DisplayName: "Test Runtime"},
		RuntimeSetupService: setupStore,
	})

	response := postJSON[ErrorResponse](t, handler, "/setup/attestation", SetupAttestationRequest{
		SetupID: seed.SetupID,
		Nonce:   "nonce-restored-0123456789",
	}, http.StatusUnauthorized)
	if response.Error.Code != "setup_attestation_release_mismatch" {
		t.Fatalf("error code = %q, want setup_attestation_release_mismatch", response.Error.Code)
	}
}

func TestSetupAttestationUsesGlobalFailureRateLimit(t *testing.T) {
	now := time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
	setupStore, _ := newTestRuntimeSetupStore(t, now)
	limiter := NewPairingFailureLimiter(2, time.Minute)
	handler := NewHandler(HandlerConfig{
		Metadata:                BackendMetadata{Name: BackendName, Version: "v1.2.3"},
		RuntimeMetadata:         RuntimeMetadata{ID: "0123456789abcdef0123456789abcdef", DisplayName: "Test Runtime"},
		RuntimeSetupService:     setupStore,
		SetupAttestationLimiter: limiter,
	})
	request := SetupAttestationRequest{
		SetupID: "setup_missing",
		Nonce:   "nonce-4444444444444444",
	}

	postJSON[ErrorResponse](t, handler, "/setup/attestation", request, http.StatusUnauthorized)
	request.Nonce = "nonce-5555555555555555"
	postJSON[ErrorResponse](t, handler, "/setup/attestation", request, http.StatusUnauthorized)
	request.Nonce = "nonce-6666666666666666"
	response := postJSON[ErrorResponse](t, handler, "/setup/attestation", request, http.StatusTooManyRequests)
	if response.Error.Code != "setup_attestation_rate_limited" {
		t.Fatalf("error code = %q, want setup_attestation_rate_limited", response.Error.Code)
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

func TestPairingCompleteAndDeviceRevocationThroughHTTP(t *testing.T) {
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

	paired := postJSON[CompletePairingResponse](t, handler, "/pairing/complete", CompletePairingRequest{
		ClientDisplayName: "Paired desktop",
		PairingToken:      pairingToken,
	}, http.StatusOK)
	if paired.DeviceID == "" || paired.DeviceToken == "" || paired.RuntimeID != "runtime_test" {
		t.Fatalf("pairing response = %+v", paired)
	}

	revoked := postJSONWithToken[RevokeDeviceResponse](t, handler, "/devices/revoke", RevokeDeviceRequest{
		DeviceID: paired.DeviceID,
	}, paired.DeviceToken, http.StatusOK)
	if revoked.Device.ID != paired.DeviceID || revoked.Device.RevokedAt == nil {
		t.Fatalf("revoked device = %+v, want device %s revoked", revoked.Device, paired.DeviceID)
	}
	assertUnauthorized(t, handler, "Bearer "+paired.DeviceToken)
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

func TestRuntimeAccessGrantRevocationClosesLiveSSEWithinBoundWithFakeClock(t *testing.T) {
	issuer, token, deviceID, runtimeName := newTestRuntimeAccessIssuer(t)
	events := make(chan workspaceactivity.WorkspaceActivityEvent)
	revalidationClock := newFakeConnectionRevalidationClock()
	handler := NewHandler(HandlerConfig{
		Metadata:                    BackendMetadata{Name: BackendName, Version: "test"},
		RevocationSweepInterval:     2 * time.Second,
		ConnectionRevalidationClock: revalidationClock,
		RuntimeAccessService:        issuer,
		RuntimeMetadata:             RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
		WorkspaceActivityService:    &fakeWorkspaceActivityService{events: events},
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
	ticker := revalidationClock.nextTicker(t)
	if ticker.interval != 2*time.Second {
		t.Fatalf("revalidation interval = %s, want 2s", ticker.interval)
	}

	if _, ok, err := issuer.RevokeRuntimeAccessGrant(context.Background(), deviceID, runtimeName); err != nil || !ok {
		t.Fatalf("RevokeRuntimeAccessGrant ok=%v err=%v", ok, err)
	}

	readDone := make(chan error, 1)
	go func() {
		_, err := response.Body.Read(make([]byte, 1))
		readDone <- err
	}()
	ticker.tick(time.Date(2026, 7, 16, 12, 0, 2, 0, time.UTC))
	select {
	case err := <-readDone:
		if err != nil && !errors.Is(err, io.EOF) {
			t.Fatalf("read after grant revocation: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("stream did not close after credential revalidation tick")
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

func getHTTPJSON[T any](t *testing.T, client *http.Client, url string, wantStatus int) T {
	t.Helper()
	response, err := client.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read %s response: %v", url, err)
	}
	if response.StatusCode != wantStatus {
		t.Fatalf("%s status = %d, want %d, body: %s", url, response.StatusCode, wantStatus, string(body))
	}
	var decoded T
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatalf("decode response %s: %v", url, err)
	}
	return decoded
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

type fakeRuntimeDiagnosticsService struct {
	diagnostics runtimecapability.RuntimeDiagnostics
}

func (service fakeRuntimeDiagnosticsService) RuntimeDiagnostics(context.Context) runtimecapability.RuntimeDiagnostics {
	return service.diagnostics
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

func newTestRuntimeSetupStore(t *testing.T, now time.Time) (*runtimesetup.Store, runtimesetup.Seed) {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("httpapi-setup-attestation")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	seed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     identity.Name,
		SetupID:         "setup_http_012345",
		ReleaseVersion:  "v1.2.3",
		CredentialEpoch: 1,
		AttestationKey:  "attestation-key-3333333333333333",
	}, now)
	if err != nil {
		t.Fatalf("NewSeed: %v", err)
	}
	store, err := runtimesetup.NewStore(t.TempDir(), runtimesetup.WithClock(func() time.Time {
		return now
	}))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if err := runtimesetup.WriteSeedFile(store.Path(), seed); err != nil {
		t.Fatalf("WriteSeedFile: %v", err)
	}
	return store, seed
}

func newTestRuntimeAccessIssuer(t *testing.T) (*credissuer.Issuer, string, string, string) {
	t.Helper()
	now := time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
	issuer, err := credissuer.NewIssuer(credissuer.Config{
		Issuer:   "setta-control-plane",
		Audience: "setta-runtime",
		Clock: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("NewIssuer: %v", err)
	}
	userID := "user_httpapi"
	deviceID := "device_httpapi"
	identity, err := runtimeprovider.NewManagedIdentity("httpapi-runtime-access")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	if _, err := issuer.UpsertUser(context.Background(), userID); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	if _, err := issuer.RegisterDevice(context.Background(), userID, deviceID); err != nil {
		t.Fatalf("RegisterDevice: %v", err)
	}
	if _, err := issuer.RegisterRuntime(context.Background(), userID, identity.Name, 1); err != nil {
		t.Fatalf("RegisterRuntime: %v", err)
	}
	seed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     identity.Name,
		SetupID:         "setup_runtime_access",
		ReleaseVersion:  "v1.2.3",
		CredentialEpoch: 1,
		AttestationKey:  "attestation-key-runtime-access-012345",
	}, now)
	if err != nil {
		t.Fatalf("NewSeed: %v", err)
	}
	if err := issuer.RegisterSetupSeed(context.Background(), seed); err != nil {
		t.Fatalf("RegisterSetupSeed: %v", err)
	}
	store, err := runtimesetup.NewStore(t.TempDir(), runtimesetup.WithClock(func() time.Time {
		return now
	}))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if err := runtimesetup.WriteSeedFile(store.Path(), seed); err != nil {
		t.Fatalf("WriteSeedFile: %v", err)
	}
	attestation, status, err := store.CreateAttestation(context.Background(), runtimesetup.AttestationChallenge{
		BackendName:    BackendName,
		RuntimeID:      "0123456789abcdef0123456789abcdef",
		SetupID:        seed.SetupID,
		ReleaseVersion: seed.ReleaseVersion,
		FeatureSet:     runtimecapability.RuntimeFeatureSetIdentity(),
		Nonce:          "nonce-runtime-access",
	})
	if err != nil {
		t.Fatalf("CreateAttestation: %v", err)
	}
	if status != runtimesetup.AttestationOK {
		t.Fatalf("attestation status = %s, want ok", status)
	}
	_, credential, err := issuer.AuthorizeRuntimeAccess(context.Background(), credissuer.AuthorizeRuntimeAccessRequest{
		DeviceID:    deviceID,
		RuntimeName: identity.Name,
		Attestation: attestation,
	})
	if err != nil {
		t.Fatalf("AuthorizeRuntimeAccess: %v", err)
	}
	return issuer, credential.Token, deviceID, identity.Name
}

type fakeConnectionRevalidationClock struct {
	tickers chan *fakeConnectionRevalidationTicker
}

func newFakeConnectionRevalidationClock() *fakeConnectionRevalidationClock {
	return &fakeConnectionRevalidationClock{
		tickers: make(chan *fakeConnectionRevalidationTicker, 1),
	}
}

func (clock *fakeConnectionRevalidationClock) NewTicker(interval time.Duration) ConnectionRevalidationTicker {
	ticker := &fakeConnectionRevalidationTicker{
		interval: interval,
		c:        make(chan time.Time, 1),
	}
	clock.tickers <- ticker
	return ticker
}

func (clock *fakeConnectionRevalidationClock) nextTicker(t *testing.T) *fakeConnectionRevalidationTicker {
	t.Helper()
	select {
	case ticker := <-clock.tickers:
		return ticker
	case <-time.After(time.Second):
		t.Fatal("connection revalidation ticker was not created")
		return nil
	}
}

type fakeConnectionRevalidationTicker struct {
	interval time.Duration
	c        chan time.Time
}

func (ticker *fakeConnectionRevalidationTicker) C() <-chan time.Time {
	return ticker.c
}

func (ticker *fakeConnectionRevalidationTicker) Stop() {
}

func (ticker *fakeConnectionRevalidationTicker) tick(now time.Time) {
	ticker.c <- now
}
