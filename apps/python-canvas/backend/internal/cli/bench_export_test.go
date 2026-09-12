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
	python, projectPath, venvPython := prepareBenchExportEnvironment(t)
	snapshot := exportableSnapshot(t)
	server := serveBenchExportSnapshot(t, snapshot, projectPath)
	defer server.Close()

	output := filepath.Join(t.TempDir(), "bench-candidate")
	_, bundle := exportBenchBundleForTest(t, server, python, output)
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
	envelope := executeBenchCandidate(t, bundle, output, executionOutput, "test", map[string]int{"value": 7})
	if envelope.Type != "result" || envelope.Output != 21 {
		t.Fatalf("candidate output = %#v", envelope)
	}
	envelope = executeBenchCandidate(t, bundle, output, executionOutput, "default", map[string]int{})
	if envelope.Type != "result" || envelope.Output != 15 {
		t.Fatalf("default candidate output = %#v", envelope)
	}
}

type benchCandidateEnvelope struct {
	Type   string `json:"type"`
	Output int    `json:"output"`
}

func prepareBenchExportEnvironment(t *testing.T) (string, string, string) {
	t.Helper()
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
	return python, projectPath, venvPython
}

func serveBenchExportSnapshot(t *testing.T, snapshot contracts.ProjectSnapshotV2, projectPath string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
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
}

func exportBenchBundleForTest(t *testing.T, server *httptest.Server, python string, output string) (benchExportResult, contracts.BenchCandidateBundleV1) {
	t.Helper()
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
	return result, bundle
}

func executeBenchCandidate(t *testing.T, bundle contracts.BenchCandidateBundleV1, root string, outputDirectory string, caseID string, input map[string]int) benchCandidateEnvelope {
	t.Helper()
	request, err := json.Marshal(map[string]any{
		"protocolVersion": "bench-candidate/v1",
		"runId":           "run:" + caseID,
		"case": map[string]any{
			"id": caseID, "name": caseID, "input": input, "expected": nil,
		},
		"outputDirectory": outputDirectory,
	})
	if err != nil {
		t.Fatalf("encode candidate request: %v", err)
	}
	command := exec.Command(bundle.Candidate.Command.Argv[0], "candidate.py")
	command.Dir = root
	command.Stdin = bytes.NewReader(request)
	output, err := command.Output()
	if err != nil {
		t.Fatalf("execute exported candidate: %v", err)
	}
	var envelope benchCandidateEnvelope
	if err := json.Unmarshal(output, &envelope); err != nil {
		t.Fatalf("decode candidate output %q: %v", output, err)
	}
	return envelope
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
