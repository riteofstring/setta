package hostedmeasurement

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

const (
	testMutationToken  = "mutation-token-sentinel"
	testInventoryToken = "inventory-token-sentinel"
)

func TestFlyMachinesClientAppLifecycleUsesSeparatedTokensAndExactPaths(t *testing.T) {
	script := &flyAPIScript{t: t, requests: []flyExpectedRequest{
		{
			method: http.MethodGet, path: "/v1/apps", query: "org_slug=personal", token: testInventoryToken,
			status: http.StatusOK, response: `{"total_apps":1,"apps":[{"id":"app_123","name":"setta-gateway-night"}]}`,
		},
		{
			method: http.MethodPost, path: "/v1/apps", token: testMutationToken, status: http.StatusCreated,
			response: `{"id":"app_123","created_at":1}`,
			body:     flyCreateAppRequest{AppName: "setta-gateway-night", Organization: "personal"},
		},
		{
			method: http.MethodDelete, path: "/v1/apps/setta-gateway-night", query: "force=true",
			token: testMutationToken, status: http.StatusAccepted,
		},
	}}
	client, closeServer := newTestFlyMachinesClient(t, script)
	defer closeServer()
	apps, err := client.ListApps(context.Background(), "personal")
	if err != nil || !reflect.DeepEqual(apps, []ProviderResource{{ID: "app_123", Name: "setta-gateway-night"}}) {
		t.Fatalf("ListApps = %+v, %v", apps, err)
	}
	app, err := client.CreateApp(context.Background(), "personal", "setta-gateway-night")
	if err != nil || app.ID != "app_123" || app.Name != "setta-gateway-night" {
		t.Fatalf("CreateApp = %+v, %v", app, err)
	}
	if err := client.DestroyApp(context.Background(), "personal", "setta-gateway-night"); err != nil {
		t.Fatalf("DestroyApp: %v", err)
	}
	script.assertComplete()
}

func TestFlyMachinesClientVolumeLifecycleEnforcesDisposableShape(t *testing.T) {
	backupDisabled := false
	volume := flyVolumeResponse{
		ID: "vol_123", Name: "setta-gateway-night-data", Region: "yyz", SizeGiB: 1,
		Encrypted: true, AutoBackupEnabled: &backupDisabled,
	}
	volumeJSON := mustJSON(t, volume)
	script := &flyAPIScript{t: t, requests: []flyExpectedRequest{
		{
			method: http.MethodGet, path: "/v1/apps/setta-gateway-night/volumes", token: testInventoryToken,
			status: http.StatusOK, response: "[" + volumeJSON + "]",
		},
		{
			method: http.MethodPost, path: "/v1/apps/setta-gateway-night/volumes", token: testMutationToken,
			status: http.StatusOK, response: volumeJSON,
			body: flyCreateVolumeRequest{
				AutoBackupEnabled: false, Encrypted: true, Name: "setta-gateway-night-data",
				Region: "yyz", RequireUniqueZone: false, SizeGiB: 1,
			},
		},
		{
			method: http.MethodDelete, path: "/v1/apps/setta-gateway-night/volumes/vol_123",
			token: testMutationToken, status: http.StatusOK,
		},
	}}
	client, closeServer := newTestFlyMachinesClient(t, script)
	defer closeServer()
	volumes, err := client.ListVolumes(context.Background(), "setta-gateway-night")
	if err != nil || len(volumes) != 1 || volumes[0].ID != "vol_123" {
		t.Fatalf("ListVolumes = %+v, %v", volumes, err)
	}
	resource, err := client.CreateVolume(context.Background(), VolumeSpec{
		AppName: "setta-gateway-night", Name: "setta-gateway-night-data", Region: "yyz",
		SizeGiB: 1, Encrypted: true, ScheduledSnapshots: false,
	})
	if err != nil || resource.ID != "vol_123" {
		t.Fatalf("CreateVolume = %+v, %v", resource, err)
	}
	if err := client.DestroyVolume(context.Background(), "setta-gateway-night", "vol_123"); err != nil {
		t.Fatalf("DestroyVolume: %v", err)
	}
	script.assertComplete()
}

func TestFlyMachinesClientMachineLifecycleRendersFixedProductionShape(t *testing.T) {
	spec := testMachineSpec()
	machineResponse := `{"id":"machine_123","name":"setta-gateway-night-machine","region":"yyz","state":"started","image_ref":{"digest":"sha256:` + strings.Repeat("a", 64) + `"}}`
	script := &flyAPIScript{t: t, requests: []flyExpectedRequest{
		{
			method: http.MethodGet, path: "/v1/apps/setta-gateway-night/machines", token: testInventoryToken,
			status: http.StatusOK, response: "[" + machineResponse + "]",
		},
		{
			method: http.MethodPost, path: "/v1/apps/setta-gateway-night/machines", token: testMutationToken,
			status: http.StatusOK, response: machineResponse, body: buildCreateMachineRequest(spec),
		},
		{
			method: http.MethodDelete, path: "/v1/apps/setta-gateway-night/machines/machine_123", query: "force=true",
			token: testMutationToken, status: http.StatusOK,
		},
	}}
	client, closeServer := newTestFlyMachinesClient(t, script)
	defer closeServer()
	machines, err := client.ListMachines(context.Background(), spec.AppName)
	if err != nil || len(machines) != 1 || machines[0].Region != "yyz" {
		t.Fatalf("ListMachines = %+v, %v", machines, err)
	}
	resource, err := client.CreateMachine(context.Background(), spec)
	if err != nil || resource.ID != "machine_123" {
		t.Fatalf("CreateMachine = %+v, %v", resource, err)
	}
	if err := client.DestroyMachine(context.Background(), spec.AppName, "machine_123"); err != nil {
		t.Fatalf("DestroyMachine: %v", err)
	}
	script.assertComplete()
}

func TestFlyMachinesClientRejectsUnsafeConfigurationAndWrongShape(t *testing.T) {
	tests := []FlyMachinesClientConfig{
		{BaseURL: "http://api.machines.dev/v1", HTTPClient: &http.Client{Timeout: time.Second}, MutationToken: []byte("one"), InventoryToken: []byte("two")},
		{BaseURL: DefaultFlyMachinesAPI, HTTPClient: &http.Client{}, MutationToken: []byte("one"), InventoryToken: []byte("two")},
		{BaseURL: DefaultFlyMachinesAPI, HTTPClient: &http.Client{Timeout: time.Second}, MutationToken: []byte("same"), InventoryToken: []byte("same")},
	}
	for _, config := range tests {
		if _, err := NewFlyMachinesClient(config); err == nil {
			t.Fatalf("NewFlyMachinesClient accepted unsafe config: %+v", config)
		}
	}
	client := &FlyMachinesClient{}
	if _, err := client.CreateVolume(context.Background(), VolumeSpec{SizeGiB: 3}); err == nil {
		t.Fatal("CreateVolume accepted a non-disposable shape")
	}
	badMachine := testMachineSpec()
	badMachine.MemoryMiB = 512
	if _, err := client.CreateMachine(context.Background(), badMachine); err == nil {
		t.Fatal("CreateMachine accepted a non-fixed shape")
	}
	badMachine = testMachineSpec()
	badMachine.ImageReference = "registry.fly.io/setta-gateway-night@sha256:abc"
	if _, err := client.CreateMachine(context.Background(), badMachine); err == nil {
		t.Fatal("CreateMachine accepted a malformed image digest")
	}
}

func TestFlyMachinesClientRejectsCreatedMachineWithDifferentImageDigest(t *testing.T) {
	spec := testMachineSpec()
	response := `{"id":"machine_123","name":"setta-gateway-night-machine","region":"yyz","image_ref":{"digest":"sha256:` + strings.Repeat("b", 64) + `"}}`
	script := &flyAPIScript{t: t, requests: []flyExpectedRequest{{
		method: http.MethodPost, path: "/v1/apps/setta-gateway-night/machines", token: testMutationToken,
		status: http.StatusOK, response: response, body: buildCreateMachineRequest(spec),
	}}}
	client, closeServer := newTestFlyMachinesClient(t, script)
	defer closeServer()
	if _, err := client.CreateMachine(context.Background(), spec); err == nil {
		t.Fatal("CreateMachine accepted a response attesting a different image digest")
	}
	script.assertComplete()
}

func TestFlyMachinesClientErrorsAreContentFreeAndMapNotFound(t *testing.T) {
	script := &flyAPIScript{t: t, requests: []flyExpectedRequest{
		{
			method: http.MethodGet, path: "/v1/apps", query: "org_slug=personal", token: testInventoryToken,
			status: http.StatusInternalServerError, response: `{"error":"mutation-token-sentinel secret provider detail"}`,
		},
		{
			method: http.MethodDelete, path: "/v1/apps/setta-gateway-night/volumes/vol_missing",
			token: testMutationToken, status: http.StatusNotFound, response: `{"error":"not found detail"}`,
		},
	}}
	client, closeServer := newTestFlyMachinesClient(t, script)
	defer closeServer()
	_, err := client.ListApps(context.Background(), "personal")
	if err == nil || strings.Contains(err.Error(), "sentinel") || strings.Contains(err.Error(), "provider detail") {
		t.Fatalf("contentful API error = %v", err)
	}
	if err := client.DestroyVolume(context.Background(), "setta-gateway-night", "vol_missing"); !errors.Is(err, ErrProviderNotFound) {
		t.Fatalf("not found error = %v", err)
	}
	script.assertComplete()
}

func testMachineSpec() MachineSpec {
	return MachineSpec{
		AppName: "setta-gateway-night", Name: "setta-gateway-night-machine", Region: "yyz",
		ImageReference: testImageReference(), VolumeID: "vol_123", VolumeMountPath: "/data",
		CPUKind: "shared", CPUs: 1, MemoryMiB: 256, InternalPort: 8080, ForceHTTPS: true,
		HardConcurrencyLimit: 64, AutoStartMachines: true, AutoStopMachines: "stop", MinimumMachines: 0,
		HealthPath: "/healthz",
	}
}

type flyExpectedRequest struct {
	method   string
	path     string
	query    string
	token    string
	body     any
	status   int
	response string
}

type flyAPIScript struct {
	t        *testing.T
	requests []flyExpectedRequest
	next     int
}

func (script *flyAPIScript) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	script.t.Helper()
	if script.next >= len(script.requests) {
		script.t.Fatalf("unexpected Fly API request: %s %s", request.Method, request.URL.String())
	}
	expected := script.requests[script.next]
	script.next++
	if request.Method != expected.method || request.URL.Path != expected.path || request.URL.RawQuery != expected.query {
		script.t.Fatalf("Fly API request = %s %s?%s, want %s %s?%s", request.Method, request.URL.Path, request.URL.RawQuery, expected.method, expected.path, expected.query)
	}
	if got := request.Header.Get("Authorization"); got != "Bearer "+expected.token {
		script.t.Fatalf("Fly API authorization header used the wrong credential")
	}
	if expected.body != nil {
		assertJSONBody(script.t, request.Body, expected.body)
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(expected.status)
	if expected.response != "" {
		_, _ = io.WriteString(writer, expected.response)
	}
}

func (script *flyAPIScript) assertComplete() {
	script.t.Helper()
	if script.next != len(script.requests) {
		script.t.Fatalf("Fly API script consumed %d/%d requests", script.next, len(script.requests))
	}
}

func newTestFlyMachinesClient(t *testing.T, script http.Handler) (*FlyMachinesClient, func()) {
	t.Helper()
	server := httptest.NewServer(script)
	httpClient := server.Client()
	httpClient.Timeout = 5 * time.Second
	client, err := NewFlyMachinesClient(FlyMachinesClientConfig{
		BaseURL: server.URL + "/v1", HTTPClient: httpClient,
		MutationToken: []byte(testMutationToken), InventoryToken: []byte(testInventoryToken),
	})
	if err != nil {
		server.Close()
		t.Fatalf("NewFlyMachinesClient: %v", err)
	}
	return client, server.Close
}

func assertJSONBody(t *testing.T, body io.Reader, want any) {
	t.Helper()
	gotBytes, err := io.ReadAll(body)
	if err != nil {
		t.Fatal(err)
	}
	wantBytes, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	var gotValue any
	var wantValue any
	if err := json.Unmarshal(gotBytes, &gotValue); err != nil {
		t.Fatalf("decode request body: %v", err)
	}
	if err := json.Unmarshal(wantBytes, &wantValue); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(gotValue, wantValue) {
		t.Fatalf("request body = %s, want %s", bytes.TrimSpace(gotBytes), bytes.TrimSpace(wantBytes))
	}
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}
