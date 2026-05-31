package settacli

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"setta/internal/settahttpclient"
)

const (
	exitSuccess            = 0
	exitInvalid            = 2
	exitBackendUnavailable = 3
	exitAuth               = 4
	exitPermission         = 5
	exitNotFound           = 6
	exitConflict           = 7
	exitRuntime            = 8
	exitValidation         = 9
	exitCancelled          = 10
)

type Globals struct {
	JSON        bool
	NoInput     bool
	BackendAddr string
	Timeout     time.Duration
	Verbose     bool
	Quiet       bool
}

type Context struct {
	Globals  Globals
	Registry *Registry
	Stdin    io.Reader
	Stdout   io.Writer
	Stderr   io.Writer
	Getenv   func(string) string
}

type cliError struct {
	ExitCode  int
	Code      string
	Message   string
	Retryable bool
}

func (err cliError) Error() string {
	return err.Message
}

func Run(args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer, getenv func(string) string) int {
	context := newRunContext(stdin, stdout, stderr, getenv)
	globals, remaining, err := parseGlobals(args)
	context.Globals = globals
	if err != nil {
		return context.handleError(invalidError(err.Error()))
	}
	if err := dispatch(context, remaining); err != nil {
		return context.handleError(err)
	}
	return exitSuccess
}

func newRunContext(stdin io.Reader, stdout io.Writer, stderr io.Writer, getenv func(string) string) *Context {
	if stdin == nil {
		stdin = io.Reader(os.Stdin)
	}
	if stdout == nil {
		stdout = io.Discard
	}
	if stderr == nil {
		stderr = io.Discard
	}
	if getenv == nil {
		getenv = os.Getenv
	}
	return &Context{
		Getenv:   getenv,
		Registry: NewRegistry(),
		Stdin:    stdin,
		Stdout:   stdout,
		Stderr:   stderr,
	}
}

func dispatch(context *Context, remaining []string) error {
	if len(remaining) == 0 {
		if context.Globals.JSON {
			return invalidError("command is required")
		}
		_ = writeRootHelp(context.Stderr)
		return cliError{ExitCode: exitInvalid, Code: "invalid_arguments", Message: "command is required"}
	}

	command, commandArgs, err := context.Registry.Match(remaining)
	if err != nil {
		return invalidError(err.Error())
	}
	if command.RequiresBackend {
		if _, err := context.backendAddr(); err != nil {
			return backendUnavailableError(err.Error())
		}
	}
	return command.handler(context, commandArgs)
}

func parseGlobals(args []string) (Globals, []string, error) {
	globals := Globals{Timeout: 30 * time.Second}
	remaining := make([]string, 0, len(args))
	for index := 0; index < len(args); index++ {
		consumed, err := parseGlobalArg(&globals, args, index, &remaining)
		if err != nil {
			return globals, remaining, err
		}
		index += consumed
	}
	if globals.Verbose && globals.Quiet {
		return globals, remaining, errors.New("--verbose and --quiet cannot be used together")
	}
	return globals, remaining, nil
}

func parseGlobalArg(globals *Globals, args []string, index int, remaining *[]string) (int, error) {
	arg := args[index]
	if parseBooleanGlobal(globals, arg) {
		return 0, nil
	}
	if consumed, ok, err := parseSeparateValueGlobal(globals, args, index); ok || err != nil {
		return consumed, err
	}
	if ok, err := parseInlineValueGlobal(globals, arg); ok || err != nil {
		return 0, err
	}
	*remaining = append(*remaining, arg)
	return 0, nil
}

func parseBooleanGlobal(globals *Globals, arg string) bool {
	switch arg {
	case "--json":
		globals.JSON = true
	case "--no-input":
		globals.NoInput = true
	case "--verbose":
		globals.Verbose = true
	case "--quiet":
		globals.Quiet = true
	default:
		return false
	}
	return true
}

func parseSeparateValueGlobal(globals *Globals, args []string, index int) (int, bool, error) {
	arg := args[index]
	if arg != "--backend-addr" && arg != "--timeout" {
		return 0, false, nil
	}
	if index+1 >= len(args) {
		return 0, true, fmt.Errorf("%s requires a value", arg)
	}
	if err := setGlobalValue(globals, arg, args[index+1]); err != nil {
		return 0, true, err
	}
	return 1, true, nil
}

func parseInlineValueGlobal(globals *Globals, arg string) (bool, error) {
	name, value, ok := strings.Cut(arg, "=")
	if !ok || (name != "--backend-addr" && name != "--timeout") {
		return false, nil
	}
	return true, setGlobalValue(globals, name, value)
}

func setGlobalValue(globals *Globals, name string, value string) error {
	switch name {
	case "--backend-addr":
		if value == "" {
			return errors.New("--backend-addr requires a value")
		}
		globals.BackendAddr = value
	case "--timeout":
		timeout, err := parseTimeout(value)
		if err != nil {
			return err
		}
		globals.Timeout = timeout
	}
	return nil
}

func parseTimeout(value string) (time.Duration, error) {
	if value == "" {
		return 0, errors.New("--timeout requires a value")
	}
	duration, err := time.ParseDuration(value)
	if err == nil {
		if duration <= 0 {
			return 0, errors.New("--timeout must be positive")
		}
		return duration, nil
	}
	seconds, parseErr := strconv.Atoi(value)
	if parseErr != nil || seconds <= 0 {
		return 0, fmt.Errorf("--timeout must be a positive duration: %s", value)
	}
	return time.Duration(seconds) * time.Second, nil
}

func (context *Context) backendAddr() (string, error) {
	if context.Globals.BackendAddr != "" {
		return context.Globals.BackendAddr, nil
	}
	if value := context.Getenv("SETTA_BACKEND_ADDR"); value != "" {
		return value, nil
	}
	return "", errors.New("backend address is required; pass --backend-addr or set SETTA_BACKEND_ADDR")
}

func (context *Context) client() (*settahttpclient.Client, error) {
	addr, err := context.backendAddr()
	if err != nil {
		return nil, backendUnavailableError(err.Error())
	}
	client, err := settahttpclient.New(addr, context.Globals.Timeout)
	if err != nil {
		return nil, backendUnavailableError(err.Error())
	}
	return client, nil
}

func (context *Context) commandContext() (context.Context, context.CancelFunc) {
	return contextWithTimeout(context.Globals.Timeout)
}

func contextWithTimeout(timeout time.Duration) (context.Context, context.CancelFunc) {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return context.WithTimeout(context.Background(), timeout)
}

func (context *Context) handleError(err error) int {
	var cliErr cliError
	if errors.As(err, &cliErr) {
		context.writeError(cliErr)
		return cliErr.ExitCode
	}
	var backendErr settahttpclient.BackendError
	if errors.As(err, &backendErr) {
		mapped := mapBackendError(backendErr)
		context.writeError(mapped)
		return mapped.ExitCode
	}
	mapped := cliError{ExitCode: exitRuntime, Code: "runtime_error", Message: err.Error()}
	context.writeError(mapped)
	return mapped.ExitCode
}

func (context *Context) writeError(err cliError) {
	if context.Globals.JSON {
		_ = writeJSON(context.Stdout, errorEnvelope{
			SchemaVersion: schemaVersion,
			Error: errorPayload{
				Code:      err.Code,
				Message:   err.Message,
				Retryable: err.Retryable,
			},
		})
		return
	}
	fmt.Fprintf(context.Stderr, "%s\n", err.Message)
}

func invalidError(message string) cliError {
	return cliError{ExitCode: exitInvalid, Code: "invalid_arguments", Message: message}
}

func backendUnavailableError(message string) cliError {
	return cliError{ExitCode: exitBackendUnavailable, Code: "backend_unavailable", Message: message, Retryable: true}
}

func validationError(message string) cliError {
	return cliError{ExitCode: exitValidation, Code: "validation_failed", Message: message}
}

func mapBackendError(err settahttpclient.BackendError) cliError {
	exitCode := exitValidation
	switch err.StatusCode {
	case 401, 403:
		exitCode = exitAuth
	case 404:
		exitCode = exitNotFound
	case 409:
		exitCode = exitConflict
	case 500, 502, 503, 504:
		exitCode = exitRuntime
	}
	if mapped, ok := backendErrorExitCodes[err.Code]; ok {
		exitCode = mapped
	}
	return cliError{
		ExitCode:  exitCode,
		Code:      err.Code,
		Message:   err.Message,
		Retryable: exitCode == exitBackendUnavailable || err.StatusCode == 503,
	}
}

var backendErrorExitCodes = map[string]int{
	"backend_http_error":                     exitBackendUnavailable,
	"codex_app_server_rpc_failed":            exitRuntime,
	"codex_provider_drift":                   exitRuntime,
	"codex_thread_unavailable":               exitRuntime,
	"command_unavailable":                    exitConflict,
	"command_unsupported_by_harness":         exitRuntime,
	"event_stream_unavailable":               exitRuntime,
	"goal_not_set":                           exitConflict,
	"goal_replacement_requires_confirmation": exitConflict,
	"immediate_steering_conflict":            exitConflict,
	"invalid_event_cursor":                   exitValidation,
	"invalid_json":                           exitValidation,
	"malformed_command":                      exitValidation,
	"queued_message_conflict":                exitConflict,
	"slash_command_wrong_endpoint":           exitValidation,
	"unknown_command":                        exitValidation,
}

func writeRootHelp(writer io.Writer) error {
	_, err := fmt.Fprintln(writer, "Usage: setta [global flags] <command> [flags]\nRun 'setta commands --json' to inspect command metadata.")
	return err
}
