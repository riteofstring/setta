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
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/httpapi"
	"setta/internal/orchestrator"
	"setta/internal/runtime"
	"setta/internal/workflowaudit"
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
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "no_current_workspace" {
		t.Fatalf("error code = %q, want no_current_workspace", errResponse.Error.Code)
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
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "read_workflow_definition_failed" {
		t.Fatalf("error code = %q, want read_workflow_definition_failed", errResponse.Error.Code)
	}
}

func TestWorkflowDefinitionsSaveCommandCreatesAndUpdatesDefinition(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	inputPath := filepath.Join(t.TempDir(), "save.json")
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
	writeWorkflowDefinitionSaveInputForCLITest(t, inputPath, orchestrator.WorkflowDefinitionSaveInput{
		Operation:   orchestrator.WorkflowDefinitionSaveCreate,
		Name:        "Saved Flow",
		Description: "created through CLI save",
		Graph:       cliTestStartEndWorkflowGraph(),
	})

	var createStdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &createStdout
	if code := runWithDeps([]string{"workflow", "definitions", "save", "--app-data-dir", appDataDir, "--input", inputPath}, commandDeps); code != 0 {
		t.Fatalf("create save exit code = %d, want 0", code)
	}
	var created orchestrator.WorkflowDefinitionSaveResult
	if err := json.NewDecoder(&createStdout).Decode(&created); err != nil {
		t.Fatalf("decode workflow definition save output: %v\noutput:\n%s", err, createStdout.String())
	}
	if !created.Saved || !created.Validation.Valid || created.Definition == nil {
		t.Fatalf("created save result = %+v, want saved valid definition", created)
	}
	if created.Definition.WorkspaceID != opened.Workspace.ID || created.Definition.Name != "Saved Flow" {
		t.Fatalf("created definition = %+v, want workspace %s saved flow", created.Definition, opened.Workspace.ID)
	}

	writeWorkflowDefinitionSaveInputForCLITest(t, inputPath, orchestrator.WorkflowDefinitionSaveInput{
		Operation:    orchestrator.WorkflowDefinitionSaveUpdate,
		DefinitionID: created.Definition.ID,
		Name:         "Updated Flow",
		Description:  "updated through CLI save",
		Graph:        cliTestStartEndWorkflowGraph(),
	})
	var updateStdout bytes.Buffer
	commandDeps.stdout = &updateStdout
	if code := runWithDeps([]string{"workflow", "definitions", "save", "--app-data-dir", appDataDir, "--input", inputPath}, commandDeps); code != 0 {
		t.Fatalf("update save exit code = %d, want 0", code)
	}
	var updated orchestrator.WorkflowDefinitionSaveResult
	if err := json.NewDecoder(&updateStdout).Decode(&updated); err != nil {
		t.Fatalf("decode workflow definition update save output: %v\noutput:\n%s", err, updateStdout.String())
	}
	if !updated.Saved || updated.Definition == nil || updated.Definition.ID != created.Definition.ID || updated.Definition.Name != "Updated Flow" {
		t.Fatalf("updated save result = %+v, want updated definition %s", updated, created.Definition.ID)
	}

	records := readWorkflowAuditRecordsForCLITest(t, appDataDir)
	if len(records) != 2 {
		t.Fatalf("audit records = %+v, want create and update save records", records)
	}
	assertCLIWorkflowSaveAuditRecord(t, records[0], opened.Workspace.ID, created.Definition.ID, orchestrator.WorkflowDefinitionSaveCreate)
	assertCLIWorkflowSaveAuditRecord(t, records[1], opened.Workspace.ID, created.Definition.ID, orchestrator.WorkflowDefinitionSaveUpdate)
}

func TestWorkflowDefinitionsSaveCommandReturnsDiagnosticsWithoutSaving(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	inputPath := filepath.Join(t.TempDir(), "save.json")
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
	writeWorkflowDefinitionSaveInputForCLITest(t, inputPath, orchestrator.WorkflowDefinitionSaveInput{
		Operation: orchestrator.WorkflowDefinitionSaveCreate,
		Name:      "Invalid Flow",
		Graph:     cliTestMissingEndWorkflowGraph(),
	})

	var saveStdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &saveStdout
	if code := runWithDeps([]string{"workflow", "definitions", "save", "--app-data-dir", appDataDir, "--input", inputPath}, commandDeps); code != 0 {
		t.Fatalf("invalid save exit code = %d, want 0", code)
	}
	var result orchestrator.WorkflowDefinitionSaveResult
	if err := json.NewDecoder(&saveStdout).Decode(&result); err != nil {
		t.Fatalf("decode workflow definition invalid save output: %v\noutput:\n%s", err, saveStdout.String())
	}
	if result.Saved || result.Validation.Valid || result.Definition != nil {
		t.Fatalf("invalid save result = %+v, want unsaved diagnostics", result)
	}
	assertWorkflowDiagnostic(t, result.Validation, "end_node_required")

	var listStdout bytes.Buffer
	commandDeps.stdout = &listStdout
	if code := runWithDeps([]string{"workflow", "definitions", "list", "--app-data-dir", appDataDir}, commandDeps); code != 0 {
		t.Fatalf("list exit code = %d, want 0", code)
	}
	var listed httpapi.ListWorkflowDefinitionsResponse
	if err := json.NewDecoder(&listStdout).Decode(&listed); err != nil {
		t.Fatalf("decode workflow definitions list output: %v\noutput:\n%s", err, listStdout.String())
	}
	if len(listed.Definitions) != 0 {
		t.Fatalf("listed definitions = %+v, want invalid save to persist nothing", listed.Definitions)
	}
}

func TestWorkflowDefinitionsValidateCommandIntegration(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	graphPath := filepath.Join(t.TempDir(), "graph.json")
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
	writeWorkflowGraphForCLITest(t, graphPath, cliTestStartEndWorkflowGraph())

	var stdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &stdout
	if code := runWithDeps([]string{"workflow", "definitions", "validate", "--app-data-dir", appDataDir, "--graph", graphPath}, commandDeps); code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}

	var result orchestrator.WorkflowValidationResult
	if err := json.NewDecoder(&stdout).Decode(&result); err != nil {
		t.Fatalf("decode workflow validation output: %v\noutput:\n%s", err, stdout.String())
	}
	if !result.Valid {
		t.Fatalf("validation result = %+v, want valid graph", result)
	}
	if result.Diagnostics == nil {
		t.Fatalf("diagnostics = nil, want empty array")
	}
	if len(result.Diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want empty", result.Diagnostics)
	}
}

func TestWorkflowDefinitionsValidateCommandReturnsDiagnostics(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	graphPath := filepath.Join(t.TempDir(), "graph.json")
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
	writeWorkflowGraphForCLITest(t, graphPath, cliTestMissingEndWorkflowGraph())

	var stdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &stdout
	if code := runWithDeps([]string{"workflow", "definitions", "validate", "--app-data-dir", appDataDir, "--graph", graphPath}, commandDeps); code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}

	var result orchestrator.WorkflowValidationResult
	if err := json.NewDecoder(&stdout).Decode(&result); err != nil {
		t.Fatalf("decode workflow validation output: %v\noutput:\n%s", err, stdout.String())
	}
	if result.Valid {
		t.Fatalf("validation result = %+v, want invalid graph", result)
	}
	assertWorkflowDiagnostic(t, result, "end_node_required")
}

func TestWorkflowExecutionsStartAndReadCommandIntegration(t *testing.T) {
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
	definition := createWorkflowDefinitionForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, httpapi.CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Runnable Flow",
		Description: "CLI execution start test workflow",
		Graph:       cliTestStartEndWorkflowGraph(),
	})

	var startStdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &startStdout
	if code := runWithDeps([]string{"workflow", "executions", "start", "--app-data-dir", appDataDir, definition.ID}, commandDeps); code != 0 {
		t.Fatalf("start exit code = %d, want 0", code)
	}
	var started orchestrator.WorkflowExecution
	if err := json.NewDecoder(&startStdout).Decode(&started); err != nil {
		t.Fatalf("decode workflow execution start output: %v\noutput:\n%s", err, startStdout.String())
	}
	if started.WorkspaceID != opened.Workspace.ID || started.DefinitionID != definition.ID {
		t.Fatalf("started execution = %+v, want workspace %s definition %s", started, opened.Workspace.ID, definition.ID)
	}
	if started.Status != orchestrator.ExecutionStatusCompleted {
		t.Fatalf("started execution status = %s, want completed", started.Status)
	}
	if started.DefinitionVersionID == "" || started.NodeExecutions == nil || started.Tokens == nil {
		t.Fatalf("started execution missing generated state: %+v", started)
	}

	var readStdout bytes.Buffer
	commandDeps.stdout = &readStdout
	if code := runWithDeps([]string{"workflow", "executions", "read", "--app-data-dir", appDataDir, started.ID}, commandDeps); code != 0 {
		t.Fatalf("read exit code = %d, want 0", code)
	}
	var read orchestrator.WorkflowExecution
	if err := json.NewDecoder(&readStdout).Decode(&read); err != nil {
		t.Fatalf("decode workflow execution read output: %v\noutput:\n%s", err, readStdout.String())
	}
	if !reflect.DeepEqual(read, started) {
		t.Fatalf("read execution = %+v, want %+v", read, started)
	}

	records := readWorkflowAuditRecordsForCLITest(t, appDataDir)
	if len(records) != 1 {
		t.Fatalf("audit records = %+v, want execution start record", records)
	}
	assertCLIWorkflowStartAuditRecord(t, records[0], opened.Workspace.ID, definition.ID, started.ID)
}

func TestWorkflowExecutionsStartCommandFailsForMissingDefinition(t *testing.T) {
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
	if code := runWithDeps([]string{"workflow", "executions", "start", "--app-data-dir", appDataDir, "missing_definition"}, commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "start_workflow_execution_failed" {
		t.Fatalf("error code = %q, want start_workflow_execution_failed", errResponse.Error.Code)
	}

	records := readWorkflowAuditRecordsForCLITest(t, appDataDir)
	if len(records) != 1 {
		t.Fatalf("audit records = %+v, want failed execution start record", records)
	}
	assertCLIWorkflowFailedStartAuditRecord(t, records[0], "missing_definition", "start_workflow_execution_failed")
}

func TestWorkflowExecutionsStartConflictReturnsActiveExecutionEnvelope(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	serveDeps := deps
	serveDeps.stdout = io.Discard
	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir:  appDataDir,
		ChatHarness: runtime.ChatHarnessScriptedWorkflow,
		Host:        "127.0.0.1",
		Port:        0,
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
	definition := createWorkflowDefinitionForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, httpapi.CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Running Flow",
		Description: "CLI execution active conflict test workflow",
		Graph:       cliTestRunningActionWorkflowGraph(),
	})

	var startStdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &startStdout
	if code := runWithDeps([]string{"workflow", "executions", "start", "--app-data-dir", appDataDir, definition.ID}, commandDeps); code != 0 {
		t.Fatalf("start exit code = %d, want 0", code)
	}
	var started orchestrator.WorkflowExecution
	if err := json.NewDecoder(&startStdout).Decode(&started); err != nil {
		t.Fatalf("decode workflow execution start output: %v\noutput:\n%s", err, startStdout.String())
	}
	if started.Status != orchestrator.ExecutionStatusRunning {
		t.Fatalf("started execution status = %s, want running", started.Status)
	}

	var conflictStdout bytes.Buffer
	var conflictStderr bytes.Buffer
	commandDeps.stdout = &conflictStdout
	commandDeps.stderr = &conflictStderr
	if code := runWithDeps([]string{"workflow", "executions", "start", "--app-data-dir", appDataDir, definition.ID}, commandDeps); code != 1 {
		t.Fatalf("conflict exit code = %d, want 1", code)
	}
	if conflictStdout.String() != "" {
		t.Fatalf("conflict stdout = %q, want empty", conflictStdout.String())
	}
	errResponse := decodeCLIError(t, conflictStderr.String())
	if errResponse.Error.Code != orchestrator.WorkflowExecutionAlreadyRunningCode {
		t.Fatalf("error code = %q, want %s", errResponse.Error.Code, orchestrator.WorkflowExecutionAlreadyRunningCode)
	}
	if errResponse.Error.ActiveExecution == nil {
		t.Fatal("active execution payload was nil")
	}
	if errResponse.Error.ActiveExecution.ID != started.ID ||
		errResponse.Error.ActiveExecution.WorkspaceID != opened.Workspace.ID ||
		errResponse.Error.ActiveExecution.DefinitionID != definition.ID ||
		errResponse.Error.ActiveExecution.Status != orchestrator.ExecutionStatusRunning {
		t.Fatalf("active execution payload = %+v, want running execution %s", errResponse.Error.ActiveExecution, started.ID)
	}
	if errResponse.Error.ActiveExecution.DefinitionVersionNumber != 1 {
		t.Fatalf("active version number = %d, want 1", errResponse.Error.ActiveExecution.DefinitionVersionNumber)
	}
}

func TestWorkflowExecutionsReadCommandFailsForMissingExecution(t *testing.T) {
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
	if code := runWithDeps([]string{"workflow", "executions", "read", "--app-data-dir", appDataDir, "missing_execution"}, commandDeps); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "read_workflow_execution_failed" {
		t.Fatalf("error code = %q, want read_workflow_execution_failed", errResponse.Error.Code)
	}
}

func TestWorkflowCommandUsageErrorReturnsJSONEnvelope(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.stderr = &stderr

	if code := runWithDeps([]string{"workflow", "definitions", "read"}, deps); code != 2 {
		t.Fatalf("exit code = %d, want 2", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q, want empty", stdout.String())
	}
	errResponse := decodeCLIError(t, stderr.String())
	if errResponse.Error.Code != "workflow_usage_error" {
		t.Fatalf("error code = %q, want workflow_usage_error", errResponse.Error.Code)
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

func cliTestRunningActionWorkflowGraph() orchestrator.WorkflowGraph {
	return orchestrator.WorkflowGraph{
		Nodes: []orchestrator.WorkflowNode{
			{ID: "start", Kind: orchestrator.NodeKindStart},
			{
				ID:   "work",
				Kind: orchestrator.NodeKindAction,
				Action: &orchestrator.WorkflowActionConfig{
					Kind: orchestrator.ActionKindAgentCodex,
					Codex: &orchestrator.WorkflowCodexActionConfig{
						Prompt: "workflow hold for queue and steering",
					},
				},
			},
			{ID: "end", Kind: orchestrator.NodeKindEnd},
		},
		Edges: []orchestrator.WorkflowEdge{
			{ID: "start_work", FromNodeID: "start", ToNodeID: "work", Kind: orchestrator.EdgeKindNormal},
			{ID: "work_end", FromNodeID: "work", ToNodeID: "end", Kind: orchestrator.EdgeKindNormal},
		},
		Layout: orchestrator.WorkflowGraphLayout{
			Nodes: []orchestrator.WorkflowGraphNodeLayout{
				{NodeID: "start", X: -240, Y: 0},
				{NodeID: "work", X: 0, Y: 0},
				{NodeID: "end", X: 240, Y: 0},
			},
		},
	}
}

func cliTestMissingEndWorkflowGraph() orchestrator.WorkflowGraph {
	return orchestrator.WorkflowGraph{
		Nodes: []orchestrator.WorkflowNode{
			{ID: "start", Kind: orchestrator.NodeKindStart},
		},
		Edges: []orchestrator.WorkflowEdge{},
		Layout: orchestrator.WorkflowGraphLayout{
			Nodes: []orchestrator.WorkflowGraphNodeLayout{
				{NodeID: "start", X: 0, Y: 0},
			},
		},
	}
}

func writeWorkflowGraphForCLITest(t *testing.T, path string, graph orchestrator.WorkflowGraph) {
	t.Helper()
	payload, err := json.Marshal(graph)
	if err != nil {
		t.Fatalf("marshal workflow graph: %v", err)
	}
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		t.Fatalf("write workflow graph: %v", err)
	}
}

func writeWorkflowDefinitionSaveInputForCLITest(t *testing.T, path string, input orchestrator.WorkflowDefinitionSaveInput) {
	t.Helper()
	payload, err := json.Marshal(input)
	if err != nil {
		t.Fatalf("marshal workflow definition save input: %v", err)
	}
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		t.Fatalf("write workflow definition save input: %v", err)
	}
}

func writeWorkflowExecutionResultInputForCLITest(t *testing.T, path string, input orchestrator.WorkflowExecutionResultInput) {
	t.Helper()
	payload, err := json.Marshal(input)
	if err != nil {
		t.Fatalf("marshal workflow execution result input: %v", err)
	}
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		t.Fatalf("write workflow execution result input: %v", err)
	}
}

func cliTestLatestNodeExecution(t *testing.T, execution orchestrator.WorkflowExecution, nodeID string) orchestrator.WorkflowNodeExecution {
	t.Helper()
	for index := len(execution.NodeExecutions) - 1; index >= 0; index-- {
		if execution.NodeExecutions[index].NodeID == nodeID {
			return execution.NodeExecutions[index]
		}
	}
	t.Fatalf("node execution for %s was not found in %+v", nodeID, execution.NodeExecutions)
	return orchestrator.WorkflowNodeExecution{}
}

func assertWorkflowDiagnostic(t *testing.T, result orchestrator.WorkflowValidationResult, code string) {
	t.Helper()
	for _, diagnostic := range result.Diagnostics {
		if diagnostic.Code == code {
			return
		}
	}
	t.Fatalf("diagnostics = %+v, want code %s", result.Diagnostics, code)
}

func readWorkflowAuditRecordsForCLITest(t *testing.T, appDataDir string) []workflowaudit.Record {
	t.Helper()
	store, err := workflowaudit.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new workflow audit store: %v", err)
	}
	records, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list workflow audit records: %v", err)
	}
	return records
}

func assertCLIWorkflowSaveAuditRecord(
	t *testing.T,
	record workflowaudit.Record,
	workspaceID string,
	definitionID string,
	operation orchestrator.WorkflowDefinitionSaveOperation,
) {
	t.Helper()
	if record.CommandName != workflowaudit.CommandWorkflowDefinitionsSave || record.Outcome != workflowaudit.OutcomeWorkflowDefinitionSaved {
		t.Fatalf("audit save command/outcome = %s/%s, want saved workflow definition", record.CommandName, record.Outcome)
	}
	if record.AuthenticatedDeviceSession.DisplayName != workflowDefinitionsSaveCLIAuthDisplayName {
		t.Fatalf("audit save device display name = %q, want %q", record.AuthenticatedDeviceSession.DisplayName, workflowDefinitionsSaveCLIAuthDisplayName)
	}
	if record.WorkspaceID != workspaceID || record.DefinitionID != definitionID {
		t.Fatalf("audit save workspace/definition = %s/%s, want %s/%s", record.WorkspaceID, record.DefinitionID, workspaceID, definitionID)
	}
	if record.SaveOperation != operation {
		t.Fatalf("audit save operation = %s, want %s", record.SaveOperation, operation)
	}
	if record.Saved == nil || !*record.Saved || record.Validation == nil || !record.Validation.Valid {
		t.Fatalf("audit save result = saved:%+v validation:%+v, want saved valid", record.Saved, record.Validation)
	}
}

func assertCLIWorkflowStartAuditRecord(t *testing.T, record workflowaudit.Record, workspaceID string, definitionID string, executionID string) {
	t.Helper()
	if record.CommandName != workflowaudit.CommandWorkflowExecutionsStart || record.Outcome != workflowaudit.OutcomeWorkflowExecutionStarted {
		t.Fatalf("audit start command/outcome = %s/%s, want execution started", record.CommandName, record.Outcome)
	}
	if record.AuthenticatedDeviceSession.DisplayName != workflowExecutionsStartCLIAuthDisplayName {
		t.Fatalf("audit start device display name = %q, want %q", record.AuthenticatedDeviceSession.DisplayName, workflowExecutionsStartCLIAuthDisplayName)
	}
	if record.WorkspaceID != workspaceID || record.DefinitionID != definitionID || record.ExecutionID != executionID {
		t.Fatalf("audit start workspace/definition/execution = %s/%s/%s, want %s/%s/%s", record.WorkspaceID, record.DefinitionID, record.ExecutionID, workspaceID, definitionID, executionID)
	}
	if record.Validation == nil || !record.Validation.Valid {
		t.Fatalf("audit start validation = %+v, want valid result", record.Validation)
	}
}

func assertCLIWorkflowFailedStartAuditRecord(t *testing.T, record workflowaudit.Record, definitionID string, errorCode string) {
	t.Helper()
	if record.CommandName != workflowaudit.CommandWorkflowExecutionsStart || record.Outcome != workflowaudit.OutcomeFailed {
		t.Fatalf("audit failed start command/outcome = %s/%s, want failed execution start", record.CommandName, record.Outcome)
	}
	if record.AuthenticatedDeviceSession.DisplayName != workflowExecutionsStartCLIAuthDisplayName {
		t.Fatalf("audit failed start device display name = %q, want %q", record.AuthenticatedDeviceSession.DisplayName, workflowExecutionsStartCLIAuthDisplayName)
	}
	if record.DefinitionID != definitionID || record.ErrorCode != errorCode || record.ErrorMessage == "" {
		t.Fatalf("audit failed start = %+v, want definition %s error %s", record, definitionID, errorCode)
	}
}

func decodeCLIError(t *testing.T, stderr string) httpapi.ErrorResponse {
	t.Helper()
	payload := strings.TrimSpace(stderr)
	if !json.Valid([]byte(payload)) {
		t.Fatalf("stderr = %q, want JSON error envelope", stderr)
	}
	var response httpapi.ErrorResponse
	if err := json.Unmarshal([]byte(payload), &response); err != nil {
		t.Fatalf("decode CLI error envelope: %v\nstderr:\n%s", err, stderr)
	}
	if response.Error.Code == "" {
		t.Fatalf("CLI error response missing code: %+v", response)
	}
	if response.Error.Message == "" {
		t.Fatalf("CLI error response missing message: %+v", response)
	}
	return response
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
		executablePath: func() (string, error) {
			return "", nil
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
