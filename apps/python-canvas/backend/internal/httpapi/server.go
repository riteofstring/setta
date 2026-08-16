// Package httpapi exposes the loopback-only V1 HTTP boundary.
package httpapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project"
)

const shutdownTimeout = 5 * time.Second

var ErrProjectServiceRequired = errors.New("httpapi: project service is required")

// ProjectService is the complete application boundary required by the V1
// routes. It exposes canonical snapshots rather than a mutable transport
// model, keeping HTTP details outside the project package.
type ProjectService interface {
	Snapshot() contracts.ProjectSnapshotV1
	CommitCallable(
		context.Context,
		string,
		string,
		string,
	) (contracts.ProjectSnapshotV1, error)
	CompleteCallable(
		context.Context,
		string,
		string,
		string,
		int,
	) ([]project.CallableCompletionItem, error)
	SetCallableParameters(
		context.Context,
		string,
		string,
		int,
		[]project.ParameterProposal,
	) (contracts.ProjectSnapshotV1, error)
}

type commitCallablePayload struct {
	ProjectID          string  `json:"projectId"`
	SectionID          string  `json:"sectionId"`
	AuthoredExpression *string `json:"authoredExpression"`
}

type callableCompletionPayload struct {
	ProjectID          string  `json:"projectId"`
	SectionID          string  `json:"sectionId"`
	AuthoredExpression *string `json:"authoredExpression"`
	CursorOffsetUTF16  *int    `json:"cursorOffsetUtf16"`
}

func (payload callableCompletionPayload) toContract() (contracts.CallableCompletionRequestV1, bool) {
	if payload.AuthoredExpression == nil || payload.CursorOffsetUTF16 == nil {
		return contracts.CallableCompletionRequestV1{}, false
	}
	return contracts.CallableCompletionRequestV1{
		ProjectID:          payload.ProjectID,
		SectionID:          payload.SectionID,
		AuthoredExpression: *payload.AuthoredExpression,
		CursorOffsetUTF16:  *payload.CursorOffsetUTF16,
	}, true
}

func (payload commitCallablePayload) toContract() (contracts.CommitCallableRequestV1, bool) {
	if payload.AuthoredExpression == nil {
		return contracts.CommitCallableRequestV1{}, false
	}
	return contracts.CommitCallableRequestV1{
		ProjectID:          payload.ProjectID,
		SectionID:          payload.SectionID,
		AuthoredExpression: *payload.AuthoredExpression,
	}, true
}

type parameterProposalPayload struct {
	ID                 string  `json:"id"`
	Name               *string `json:"name"`
	AuthoredExpression *string `json:"authoredExpression"`
}

type setCallableParametersPayload struct {
	ProjectID        string                      `json:"projectId"`
	CallableID       string                      `json:"callableId"`
	ExpectedRevision *int                        `json:"expectedRevision"`
	Parameters       *[]parameterProposalPayload `json:"parameters"`
}

func (payload setCallableParametersPayload) toContract() (contracts.SetCallableParametersRequestV1, bool) {
	if payload.ExpectedRevision == nil || payload.Parameters == nil {
		return contracts.SetCallableParametersRequestV1{}, false
	}
	parameters := make([]contracts.ParameterProposalV1, 0, len(*payload.Parameters))
	for _, parameter := range *payload.Parameters {
		if parameter.Name == nil || parameter.AuthoredExpression == nil {
			return contracts.SetCallableParametersRequestV1{}, false
		}
		parameters = append(parameters, contracts.ParameterProposalV1{
			ID:                 parameter.ID,
			Name:               *parameter.Name,
			AuthoredExpression: *parameter.AuthoredExpression,
		})
	}
	return contracts.SetCallableParametersRequestV1{
		ProjectID:        payload.ProjectID,
		CallableID:       payload.CallableID,
		ExpectedRevision: *payload.ExpectedRevision,
		Parameters:       parameters,
	}, true
}

// NewHandler creates the three V1 routes after validating the current
// canonical snapshot. Every successful mutation returns the same snapshot
// shape, so the frontend has one source of truth after each request.
func NewHandler(service ProjectService) (http.Handler, error) {
	if service == nil {
		return nil, ErrProjectServiceRequired
	}
	if err := service.Snapshot().Validate(); err != nil {
		return nil, fmt.Errorf("validate project endpoint snapshot: %w", err)
	}

	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch {
		case isExactPath(request, contracts.ProjectPathV1):
			handleProject(response, request, service)
		case isExactPath(request, contracts.ProjectCallablePathV1):
			handleCallable(response, request, service)
		case isExactPath(request, contracts.ProjectCallableCompletionsPathV1):
			handleCallableCompletions(response, request, service)
		case isExactPath(request, contracts.ProjectParametersPathV1):
			handleParameters(response, request, service)
		default:
			writeError(response, http.StatusNotFound, contracts.APIErrorCodeNotFoundV1, "route not found")
		}
	}), nil
}

func handleCallableCompletions(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMethod(response, request, http.MethodPost) {
		return
	}
	if !rejectQuery(response, request) {
		return
	}
	var payload callableCompletionPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.toContract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "callable completion request is invalid")
		return
	}
	items, err := service.CompleteCallable(
		request.Context(),
		body.ProjectID,
		body.SectionID,
		body.AuthoredExpression,
		body.CursorOffsetUTF16,
	)
	if err != nil {
		writeCallableCompletionError(response, err)
		return
	}
	result := contracts.CallableCompletionResponseV1{
		Items: make([]contracts.CallableCompletionItemV1, 0, len(items)),
	}
	for _, item := range items {
		result.Items = append(result.Items, contracts.CallableCompletionItemV1{
			Label:      item.Label,
			InsertText: item.InsertText,
		})
	}
	if err := result.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeInternalV1, "callable completion response is invalid")
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func handleProject(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMethod(response, request, http.MethodGet) {
		return
	}
	if !rejectQuery(response, request) || !rejectRequestBody(response, request) {
		return
	}
	writeJSON(response, http.StatusOK, service.Snapshot())
}

func handleCallable(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMethod(response, request, http.MethodPost) {
		return
	}
	if !rejectQuery(response, request) {
		return
	}
	var payload commitCallablePayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, hasAuthoredExpression := payload.toContract()
	if !hasAuthoredExpression || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "callable request is invalid")
		return
	}
	snapshot, err := service.CommitCallable(
		request.Context(),
		body.ProjectID,
		body.SectionID,
		body.AuthoredExpression,
	)
	if err != nil {
		writeMutationError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}

// One route owns the callable's whole parameter list, so a reorder, rename,
// value edit, insertion, and deletion all arrive as the same complete candidate.
func handleParameters(
	response http.ResponseWriter,
	request *http.Request,
	service ProjectService,
) {
	if !requireMethod(response, request, http.MethodPost) {
		return
	}
	if !rejectQuery(response, request) {
		return
	}
	var payload setCallableParametersPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.toContract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "parameter list request is invalid")
		return
	}
	proposals := make([]project.ParameterProposal, 0, len(body.Parameters))
	for _, parameter := range body.Parameters {
		proposals = append(proposals, project.ParameterProposal{
			ID:                 parameter.ID,
			Name:               parameter.Name,
			AuthoredExpression: parameter.AuthoredExpression,
		})
	}
	snapshot, err := service.SetCallableParameters(
		request.Context(),
		body.ProjectID,
		body.CallableID,
		body.ExpectedRevision,
		proposals,
	)
	if err != nil {
		writeMutationError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}

func requireMethod(response http.ResponseWriter, request *http.Request, method string) bool {
	if request.Method == method {
		return true
	}
	response.Header().Set("Allow", method)
	writeError(response, http.StatusMethodNotAllowed, contracts.APIErrorCodeMethodNotAllowedV1, "method is not allowed")
	return false
}

func rejectQuery(response http.ResponseWriter, request *http.Request) bool {
	if request.URL.RawQuery == "" && !request.URL.ForceQuery {
		return true
	}
	writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "query parameters are not accepted")
	return false
}

func rejectRequestBody(response http.ResponseWriter, request *http.Request) bool {
	hasBody, err := requestHasBody(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "request body could not be read")
		return false
	}
	if !hasBody {
		return true
	}
	writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "GET requests must not include a body")
	return false
}

func writeMutationError(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, project.ErrProjectNotFound),
		errors.Is(err, project.ErrCallableSectionNotFound):
		writeError(response, http.StatusNotFound, contracts.APIErrorCodeNotFoundV1, "the requested project resource does not exist")
	case errors.Is(err, project.ErrCallableExpressionInvalid):
		writeError(response, http.StatusUnprocessableEntity, contracts.APIErrorCodeInvalidCallableV1, "callable expression is invalid")
	case errors.Is(err, project.ErrParameterExpressionInvalid):
		writeError(response, http.StatusUnprocessableEntity, contracts.APIErrorCodeInvalidParameterExpressionV1, "parameter expression is invalid")
	case errors.Is(err, project.ErrParameterNameInvalid):
		writeError(response, http.StatusUnprocessableEntity, contracts.APIErrorCodeInvalidParameterNameV1, "parameter name is invalid")
	case errors.Is(err, project.ErrParameterListInvalid):
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "parameter list request is invalid")
	case errors.Is(err, project.ErrProjectRevisionStale):
		writeError(response, http.StatusConflict, contracts.APIErrorCodeRevisionConflictV1, "the project changed since this revision")
	case errors.Is(err, project.ErrUnsupportedSignature):
		writeError(response, http.StatusUnprocessableEntity, contracts.APIErrorCodeUnsupportedSignatureV1, "callable signature is not supported")
	case errors.Is(err, project.ErrLSPProviderRequired),
		errors.Is(err, project.ErrProviderUnavailable),
		errors.Is(err, project.ErrStoreClosed),
		errors.Is(err, context.Canceled),
		errors.Is(err, context.DeadlineExceeded):
		writeError(response, http.StatusServiceUnavailable, contracts.APIErrorCodeProviderUnavailableV1, "Basedpyright is unavailable")
	default:
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeInternalV1, "unable to update the project")
	}
}

func writeCallableCompletionError(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, project.ErrProjectNotFound),
		errors.Is(err, project.ErrCallableSectionNotFound):
		writeError(response, http.StatusNotFound, contracts.APIErrorCodeNotFoundV1, "the requested project resource does not exist")
	case errors.Is(err, project.ErrCallableCompletionInvalid):
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "callable completion request is invalid")
	case errors.Is(err, project.ErrLSPProviderRequired),
		errors.Is(err, project.ErrProviderUnavailable),
		errors.Is(err, project.ErrStoreClosed),
		errors.Is(err, context.Canceled),
		errors.Is(err, context.DeadlineExceeded):
		writeError(response, http.StatusServiceUnavailable, contracts.APIErrorCodeProviderUnavailableV1, "Basedpyright is unavailable")
	default:
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeInternalV1, "unable to complete the callable")
	}
}

func isExactPath(request *http.Request, path string) bool {
	return request.URL.Path == path &&
		request.URL.RawPath == "" &&
		request.URL.EscapedPath() == path
}

// ListenLoopback binds only the IPv4 loopback interface.
func ListenLoopback(port uint16) (net.Listener, error) {
	return listenLoopback(port, net.Listen)
}

type listenFunc func(network, address string) (net.Listener, error)

func listenLoopback(port uint16, listen listenFunc) (net.Listener, error) {
	listener, err := listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(int(port))))
	if err != nil {
		return nil, fmt.Errorf("listen on loopback: %w", err)
	}
	return listener, nil
}

// ServeLoopback binds the V1 service to loopback and shuts it down when the
// caller's service context ends.
func ServeLoopback(ctx context.Context, port uint16, service ProjectService) error {
	listener, err := ListenLoopback(port)
	if err != nil {
		return err
	}
	return serve(ctx, listener, service)
}

func serve(ctx context.Context, listener net.Listener, service ProjectService) error {
	if ctx == nil {
		ctx = context.Background()
	}
	handler, err := NewHandler(service)
	if err != nil {
		_ = listener.Close()
		return err
	}
	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	serveResult := make(chan error, 1)
	go func() {
		serveResult <- server.Serve(listener)
	}()

	select {
	case err := <-serveResult:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownContext, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		shutdownErr := server.Shutdown(shutdownContext)
		serveErr := <-serveResult
		if shutdownErr != nil {
			return fmt.Errorf("shutdown loopback server: %w", shutdownErr)
		}
		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			return serveErr
		}
		return nil
	}
}

func requestHasBody(request *http.Request) (bool, error) {
	if request.Body == nil || request.Body == http.NoBody {
		return false, nil
	}
	if request.ContentLength > 0 {
		return true, nil
	}

	content, err := io.ReadAll(io.LimitReader(request.Body, 1))
	if err != nil {
		return false, err
	}
	return len(content) != 0, nil
}
