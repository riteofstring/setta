package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/contracts"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/runner"
)

var ErrRunnerRequired = errors.New("httpapi: generated-program runner is required")

type runRoutes struct {
	runtime   runner.Runtime
	lifecycle context.Context
}

type runGeneratedProgramPayload struct {
	ProjectID              *string `json:"projectId"`
	ExpectedRevision       *int    `json:"expectedRevision"`
	RunTimeoutMilliseconds *int    `json:"runTimeoutMilliseconds"`
}

func (payload runGeneratedProgramPayload) contract() (contracts.RunGeneratedProgramRequestV2, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil {
		return contracts.RunGeneratedProgramRequestV2{}, false
	}
	return contracts.RunGeneratedProgramRequestV2{
		ProjectID:              *payload.ProjectID,
		ExpectedRevision:       *payload.ExpectedRevision,
		RunTimeoutMilliseconds: payload.RunTimeoutMilliseconds,
	}, true
}

func newRunRoutes(options HandlerOptions) (*runRoutes, error) {
	if options.Runner == nil {
		return nil, ErrRunnerRequired
	}
	lifecycle := options.Lifecycle
	if lifecycle == nil {
		lifecycle = context.Background()
	}
	return &runRoutes{runtime: options.Runner, lifecycle: lifecycle}, nil
}

func (routes *runRoutes) dispatch(response http.ResponseWriter, request *http.Request, service ProjectService) bool {
	if !isExactPath(request, contracts.ProjectRunPathV2) {
		return false
	}
	routes.handle(response, request, service)
	return true
}

func (routes *runRoutes) handle(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload runGeneratedProgramPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Generated-program run request is invalid.")
		return
	}

	program, err := service.CaptureGeneratedProgram(request.Context(), body.ProjectID, body.ExpectedRevision)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	if program.ProjectID != body.ProjectID || program.Revision != body.ExpectedRevision {
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeRunnerFailedV2, "Unable to capture the requested generated Python revision.")
		return
	}

	executionContext, cancel := routes.executionContext(request.Context())
	defer cancel()
	result, err := routes.runtime.Run(executionContext, runner.Program{
		ProjectID: program.ProjectID,
		Revision:  program.Revision,
		Code:      program.Code,
	}, runner.Request{Timeout: runTimeout(body.RunTimeoutMilliseconds)})
	if err != nil {
		writeRunFailure(response, err)
		return
	}
	contract, err := runResultContract(program, result)
	if err != nil {
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeRunnerFailedV2, "Unable to publish generated-program run output.")
		return
	}
	writeJSON(response, http.StatusOK, contract)
}

func (routes *runRoutes) executionContext(requestContext context.Context) (context.Context, context.CancelFunc) {
	executionContext, cancel := context.WithCancel(requestContext)
	stopLifecycle := context.AfterFunc(routes.lifecycle, cancel)
	return executionContext, func() {
		stopLifecycle()
		cancel()
	}
}

func runTimeout(value *int) time.Duration {
	if value == nil {
		return 0
	}
	return time.Duration(*value) * time.Millisecond
}

func runResultContract(program GeneratedProgram, result runner.Result) (contracts.GeneratedProgramRunResultV2, error) {
	if result.ProjectID != program.ProjectID || result.Revision != program.Revision {
		return contracts.GeneratedProgramRunResultV2{}, errors.New("runner result does not match captured program")
	}
	termination, err := runTerminationContract(result.Termination)
	if err != nil {
		return contracts.GeneratedProgramRunResultV2{}, err
	}
	if result.Elapsed < 0 {
		return contracts.GeneratedProgramRunResultV2{}, errors.New("runner elapsed time is negative")
	}
	elapsed := result.Elapsed.Milliseconds()
	if elapsed > int64(maxInt()) {
		return contracts.GeneratedProgramRunResultV2{}, errors.New("runner elapsed time overflows contract")
	}
	var exitCode *int
	if result.ExitCode != nil {
		value := *result.ExitCode
		exitCode = &value
	}
	contract := contracts.GeneratedProgramRunResultV2{
		ProjectID:       result.ProjectID,
		Revision:        result.Revision,
		Stdout:          result.Stdout,
		Stderr:          result.Stderr,
		StdoutTruncated: result.StdoutTruncated,
		StderrTruncated: result.StderrTruncated,
		ExitCode:        exitCode,
		Termination:     termination,
		ElapsedMillis:   int(elapsed),
	}
	if err := contract.Validate(); err != nil {
		return contracts.GeneratedProgramRunResultV2{}, fmt.Errorf("validate runner result: %w", err)
	}
	return contract, nil
}

func runTerminationContract(value runner.TerminationReason) (contracts.GeneratedProgramTerminationReasonV2, error) {
	switch value {
	case runner.TerminationExited:
		return contracts.GeneratedProgramTerminationExitedV2, nil
	case runner.TerminationSignaled:
		return contracts.GeneratedProgramTerminationSignaledV2, nil
	case runner.TerminationTimedOut:
		return contracts.GeneratedProgramTerminationTimedOutV2, nil
	case runner.TerminationOutputLimit:
		return contracts.GeneratedProgramTerminationOutputLimitV2, nil
	default:
		return "", fmt.Errorf("unsupported runner termination reason %q", value)
	}
}

func maxInt() int {
	return int(^uint(0) >> 1)
}

func writeRunFailure(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		writeError(response, http.StatusServiceUnavailable, contracts.APIErrorCodeRunnerUnavailableV2, "Generated-program execution was interrupted.")
	default:
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeRunnerFailedV2, "Unable to execute the generated Python.")
	}
}
