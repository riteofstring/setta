package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/setta/realtime/backend/internal/contracts"
)

const (
	launcherPythonEnvironment = "SETTA_LAUNCHER_PYTHON"
	maximumCommandBytes       = 4 << 20
)

type commandError struct {
	code    string
	message string
	status  int
}

func (failure *commandError) Error() string {
	return failure.message
}

type commandCoordinator interface {
	ProjectSnapshot() (contracts.Project, error)
	Apply(contracts.ApplyRequest) (contracts.Project, error)
	Reload(context.Context) (contracts.InitializeResult, error)
	Invoke(context.Context, string, contracts.DirectInvokeRequest) (contracts.InvokeResult, error)
	Snapshot() (contracts.RuntimeSnapshot, error)
}

type openedApplication interface {
	Coordinator() commandCoordinator
	ServerCoordinator() serverCoordinator
	ProjectEvents() projectEvents
	ContentStore() contentStore
	Close() error
}

type applicationOpener func(string, bool, string) (openedApplication, error)

type optionKind uint8

const (
	valueOption optionKind = iota
	flagOption
	booleanValueOption
)

type parsedOptions struct {
	values map[string]string
	flags  map[string]bool
}

type snapshotDocument struct {
	Project contracts.Project         `json:"project"`
	Runtime contracts.RuntimeSnapshot `json:"runtime"`
}

func execute(arguments []string, stdin io.Reader, stdout io.Writer, stderr io.Writer, getenv func(string) string, opener applicationOpener) int {
	if stdin == nil || stdout == nil || stderr == nil || getenv == nil || opener == nil {
		return writeCommandError(stderr, operationalError(errors.New("command streams and dependencies are required")))
	}
	err := run(arguments, stdin, stdout, getenv, opener)
	if err == nil {
		return 0
	}
	var failure *commandError
	if !errors.As(err, &failure) {
		failure = operationalError(err)
	}
	return writeCommandError(stderr, failure)
}

func run(arguments []string, stdin io.Reader, stdout io.Writer, getenv func(string) string, opener applicationOpener) error {
	if len(arguments) == 0 {
		return usageError("a Realtime command is required")
	}
	command := arguments[0]
	rest := arguments[1:]
	switch command {
	case "serve":
		return runServe(rest, stdin, stdout, opener)
	case "schema":
		return runSchema(rest, stdout)
	case "snapshot":
		return runSnapshot(rest, stdout, getenv, opener)
	case "apply":
		return runApply(rest, stdin, stdout, getenv, opener)
	case "reload":
		return runReload(rest, stdout, getenv, opener)
	case "invoke":
		return runInvoke(rest, stdin, stdout, getenv, opener)
	default:
		return usageError(fmt.Sprintf("unknown Realtime command %q", command))
	}
}

func runSchema(arguments []string, stdout io.Writer) error {
	options, err := parseOptions(arguments, map[string]optionKind{"--pretty": flagOption})
	if err != nil {
		return err
	}
	return writeOutput(stdout, schemaDocument(), options.flags["--pretty"])
}

func runSnapshot(arguments []string, stdout io.Writer, getenv func(string) string, opener applicationOpener) error {
	options, err := parseProjectOptions(arguments, false, false)
	if err != nil {
		return err
	}
	application, err := openCommandApplication(options, getenv, opener)
	if err != nil {
		return err
	}
	projectSnapshot, operationErr := application.Coordinator().ProjectSnapshot()
	var runtimeSnapshot contracts.RuntimeSnapshot
	if operationErr == nil {
		runtimeSnapshot, operationErr = application.Coordinator().Snapshot()
	}
	if closeErr := application.Close(); operationErr == nil {
		operationErr = closeErr
	}
	if operationErr != nil {
		return operationalError(operationErr)
	}
	return writeOutput(stdout, snapshotDocument{Project: projectSnapshot, Runtime: runtimeSnapshot}, options.flags["--pretty"])
}

func runApply(arguments []string, stdin io.Reader, stdout io.Writer, getenv func(string) string, opener applicationOpener) error {
	options, err := parseProjectOptions(arguments, true, false)
	if err != nil {
		return err
	}
	var request contracts.ApplyRequest
	if err := readJSONInput(options.values["--file"], stdin, &request); err != nil {
		return err
	}
	application, err := openCommandApplication(options, getenv, opener)
	if err != nil {
		return err
	}
	result, operationErr := application.Coordinator().Apply(request)
	if closeErr := application.Close(); operationErr == nil {
		operationErr = closeErr
	}
	if operationErr != nil {
		return operationalError(operationErr)
	}
	return writeOutput(stdout, result, options.flags["--pretty"])
}

func runReload(arguments []string, stdout io.Writer, getenv func(string) string, opener applicationOpener) error {
	options, err := parseProjectOptions(arguments, false, false)
	if err != nil {
		return err
	}
	application, err := openCommandApplication(options, getenv, opener)
	if err != nil {
		return err
	}
	result, operationErr := application.Coordinator().Reload(context.Background())
	if closeErr := application.Close(); operationErr == nil {
		operationErr = closeErr
	}
	if operationErr != nil {
		return operationalError(operationErr)
	}
	return writeOutput(stdout, result, options.flags["--pretty"])
}

func runInvoke(arguments []string, stdin io.Reader, stdout io.Writer, getenv func(string) string, opener applicationOpener) error {
	options, err := parseProjectOptions(arguments, false, true)
	if err != nil {
		return err
	}
	request := contracts.DirectInvokeRequest{Arguments: map[string]json.RawMessage{}, Content: []contracts.ContentReference{}}
	if file, exists := options.values["--file"]; exists {
		if err := readJSONInput(file, stdin, &request); err != nil {
			return err
		}
	}
	if err := request.Validate(); err != nil {
		return usageError(err.Error())
	}
	application, err := openCommandApplication(options, getenv, opener)
	if err != nil {
		return err
	}
	result, operationErr := application.Coordinator().Reload(context.Background())
	if operationErr == nil && result.LoadError != nil {
		operationErr = errors.New(result.LoadError.Message)
	}
	var invoked contracts.InvokeResult
	if operationErr == nil {
		invoked, operationErr = application.Coordinator().Invoke(context.Background(), options.values["--handler"], request)
	}
	if closeErr := application.Close(); operationErr == nil {
		operationErr = closeErr
	}
	if operationErr != nil {
		return operationalError(operationErr)
	}
	return writeOutput(stdout, invoked, options.flags["--pretty"])
}

func parseProjectOptions(arguments []string, requireFile bool, invoke bool) (parsedOptions, error) {
	specification := map[string]optionKind{"--project-root": valueOption, "--pretty": flagOption}
	if requireFile || invoke {
		specification["--file"] = valueOption
	}
	if invoke {
		specification["--handler"] = valueOption
	}
	options, err := parseOptions(arguments, specification)
	if err != nil {
		return parsedOptions{}, err
	}
	if err := requireValue(options, "--project-root"); err != nil {
		return parsedOptions{}, err
	}
	if requireFile {
		if err := requireValue(options, "--file"); err != nil {
			return parsedOptions{}, err
		}
	}
	if invoke {
		if err := requireValue(options, "--handler"); err != nil {
			return parsedOptions{}, err
		}
	}
	return options, nil
}

func parseOptions(arguments []string, specification map[string]optionKind) (parsedOptions, error) {
	options := parsedOptions{values: make(map[string]string), flags: make(map[string]bool)}
	for index := 0; index < len(arguments); index++ {
		next, err := parseOption(arguments, index, specification, &options)
		if err != nil {
			return parsedOptions{}, err
		}
		index = next
	}
	return options, nil
}

func parseOption(arguments []string, index int, specification map[string]optionKind, options *parsedOptions) (int, error) {
	token := arguments[index]
	name, inline, hasInline := strings.Cut(token, "=")
	kind, exists := specification[name]
	if !exists || !strings.HasPrefix(name, "--") {
		return index, usageError(fmt.Sprintf("unexpected Realtime argument %q", token))
	}
	if _, exists := options.values[name]; exists || options.flags[name] {
		return index, usageError(fmt.Sprintf("%s may be supplied only once", name))
	}
	return applyParsedOption(arguments, index, name, inline, hasInline, kind, options)
}

func applyParsedOption(arguments []string, index int, name string, inline string, hasInline bool, kind optionKind, options *parsedOptions) (int, error) {
	switch kind {
	case flagOption:
		if hasInline {
			return index, usageError(fmt.Sprintf("%s does not accept a value", name))
		}
		options.flags[name] = true
	case booleanValueOption:
		if !hasInline || inline != "true" && inline != "false" {
			return index, usageError(fmt.Sprintf("%s requires true or false", name))
		}
		options.values[name] = inline
	case valueOption:
		value, next, err := parseOptionValue(arguments, index, name, inline, hasInline)
		if err != nil {
			return index, err
		}
		options.values[name] = value
		return next, nil
	default:
		return index, usageError(fmt.Sprintf("unexpected Realtime argument %q", arguments[index]))
	}
	return index, nil
}

func parseOptionValue(arguments []string, index int, name string, inline string, hasInline bool) (string, int, error) {
	value := inline
	if !hasInline {
		if index+1 >= len(arguments) {
			return "", index, usageError(fmt.Sprintf("%s requires a value", name))
		}
		index++
		value = arguments[index]
	}
	if value == "" {
		return "", index, usageError(fmt.Sprintf("%s requires a value", name))
	}
	return value, index, nil
}

func requireValue(options parsedOptions, name string) error {
	if options.values[name] == "" {
		return usageError(fmt.Sprintf("%s is required", name))
	}
	return nil
}

func openCommandApplication(options parsedOptions, getenv func(string) string, opener applicationOpener) (openedApplication, error) {
	launcher := getenv(launcherPythonEnvironment)
	if launcher == "" {
		return nil, usageError(launcherPythonEnvironment + " is required")
	}
	application, err := opener(options.values["--project-root"], false, launcher)
	if err != nil {
		return nil, operationalError(err)
	}
	return application, nil
}

func readJSONInput(path string, stdin io.Reader, target any) error {
	var source io.Reader
	var file *os.File
	if path == "-" {
		source = stdin
	} else {
		opened, err := os.Open(path)
		if err != nil {
			return usageError(fmt.Sprintf("read %s: %v", path, err))
		}
		file = opened
		defer file.Close()
		information, err := file.Stat()
		if err != nil || !information.Mode().IsRegular() {
			return usageError(fmt.Sprintf("%s is not a regular file", path))
		}
		source = file
	}
	data, err := io.ReadAll(io.LimitReader(source, maximumCommandBytes+1))
	if err != nil {
		return usageError(fmt.Sprintf("read JSON input: %v", err))
	}
	if len(data) > maximumCommandBytes {
		return usageError("JSON input exceeds the byte limit")
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return usageError("JSON input is empty")
	}
	if err := contracts.DecodeStrict(data, target); err != nil {
		return usageError(fmt.Sprintf("decode JSON input: %v", err))
	}
	return nil
}

func canonicalProjectRoot(value string) (string, error) {
	if value == "" || value != strings.TrimSpace(value) || strings.ContainsRune(value, '\x00') {
		return "", usageError("--project-root is invalid")
	}
	resolved, err := filepath.Abs(value)
	if err != nil {
		return "", usageError(fmt.Sprintf("resolve --project-root: %v", err))
	}
	return filepath.Clean(resolved), nil
}

func parsePort(value string) (uint16, error) {
	if value == "" || strings.HasPrefix(value, "+") || value != strings.TrimSpace(value) {
		return 0, usageError("--port is invalid")
	}
	parsed, err := strconv.ParseUint(value, 10, 16)
	if err != nil {
		return 0, usageError("--port is invalid")
	}
	return uint16(parsed), nil
}

func writeOutput(destination io.Writer, value any, pretty bool) error {
	var encoded []byte
	var err error
	if pretty {
		encoded, err = json.MarshalIndent(value, "", "  ")
	} else {
		encoded, err = json.Marshal(value)
	}
	if err != nil {
		return operationalError(fmt.Errorf("encode output: %w", err))
	}
	if _, err := destination.Write(append(encoded, '\n')); err != nil {
		return operationalError(fmt.Errorf("write output: %w", err))
	}
	return nil
}

func writeCommandError(destination io.Writer, failure *commandError) int {
	if destination != nil {
		_ = json.NewEncoder(destination).Encode(map[string]any{"error": contracts.StructuredError{Code: failure.code, Message: failure.message}})
	}
	return failure.status
}

func usageError(message string) *commandError {
	return &commandError{code: "invalid_input", message: message, status: 2}
}

func operationalError(err error) *commandError {
	return &commandError{code: "runtime_failed", message: err.Error(), status: 1}
}
