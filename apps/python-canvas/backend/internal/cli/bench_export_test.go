package cli

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
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
	snapshot := exportableSnapshot(t)
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet || request.URL.Path != contracts.ProjectPathV2 {
			t.Errorf("unexpected request %s %s", request.Method, request.URL.Path)
			response.WriteHeader(http.StatusNotFound)
			return
		}
		writeJSONResponse(t, response, snapshot)
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

	executionOutput := filepath.Join(t.TempDir(), "case-output")
	if err := os.Mkdir(executionOutput, 0o700); err != nil {
		t.Fatalf("create case output: %v", err)
	}
	request := []byte(`{"input":{"value":7},"outputDirectory":` + quotedJSON(t, executionOutput) + `}`)
	command := exec.Command(python, "candidate.py")
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

func exportableSnapshot(t *testing.T) contracts.ProjectSnapshotV2 {
	t.Helper()
	ui, err := contracts.DefaultParameterUIV2(contracts.ParameterUITypeTextV2)
	if err != nil {
		t.Fatalf("default parameter UI: %v", err)
	}
	snapshot := contracts.FixtureProjectSnapshotV2()
	snapshot.Project = contracts.ProjectV2{ID: "project:export", Name: "Export", Revision: 7}
	snapshot.PythonTarget.Prefix = "def multiply(value):\n    return value * 3"
	snapshot.Callables = []contracts.CallableV2{{
		ID: "callable:multiply", Name: "Multiply", AuthoredExpression: "multiply",
		Parameters: []contracts.ParameterV2{{
			ID: "parameter:value", Name: "value", NameEditable: true,
			PassingStyle: contracts.ParameterPassingStylePositionalOrKeywordV2, AuthoredExpression: "1", UI: ui,
		}},
	}}
	snapshot.TopLevelSectionIDs = []string{"callable:multiply"}
	snapshot.DiagnosticsRevision = snapshot.Project.Revision
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
