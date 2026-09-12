package cli

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"unicode/utf8"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/pythonenv"
)

type benchExportCommandOptions struct {
	url                string
	callableID         string
	output             string
	python             string
	name               string
	deepLink           string
	diagnosticsTimeout string
	pretty             bool
}

type benchRuntimeParameter struct {
	Name         string                            `json:"name"`
	PassingStyle contracts.ParameterPassingStyleV2 `json:"passingStyle"`
	HasDefault   bool                              `json:"hasDefault"`
}

type benchRuntimeDocument struct {
	Version            int                     `json:"version"`
	CallableExpression string                  `json:"callableExpression"`
	Parameters         []benchRuntimeParameter `json:"parameters"`
}

type benchExportResult struct {
	SchemaVersion   string `json:"schemaVersion"`
	BundleDirectory string `json:"bundleDirectory"`
	CandidateID     string `json:"candidateId"`
}

type benchBundleFile struct {
	name    string
	content []byte
}

func runBenchExportCommand(ctx context.Context, arguments []string, options Options) int {
	command, help, failure := parseBenchExportArguments(arguments)
	if help {
		writeHelp(options.Stdout, "export-bench")
		return exitSuccess
	}
	if failure != nil {
		writeFailure(options.Stderr, failure, false)
		return failure.exitCode
	}
	result, failure := createBenchExport(ctx, command, options.HTTPClient)
	if failure != nil {
		writeFailure(options.Stderr, failure, command.pretty)
		return failure.exitCode
	}
	if err := writeJSON(options.Stdout, result, command.pretty); err != nil {
		writeFailure(options.Stderr, unexpectedFailure("internal_error", "Unable to write command output."), command.pretty)
		return exitUnexpectedFailure
	}
	return exitSuccess
}

func createBenchExport(ctx context.Context, command benchExportCommandOptions, httpClient HTTPClient) (benchExportResult, *commandFailure) {
	client, failure := newServiceClient(command.url, httpClient)
	if failure != nil {
		return benchExportResult{}, failure
	}
	snapshot, failure := settledBenchExportSnapshot(ctx, client, command.diagnosticsTimeout)
	if failure != nil {
		return benchExportResult{}, failure
	}
	bundle, runtimeDocument, program, failure := buildBenchBundle(snapshot, command)
	if failure != nil {
		return benchExportResult{}, failure
	}
	identity, failure := client.runtimeSession(ctx)
	if failure != nil {
		return benchExportResult{}, failure
	}
	environment, err := pythonenv.Resolve(ctx, pythonenv.Options{
		ProjectPath: identity.ProjectPath, LauncherPython: command.python,
	})
	if err != nil {
		return benchExportResult{}, inputFailure("python_environment_invalid", "The Python Canvas environment cannot be exported: "+safeOperationErrorReason(err))
	}
	bundle.Candidate.Command.Argv[0] = environment.InterpreterPath()
	if err := bundle.Validate(); err != nil {
		return benchExportResult{}, unexpectedFailure("internal_error", "Unable to build a valid Bench candidate bundle.")
	}
	directory, err := writeBenchBundle(command.output, bundle, runtimeDocument, program)
	if err != nil {
		return benchExportResult{}, inputFailure("export_failed", "The Bench candidate bundle could not be created: "+safeOperationErrorReason(err))
	}
	return benchExportResult{SchemaVersion: "python-canvas-bench-export/v1", BundleDirectory: directory, CandidateID: bundle.Candidate.ID}, nil
}

func settledBenchExportSnapshot(ctx context.Context, client *serviceClient, diagnosticTimeout string) (contracts.ProjectSnapshotV2, *commandFailure) {
	snapshot, failure := client.snapshot(ctx)
	if failure != nil {
		return contracts.ProjectSnapshotV2{}, failure
	}
	timeout, failure := parseDiagnosticTimeout(diagnosticTimeout)
	if failure != nil {
		return contracts.ProjectSnapshotV2{}, failure
	}
	return settleDiagnostics(ctx, client, snapshot, timeout)
}

func parseBenchExportArguments(arguments []string) (benchExportCommandOptions, bool, *commandFailure) {
	flags := newFlagSet("export-bench")
	serviceURL := flags.String("url", defaultServiceURL, "loopback Python Canvas service URL")
	callableID := flags.String("callable", "", "callable stable ID")
	output := flags.String("output", "", "new bundle directory")
	python := flags.String("python", "", "absolute Python interpreter")
	name := flags.String("name", "", "candidate display name")
	deepLink := flags.String("deep-link", "", "source deep link")
	diagnosticsTimeout := flags.String("diagnostics-timeout", "", "diagnostic wait timeout")
	pretty := flags.Bool("pretty", false, "indent JSON output")
	if err := flags.Parse(arguments); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return benchExportCommandOptions{}, true, nil
		}
		return benchExportCommandOptions{}, false, inputFailure("invalid_input", "Export arguments are invalid.")
	}
	if flags.NArg() != 0 {
		return benchExportCommandOptions{}, false, inputFailure("invalid_input", "Export does not accept positional arguments.")
	}
	command := benchExportCommandOptions{
		url: *serviceURL, callableID: *callableID, output: *output, python: *python,
		name: *name, deepLink: *deepLink, diagnosticsTimeout: *diagnosticsTimeout, pretty: *pretty,
	}
	if failure := validateBenchExportArguments(command); failure != nil {
		return benchExportCommandOptions{}, false, failure
	}
	return command, false, nil
}

func validateBenchExportArguments(command benchExportCommandOptions) *commandFailure {
	if _, err := validateServiceURL(command.url); err != nil {
		return inputFailure("invalid_url", "The service URL must be an absolute loopback HTTP URL without a base path, query, user info, or fragment.")
	}
	if failure := validateBenchExportRequiredValues(command); failure != nil {
		return failure
	}
	if failure := validateBenchExportInterpreter(command.python); failure != nil {
		return failure
	}
	if command.name != "" && invalidBenchText(command.name, 160) {
		return inputFailure("invalid_input", "Candidate name must be trimmed valid text no longer than 160 bytes.")
	}
	if command.deepLink != "" {
		if failure := validateBenchExportDeepLink(command.deepLink); failure != nil {
			return failure
		}
	}
	_, failure := parseDiagnosticTimeout(command.diagnosticsTimeout)
	return failure
}

func validateBenchExportRequiredValues(command benchExportCommandOptions) *commandFailure {
	for _, required := range []struct {
		label string
		value string
	}{{label: "callable", value: command.callableID}, {label: "output", value: command.output}, {label: "python", value: command.python}} {
		if invalidBenchExportRequiredValue(required.value) {
			return inputFailure("invalid_input", "Export requires a valid --"+required.label+" value.")
		}
	}
	return nil
}

func invalidBenchExportRequiredValue(value string) bool {
	return strings.TrimSpace(value) == "" || strings.TrimSpace(value) != value || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00')
}

func validateBenchExportInterpreter(python string) *commandFailure {
	if !filepath.IsAbs(python) {
		return inputFailure("invalid_input", "Export requires --python to be an absolute path.")
	}
	info, err := os.Stat(python)
	if err != nil || !info.Mode().IsRegular() {
		return inputFailure("invalid_input", "Export requires --python to name an existing regular file.")
	}
	return nil
}

func validateBenchExportDeepLink(value string) *commandFailure {
	parsed, err := url.Parse(value)
	if err != nil {
		return inputFailure("invalid_input", "Deep link must be an absolute HTTP or HTTPS URL without user information.")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if parsed.Host == "" || parsed.User != nil || scheme != "http" && scheme != "https" || invalidBenchText(value, 4096) {
		return inputFailure("invalid_input", "Deep link must be an absolute HTTP or HTTPS URL without user information.")
	}
	return nil
}

func invalidBenchText(value string, maximum int) bool {
	return value == "" || strings.TrimSpace(value) != value || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') || len(value) > maximum
}

func buildBenchBundle(snapshot contracts.ProjectSnapshotV2, command benchExportCommandOptions) (contracts.BenchCandidateBundleV1, benchRuntimeDocument, []byte, *commandFailure) {
	if benchExportHasErrorDiagnostics(snapshot.Diagnostics) {
		return contracts.BenchCandidateBundleV1{}, benchRuntimeDocument{}, nil, inputFailure("diagnostics_failed", "The selected project has error diagnostics and cannot be exported.")
	}
	selected := findBenchExportCallable(snapshot.Callables, command.callableID)
	if selected == nil {
		return contracts.BenchCandidateBundleV1{}, benchRuntimeDocument{}, nil, inputFailure("callable_not_found", "The selected callable does not exist in the current project revision.")
	}
	parameters, failure := buildBenchRuntimeParameters(selected.Parameters)
	if failure != nil {
		return contracts.BenchCandidateBundleV1{}, benchRuntimeDocument{}, nil, failure
	}
	name := command.name
	if name == "" {
		name = selected.Name
	}
	deepLink := command.deepLink
	if deepLink == "" {
		deepLink = command.url + "/?section=" + url.QueryEscape(selected.ID)
	}
	hash := sha256.Sum256([]byte(fmt.Sprintf("%s\x00%d\x00%s", snapshot.Project.ID, snapshot.Project.Revision, selected.ID)))
	candidateID := "python-canvas-" + hex.EncodeToString(hash[:10])
	bundle := contracts.BenchCandidateBundleV1{
		Version: contracts.BenchCandidateBundleVersionV1,
		Source: contracts.BenchCandidateSourceV1{
			Application: "python-canvas", ProjectID: snapshot.Project.ID, ProjectRevision: snapshot.Project.Revision,
			CallableID: selected.ID, DeepLink: deepLink,
		},
		Candidate: contracts.BenchCandidateV1{
			ID: candidateID, Name: name,
			Command: contracts.BenchCandidateCommandV1{Argv: []string{command.python, "candidate.py"}, WorkingDirectory: "."},
		},
	}
	if err := bundle.Validate(); err != nil {
		return contracts.BenchCandidateBundleV1{}, benchRuntimeDocument{}, nil, unexpectedFailure("internal_error", "Unable to build a valid Bench candidate bundle.")
	}
	runtime := benchRuntimeDocument{Version: 1, CallableExpression: selected.AuthoredExpression, Parameters: parameters}
	return bundle, runtime, []byte(snapshot.GeneratedCode.Code), nil
}

func benchExportHasErrorDiagnostics(diagnostics []contracts.DiagnosticV2) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Severity == contracts.DiagnosticSeverityErrorV2 {
			return true
		}
	}
	return false
}

func findBenchExportCallable(callables []contracts.CallableV2, callableID string) *contracts.CallableV2 {
	for index := range callables {
		if callables[index].ID == callableID {
			return &callables[index]
		}
	}
	return nil
}

func buildBenchRuntimeParameters(parameters []contracts.ParameterV2) ([]benchRuntimeParameter, *commandFailure) {
	runtimeParameters := make([]benchRuntimeParameter, 0, len(parameters))
	for _, parameter := range parameters {
		if parameter.Name == "" || parameter.AuthoredExpression == "" && parameter.Default == nil {
			return nil, inputFailure("callable_incomplete", "The selected callable contains an incomplete parameter.")
		}
		runtimeParameters = append(runtimeParameters, benchRuntimeParameter{
			Name: parameter.Name, PassingStyle: parameter.PassingStyle, HasDefault: parameter.Default != nil,
		})
	}
	return runtimeParameters, nil
}

func (client *serviceClient) runtimeSession(ctx context.Context) (contracts.RuntimeSessionIdentityV2, *commandFailure) {
	content, failure := client.requestContent(ctx, http.MethodGet, contracts.RuntimeSessionPathV2, nil, defaultRequestTimeout)
	if failure != nil {
		return contracts.RuntimeSessionIdentityV2{}, failure
	}
	var identity contracts.RuntimeSessionIdentityV2
	if err := decodeStrictJSON(content, &identity); err != nil || identity.Validate() != nil {
		return contracts.RuntimeSessionIdentityV2{}, unexpectedFailure("malformed_response", "The service returned an invalid runtime session identity.")
	}
	return identity, nil
}

func writeBenchBundle(output string, bundle contracts.BenchCandidateBundleV1, runtime benchRuntimeDocument, program []byte) (string, error) {
	absolute, parent, err := resolveBenchBundleDestination(output)
	if err != nil {
		return "", err
	}
	staging, err := os.MkdirTemp(parent, ".setta-bench-export-*")
	if err != nil {
		return "", fmt.Errorf("create staging directory: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = os.RemoveAll(staging)
		}
	}()
	files, err := encodeBenchBundleFiles(bundle, runtime, program)
	if err != nil {
		return "", err
	}
	if err := writeBenchBundleFiles(staging, files); err != nil {
		return "", err
	}
	if err := syncBenchBundleDirectory(staging); err != nil {
		return "", fmt.Errorf("sync bundle directory: %w", err)
	}
	if err := os.Rename(staging, absolute); err != nil {
		return "", fmt.Errorf("install bundle: %w", err)
	}
	committed = true
	if err := syncBenchBundleDirectory(parent); err != nil {
		return "", fmt.Errorf("sync bundle parent: %w", err)
	}
	return absolute, nil
}

func resolveBenchBundleDestination(output string) (string, string, error) {
	absolute, err := filepath.Abs(output)
	if err != nil {
		return "", "", fmt.Errorf("resolve output: %w", err)
	}
	absolute = filepath.Clean(absolute)
	if _, err := os.Lstat(absolute); err == nil {
		return "", "", errors.New("output already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", "", fmt.Errorf("inspect output: %w", err)
	}
	parent := filepath.Dir(absolute)
	parentInfo, err := os.Stat(parent)
	if err != nil || !parentInfo.IsDir() {
		return "", "", errors.New("output parent is not an existing directory")
	}
	return absolute, parent, nil
}

func encodeBenchBundleFiles(bundle contracts.BenchCandidateBundleV1, runtime benchRuntimeDocument, program []byte) ([]benchBundleFile, error) {
	manifest, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode manifest: %w", err)
	}
	runtimeContent, err := json.MarshalIndent(runtime, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode runtime: %w", err)
	}
	return []benchBundleFile{
		{name: "bench-candidate.json", content: append(manifest, '\n')},
		{name: "runtime.json", content: append(runtimeContent, '\n')},
		{name: "program.py", content: program},
		{name: "candidate.py", content: []byte(benchCandidatePython)},
	}, nil
}

func writeBenchBundleFiles(root string, files []benchBundleFile) error {
	for _, file := range files {
		if err := writeBenchBundleFile(filepath.Join(root, file.name), file.content); err != nil {
			return err
		}
	}
	return nil
}

func syncBenchBundleDirectory(path string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func writeBenchBundleFile(path string, content []byte) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create bundle file: %w", err)
	}
	written, err := file.Write(content)
	if err != nil {
		_ = file.Close()
		return fmt.Errorf("write bundle file: %w", err)
	}
	if written != len(content) {
		_ = file.Close()
		return errors.New("write bundle file: short write")
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("sync bundle file: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close bundle file: %w", err)
	}
	return nil
}

const benchCandidatePython = `import asyncio
import contextlib
import inspect
import json
import pathlib
import sys
import traceback


def load_runtime():
    root = pathlib.Path(__file__).resolve().parent
    runtime = json.loads((root / "runtime.json").read_text(encoding="utf-8"))
    namespace = {"__file__": str(root / "program.py"), "__name__": "__setta_bench_candidate__"}
    source = (root / "program.py").read_text(encoding="utf-8")
    exec(compile(source, str(root / "program.py"), "exec"), namespace, namespace)
    return runtime, eval(runtime["callableExpression"], namespace, namespace)


def bind_arguments(runtime, request):
    case = request.get("case")
    if not isinstance(case, dict):
        raise TypeError("Bench case is required")
    provided = case.get("input")
    if not isinstance(provided, dict):
        raise TypeError("Bench case input must be an object")
    values = dict(provided)
    values["outputDirectory"] = request["outputDirectory"]
    values["output_directory"] = request["outputDirectory"]
    args = []
    kwargs = {}
    positional = [parameter for parameter in runtime["parameters"] if parameter["passingStyle"] == "positional_only"]
    last_provided = max((index for index, parameter in enumerate(positional) if parameter["name"] in values), default=-1)
    variadic_values = [values.get(parameter["name"], []) for parameter in runtime["parameters"] if parameter["passingStyle"] == "variadic_positional"]
    if any(variadic_values):
        last_provided = len(positional) - 1
    signature = inspect.signature(runtime["callable"])
    positional_index = 0
    for parameter in runtime["parameters"]:
        name = parameter["name"]
        style = parameter["passingStyle"]
        if style == "positional_only":
            if name in values:
                args.append(values[name])
            elif positional_index <= last_provided:
                default = signature.parameters[name].default
                if default is inspect.Parameter.empty:
                    raise KeyError(name)
                args.append(default)
            elif not parameter["hasDefault"]:
                raise KeyError(name)
            positional_index += 1
        elif style == "variadic_positional":
            args.extend(values.get(name, []))
        elif style == "variadic_keyword":
            kwargs.update(values.get(name, {}))
        elif name in values:
            kwargs[name] = values[name]
        elif not parameter["hasDefault"]:
            raise KeyError(name)
    return args, kwargs


def result_envelope(value):
    if isinstance(value, dict) and "output" in value and ("artifacts" in value or "observations" in value):
        return {
            "type": "result",
            "output": value["output"],
            "observations": value.get("observations", []),
            "artifacts": value.get("artifacts", []),
        }
    return {"type": "result", "output": value, "observations": [], "artifacts": []}


def main():
    try:
        request = json.load(sys.stdin)
        if request.get("protocolVersion") != "bench-candidate/v1":
            raise ValueError("Bench candidate protocol version is unsupported")
        with contextlib.redirect_stdout(sys.stderr):
            runtime, callable_value = load_runtime()
            runtime["callable"] = callable_value
            args, kwargs = bind_arguments(runtime, request)
            value = callable_value(*args, **kwargs)
            if inspect.isawaitable(value):
                value = asyncio.run(value)
        print(json.dumps(result_envelope(value), ensure_ascii=False, separators=(",", ":")))
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        message = str(error) or type(error).__name__
        print(json.dumps({"type": "error", "code": "python_exception", "message": message}, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
`
