package hostedmeasurement

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"setta/internal/controlplane"
	"setta/internal/runtimeprovider"
)

func TestCandidateBWorkloadMeasuresHTTPAndSSEWithoutUnauthenticatedSpriteWake(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	credential, err := controlplane.NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	credentialPath := filepath.Join(directory, clientCredentialFileName)
	if err := writeLocalClientCredential(credentialPath, credential); err != nil {
		t.Fatal(err)
	}
	provider := &fakeHostedWakeController{activity: runtimeprovider.RuntimeActivityActive}
	server := newCandidateBTestServer(t, credential.Token, nil)
	defer server.Close()
	client := server.Client()
	client.Timeout = 5 * time.Second
	runtime := HostedRuntime{Sprite: PreparedSprite{Observation: runtimeprovider.RuntimeObservation{
		Name: "setta-u-0123456789abcdef0123456789abcdef", Placement: "yyz",
	}}}
	workload := CandidateBWorkload{
		HTTPClient: client, Provider: provider, baseURL: server.URL,
		Now:   func() time.Time { return testAuthorizedAt.Add(10 * time.Minute) },
		Sleep: func(context.Context, time.Duration) error { return nil },
	}
	if err := workload.Execute(context.Background(), authorization, runtime, ControlPlaneBootstrapResult{
		ClientCredentialPath: credentialPath, DeviceID: credential.DeviceID,
	}); err != nil {
		t.Fatal(err)
	}
	data, err := readPrivateRegularFile(filepath.Join(directory, candidateBReportFileName), maximumBootstrapEventBytes, "test report")
	if err != nil {
		t.Fatal(err)
	}
	var report CandidateBReport
	if err := json.Unmarshal(data, &report); err != nil {
		t.Fatal(err)
	}
	if !report.Passed || report.UnauthenticatedStatus != http.StatusUnauthorized || report.UnauthenticatedOpenedRuntime ||
		report.MeasurementsPerPath != candidateBMeasurementCount {
		t.Fatalf("Candidate B report = %+v", report)
	}
	if provider.suspendCalls != 1 || provider.inspectCalls != 2 {
		t.Fatalf("provider calls = suspend %d inspect %d", provider.suspendCalls, provider.inspectCalls)
	}
	if err := workload.Execute(context.Background(), authorization, runtime, ControlPlaneBootstrapResult{
		ClientCredentialPath: credentialPath, DeviceID: credential.DeviceID,
	}); err != nil {
		t.Fatal(err)
	}
	if provider.suspendCalls != 1 {
		t.Fatal("valid durable report reran the hosted measurement")
	}
}

func TestCandidateBWorkloadFailsWhenUnauthenticatedRequestWakesSprite(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	credential, err := controlplane.NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	credentialPath := filepath.Join(directory, clientCredentialFileName)
	if err := writeLocalClientCredential(credentialPath, credential); err != nil {
		t.Fatal(err)
	}
	provider := &fakeHostedWakeController{activity: runtimeprovider.RuntimeActivityActive}
	server := newCandidateBTestServer(t, credential.Token, func() { provider.setActivity(runtimeprovider.RuntimeActivityActive) })
	defer server.Close()
	client := server.Client()
	client.Timeout = 5 * time.Second
	workload := CandidateBWorkload{
		HTTPClient: client, Provider: provider, baseURL: server.URL,
		Sleep: func(context.Context, time.Duration) error { return nil },
	}
	runtime := HostedRuntime{Sprite: PreparedSprite{Observation: runtimeprovider.RuntimeObservation{
		Name: "setta-u-0123456789abcdef0123456789abcdef",
	}}}
	err = workload.Execute(context.Background(), authorization, runtime, ControlPlaneBootstrapResult{
		ClientCredentialPath: credentialPath, DeviceID: credential.DeviceID,
	})
	if err == nil {
		t.Fatal("Candidate B workload accepted an unauthenticated Sprite wake")
	}
}

func newCandidateBTestServer(t *testing.T, credential string, unauthenticated func()) *httptest.Server {
	t.Helper()
	return httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer "+credential {
			if unauthenticated != nil {
				unauthenticated()
			}
			response.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch request.URL.Path {
		case "/workspace-session":
			response.Header().Set("Content-Type", "application/json")
			_, _ = response.Write([]byte(`{"ok":true}`))
		case "/codex/account/events":
			response.Header().Set("Content-Type", "text/event-stream")
			_, _ = response.Write([]byte("event: snapshot\ndata: {}\n\n"))
		default:
			response.WriteHeader(http.StatusNotFound)
		}
	}))
}

type fakeHostedWakeController struct {
	mu           sync.Mutex
	activity     runtimeprovider.RuntimeActivity
	inspectCalls int
	suspendCalls int
}

func (provider *fakeHostedWakeController) Suspend(context.Context, string) error {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	provider.suspendCalls++
	provider.activity = runtimeprovider.RuntimeActivityCold
	return nil
}

func (provider *fakeHostedWakeController) Inspect(
	context.Context,
	string,
) (runtimeprovider.RuntimeObservation, bool, error) {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	provider.inspectCalls++
	return runtimeprovider.RuntimeObservation{Activity: provider.activity}, true, nil
}

func (provider *fakeHostedWakeController) setActivity(activity runtimeprovider.RuntimeActivity) {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	provider.activity = activity
}
