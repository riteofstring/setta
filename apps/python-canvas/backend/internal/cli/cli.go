package cli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

const (
	// MaxOperationBytes bounds one apply document before it is decoded or sent.
	MaxOperationBytes = 1 << 20

	defaultServiceURL         = "http://127.0.0.1:8080"
	defaultRequestTimeout     = 10 * time.Second
	defaultDiagnosticTimeout  = 10 * time.Second
	maxDiagnosticTimeout      = 60 * time.Second
	maxResponseBytes          = 16 << 20
	exitSuccess               = 0
	exitUnexpectedFailure     = 1
	exitInputOrTypedV2Failure = 2
)

// HTTPClient is the narrow seam used by the CLI. The production default is a
// timeout-bounded client that refuses redirects.
type HTTPClient interface {
	Do(*http.Request) (*http.Response, error)
}

// Options keeps process dependencies at the delivery boundary so the command
// package stays testable and does not own a project engine.
type Options struct {
	Stdin      io.Reader
	Stdout     io.Writer
	Stderr     io.Writer
	HTTPClient HTTPClient
}

type commandFailure struct {
	exitCode int
	detail   errorDetail
}

type errorDocument struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code                string `json:"code"`
	Message             string `json:"message"`
	ExpectedRevision    *int   `json:"expectedRevision,omitempty"`
	CurrentRevision     *int   `json:"currentRevision,omitempty"`
	ProjectRevision     *int   `json:"projectRevision,omitempty"`
	DiagnosticsRevision *int   `json:"diagnosticsRevision,omitempty"`
	ProviderState       string `json:"providerState,omitempty"`
}

type serviceCommandOptions struct {
	url             string
	file            string
	pretty          bool
	waitDiagnostics bool
	timeout         time.Duration
}

// IsCommand reports whether arguments select the machine-readable CLI rather
// than the existing server-startup argument surface.
func IsCommand(arguments []string) bool {
	if len(arguments) == 0 {
		return false
	}
	switch arguments[0] {
	case "schema", "snapshot", "apply":
		return true
	default:
		return false
	}
}

// Run executes one CLI command and returns its stable process exit status.
func Run(ctx context.Context, arguments []string, options Options) int {
	if ctx == nil {
		ctx = context.Background()
	}
	options = normalizedOptions(options)
	if len(arguments) == 0 {
		writeFailure(options.Stderr, inputFailure("invalid_input", "A Python Canvas command is required."), false)
		return exitInputOrTypedV2Failure
	}

	switch arguments[0] {
	case "schema":
		return runSchemaCommand(arguments[1:], options)
	case "snapshot":
		return runSnapshotCommand(ctx, arguments[1:], options)
	case "apply":
		return runApplyCommand(ctx, arguments[1:], options)
	default:
		writeFailure(options.Stderr, inputFailure("invalid_command", "The Python Canvas command is not supported."), false)
		return exitInputOrTypedV2Failure
	}
}

func runSchemaCommand(arguments []string, options Options) int {
	pretty, help, failure := parseSchemaArguments(arguments)
	if help {
		writeHelp(options.Stdout, "schema")
		return exitSuccess
	}
	if failure != nil {
		writeFailure(options.Stderr, failure, false)
		return failure.exitCode
	}
	document, err := schema()
	if err != nil {
		writeFailure(options.Stderr, unexpectedFailure("internal_error", "Unable to build the command schema."), pretty)
		return exitUnexpectedFailure
	}
	if err := writeJSON(options.Stdout, document, pretty); err != nil {
		writeFailure(options.Stderr, unexpectedFailure("internal_error", "Unable to write command output."), pretty)
		return exitUnexpectedFailure
	}
	return exitSuccess
}

func runSnapshotCommand(ctx context.Context, arguments []string, options Options) int {
	command, help, failure := parseServiceArguments("snapshot", arguments, false)
	if help {
		writeHelp(options.Stdout, "snapshot")
		return exitSuccess
	}
	if failure != nil {
		writeFailure(options.Stderr, failure, false)
		return failure.exitCode
	}
	return runSnapshot(ctx, command, options)
}

func runApplyCommand(ctx context.Context, arguments []string, options Options) int {
	command, help, failure := parseServiceArguments("apply", arguments, true)
	if help {
		writeHelp(options.Stdout, "apply")
		return exitSuccess
	}
	if failure != nil {
		writeFailure(options.Stderr, failure, false)
		return failure.exitCode
	}
	return runApply(ctx, command, options)
}

func normalizedOptions(options Options) Options {
	if options.Stdin == nil {
		options.Stdin = bytes.NewReader(nil)
	}
	if options.Stdout == nil {
		options.Stdout = io.Discard
	}
	if options.Stderr == nil {
		options.Stderr = io.Discard
	}
	if options.HTTPClient == nil {
		options.HTTPClient = &http.Client{
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	return options
}

func parseSchemaArguments(arguments []string) (pretty bool, help bool, failure *commandFailure) {
	flags := newFlagSet("schema")
	prettyFlag := flags.Bool("pretty", false, "indent JSON output")
	if err := flags.Parse(arguments); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return false, true, nil
		}
		return false, false, inputFailure("invalid_input", "Schema arguments are invalid.")
	}
	if flags.NArg() != 0 {
		return false, false, inputFailure("invalid_input", "Schema does not accept positional arguments.")
	}
	return *prettyFlag, false, nil
}

type serviceArgumentValues struct {
	file             string
	pretty           bool
	timeoutSpecified bool
	timeoutValue     string
	url              string
	waitDiagnostics  bool
}

func parseServiceArguments(command string, arguments []string, requireFile bool) (serviceCommandOptions, bool, *commandFailure) {
	values, help, failure := parseServiceArgumentValues(command, arguments)
	if help || failure != nil {
		return serviceCommandOptions{}, help, failure
	}
	options, failure := validateServiceArguments(values, requireFile)
	return options, false, failure
}

func parseServiceArgumentValues(command string, arguments []string) (serviceArgumentValues, bool, *commandFailure) {
	flags := newFlagSet(command)
	urlValue := flags.String("url", defaultServiceURL, "loopback Python Canvas service URL")
	pretty := flags.Bool("pretty", false, "indent JSON output")
	waitDiagnostics := flags.Bool("wait-diagnostics", false, "wait for current diagnostics")
	timeoutValue := flags.String("timeout", "", "diagnostic wait timeout")
	file := flags.String("file", "", "operation JSON file, or - for stdin")
	if err := flags.Parse(arguments); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return serviceArgumentValues{}, true, nil
		}
		return serviceArgumentValues{}, false, inputFailure("invalid_input", "Command arguments are invalid.")
	}
	if flags.NArg() != 0 {
		return serviceArgumentValues{}, false, inputFailure("invalid_input", "Command does not accept positional arguments.")
	}
	timeoutSpecified := false
	flags.Visit(func(value *flag.Flag) {
		if value.Name == "timeout" {
			timeoutSpecified = true
		}
	})
	return serviceArgumentValues{
		file:             *file,
		pretty:           *pretty,
		timeoutSpecified: timeoutSpecified,
		timeoutValue:     *timeoutValue,
		url:              *urlValue,
		waitDiagnostics:  *waitDiagnostics,
	}, false, nil
}

func validateServiceArguments(values serviceArgumentValues, requireFile bool) (serviceCommandOptions, *commandFailure) {
	if failure := validateServiceFileArgument(values.file, requireFile); failure != nil {
		return serviceCommandOptions{}, failure
	}
	if _, err := validateServiceURL(values.url); err != nil {
		return serviceCommandOptions{}, inputFailure("invalid_url", "The service URL must be an absolute loopback HTTP URL without a base path, query, user info, or fragment.")
	}
	timeout, failure := validatedDiagnosticTimeout(values)
	if failure != nil {
		return serviceCommandOptions{}, failure
	}
	return serviceCommandOptions{
		url:             values.url,
		file:            values.file,
		pretty:          values.pretty,
		waitDiagnostics: values.waitDiagnostics,
		timeout:         timeout,
	}, nil
}

func validateServiceFileArgument(file string, requireFile bool) *commandFailure {
	if requireFile && file == "" {
		return inputFailure("invalid_input", "Apply requires --file PATH or --file -.")
	}
	if !requireFile && file != "" {
		return inputFailure("invalid_input", "Snapshot does not accept --file.")
	}
	return nil
}

func validatedDiagnosticTimeout(values serviceArgumentValues) (time.Duration, *commandFailure) {
	if values.timeoutSpecified && !values.waitDiagnostics {
		return 0, inputFailure("invalid_input", "--timeout requires --wait-diagnostics.")
	}
	if values.timeoutSpecified && values.timeoutValue == "" {
		return 0, inputFailure("invalid_input", "Diagnostic timeout must be greater than zero and no more than one minute.")
	}
	timeout, failure := parseDiagnosticTimeout(values.timeoutValue)
	if failure != nil {
		return 0, failure
	}
	if !values.waitDiagnostics {
		timeout = 0
	}
	return timeout, nil
}

func newFlagSet(name string) *flag.FlagSet {
	result := flag.NewFlagSet(name, flag.ContinueOnError)
	result.SetOutput(io.Discard)
	return result
}

func parseDiagnosticTimeout(value string) (time.Duration, *commandFailure) {
	if value == "" {
		return defaultDiagnosticTimeout, nil
	}
	timeout, err := time.ParseDuration(value)
	if err != nil || timeout <= 0 || timeout > maxDiagnosticTimeout {
		return 0, inputFailure("invalid_input", "Diagnostic timeout must be greater than zero and no more than one minute.")
	}
	return timeout, nil
}

func runSnapshot(ctx context.Context, command serviceCommandOptions, options Options) int {
	client, failure := newServiceClient(command.url, options.HTTPClient)
	if failure != nil {
		writeFailure(options.Stderr, failure, command.pretty)
		return failure.exitCode
	}
	snapshot, failure := client.snapshot(ctx)
	if failure == nil && command.waitDiagnostics {
		snapshot, failure = settleDiagnostics(ctx, client, snapshot, command.timeout)
	}
	if failure != nil {
		writeFailure(options.Stderr, failure, command.pretty)
		return failure.exitCode
	}
	if err := writeJSON(options.Stdout, snapshot, command.pretty); err != nil {
		writeFailure(options.Stderr, unexpectedFailure("internal_error", "Unable to write command output."), command.pretty)
		return exitUnexpectedFailure
	}
	return exitSuccess
}

func runApply(ctx context.Context, command serviceCommandOptions, options Options) int {
	reader, closeReader, failure := openOperationReader(command.file, options.Stdin)
	if failure != nil {
		writeFailure(options.Stderr, failure, command.pretty)
		return failure.exitCode
	}
	defer closeReader()
	content, failure := readOperationDocument(reader)
	if failure != nil {
		writeFailure(options.Stderr, failure, command.pretty)
		return failure.exitCode
	}

	decoded, err := decodeOperationDocument(content)
	if err != nil {
		writeFailure(options.Stderr, operationInputFailure(err), command.pretty)
		return exitInputOrTypedV2Failure
	}
	client, failure := newServiceClient(command.url, options.HTTPClient)
	if failure != nil {
		writeFailure(options.Stderr, failure, command.pretty)
		return failure.exitCode
	}
	before, failure := client.snapshot(ctx)
	if failure != nil {
		writeFailure(options.Stderr, failure, command.pretty)
		return failure.exitCode
	}
	request, err := decoded.mutation(before)
	if err != nil {
		writeFailure(options.Stderr, operationInputFailure(err), command.pretty)
		return exitInputOrTypedV2Failure
	}
	snapshot, failure := client.apply(ctx, request)
	if failure == nil && command.waitDiagnostics {
		snapshot, failure = settleDiagnostics(ctx, client, snapshot, command.timeout)
	}
	if failure != nil {
		writeFailure(options.Stderr, failure, command.pretty)
		return failure.exitCode
	}
	if err := writeJSON(options.Stdout, snapshot, command.pretty); err != nil {
		writeFailure(options.Stderr, unexpectedFailure("internal_error", "Unable to write command output."), command.pretty)
		return exitUnexpectedFailure
	}
	return exitSuccess
}

func openOperationReader(path string, stdin io.Reader) (io.Reader, func(), *commandFailure) {
	if path == "-" {
		return stdin, func() {}, nil
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, inputFailure("invalid_input", "The operation document could not be read.")
	}
	return file, func() { _ = file.Close() }, nil
}

func readOperationDocument(reader io.Reader) ([]byte, *commandFailure) {
	content, err := readBounded(reader, MaxOperationBytes)
	if errors.Is(err, errInputTooLarge) {
		return nil, inputFailure("input_too_large", "The operation document exceeds the size limit.")
	}
	if err != nil {
		return nil, inputFailure("invalid_input", "The operation document could not be read.")
	}
	return content, nil
}

var errInputTooLarge = errors.New("input is too large")

func readBounded(reader io.Reader, maximum int) ([]byte, error) {
	content, err := io.ReadAll(io.LimitReader(reader, int64(maximum)+1))
	if err != nil {
		return nil, err
	}
	if len(content) > maximum {
		return nil, errInputTooLarge
	}
	return content, nil
}

type serviceClient struct {
	baseURL string
	http    HTTPClient
}

func newServiceClient(value string, httpClient HTTPClient) (*serviceClient, *commandFailure) {
	baseURL, err := validateServiceURL(value)
	if err != nil {
		return nil, inputFailure("invalid_url", "The service URL must be an absolute loopback HTTP URL without a base path, query, user info, or fragment.")
	}
	return &serviceClient{baseURL: baseURL, http: httpClient}, nil
}

func validateServiceURL(value string) (string, error) {
	if value == "" || strings.TrimSpace(value) != value {
		return "", errors.New("URL is empty or has surrounding whitespace")
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return "", err
	}
	if hasForbiddenServiceURLComponents(parsed) {
		return "", errors.New("URL is outside the loopback service boundary")
	}
	if err := validateLoopbackHost(parsed.Hostname()); err != nil {
		return "", err
	}
	if err := validateServicePort(parsed.Port()); err != nil {
		return "", err
	}
	return parsed.String(), nil
}

func hasForbiddenServiceURLComponents(parsed *url.URL) bool {
	return parsed.Scheme != "http" || parsed.Opaque != "" || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawPath != "" || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != ""
}

func validateLoopbackHost(host string) error {
	if host == "" {
		return errors.New("URL host is empty")
	}
	if strings.EqualFold(host, "localhost") {
		return nil
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return errors.New("URL host is not loopback")
	}
	return nil
}

func validateServicePort(port string) error {
	if port == "" {
		return nil
	}
	value, err := strconv.Atoi(port)
	if err != nil || value < 1 || value > 65535 {
		return errors.New("URL port is invalid")
	}
	return nil
}

func (client *serviceClient) snapshot(ctx context.Context) (contracts.ProjectSnapshotV2, *commandFailure) {
	return client.request(ctx, http.MethodGet, contracts.ProjectPathV2, nil)
}

func (client *serviceClient) apply(ctx context.Context, request mutation) (contracts.ProjectSnapshotV2, *commandFailure) {
	return client.request(ctx, http.MethodPost, request.path, request.body)
}

func (client *serviceClient) snapshotEvents(ctx context.Context) (*http.Response, *commandFailure) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, client.baseURL+contracts.ProjectEventsPathV2, nil)
	if err != nil {
		return nil, unexpectedFailure("internal_error", "Unable to create the project event request.")
	}
	request.Header.Set("Accept", "text/event-stream")
	response, err := client.http.Do(request)
	if err != nil {
		return nil, classifyRequestError(ctx, ctx)
	}
	if response == nil || response.Body == nil {
		return nil, unexpectedFailure("malformed_response", "The service returned an invalid event response.")
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		defer response.Body.Close()
		content, readErr := readBounded(response.Body, maxResponseBytes)
		if readErr != nil {
			return nil, unexpectedFailure("malformed_response", "The service event error response could not be read.")
		}
		return nil, typedV2Failure(content)
	}
	if mediaType := strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0]); mediaType != "text/event-stream" {
		_ = response.Body.Close()
		return nil, unexpectedFailure("malformed_response", "The service returned an invalid project event stream.")
	}
	return response, nil
}

func (client *serviceClient) request(ctx context.Context, method string, path string, payload any) (contracts.ProjectSnapshotV2, *commandFailure) {
	requestContext, cancel := context.WithTimeout(ctx, defaultRequestTimeout)
	defer cancel()
	body, failure := encodeRequestBody(payload)
	if failure != nil {
		return contracts.ProjectSnapshotV2{}, failure
	}
	request, err := http.NewRequestWithContext(requestContext, method, client.baseURL+path, body)
	if err != nil {
		return contracts.ProjectSnapshotV2{}, unexpectedFailure("internal_error", "Unable to create the project request.")
	}
	configureJSONRequest(request, payload != nil)
	response, err := client.http.Do(request)
	if err != nil {
		return contracts.ProjectSnapshotV2{}, classifyRequestError(ctx, requestContext)
	}
	if !validHTTPResponse(response) {
		return contracts.ProjectSnapshotV2{}, unexpectedFailure("malformed_response", "The service returned an invalid response.")
	}
	defer response.Body.Close()
	content, failure := readResponseBody(response.Body)
	if failure != nil {
		return contracts.ProjectSnapshotV2{}, failure
	}
	if successfulHTTPStatus(response.StatusCode) {
		return decodeProjectSnapshotResponse(content)
	}
	return contracts.ProjectSnapshotV2{}, typedV2Failure(content)
}

func encodeRequestBody(payload any) (io.Reader, *commandFailure) {
	if payload == nil {
		return nil, nil
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, unexpectedFailure("internal_error", "Unable to encode the project request.")
	}
	return bytes.NewReader(encoded), nil
}

func configureJSONRequest(request *http.Request, hasPayload bool) {
	request.Header.Set("Accept", "application/json")
	if hasPayload {
		request.Header.Set("Content-Type", "application/json")
	}
}

func validHTTPResponse(response *http.Response) bool {
	return response != nil && response.Body != nil
}

func readResponseBody(body io.Reader) ([]byte, *commandFailure) {
	content, err := readBounded(body, maxResponseBytes)
	if errors.Is(err, errInputTooLarge) {
		return nil, unexpectedFailure("response_too_large", "The service response exceeds the size limit.")
	}
	if err != nil {
		return nil, unexpectedFailure("malformed_response", "The service response could not be read.")
	}
	return content, nil
}

func successfulHTTPStatus(status int) bool {
	return status >= http.StatusOK && status < http.StatusMultipleChoices
}

func decodeProjectSnapshotResponse(content []byte) (contracts.ProjectSnapshotV2, *commandFailure) {
	var snapshot contracts.ProjectSnapshotV2
	if err := decodeStrictJSON(content, &snapshot); err != nil || snapshot.Validate() != nil {
		return contracts.ProjectSnapshotV2{}, unexpectedFailure("malformed_response", "The service returned an invalid project snapshot.")
	}
	return snapshot, nil
}

func classifyRequestError(parent context.Context, requestContext context.Context) *commandFailure {
	if errors.Is(parent.Err(), context.Canceled) {
		return unexpectedFailure("request_canceled", "The project request was canceled.")
	}
	if errors.Is(parent.Err(), context.DeadlineExceeded) || errors.Is(requestContext.Err(), context.DeadlineExceeded) {
		return unexpectedFailure("request_timeout", "The project request timed out.")
	}
	return unexpectedFailure("connection_failed", "The Python Canvas service could not be reached.")
}

func typedV2Failure(content []byte) *commandFailure {
	var response contracts.ErrorResponseV2
	if err := decodeStrictJSON(content, &response); err != nil || !validAPIError(response.Error) {
		return unexpectedFailure("malformed_response", "The service returned an invalid error response.")
	}
	return &commandFailure{
		exitCode: exitInputOrTypedV2Failure,
		detail: errorDetail{
			Code:             string(response.Error.Code),
			Message:          response.Error.Message,
			ExpectedRevision: response.Error.ExpectedRevision,
			CurrentRevision:  response.Error.CurrentRevision,
		},
	}
}

func decodeStrictJSON(content []byte, destination any) error {
	if !utf8.Valid(content) {
		return errors.New("JSON is not valid UTF-8")
	}
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return errors.New("multiple JSON documents")
		}
		return err
	}
	return nil
}

func validAPIError(value contracts.APIErrorV2) bool {
	if value.Message == "" {
		return false
	}
	switch value.Code {
	case contracts.APIErrorCodeRevisionConflictV2:
		return value.ExpectedRevision != nil && value.CurrentRevision != nil
	case contracts.APIErrorCodeValidationFailedV2, contracts.APIErrorCodeNotFoundV2, contracts.APIErrorCodeInvalidRequestV2,
		contracts.APIErrorCodeProviderUnavailableV2, contracts.APIErrorCodeProviderFailedV2, contracts.APIErrorCodeRenderFailedV2,
		contracts.APIErrorCodeMaterializationFailedV2, contracts.APIErrorCodePersistenceFailedV2, contracts.APIErrorCodeTerminalUnavailableV2,
		contracts.APIErrorCodeTerminalFailedV2, contracts.APIErrorCodeMethodNotAllowedV2, contracts.APIErrorCodeInternalV2:
		return value.ExpectedRevision == nil && value.CurrentRevision == nil
	default:
		return false
	}
}

func settleDiagnostics(ctx context.Context, client *serviceClient, snapshot contracts.ProjectSnapshotV2, timeout time.Duration) (contracts.ProjectSnapshotV2, *commandFailure) {
	if diagnosticsSettled(snapshot) {
		return snapshot, nil
	}
	waitContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	latest := snapshot
	response, failure := client.snapshotEvents(waitContext)
	if failure != nil {
		return contracts.ProjectSnapshotV2{}, diagnosticWaitFailure(waitContext, latest, failure)
	}
	defer response.Body.Close()
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 64<<10), maxResponseBytes+len("data: "))
	for {
		candidate, err := scanSnapshotEvent(scanner)
		if err != nil {
			return contracts.ProjectSnapshotV2{}, diagnosticStreamFailure(waitContext, latest)
		}
		if !consistentDiagnosticSnapshot(candidate, latest) {
			return contracts.ProjectSnapshotV2{}, unexpectedFailure("malformed_response", "The project event stream returned an inconsistent snapshot.")
		}
		latest = candidate
		if diagnosticsSettled(latest) {
			return latest, nil
		}
	}
}

func diagnosticWaitFailure(ctx context.Context, latest contracts.ProjectSnapshotV2, failure *commandFailure) *commandFailure {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return diagnosticsTimeoutFailure(latest)
	}
	return failure
}

func diagnosticStreamFailure(ctx context.Context, latest contracts.ProjectSnapshotV2) *commandFailure {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return diagnosticsTimeoutFailure(latest)
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		return unexpectedFailure("request_canceled", "The diagnostic wait was canceled.")
	}
	return unexpectedFailure("malformed_response", "The project event stream ended before diagnostics settled.")
}

func consistentDiagnosticSnapshot(candidate contracts.ProjectSnapshotV2, latest contracts.ProjectSnapshotV2) bool {
	if candidate.Project.ID != latest.Project.ID || candidate.Project.Revision < latest.Project.Revision {
		return false
	}
	return candidate.Project.Revision != latest.Project.Revision || candidate.DiagnosticsRevision >= latest.DiagnosticsRevision
}

func scanSnapshotEvent(scanner *bufio.Scanner) (contracts.ProjectSnapshotV2, error) {
	var data strings.Builder
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if line == "" {
			if data.Len() == 0 {
				continue
			}
			var snapshot contracts.ProjectSnapshotV2
			if err := decodeStrictJSON([]byte(data.String()), &snapshot); err != nil {
				return contracts.ProjectSnapshotV2{}, err
			}
			if err := snapshot.Validate(); err != nil {
				return contracts.ProjectSnapshotV2{}, err
			}
			return snapshot, nil
		}
		if strings.HasPrefix(line, ":") || !strings.HasPrefix(line, "data:") {
			continue
		}
		value := strings.TrimPrefix(line, "data:")
		value = strings.TrimPrefix(value, " ")
		if data.Len() > 0 {
			data.WriteByte('\n')
		}
		if data.Len()+len(value) > maxResponseBytes {
			return contracts.ProjectSnapshotV2{}, errInputTooLarge
		}
		data.WriteString(value)
	}
	if err := scanner.Err(); err != nil {
		return contracts.ProjectSnapshotV2{}, err
	}
	return contracts.ProjectSnapshotV2{}, io.ErrUnexpectedEOF
}

func diagnosticsSettled(snapshot contracts.ProjectSnapshotV2) bool {
	return snapshot.DiagnosticsRevision == snapshot.Project.Revision && snapshot.ProviderStatus.State != contracts.ProviderLifecycleStatePendingV2
}

func diagnosticsTimeoutFailure(snapshot contracts.ProjectSnapshotV2) *commandFailure {
	projectRevision := snapshot.Project.Revision
	diagnosticsRevision := snapshot.DiagnosticsRevision
	return unexpectedFailureWithDetail(errorDetail{
		Code:                "diagnostics_timeout",
		Message:             "Diagnostics did not settle before the timeout.",
		ProjectRevision:     &projectRevision,
		DiagnosticsRevision: &diagnosticsRevision,
		ProviderState:       string(snapshot.ProviderStatus.State),
	})
}

const maxOperationErrorReasonRunes = 240

func operationInputFailure(err error) *commandFailure {
	code := "invalid_operation"
	var unknown unknownOperationError
	if errors.As(err, &unknown) {
		code = "unknown_operation"
	}
	return inputFailure(code, "The operation document is invalid: "+safeOperationErrorReason(err))
}

func safeOperationErrorReason(err error) string {
	reason := strings.Join(strings.Fields(err.Error()), " ")
	if reason == "" {
		return "no valid reason was provided"
	}
	runes := []rune(reason)
	if len(runes) > maxOperationErrorReasonRunes {
		return string(runes[:maxOperationErrorReasonRunes]) + "…"
	}
	return reason
}

func inputFailure(code string, message string) *commandFailure {
	return &commandFailure{exitCode: exitInputOrTypedV2Failure, detail: errorDetail{Code: code, Message: message}}
}

func unexpectedFailure(code string, message string) *commandFailure {
	return &commandFailure{exitCode: exitUnexpectedFailure, detail: errorDetail{Code: code, Message: message}}
}

func unexpectedFailureWithDetail(detail errorDetail) *commandFailure {
	return &commandFailure{exitCode: exitUnexpectedFailure, detail: detail}
}

func writeFailure(writer io.Writer, failure *commandFailure, pretty bool) {
	_ = writeJSON(writer, errorDocument{Error: failure.detail}, pretty)
}

func writeJSON(writer io.Writer, value any, pretty bool) error {
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	if pretty {
		encoder.SetIndent("", "  ")
	}
	return encoder.Encode(value)
}

func writeHelp(writer io.Writer, command string) {
	switch command {
	case "schema":
		_, _ = fmt.Fprintln(writer, "Usage: python-canvas schema [--pretty]")
	case "snapshot":
		_, _ = fmt.Fprintln(writer, "Usage: python-canvas snapshot [--url URL] [--wait-diagnostics] [--timeout DURATION] [--pretty]")
	case "apply":
		_, _ = fmt.Fprintln(writer, "Usage: python-canvas apply --file PATH| - [--url URL] [--wait-diagnostics] [--timeout DURATION] [--pretty]")
	}
}
