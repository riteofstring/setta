package main

import (
	"errors"
	"flag"
	"fmt"
	"io"

	"setta/internal/httpapi"
)

type workflowCLIError struct {
	err      error
	response httpapi.ErrorResponse
}

type workflowHTTPStatusError struct {
	operation  string
	response   httpapi.ErrorResponse
	statusCode int
}

func newWorkflowCLIError(code string, err error) workflowCLIError {
	return workflowCLIError{
		err: err,
		response: httpapi.ErrorResponse{Error: httpapi.APIError{
			Code:    code,
			Message: err.Error(),
		}},
	}
}

func (err workflowCLIError) Error() string {
	return err.err.Error()
}

func (err workflowCLIError) Unwrap() error {
	return err.err
}

func (err workflowCLIError) CLIErrorResponse() httpapi.ErrorResponse {
	return err.response
}

func (err workflowHTTPStatusError) Error() string {
	return fmt.Sprintf("%s status %d: %s: %s", err.operation, err.statusCode, err.response.Error.Code, err.response.Error.Message)
}

func (err workflowHTTPStatusError) CLIErrorResponse() httpapi.ErrorResponse {
	return err.response
}

func newWorkflowFlagSet(name string) *flag.FlagSet {
	flagSet := flag.NewFlagSet(name, flag.ContinueOnError)
	flagSet.SetOutput(io.Discard)
	return flagSet
}

func workflowCommandError(err error) error {
	if err == nil {
		return nil
	}
	var structured cliStructuredError
	if errors.As(err, &structured) {
		return err
	}
	var usage usageError
	if errors.As(err, &usage) {
		return newWorkflowCLIError("workflow_usage_error", err)
	}
	return newWorkflowCLIError("workflow_command_failed", err)
}
