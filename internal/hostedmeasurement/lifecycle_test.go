package hostedmeasurement

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/controlplane"
)

func TestCandidateBLifecycleWorkloadMeasuresLiveRevocationSuspensionAndRateLimit(t *testing.T) {
	fixture := newCandidateBLifecycleTestFixture(t)
	defer fixture.server.Close()
	workload := CandidateBLifecycleWorkload{
		Fly: fixture.executor, HTTPClient: fixture.client, State: fixture.store, baseURL: fixture.server.URL,
		Now: func() time.Time { return testAuthorizedAt.Add(15 * time.Minute) },
	}
	if err := workload.Execute(context.Background(), fixture.authorization, fixture.runtime, fixture.bootstrap); err != nil {
		t.Fatal(err)
	}
	verifyCandidateBLifecycleResult(t, fixture)
	if err := workload.Execute(context.Background(), fixture.authorization, fixture.runtime, fixture.bootstrap); err != nil {
		t.Fatal(err)
	}
	if fixture.executor.calls != 4 {
		t.Fatal("valid durable lifecycle report reran administration")
	}
}

type candidateBLifecycleTestFixture struct {
	authorization Authorization
	bootstrap     ControlPlaneBootstrapResult
	client        *http.Client
	executor      *fakeHostedMachineExecutor
	original      controlplane.DeviceCredential
	runtime       HostedRuntime
	server        *httptest.Server
	store         *StateStore
}

func newCandidateBLifecycleTestFixture(t *testing.T) candidateBLifecycleTestFixture {
	t.Helper()
	authorization, store, runtime := bootstrapTestState(t)
	original, err := controlplane.NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	originalPath := filepath.Join(authorization.StateDirectory, clientCredentialFileName)
	if err := writeLocalClientCredential(originalPath, original); err != nil {
		t.Fatal(err)
	}
	state := newLifecycleTestState(original)
	server := httptest.NewTLSServer(state)
	client := server.Client()
	client.Timeout = 5 * time.Second
	return candidateBLifecycleTestFixture{
		authorization: authorization,
		bootstrap:     ControlPlaneBootstrapResult{ClientCredentialPath: originalPath, DeviceID: original.DeviceID},
		client:        client,
		executor:      &fakeHostedMachineExecutor{resultFunc: state.execResult},
		original:      original,
		runtime:       runtime,
		server:        server,
		store:         store,
	}
}

func verifyCandidateBLifecycleResult(t *testing.T, fixture candidateBLifecycleTestFixture) {
	t.Helper()
	data, err := readPrivateRegularFile(
		filepath.Join(fixture.authorization.StateDirectory, candidateBLifecycleReportFileName),
		maximumBootstrapEventBytes,
		"test lifecycle report",
	)
	if err != nil {
		t.Fatal(err)
	}
	var report CandidateBLifecycleReport
	if err := json.Unmarshal(data, &report); err != nil {
		t.Fatal(err)
	}
	if !report.Passed || !report.RotationPassed || !report.RevocationPassed || !report.SuspensionPassed ||
		!report.ResumePassed || !report.RateLimitPassed || report.RateLimitedAfterRequests != 3 {
		t.Fatalf("lifecycle report = %+v", report)
	}
	verifyCandidateBLifecycleCredentials(t, fixture, data)
	if fixture.executor.calls != 4 {
		t.Fatalf("administration calls = %d", fixture.executor.calls)
	}
}

func verifyCandidateBLifecycleCredentials(t *testing.T, fixture candidateBLifecycleTestFixture, report []byte) {
	t.Helper()
	replacement, found, err := loadLocalClientCredential(filepath.Join(fixture.authorization.StateDirectory, replacementCredentialFileName))
	if err != nil || !found || replacement.DeviceID == fixture.original.DeviceID {
		t.Fatalf("replacement credential = %+v, found=%t, err=%v", replacement, found, err)
	}
	if strings.Contains(string(report), fixture.original.Token) || strings.Contains(string(report), replacement.Token) {
		t.Fatal("lifecycle report exposed credential material")
	}
}

type lifecycleTestDevice struct {
	deviceID string
	revoked  bool
	requests int
}

type lifecycleTestState struct {
	mu        sync.Mutex
	devices   map[string]*lifecycleTestDevice
	streams   map[string][]chan struct{}
	suspended bool
}

func newLifecycleTestState(original controlplane.DeviceCredential) *lifecycleTestState {
	return &lifecycleTestState{
		devices: map[string]*lifecycleTestDevice{
			original.Token: {deviceID: original.DeviceID},
		},
		streams: make(map[string][]chan struct{}),
	}
}

func (state *lifecycleTestState) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	token := strings.TrimPrefix(request.Header.Get("Authorization"), "Bearer ")
	status := state.authorize(token)
	if status != http.StatusOK {
		response.WriteHeader(status)
		return
	}
	switch request.URL.Path {
	case "/workspace-session":
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"ok":true}`))
	case "/codex/account/events":
		state.serveEventStream(response, request, token)
	default:
		response.WriteHeader(http.StatusNotFound)
	}
}

func (state *lifecycleTestState) authorize(token string) int {
	state.mu.Lock()
	defer state.mu.Unlock()
	device := state.devices[token]
	switch {
	case device == nil || device.revoked:
		return http.StatusUnauthorized
	case state.suspended:
		return http.StatusForbidden
	case device.requests >= 5:
		return http.StatusTooManyRequests
	default:
		device.requests++
		return http.StatusOK
	}
}

func (state *lifecycleTestState) serveEventStream(
	response http.ResponseWriter,
	request *http.Request,
	token string,
) {
	closed := make(chan struct{})
	state.mu.Lock()
	state.streams[token] = append(state.streams[token], closed)
	state.mu.Unlock()
	response.Header().Set("Content-Type", "text/event-stream")
	_, _ = response.Write([]byte("event: snapshot\ndata: {}\n\n"))
	if flusher, ok := response.(http.Flusher); ok {
		flusher.Flush()
	}
	select {
	case <-closed:
	case <-request.Context().Done():
	}
}

func (state *lifecycleTestState) execResult(request FlyMachineExecRequest) FlyMachineExecResult {
	state.mu.Lock()
	defer state.mu.Unlock()
	var event controlplane.AdminEvent
	switch {
	case strings.Contains(request.Command, " ensure-device "):
		var credential controlplane.DeviceCredential
		if err := json.Unmarshal(request.Stdin, &credential); err != nil {
			return FlyMachineExecResult{ExitCode: 1}
		}
		state.devices[credential.Token] = &lifecycleTestDevice{deviceID: credential.DeviceID}
		event = controlplane.AdminEvent{DeviceID: credential.DeviceID, Event: "device_ensured"}
	case strings.Contains(request.Command, " revoke-device "):
		deviceID := commandArgument(request.Command, "--device-id")
		for token, device := range state.devices {
			if device.deviceID == deviceID {
				device.revoked = true
				state.closeStreams(token)
			}
		}
		event = controlplane.AdminEvent{DeviceID: deviceID, Event: "device_revoked"}
	case strings.Contains(request.Command, " set-user-status "):
		status := commandArgument(request.Command, "--status")
		state.suspended = status == string(controlplane.UserStatusSuspended)
		if state.suspended {
			for token := range state.streams {
				state.closeStreams(token)
			}
		}
		event = controlplane.AdminEvent{
			Event: "user_status_set", Status: status,
			UserID: commandArgument(request.Command, "--user-id"),
		}
	default:
		return FlyMachineExecResult{ExitCode: 1}
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return FlyMachineExecResult{ExitCode: 1}
	}
	return FlyMachineExecResult{Stdout: append(payload, '\n')}
}

func (state *lifecycleTestState) closeStreams(token string) {
	for _, stream := range state.streams[token] {
		close(stream)
	}
	delete(state.streams, token)
}

func commandArgument(command string, name string) string {
	parts := strings.Fields(command)
	for index := 0; index+1 < len(parts); index++ {
		if parts[index] == name {
			return parts[index+1]
		}
	}
	return ""
}
