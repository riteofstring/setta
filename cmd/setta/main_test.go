package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/httpapi"
	"setta/internal/speech"
)

const testRuntimeID = "0123456789abcdef0123456789abcdef"

func TestVersionCommandPrintsEmbeddedVersion(t *testing.T) {
	oldVersion := version
	version = "v9.8.7-test"
	t.Cleanup(func() {
		version = oldVersion
	})

	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout

	if code := runWithDeps([]string{"version"}, deps); code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if got := strings.TrimSpace(stdout.String()); got != "v9.8.7-test" {
		t.Fatalf("version output = %q, want embedded version", got)
	}
}

func TestServeOptionsDefaultsAndExplicitPort(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()

	options, err := serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", appDataDir,
		"--port", "0",
	}, deps)
	if err != nil {
		t.Fatalf("serve options: %v", err)
	}
	if options.AppDataDir != appDataDir {
		t.Fatalf("app data dir = %q, want %q", options.AppDataDir, appDataDir)
	}
	if options.Port != 0 {
		t.Fatalf("port = %d, want 0", options.Port)
	}
	if options.Host != "127.0.0.1" {
		t.Fatalf("host = %q, want loopback", options.Host)
	}
}

func TestServeOptionsRequireExplicitLocalCredentialIssuerFlag(t *testing.T) {
	deps := testDeps()
	options, err := serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", t.TempDir(),
		"--local-credential-issuer",
	}, deps)
	if err != nil {
		t.Fatalf("serve options: %v", err)
	}
	if !options.LocalCredentialIssuer {
		t.Fatal("local credential issuer was not enabled")
	}
}

func TestServeOptionsDisplayNameFromEnvAndFlag(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	deps.getenv = func(name string) string {
		if name == "SETTA_RUNTIME_DISPLAY_NAME" {
			return "setta-copper-lantern"
		}
		return ""
	}

	options, err := serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", appDataDir,
	}, deps)
	if err != nil {
		t.Fatalf("serve options: %v", err)
	}
	if options.DisplayName != "setta-copper-lantern" {
		t.Fatalf("display name = %q, want env value", options.DisplayName)
	}

	options, err = serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", appDataDir,
		"--display-name", "setta-silver-beacon",
	}, deps)
	if err != nil {
		t.Fatalf("serve options with flag: %v", err)
	}
	if options.DisplayName != "setta-silver-beacon" {
		t.Fatalf("display name = %q, want flag value", options.DisplayName)
	}
}

func TestServeOptionsMapsSpeechEnvironment(t *testing.T) {
	deps := testDeps()
	var cleared string
	deps.getenv = func(name string) string {
		switch name {
		case "SETTA_E2E":
			return "1"
		case speech.APIKeyEnvironmentVariable:
			return "sk-openai-speech-serve"
		case speech.E2EBaseURLEnvironmentVariable:
			return "http://127.0.0.1:24892/v1"
		default:
			return ""
		}
	}
	deps.unsetenv = func(name string) error {
		cleared = name
		return nil
	}

	options, err := serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", t.TempDir(),
	}, deps)
	if err != nil {
		t.Fatalf("serve options: %v", err)
	}
	if options.Speech.APIKey != "sk-openai-speech-serve" {
		t.Fatalf("speech API key = %q, want OpenAI API key", options.Speech.APIKey)
	}
	if options.Speech.BaseURL != "http://127.0.0.1:24892/v1" || !options.Speech.AllowTestBaseURL {
		t.Fatalf("speech provider config = %+v, want guarded E2E URL", options.Speech)
	}

	config, err := serveRuntimeConfig(options, deps, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(config.Speech, options.Speech) {
		t.Fatalf("runtime speech config = %+v, want %+v", config.Speech, options.Speech)
	}
	if cleared != speech.APIKeyEnvironmentVariable {
		t.Fatalf("cleared environment variable = %q, want %q", cleared, speech.APIKeyEnvironmentVariable)
	}
}

func TestServeOptionsRejectsSpeechBaseURLWithoutE2E(t *testing.T) {
	deps := testDeps()
	deps.getenv = func(name string) string {
		if name == speech.E2EBaseURLEnvironmentVariable {
			return "http://127.0.0.1:24892/v1"
		}
		return ""
	}

	_, err := serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", t.TempDir(),
	}, deps)
	if err == nil || !strings.Contains(err.Error(), "requires SETTA_E2E=1") {
		t.Fatalf("error = %v, want SETTA_E2E guard error", err)
	}
}

func TestServeOptionsRejectsUnclearedSpeechCredential(t *testing.T) {
	deps := testDeps()
	clearErr := errors.New("environment is read-only")
	deps.unsetenv = func(string) error { return clearErr }

	_, err := serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", t.TempDir(),
	}, deps)
	if !errors.Is(err, clearErr) || !strings.Contains(err.Error(), speech.APIKeyEnvironmentVariable) {
		t.Fatalf("error = %v, want wrapped speech credential clear failure", err)
	}
}

func TestBuildPairingURL(t *testing.T) {
	pairingURL, err := buildPairingURL(testRuntimeID, "token_test", "http://127.0.0.1:7345")
	if err != nil {
		t.Fatalf("build pairing URL: %v", err)
	}
	parsed, err := url.Parse(pairingURL)
	if err != nil {
		t.Fatalf("parse pairing URL: %v", err)
	}
	if parsed.Scheme != "setta" || parsed.Host != "pair" {
		t.Fatalf("pairing URL = %s, want setta://pair", pairingURL)
	}
	query := parsed.Query()
	if query.Get("rt") != testRuntimeID {
		t.Fatalf("rt = %q, want runtime id", query.Get("rt"))
	}
	if query.Get("tok") != "token_test" {
		t.Fatalf("tok = %q, want token", query.Get("tok"))
	}
	if query.Get("url") != "http://127.0.0.1:7345" {
		t.Fatalf("url = %q, want base URL", query.Get("url"))
	}
}

func TestPrintPairingJSONIsTypedAndDoesNotRenderHumanOutput(t *testing.T) {
	var output bytes.Buffer
	renderedQR := false
	err := printPairing(&output, pairingResult{
		RuntimeID: testRuntimeID, Token: "pairing-token", URL: "setta://pair?tok=pairing-token",
	}, true, cliDeps{renderQR: func(io.Writer, string) { renderedQR = true }})
	if err != nil {
		t.Fatal(err)
	}
	var event pairingJSONEvent
	if err := json.Unmarshal(output.Bytes(), &event); err != nil {
		t.Fatal(err)
	}
	if event.SchemaVersion != 1 || event.Event != "runtime_pairing_ready" || event.RuntimeID != testRuntimeID ||
		event.PairingToken != "pairing-token" || renderedQR || strings.Contains(output.String(), "Pairing URL") {
		t.Fatalf("pairing JSON event = %+v, rendered QR = %t", event, renderedQR)
	}
}

func TestServeStateRoundTrip(t *testing.T) {
	appDataDir := t.TempDir()
	state := serveState{
		SchemaVersion:   serveStateSchemaVersion,
		PID:             1234,
		Addr:            "127.0.0.1:7345",
		BaseURL:         "http://127.0.0.1:7345",
		RuntimeID:       testRuntimeID,
		DisplayName:     "Test Runtime",
		ProtocolVersion: httpapi.ProtocolVersion,
		StartedAt:       "2026-07-02T10:00:00Z",
	}
	if err := writeServeState(appDataDir, state); err != nil {
		t.Fatalf("write serve state: %v", err)
	}
	read, err := readServeState(appDataDir)
	if err != nil {
		t.Fatalf("read serve state: %v", err)
	}
	if !reflect.DeepEqual(read, state) {
		t.Fatalf("read state = %+v, want %+v", read, state)
	}
}

func TestRuntimeRenameIntegration(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, deps)
	if err != nil {
		t.Fatalf("start serve: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := instance.Shutdown(ctx); err != nil {
			t.Fatalf("shutdown serve: %v", err)
		}
	})

	renamed, err := renameRuntimeDisplayName(context.Background(), appDataDir, "setta-copper-lantern", deps)
	if err != nil {
		t.Fatalf("rename runtime display name: %v", err)
	}
	if renamed.RuntimeID != instance.state.RuntimeID || renamed.DisplayName != "setta-copper-lantern" {
		t.Fatalf("renamed runtime info = %+v", renamed)
	}
	info, err := getRuntimeInfo(context.Background(), deps.httpClient, instance.state.BaseURL)
	if err != nil {
		t.Fatalf("get runtime info after rename: %v", err)
	}
	if info.DisplayName != "setta-copper-lantern" {
		t.Fatalf("runtime info display name = %q, want setta-copper-lantern", info.DisplayName)
	}
	state, err := readServeState(appDataDir)
	if err != nil {
		t.Fatalf("read serve state after rename: %v", err)
	}
	if state.DisplayName != "setta-copper-lantern" {
		t.Fatalf("serve-state display name = %q, want setta-copper-lantern", state.DisplayName)
	}
}

func TestPairingRevocationIntegration(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, deps)
	if err != nil {
		t.Fatalf("start serve: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := instance.Shutdown(ctx); err != nil {
			t.Fatalf("shutdown serve: %v", err)
		}
	})

	pairing, err := pairFromServeState(context.Background(), appDataDir, deps)
	if err != nil {
		t.Fatalf("pair from serve state: %v", err)
	}
	paired := completePairing(t, deps.httpClient, instance.state.BaseURL, pairing.Token)
	if paired.DeviceID == "" || paired.DeviceToken == "" || paired.RuntimeID != instance.state.RuntimeID {
		t.Fatalf("complete pairing response = %+v", paired)
	}

	status := authedStatus(t, deps.httpClient, instance.state.BaseURL+"/appearance/settings", paired.DeviceToken)
	if status != http.StatusOK {
		t.Fatalf("authed status before revoke = %d, want 200", status)
	}
	if _, err := revokeDevice(context.Background(), appDataDir, paired.DeviceID); err != nil {
		t.Fatalf("revoke device: %v", err)
	}
	status = authedStatus(t, deps.httpClient, instance.state.BaseURL+"/appearance/settings", paired.DeviceToken)
	if status != http.StatusUnauthorized {
		t.Fatalf("authed status after revoke = %d, want 401", status)
	}
}

func completePairing(t *testing.T, client *http.Client, baseURL string, token string) httpapi.CompletePairingResponse {
	t.Helper()
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(httpapi.CompletePairingRequest{
		ClientDisplayName: "Integration test client",
		PairingToken:      token,
	}); err != nil {
		t.Fatalf("encode pairing request: %v", err)
	}
	response, err := client.Post(baseURL+"/pairing/complete", "application/json", &body)
	if err != nil {
		t.Fatalf("complete pairing request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("complete pairing status = %d body = %s, want 200", response.StatusCode, payload)
	}
	var paired httpapi.CompletePairingResponse
	if err := json.NewDecoder(response.Body).Decode(&paired); err != nil {
		t.Fatalf("decode pairing response: %v", err)
	}
	return paired
}

func authedStatus(t *testing.T, client *http.Client, targetURL string, token string) int {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, targetURL, nil)
	if err != nil {
		t.Fatalf("create authed request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("authed request: %v", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)
	return response.StatusCode
}

func testDeps() cliDeps {
	return normalizeDeps(cliDeps{
		getenv: func(string) string {
			return ""
		},
		unsetenv: func(string) error {
			return nil
		},
		httpClient: &http.Client{Timeout: 5 * time.Second},
		now: func() time.Time {
			return time.Date(2026, 7, 2, 10, 0, 0, 0, time.UTC)
		},
		pid: func() int {
			return 1234
		},
		renderQR: func(output io.Writer, text string) {
			fmt.Fprintf(output, "[qr %d]\n", len(text))
		},
		stderr: io.Discard,
		stdout: io.Discard,
	})
}
