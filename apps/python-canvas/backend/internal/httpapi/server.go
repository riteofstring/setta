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
	"strings"
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
	SetParameterExpression(
		context.Context,
		string,
		string,
		string,
	) (contracts.ProjectSnapshotV1, error)
}

type commitCallablePayload struct {
	ProjectID          string  `json:"projectId"`
	SectionID          string  `json:"sectionId"`
	AuthoredExpression *string `json:"authoredExpression"`
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

type setParameterExpressionPayload struct {
	ProjectID          string  `json:"projectId"`
	AuthoredExpression *string `json:"authoredExpression"`
}

func (payload setParameterExpressionPayload) toContract() (contracts.SetParameterExpressionRequestV1, bool) {
	if payload.AuthoredExpression == nil {
		return contracts.SetParameterExpressionRequestV1{}, false
	}
	return contracts.SetParameterExpressionRequestV1{
		ProjectID:          payload.ProjectID,
		AuthoredExpression: *payload.AuthoredExpression,
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
		default:
			parameterID, matchesParameterPath := parameterIDFromRequestPath(request)
			if !matchesParameterPath {
				writeError(response, http.StatusNotFound, contracts.APIErrorCodeNotFoundV1, "route not found")
				return
			}
			handleParameter(response, request, service, parameterID)
		}
	}), nil
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

func handleParameter(
	response http.ResponseWriter,
	request *http.Request,
	service ProjectService,
	parameterID string,
) {
	if !requireMethod(response, request, http.MethodPost) {
		return
	}
	if !rejectQuery(response, request) {
		return
	}
	var payload setParameterExpressionPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, hasAuthoredExpression := payload.toContract()
	if !hasAuthoredExpression || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "parameter request is invalid")
		return
	}
	snapshot, err := service.SetParameterExpression(
		request.Context(),
		body.ProjectID,
		parameterID,
		body.AuthoredExpression,
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
		errors.Is(err, project.ErrCallableSectionNotFound),
		errors.Is(err, project.ErrParameterNotFound):
		writeError(response, http.StatusNotFound, contracts.APIErrorCodeNotFoundV1, "the requested project resource does not exist")
	case errors.Is(err, project.ErrCallableExpressionInvalid):
		writeError(response, http.StatusUnprocessableEntity, contracts.APIErrorCodeInvalidCallableV1, "callable expression is invalid")
	case errors.Is(err, project.ErrParameterExpressionInvalid):
		writeError(response, http.StatusUnprocessableEntity, contracts.APIErrorCodeInvalidParameterExpressionV1, "parameter expression is invalid")
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

func isExactPath(request *http.Request, path string) bool {
	return request.URL.Path == path &&
		request.URL.RawPath == "" &&
		request.URL.EscapedPath() == path
}

func parameterIDFromRequestPath(request *http.Request) (string, bool) {
	if request.URL.RawPath != "" || request.URL.EscapedPath() != request.URL.Path {
		return "", false
	}
	if !strings.HasPrefix(request.URL.Path, contracts.ProjectParameterPathV1) {
		return "", false
	}
	parameterID := strings.TrimPrefix(request.URL.Path, contracts.ProjectParameterPathV1)
	if parameterID == "" || strings.Contains(parameterID, "/") {
		return "", false
	}
	return parameterID, true
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
