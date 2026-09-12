package cli

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

func TestExportBenchCreatesAnExecutableRevisionBoundBundle(t *testing.T) {
	python, err := exec.LookPath("python3")
	if err != nil {
		t.Fatal("python3 is required for the Python Canvas boundary suite")
	}
	python, err = filepath.Abs(python)
	if err != nil {
		t.Fatalf("resolve python3: %v", err)
	}
	workspace := t.TempDir()
	projectPath := filepath.Join(workspace, ".local", "python-canvas", "project.json")
	if err := os.MkdirAll(filepath.Dir(projectPath), 0o700); err != nil {
		t.Fatalf("create project directory: %v", err)
	}
	venvRoot := filepath.Join(workspace, ".venv")
	if output, err := exec.Command(python, "-m", "venv", "--without-pip", venvRoot).CombinedOutput(); err != nil {
		t.Fatalf("create test venv: %v: %s", err, output)
	}
	venvPython := filepath.Join(venvRoot, "bin", "python")
	if runtime.GOOS == "windows" {
		venvPython = filepath.Join(venvRoot, "Scripts", "python.exe")
	}
	snapshot := exportableSnapshot(t)
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			t.Errorf("unexpected request %s %s", request.Method, request.URL.Path)
			response.WriteHeader(http.StatusNotFound)
			return
		}
		switch request.URL.Path {
		case contracts.ProjectPathV2:
			writeJSONResponse(t, response, snapshot)
		case contracts.RuntimeSessionPathV2:
			writeJSONResponse(t, response, contracts.RuntimeSessionIdentityV2{
				SchemaVersion: contracts.RuntimeSessionSchemaVersionV1,
				AppID:         contracts.RuntimeSessionAppIDV1,
				ProjectPath:   projectPath,
				InstanceNonce: "export-test-session-nonce",
			})
		default:
			t.Errorf("unexpected request %s %s", request.Method, request.URL.Path)
			response.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	output := filepath.Join(t.TempDir(), "bench-candidate")
	exitCode, stdout, stderr := runForTest(t, []string{
		"export-bench", "--url", server.URL, "--callable", "callable:multiply", "--output", output, "--python", python,
	}, "", server.Client())
	if exitCode != exitSuccess || stderr != "" {
		t.Fatalf("export = exit %d stdout %q stderr %q", exitCode, stdout, stderr)
	}
	var result benchExportResult
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("decode export result: %v", err)
	}
	if result.SchemaVersion != "python-canvas-bench-export/v1" || result.BundleDirectory != output || result.CandidateID == "" {
		t.Fatalf("export result = %#v", result)
	}
	manifestContent, err := os.ReadFile(filepath.Join(output, "bench-candidate.json"))
	if err != nil {
		t.Fatalf("read bundle manifest: %v", err)
	}
	var bundle contracts.BenchCandidateBundleV1
	if err := decodeStrictJSON(manifestContent, &bundle); err != nil || bundle.Validate() != nil {
		t.Fatalf("bundle = %#v, decode error = %v, validation error = %v", bundle, err, bundle.Validate())
	}
	if bundle.Source.ProjectID != snapshot.Project.ID || bundle.Source.ProjectRevision != snapshot.Project.Revision || bundle.Source.CallableID != "callable:multiply" {
		t.Fatalf("bundle source = %#v", bundle.Source)
	}
	if bundle.Candidate.Command.Argv[0] != venvPython {
		t.Fatalf("bundle interpreter = %q, want project venv %q", bundle.Candidate.Command.Argv[0], venvPython)
	}

	executionOutput := filepath.Join(t.TempDir(), "case-output")
	if err := os.Mkdir(executionOutput, 0o700); err != nil {
		t.Fatalf("create case output: %v", err)
	}
	request := []byte(`{"protocolVersion":"bench-candidate/v1","runId":"run:test","case":{"id":"case:test","name":"Test","input":{"value":7},"expected":null},"outputDirectory":` + quotedJSON(t, executionOutput) + `}`)
	command := exec.Command(bundle.Candidate.Command.Argv[0], "candidate.py")
	command.Dir = output
	command.Stdin = bytes.NewReader(request)
	candidateOutput, err := command.Output()
	if err != nil {
		t.Fatalf("execute exported candidate: %v", err)
	}
	var envelope struct {
		Type   string `json:"type"`
		Output int    `json:"output"`
	}
	if err := json.Unmarshal(candidateOutput, &envelope); err != nil {
		t.Fatalf("decode candidate output %q: %v", candidateOutput, err)
	}
	if envelope.Type != "result" || envelope.Output != 21 {
		t.Fatalf("candidate output = %#v", envelope)
	}
	defaultRequest := []byte(`{"protocolVersion":"bench-candidate/v1","runId":"run:default","case":{"id":"case:default","name":"Default","input":{},"expected":null},"outputDirectory":` + quotedJSON(t, executionOutput) + `}`)
	defaultCommand := exec.Command(bundle.Candidate.Command.Argv[0], "candidate.py")
	defaultCommand.Dir = output
	defaultCommand.Stdin = bytes.NewReader(defaultRequest)
	defaultOutput, err := defaultCommand.Output()
	if err != nil {
		t.Fatalf("execute exported candidate with default: %v", err)
	}
	if err := json.Unmarshal(defaultOutput, &envelope); err != nil {
		t.Fatalf("decode default candidate output %q: %v", defaultOutput, err)
	}
	if envelope.Type != "result" || envelope.Output != 15 {
		t.Fatalf("default candidate output = %#v", envelope)
	}
}

func TestExportBenchRejectsErrorDiagnostics(t *testing.T) {
	python, err := filepath.Abs(os.Args[0])
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	snapshot := exportableSnapshot(t)
	snapshot.Diagnostics = []contracts.DiagnosticV2{{
		ID: "diagnostic:error", Severity: contracts.DiagnosticSeverityErrorV2, Message: "broken", Start: 0, End: 0,
	}}
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		writeJSONResponse(t, response, snapshot)
	}))
	defer server.Close()

	output := filepath.Join(t.TempDir(), "candidate")
	exitCode, stdout, stderr := runForTest(t, []string{
		"export-bench", "--url", server.URL, "--callable", "callable:multiply", "--output", output, "--python", python,
	}, "", server.Client())
	if exitCode != exitInputOrTypedV2Failure || stdout != "" {
		t.Fatalf("diagnostic export = exit %d stdout %q stderr %q", exitCode, stdout, stderr)
	}
	if detail := decodeError(t, stderr); detail.Code != "diagnostics_failed" {
		t.Fatalf("diagnostic export error = %#v", detail)
	}
}

func TestExportBenchRejectsUnsafeDeepLinkBeforeConnecting(t *testing.T) {
	python, err := filepath.Abs(os.Args[0])
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	output := filepath.Join(t.TempDir(), "candidate")
	exitCode, stdout, stderr := runForTest(t, []string{
		"export-bench", "--url", "http://127.0.0.1:1", "--callable", "callable:multiply",
		"--output", output, "--python", python, "--deep-link", "javascript:alert(1)",
	}, "", nil)
	if exitCode != exitInputOrTypedV2Failure || stdout != "" {
		t.Fatalf("unsafe deep-link export = exit %d stdout %q stderr %q", exitCode, stdout, stderr)
	}
	if detail := decodeError(t, stderr); detail.Code != "invalid_input" {
		t.Fatalf("unsafe deep-link error = %#v", detail)
	}
}

func exportableSnapshot(t *testing.T) contracts.ProjectSnapshotV2 {
	t.Helper()
	ui, err := contracts.DefaultParameterUIV2(contracts.ParameterUITypeTextV2)
	if err != nil {
		t.Fatalf("default parameter UI: %v", err)
	}
	snapshot := contracts.FixtureProjectSnapshotV2()
	snapshot.Project = contracts.ProjectV2{ID: "project:export", Name: "Export", Revision: 7}
	snapshot.PythonTarget.Prefix = "def make_multiplier():\n    def multiply(value=5, /):\n        return value * 3\n    return multiply"
	defaultValue := "5"
	providerOrdinal := 0
	snapshot.Callables = []contracts.CallableV2{{
		ID: "callable:multiply", Name: "Multiply", AuthoredExpression: "state.Multiplier",
		Parameters: []contracts.ParameterV2{{
			ID: "parameter:value", Name: "value", NameEditable: false,
			PassingStyle: contracts.ParameterPassingStylePositionalOnlyV2, Default: &defaultValue,
			ProviderOrdinal: &providerOrdinal, AuthoredExpression: "", UI: ui,
		}},
	}}
	snapshot.TopLevelSectionIDs = []string{"callable:multiply"}
	snapshot.DiagnosticsRevision = snapshot.Project.Revision
	snapshot.GeneratedCode.Body = "class SettaState:\n    def __init__(state):\n        state.Multiplier = make_multiplier()"
	start := len(snapshot.PythonTarget.Prefix) + 2
	snapshot.GeneratedCode.Code = snapshot.PythonTarget.Prefix + "\n\n" + snapshot.GeneratedCode.Body + "\n\n" + snapshot.PythonTarget.Suffix
	snapshot.GeneratedCode.GeneratedBodyRange = contracts.ByteRangeV2{Start: start, End: start + len(snapshot.GeneratedCode.Body)}
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("exportable snapshot: %v", err)
	}
	return snapshot
}

func quotedJSON(t *testing.T, value string) string {
	t.Helper()
	content, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("quote JSON: %v", err)
	}
	return string(content)
}
