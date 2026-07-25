package controlplane

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"setta/internal/httpapi"
	"setta/internal/runtimeaccounting"
)

func TestRuntimeAccountingReportsAuthenticatePersistAndReplayWithoutProviderDial(t *testing.T) {
	ctx := context.Background()
	store, secrets, runtimeName, _ := seededControlPlane(t, ctx)
	defer store.Close()
	credential := newTestRuntimeReportingCredential(t)
	if _, err := store.RotateRuntimeReportingCredential(ctx, runtimeName, credential); err != nil {
		t.Fatal(err)
	}
	var audit bytes.Buffer
	observer, err := NewJSONLinesObserver(&audit)
	if err != nil {
		t.Fatal(err)
	}
	dialer := &testPrivateDialer{target: "127.0.0.1:1"}
	server := startTestServer(t, store, secrets, dialer, observer, 4)
	defer shutdownTestServer(t, server)
	transition := runtimeaccounting.ActivityTransition{
		EventID: "runtime-report-provider-begin",
		At:      time.Date(2026, 7, 25, 19, 0, 0, 0, time.UTC),
		Kind:    runtimeaccounting.ActivityProvider,
		Action:  runtimeaccounting.EventBegin,
	}
	for attempt := 0; attempt < 2; attempt++ {
		response := runtimeAccountingReportRequest(t, server, credential, transition)
		if response.StatusCode != http.StatusNoContent {
			t.Fatalf("runtime accounting report attempt %d status = %d", attempt+1, response.StatusCode)
		}
		_ = response.Body.Close()
	}
	snapshot, err := store.RuntimeAccountingSnapshot(ctx, runtimeName)
	if err != nil || snapshot.Ledger.LastSequence != 1 || !snapshot.Ledger.ProviderActive {
		t.Fatalf("runtime accounting snapshot = %+v, %v", snapshot, err)
	}
	if dialer.calls.Load() != 0 {
		t.Fatalf("runtime accounting report dialed provider %d time(s)", dialer.calls.Load())
	}
	requireContentFreeControlPlaneAudit(t, audit.Bytes(), []ControlPlaneAuditMeasurement{
		{Action: ControlPlaneAuditRuntimeUsageReported, State: "accepted"},
		{Action: ControlPlaneAuditRuntimeUsageReported, State: "accepted"},
	}, []string{runtimeName, credential.Token, transition.EventID})

	conflict := transition
	conflict.At = conflict.At.Add(time.Second)
	response := runtimeAccountingReportRequest(t, server, credential, conflict)
	if response.StatusCode != http.StatusConflict {
		t.Fatalf("conflicting runtime accounting report status = %d", response.StatusCode)
	}
	_ = response.Body.Close()
}

func TestRuntimeAccountingReportsRejectCredentialsMethodsAndInvalidBodies(t *testing.T) {
	ctx := context.Background()
	store, secrets, runtimeName, _ := seededControlPlane(t, ctx)
	defer store.Close()
	credential := newTestRuntimeReportingCredential(t)
	if _, err := store.RotateRuntimeReportingCredential(ctx, runtimeName, credential); err != nil {
		t.Fatal(err)
	}
	observer, err := NewJSONLinesObserver(&bytes.Buffer{})
	if err != nil {
		t.Fatal(err)
	}
	dialer := &testPrivateDialer{target: "127.0.0.1:1"}
	server := startTestServer(t, store, secrets, dialer, observer, 4)
	defer shutdownTestServer(t, server)
	endpoint := httpapi.RuntimeAccountingReportEndpoint()
	target := fmt.Sprintf("http://%s%s", server.Addr(), endpoint.Path)
	for _, authorization := range []string{"", "Basic " + credential.Token, "Bearer invalid"} {
		request, err := http.NewRequest(http.MethodPost, target, strings.NewReader(`{}`))
		if err != nil {
			t.Fatal(err)
		}
		if authorization != "" {
			request.Header.Set("Authorization", authorization)
		}
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != http.StatusUnauthorized {
			t.Fatalf("authorization %q status = %d", authorization, response.StatusCode)
		}
		_ = response.Body.Close()
	}
	request, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+credential.Token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("runtime accounting report GET status = %d", response.StatusCode)
	}
	_ = response.Body.Close()
	for _, body := range []string{
		`{"unknown":true}`,
		`{"event_id":"invalid"}{}`,
	} {
		request, err = http.NewRequest(http.MethodPost, target, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Authorization", "Bearer "+credential.Token)
		response, err = http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("invalid runtime accounting body status = %d", response.StatusCode)
		}
		_ = response.Body.Close()
	}
	oversized := strings.Repeat(" ", int(endpoint.RequestBodyLimitBytes)+1)
	request, err = http.NewRequest(http.MethodPost, target, strings.NewReader(oversized))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+credential.Token)
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized runtime accounting body status = %d", response.StatusCode)
	}
	_ = response.Body.Close()
	if dialer.calls.Load() != 0 {
		t.Fatalf("rejected runtime accounting reports dialed provider %d time(s)", dialer.calls.Load())
	}
}

func runtimeAccountingReportRequest(
	t *testing.T,
	server *Server,
	credential RuntimeReportingCredential,
	transition runtimeaccounting.ActivityTransition,
) *http.Response {
	t.Helper()
	body, err := json.Marshal(transition)
	if err != nil {
		t.Fatal(err)
	}
	endpoint := httpapi.RuntimeAccountingReportEndpoint()
	request, err := http.NewRequest(
		endpoint.Method,
		fmt.Sprintf("http://%s%s", server.Addr(), endpoint.Path),
		bytes.NewReader(body),
	)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+credential.Token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}
