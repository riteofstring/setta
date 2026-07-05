package main

import (
	"errors"
	"flag"
	"fmt"
	"io"

	"setta/internal/httpapi"
)

type workspaceCLIError struct {
	err      error
	response httpapi.ErrorResponse
}

type workspaceHTTPStatusError struct {
	operation  string
	response   httpapi.ErrorResponse
	statusCode int
}

func newWorkspaceCLIError(code string, err error) workspaceCLIError {
	return workspaceCLIError{
		err: err,
		response: httpapi.ErrorResponse{Error: httpapi.APIError{
			Code:    code,
			Message: err.Error(),
		}},
	}
}

func (err workspaceCLIError) Error() string {
	return err.err.Error()
}

func (err workspaceCLIError) Unwrap() error {
	return err.err
}

func (err workspaceCLIError) CLIErrorResponse() httpapi.ErrorResponse {
	return err.response
}

func (err workspaceHTTPStatusError) Error() string {
	return fmt.Sprintf("%s status %d: %s: %s", err.operation, err.statusCode, err.response.Error.Code, err.response.Error.Message)
}

func (err workspaceHTTPStatusError) CLIErrorResponse() httpapi.ErrorResponse {
	return err.response
}

func newWorkspaceFlagSet(name string) *flag.FlagSet {
	flagSet := flag.NewFlagSet(name, flag.ContinueOnError)
	flagSet.SetOutput(io.Discard)
	return flagSet
}

func workspaceCommandError(err error) error {
	if err == nil {
		return nil
	}
	var structured cliStructuredError
	if errors.As(err, &structured) {
		return err
	}
	var usage usageError
	if errors.As(err, &usage) {
		return newWorkspaceCLIError("workspace_usage_error", err)
	}
	return newWorkspaceCLIError("workspace_command_failed", err)
}
