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

	"github.com/setta/review/backend/internal/contracts"
	"github.com/setta/review/backend/internal/coordinator"
)

const maximumCommandBytes = 4 << 20

type commandError struct {
	code    string
	message string
	status  int
}

func (failure *commandError) Error() string {
	return failure.message
}

type reviewCoordinator interface {
	Snapshot() (contracts.ReviewSnapshot, error)
	Apply(contracts.ReviewMutation) (contracts.MutationResult, error)
	Export(bool) (contracts.ExportResult, error)
	Subscribe(context.Context) (<-chan contracts.ReviewSnapshot, error)
	OpenArtifact(string, string) (*os.File, contracts.ArtifactEvidenceReference, error)
	Close() error
}

type coordinatorOpener func(string) (reviewCoordinator, error)

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

type schemaDocument struct {
	SchemaVersion string                    `json:"schemaVersion"`
	Schemas       map[string]map[string]any `json:"schemas"`
}

func execute(arguments []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) int {
	return executeWith(arguments, stdin, stdout, stderr, func(root string) (reviewCoordinator, error) {
		return coordinator.Open(root)
	})
}

func executeWith(arguments []string, stdin io.Reader, stdout io.Writer, stderr io.Writer, opener coordinatorOpener) int {
	if stdin == nil || stdout == nil || stderr == nil || opener == nil {
		return writeCommandError(stderr, operationalError(errors.New("command streams and dependencies are required")))
	}
	err := run(arguments, stdin, stdout, opener)
	if err == nil {
		return 0
	}
	var failure *commandError
	if !errors.As(err, &failure) {
		failure = operationalError(err)
	}
	return writeCommandError(stderr, failure)
}

func run(arguments []string, stdin io.Reader, stdout io.Writer, opener coordinatorOpener) error {
	if len(arguments) == 0 {
		return usageError("a Review command is required")
	}
	command := arguments[0]
	rest := arguments[1:]
	switch command {
	case "schema":
		return runSchema(rest, stdout)
	case "snapshot":
		return runSnapshot(rest, stdout, opener)
	case "apply":
		return runApply(rest, stdin, stdout, opener)
	case "export":
		return runExport(rest, stdout, opener)
	case "serve":
		return runServe(rest, stdin, stdout, opener)
	default:
		return usageError(fmt.Sprintf("unknown Review command %q", command))
	}
}

func runSchema(arguments []string, stdout io.Writer) error {
	options, err := parseOptions(arguments, map[string]optionKind{"--pretty": flagOption})
	if err != nil {
		return err
	}
	document := schemaDocument{SchemaVersion: "setta-review-schema/v1", Schemas: contracts.PublicSchemas()}
	return writeOutput(stdout, document, options.flags["--pretty"])
}

func runSnapshot(arguments []string, stdout io.Writer, opener coordinatorOpener) error {
	options, err := parseProjectOptions(arguments, false)
	if err != nil {
		return err
	}
	application, err := opener(options.values["--project-root"])
	if err != nil {
		return operationalError(err)
	}
	snapshot, operationErr := application.Snapshot()
	if closeErr := application.Close(); operationErr == nil {
		operationErr = closeErr
	}
	if operationErr != nil {
		return operationalError(operationErr)
	}
	return writeOutput(stdout, snapshot, options.flags["--pretty"])
}

func runApply(arguments []string, stdin io.Reader, stdout io.Writer, opener coordinatorOpener) error {
	options, err := parseProjectOptions(arguments, true)
	if err != nil {
		return err
	}
	var mutation contracts.ReviewMutation
	if err := readJSONInput(options.values["--file"], stdin, &mutation); err != nil {
		return err
	}
	if err := mutation.Validate(); err != nil {
		return usageError(err.Error())
	}
	application, err := opener(options.values["--project-root"])
	if err != nil {
		return operationalError(err)
	}
	result, operationErr := application.Apply(mutation)
	if closeErr := application.Close(); operationErr == nil {
		operationErr = closeErr
	}
	if operationErr != nil {
		return operationalError(operationErr)
	}
	return writeOutput(stdout, result, options.flags["--pretty"])
}

func runExport(arguments []string, stdout io.Writer, opener coordinatorOpener) error {
	options, err := parseOptions(arguments, map[string]optionKind{
		"--project-root":  valueOption,
		"--output-dir":    valueOption,
		"--continuations": flagOption,
		"--pretty":        flagOption,
	})
	if err != nil {
		return err
	}
	if err := requireValue(options, "--project-root"); err != nil {
		return err
	}
	outputDirectory := options.values["--output-dir"]
	if outputDirectory == "" {
		outputDirectory = filepath.Join(options.values["--project-root"], ".local", "review", "export")
	}
	application, err := opener(options.values["--project-root"])
	if err != nil {
		return operationalError(err)
	}
	result, operationErr := application.Export(options.flags["--continuations"])
	if operationErr == nil {
		operationErr = writeExportFiles(outputDirectory, result.Export)
	}
	if closeErr := application.Close(); operationErr == nil {
		operationErr = closeErr
	}
	if operationErr != nil {
		return operationalError(operationErr)
	}
	return writeOutput(stdout, result, options.flags["--pretty"])
}

func parseProjectOptions(arguments []string, requireFile bool) (parsedOptions, error) {
	specification := map[string]optionKind{"--project-root": valueOption, "--pretty": flagOption}
	if requireFile {
		specification["--file"] = valueOption
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
		return index, usageError(fmt.Sprintf("unexpected Review argument %q", token))
	}
	if _, exists := options.values[name]; exists || options.flags[name] {
		return index, usageError(fmt.Sprintf("%s may be supplied only once", name))
	}
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
		return index, usageError(fmt.Sprintf("unexpected Review argument %q", token))
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

func readJSONInput(path string, stdin io.Reader, target any) error {
	var reader io.Reader = stdin
	var file *os.File
	if path != "-" {
		opened, err := os.Open(path)
		if err != nil {
			return usageError(fmt.Sprintf("read %s: %v", path, err))
		}
		file = opened
		reader = file
		defer file.Close()
	}
	data, err := io.ReadAll(io.LimitReader(reader, maximumCommandBytes+1))
	if err != nil {
		return usageError(fmt.Sprintf("read command: %v", err))
	}
	if len(data) > maximumCommandBytes {
		return usageError("command input exceeds the size limit")
	}
	if err := contracts.DecodeStrict(data, target); err != nil {
		return usageError(fmt.Sprintf("decode command: %v", err))
	}
	return nil
}

func writeExportFiles(outputDirectory string, document contracts.ExportDocument) error {
	if strings.TrimSpace(outputDirectory) == "" {
		return errors.New("export output directory is invalid")
	}
	absolute, err := filepath.Abs(outputDirectory)
	if err != nil {
		return fmt.Errorf("resolve export directory: %w", err)
	}
	if err := os.MkdirAll(absolute, 0o755); err != nil {
		return fmt.Errorf("create export directory: %w", err)
	}
	continuations := make(map[string]contracts.ContinuationPacket, len(document.Continuations))
	for _, packet := range document.Continuations {
		continuations[packet.Response.RequestID] = packet
	}
	for _, response := range document.Responses {
		directory := filepath.Join(absolute, response.RequestID)
		if err := os.MkdirAll(directory, 0o755); err != nil {
			return fmt.Errorf("create request export directory: %w", err)
		}
		if err := writeJSONFile(filepath.Join(directory, "review-response.json"), response); err != nil {
			return err
		}
		if packet, exists := continuations[response.RequestID]; exists {
			if err := writeJSONFile(filepath.Join(directory, "continuation-packet.json"), packet); err != nil {
				return err
			}
		}
	}
	return nil
}

func writeJSONFile(path string, value any) error {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode export: %w", err)
	}
	encoded = append(encoded, '\n')
	temporary, err := os.CreateTemp(filepath.Dir(path), ".review-export-*.json")
	if err != nil {
		return fmt.Errorf("create export replacement: %w", err)
	}
	temporaryPath := temporary.Name()
	installed := false
	defer func() {
		_ = temporary.Close()
		if !installed {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o644); err != nil {
		return fmt.Errorf("set export mode: %w", err)
	}
	if _, err := temporary.Write(encoded); err != nil {
		return fmt.Errorf("write export: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync export: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close export: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("install export: %w", err)
	}
	installed = true
	return nil
}

func writeOutput(writer io.Writer, value any, pretty bool) error {
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	if pretty {
		encoder.SetIndent("", "  ")
	}
	if err := encoder.Encode(value); err != nil {
		return operationalError(fmt.Errorf("write output: %w", err))
	}
	return nil
}

func usageError(message string) *commandError {
	return &commandError{code: "invalid_input", message: message, status: 2}
}

func operationalError(err error) *commandError {
	return &commandError{code: "operation_failed", message: err.Error(), status: 1}
}

func writeCommandError(writer io.Writer, failure *commandError) int {
	if writer == nil {
		return failure.status
	}
	document := contracts.StructuredError{Code: failure.code, Message: failure.message}
	var output bytes.Buffer
	if err := json.NewEncoder(&output).Encode(document); err == nil {
		_, _ = writer.Write(output.Bytes())
	}
	return failure.status
}

func parsePort(value string) (uint16, error) {
	port, err := strconv.ParseUint(value, 10, 16)
	if err != nil {
		return 0, usageError("--port must be an integer from 0 through 65535")
	}
	return uint16(port), nil
}
