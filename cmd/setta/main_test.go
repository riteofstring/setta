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
	"os/exec"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/httpapi"
	"setta/internal/orchestrator"
	"setta/internal/runtime"
	"setta/internal/workspace"
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
	if options.Tailnet {
		t.Fatal("tailnet = true, want false")
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

func TestServeOptionsTailnetResolvesNumericIPv4(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	deps.commandRunner = func(_ context.Context, name string, args ...string) ([]byte, error) {
		if name != "tailscale" || !reflect.DeepEqual(args, []string{"ip", "-4"}) {
			t.Fatalf("command = %s %v, want tailscale ip -4", name, args)
		}
		return []byte("100.64.0.12\n"), nil
	}

	options, err := serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", appDataDir,
		"--tailnet",
	}, deps)
	if err != nil {
		t.Fatalf("serve options: %v", err)
	}
	if options.Host != "100.64.0.12" {
		t.Fatalf("host = %q, want tailscale IPv4", options.Host)
	}
	if !options.Tailnet {
		t.Fatal("tailnet = false, want true")
	}
}

func TestServeOptionsHonorsGuardedE2EChatHarness(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	deps.getenv = func(name string) string {
		switch name {
		case "SETTA_E2E":
			return "1"
		case "SETTA_E2E_CHAT_HARNESS":
			return string(runtime.ChatHarnessScriptedWorkflow)
		default:
			return ""
		}
	}

	options, err := serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", appDataDir,
	}, deps)
	if err != nil {
		t.Fatalf("serve options: %v", err)
	}
	if options.ChatHarness != runtime.ChatHarnessScriptedWorkflow {
		t.Fatalf("chat harness = %q, want scripted workflow", options.ChatHarness)
	}
}

func TestServeOptionsRejectsE2EChatHarnessWithoutE2E(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	deps.getenv = func(name string) string {
		if name == "SETTA_E2E_CHAT_HARNESS" {
			return string(runtime.ChatHarnessScriptedWorkflow)
		}
		return ""
	}

	_, err := serveOptionsFromArgs(context.Background(), []string{
		"--app-data-dir", appDataDir,
	}, deps)
	if err == nil || !strings.Contains(err.Error(), "SETTA_E2E_CHAT_HARNESS requires SETTA_E2E=1") {
		t.Fatalf("error = %v, want SETTA_E2E guard error", err)
	}
}

func TestResolveTailnetIPv4RejectsInvalidCommandResults(t *testing.T) {
	tests := map[string]struct {
		output []byte
		err    error
		want   string
	}{
		"missing cli": {
			err:  &exec.Error{Name: "tailscale", Err: exec.ErrNotFound},
			want: "tailscale CLI not found",
		},
		"command failure": {
			output: []byte("not logged in\n"),
			err:    errors.New("exit status 1"),
			want:   "not logged in",
		},
		"empty output": {
			want: "returned no address",
		},
		"multiple addresses": {
			output: []byte("100.64.0.1\n100.64.0.2\n"),
			want:   "expected exactly one",
		},
		"not ipv4": {
			output: []byte("fd7a:115c:a1e0::1\n"),
			want:   "expected a numeric IPv4 address",
		},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			_, err := resolveTailnetIPv4(context.Background(), func(context.Context, string, ...string) ([]byte, error) {
				return test.output, test.err
			})
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want containing %q", err, test.want)
			}
		})
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

func TestWorkflowCurrentWorkspaceCommandIntegration(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	serveDeps := deps
	serveDeps.stdout = io.Discard
	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, serveDeps)
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

	opened := openWorkspaceForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, workspaceRoot)
	var stdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &stdout
	if code := runWithDeps([]string{"workflow", "current-workspace", "--app-data-dir", appDataDir}, commandDeps); code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}

	var current workspace.WorkspaceSummary
	if err := json.NewDecoder(&stdout).Decode(&current); err != nil {
		t.Fatalf("decode current workspace output: %v\noutput:\n%s", err, stdout.String())
	}
	if !reflect.DeepEqual(current, opened.Workspace) {
		t.Fatalf("current workspace = %+v, want %+v", current, opened.Workspace)
	}
}

func TestWorkflowCurrentWorkspaceCommandFailsWithoutSelectedWorkspace(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	serveDeps := deps
	serveDeps.stdout = io.Discard
	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, serveDeps)
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

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr
	if code := runWithDeps([]string{"workflow", "current-workspace", "--app-data-dir", appDataDir}, commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	if !strings.Contains(stderr.String(), "no current workspace is selected") {
		t.Fatalf("stderr = %q, want no-current-workspace error", stderr.String())
	}
}

func TestWorkflowDefinitionsListCommandIntegration(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	serveDeps := deps
	serveDeps.stdout = io.Discard
	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, serveDeps)
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

	opened := openWorkspaceForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, workspaceRoot)
	created := createWorkflowDefinitionForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, httpapi.CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Review Flow",
		Description: "CLI list test workflow",
		Graph:       cliTestStartEndWorkflowGraph(),
	})

	var stdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &stdout
	if code := runWithDeps([]string{"workflow", "definitions", "list", "--app-data-dir", appDataDir}, commandDeps); code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}

	var listed httpapi.ListWorkflowDefinitionsResponse
	if err := json.NewDecoder(&stdout).Decode(&listed); err != nil {
		t.Fatalf("decode workflow definitions list output: %v\noutput:\n%s", err, stdout.String())
	}
	if len(listed.Definitions) != 1 {
		t.Fatalf("listed definitions = %+v, want one definition", listed.Definitions)
	}
	if !reflect.DeepEqual(listed.Definitions[0], created) {
		t.Fatalf("listed definition = %+v, want %+v", listed.Definitions[0], created)
	}
}

func TestWorkflowDefinitionsListCommandReturnsEmptyArray(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	serveDeps := deps
	serveDeps.stdout = io.Discard
	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, serveDeps)
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

	openWorkspaceForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, workspaceRoot)

	var stdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &stdout
	if code := runWithDeps([]string{"workflow", "definitions", "list", "--app-data-dir", appDataDir}, commandDeps); code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}

	var listed httpapi.ListWorkflowDefinitionsResponse
	if err := json.NewDecoder(&stdout).Decode(&listed); err != nil {
		t.Fatalf("decode workflow definitions list output: %v\noutput:\n%s", err, stdout.String())
	}
	if listed.Definitions == nil {
		t.Fatalf("listed definitions = nil, want empty array")
	}
	if len(listed.Definitions) != 0 {
		t.Fatalf("listed definitions = %+v, want empty", listed.Definitions)
	}
}

func TestWorkflowDefinitionsReadCommandIntegration(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	serveDeps := deps
	serveDeps.stdout = io.Discard
	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, serveDeps)
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

	opened := openWorkspaceForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, workspaceRoot)
	created := createWorkflowDefinitionForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, httpapi.CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Review Flow",
		Description: "CLI read test workflow",
		Graph:       cliTestStartEndWorkflowGraph(),
	})

	var stdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &stdout
	if code := runWithDeps([]string{"workflow", "definitions", "read", "--app-data-dir", appDataDir, created.ID}, commandDeps); code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}

	var read orchestrator.WorkflowDefinition
	if err := json.NewDecoder(&stdout).Decode(&read); err != nil {
		t.Fatalf("decode workflow definition read output: %v\noutput:\n%s", err, stdout.String())
	}
	if !reflect.DeepEqual(read, created) {
		t.Fatalf("read definition = %+v, want %+v", read, created)
	}
}

func TestWorkflowDefinitionsReadCommandFailsForMissingDefinition(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	serveDeps := deps
	serveDeps.stdout = io.Discard
	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, serveDeps)
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

	openWorkspaceForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, workspaceRoot)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &stdout
	commandDeps.stderr = &stderr
	if code := runWithDeps([]string{"workflow", "definitions", "read", "--app-data-dir", appDataDir, "missing_definition"}, commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	if !strings.Contains(stderr.String(), "read_workflow_definition_failed") {
		t.Fatalf("stderr = %q, want read workflow definition error code", stderr.String())
	}
}

func TestWorkflowSchemaCommandIntegration(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	serveDeps := deps
	serveDeps.stdout = io.Discard
	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir: appDataDir,
		Host:       "127.0.0.1",
		Port:       0,
	}, serveDeps)
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

	var stdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &stdout
	if code := runWithDeps([]string{"workflow", "schema", "--app-data-dir", appDataDir}, commandDeps); code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}

	var schema orchestrator.WorkflowSchema
	if err := json.NewDecoder(&stdout).Decode(&schema); err != nil {
		t.Fatalf("decode workflow schema output: %v\noutput:\n%s", err, stdout.String())
	}
	if schema.SchemaVersion != orchestrator.SchemaVersion {
		t.Fatalf("schema version = %d, want %d", schema.SchemaVersion, orchestrator.SchemaVersion)
	}
	if schema.GraphType != "WorkflowGraph" {
		t.Fatalf("graph type = %q, want WorkflowGraph", schema.GraphType)
	}
	if len(schema.GraphSchema) == 0 || !json.Valid(schema.GraphSchema) {
		t.Fatalf("graph schema is empty or invalid: %s", string(schema.GraphSchema))
	}
	if len(schema.Actions) != 1 || schema.Actions[0].Kind != orchestrator.ActionKindAgentCodex {
		t.Fatalf("actions = %+v, want agent.codex schema", schema.Actions)
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

func openWorkspaceForCLITest(t *testing.T, client *http.Client, appDataDir string, baseURL string, rootPath string) httpapi.OpenWorkspaceResponse {
	t.Helper()
	token, cleanup, err := createRuntimeCLIAuthSession(context.Background(), appDataDir, "Setta CLI test workspace opener")
	if err != nil {
		t.Fatalf("create CLI auth session: %v", err)
	}
	defer cleanup()
	return postAuthedRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, token, "/workspaces/open", httpapi.OpenWorkspaceRequest{RootPath: rootPath})
}

func createWorkflowDefinitionForCLITest(t *testing.T, client *http.Client, appDataDir string, baseURL string, request httpapi.CreateWorkflowDefinitionRequest) orchestrator.WorkflowDefinition {
	t.Helper()
	token, cleanup, err := createRuntimeCLIAuthSession(context.Background(), appDataDir, "Setta CLI test workflow definition creator")
	if err != nil {
		t.Fatalf("create CLI auth session: %v", err)
	}
	defer cleanup()
	return postAuthedRuntimeJSON[orchestrator.WorkflowDefinition](t, client, baseURL, token, "/workflows/definitions/create", request)
}

func cliTestStartEndWorkflowGraph() orchestrator.WorkflowGraph {
	return orchestrator.WorkflowGraph{
		Nodes: []orchestrator.WorkflowNode{
			{ID: "start", Kind: orchestrator.NodeKindStart},
			{ID: "end", Kind: orchestrator.NodeKindEnd},
		},
		Edges: []orchestrator.WorkflowEdge{
			{ID: "start_end", FromNodeID: "start", ToNodeID: "end", Kind: orchestrator.EdgeKindNormal},
		},
		Layout: orchestrator.WorkflowGraphLayout{
			Nodes: []orchestrator.WorkflowGraphNodeLayout{
				{NodeID: "start", X: -160, Y: 0},
				{NodeID: "end", X: 160, Y: 0},
			},
		},
	}
}

func postAuthedRuntimeJSON[T any](t *testing.T, client *http.Client, baseURL string, token string, path string, payload any) T {
	t.Helper()
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(payload); err != nil {
		t.Fatalf("encode request: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, baseURL+path, &body)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("runtime request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		responseBody, _ := io.ReadAll(response.Body)
		t.Fatalf("runtime request status = %d body = %s, want 200", response.StatusCode, responseBody)
	}
	var result T
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return result
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
		commandRunner: func(context.Context, string, ...string) ([]byte, error) {
			return nil, fmt.Errorf("unexpected command")
		},
		getenv: func(string) string {
			return ""
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
