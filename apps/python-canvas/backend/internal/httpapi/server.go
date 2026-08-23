// Package httpapi exposes the loopback-only V2 HTTP boundary.
package httpapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/coordinator"
)

const shutdownTimeout = 5 * time.Second

var ErrProjectServiceRequired = errors.New("httpapi: project service is required")

type renameProjectPayload struct {
	ProjectID        *string `json:"projectId"`
	ExpectedRevision *int    `json:"expectedRevision"`
	Name             *string `json:"name"`
}

type createCallablePayload struct {
	ProjectID        *string `json:"projectId"`
	ExpectedRevision *int    `json:"expectedRevision"`
	Name             *string `json:"name"`
}

type renameCallablePayload struct {
	ProjectID        *string `json:"projectId"`
	ExpectedRevision *int    `json:"expectedRevision"`
	Name             *string `json:"name"`
}

type deleteCallablePayload struct {
	ProjectID        *string `json:"projectId"`
	ExpectedRevision *int    `json:"expectedRevision"`
}

type commitCallablePayload struct {
	ProjectID          *string `json:"projectId"`
	ExpectedRevision   *int    `json:"expectedRevision"`
	AuthoredExpression *string `json:"authoredExpression"`
}

type refreshCallableParametersPayload struct {
	ProjectID        *string `json:"projectId"`
	ExpectedRevision *int    `json:"expectedRevision"`
}

type parameterProposalPayload struct {
	ID                 *string `json:"id"`
	Name               *string `json:"name"`
	AuthoredExpression *string `json:"authoredExpression"`
}

type setParametersPayload struct {
	ProjectID        *string                     `json:"projectId"`
	ExpectedRevision *int                        `json:"expectedRevision"`
	Parameters       *[]parameterProposalPayload `json:"parameters"`
}

type setTargetPayload struct {
	ProjectID        *string `json:"projectId"`
	ExpectedRevision *int    `json:"expectedRevision"`
	Prefix           *string `json:"prefix"`
	Suffix           *string `json:"suffix"`
}

type callableCompletionPayload struct {
	ProjectID          *string `json:"projectId"`
	AuthoredExpression *string `json:"authoredExpression"`
	CursorOffsetUTF16  *int    `json:"cursorOffsetUtf16"`
}

type utf16RangePayload struct {
	Start *int `json:"start"`
	End   *int `json:"end"`
}

type targetCompletionPayload struct {
	ProjectID          *string            `json:"projectId"`
	Code               *string            `json:"code"`
	ProtectedBodyRange *utf16RangePayload `json:"protectedBodyRange"`
	CursorOffsetUTF16  *int               `json:"cursorOffsetUtf16"`
}

func (payload renameProjectPayload) contract() (contracts.RenameProjectRequestV2, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.Name == nil {
		return contracts.RenameProjectRequestV2{}, false
	}
	return contracts.RenameProjectRequestV2{ProjectID: *payload.ProjectID, ExpectedRevision: *payload.ExpectedRevision, Name: *payload.Name}, true
}

func (payload createCallablePayload) contract() (contracts.CreateCallableRequestV2, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.Name == nil {
		return contracts.CreateCallableRequestV2{}, false
	}
	return contracts.CreateCallableRequestV2{ProjectID: *payload.ProjectID, ExpectedRevision: *payload.ExpectedRevision, Name: *payload.Name}, true
}

func (payload renameCallablePayload) contract() (contracts.RenameCallableRequestV2, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.Name == nil {
		return contracts.RenameCallableRequestV2{}, false
	}
	return contracts.RenameCallableRequestV2{ProjectID: *payload.ProjectID, ExpectedRevision: *payload.ExpectedRevision, Name: *payload.Name}, true
}

func (payload deleteCallablePayload) contract() (contracts.DeleteCallableRequestV2, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil {
		return contracts.DeleteCallableRequestV2{}, false
	}
	return contracts.DeleteCallableRequestV2{ProjectID: *payload.ProjectID, ExpectedRevision: *payload.ExpectedRevision}, true
}

func (payload commitCallablePayload) contract() (contracts.CommitCallableRequestV2, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.AuthoredExpression == nil {
		return contracts.CommitCallableRequestV2{}, false
	}
	return contracts.CommitCallableRequestV2{ProjectID: *payload.ProjectID, ExpectedRevision: *payload.ExpectedRevision, AuthoredExpression: *payload.AuthoredExpression}, true
}

func (payload refreshCallableParametersPayload) contract() (contracts.RefreshCallableParametersRequestV2, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil {
		return contracts.RefreshCallableParametersRequestV2{}, false
	}
	return contracts.RefreshCallableParametersRequestV2{ProjectID: *payload.ProjectID, ExpectedRevision: *payload.ExpectedRevision}, true
}

func (payload setParametersPayload) contract() (contracts.SetCallableParametersRequestV2, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.Parameters == nil {
		return contracts.SetCallableParametersRequestV2{}, false
	}
	parameters := make([]contracts.ParameterProposalV2, 0, len(*payload.Parameters))
	for _, parameter := range *payload.Parameters {
		if parameter.ID == nil || parameter.Name == nil || parameter.AuthoredExpression == nil {
			return contracts.SetCallableParametersRequestV2{}, false
		}
		parameters = append(parameters, contracts.ParameterProposalV2{ID: *parameter.ID, Name: *parameter.Name, AuthoredExpression: *parameter.AuthoredExpression})
	}
	return contracts.SetCallableParametersRequestV2{ProjectID: *payload.ProjectID, ExpectedRevision: *payload.ExpectedRevision, Parameters: parameters}, true
}

func (payload setTargetPayload) contract() (contracts.SetPythonTargetRequestV2, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.Prefix == nil || payload.Suffix == nil {
		return contracts.SetPythonTargetRequestV2{}, false
	}
	return contracts.SetPythonTargetRequestV2{ProjectID: *payload.ProjectID, ExpectedRevision: *payload.ExpectedRevision, Prefix: *payload.Prefix, Suffix: *payload.Suffix}, true
}

func (payload callableCompletionPayload) contract() (contracts.CallableCompletionRequestV2, bool) {
	if payload.ProjectID == nil || payload.AuthoredExpression == nil || payload.CursorOffsetUTF16 == nil {
		return contracts.CallableCompletionRequestV2{}, false
	}
	return contracts.CallableCompletionRequestV2{ProjectID: *payload.ProjectID, AuthoredExpression: *payload.AuthoredExpression, CursorOffsetUTF16: *payload.CursorOffsetUTF16}, true
}

func (payload targetCompletionPayload) contract() (contracts.PythonTargetCompletionRequestV2, bool) {
	if payload.ProjectID == nil || payload.Code == nil || payload.ProtectedBodyRange == nil || payload.ProtectedBodyRange.Start == nil || payload.ProtectedBodyRange.End == nil || payload.CursorOffsetUTF16 == nil {
		return contracts.PythonTargetCompletionRequestV2{}, false
	}
	return contracts.PythonTargetCompletionRequestV2{
		ProjectID: *payload.ProjectID,
		Code:      *payload.Code,
		ProtectedBodyRange: contracts.UTF16RangeV2{
			Start: *payload.ProtectedBodyRange.Start,
			End:   *payload.ProtectedBodyRange.End,
		},
		CursorOffsetUTF16: *payload.CursorOffsetUTF16,
	}, true
}

// NewHandler creates only exact V2 routes. No legacy path, payload, or alias
// is accepted after this public cutover.
func NewHandler(service ProjectService, options HandlerOptions) (http.Handler, error) {
	if service == nil {
		return nil, ErrProjectServiceRequired
	}
	if err := service.Snapshot().Validate(); err != nil {
		return nil, fmt.Errorf("validate project endpoint snapshot: %w", err)
	}
	terminalRoutes, err := newTerminalRoutes(options)
	if err != nil {
		return nil, err
	}
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		dispatchProjectRequest(response, request, service, terminalRoutes)
	}), nil
}

func dispatchProjectRequest(response http.ResponseWriter, request *http.Request, service ProjectService, terminalRoutes *terminalRoutes) {
	if terminalRoutes.dispatch(response, request, service) {
		return
	}
	if dispatchProjectCollectionRoute(response, request, service) {
		return
	}
	if dispatchSectionCollectionRoute(response, request, service) {
		return
	}
	callableID, action, matched := callableRoute(request)
	if matched {
		dispatchCallableRoute(response, request, service, callableID, action)
		return
	}
	if dispatchSectionItemRoute(response, request, service) {
		return
	}
	writeNotFound(response)
}

func dispatchProjectCollectionRoute(response http.ResponseWriter, request *http.Request, service ProjectService) bool {
	switch {
	case isExactPath(request, contracts.ProjectPathV2):
		handleProject(response, request, service)
	case isExactPath(request, contracts.ProjectRenamePathV2):
		handleRenameProject(response, request, service)
	case isExactPath(request, contracts.ProjectCallablesPathV2):
		handleCreateCallable(response, request, service)
	case isExactPath(request, contracts.ProjectTargetPathV2):
		handleTarget(response, request, service)
	case isExactPath(request, contracts.ProjectTargetPathV2+"/completions"):
		handleTargetCompletions(response, request, service)
	default:
		return false
	}
	return true
}

func dispatchCallableRoute(response http.ResponseWriter, request *http.Request, service ProjectService, callableID string, action string) {
	switch action {
	case "rename":
		handleRenameCallable(response, request, service, callableID)
	case "delete":
		handleDeleteCallable(response, request, service, callableID)
	case "commit":
		handleCommitCallable(response, request, service, callableID)
	case "refresh-parameters":
		handleRefreshCallableParameters(response, request, service, callableID)
	case "parameters":
		handleParameters(response, request, service, callableID)
	case "completions":
		handleCallableCompletions(response, request, service, callableID)
	default:
		writeNotFound(response)
	}
}

func writeNotFound(response http.ResponseWriter) {
	writeError(response, http.StatusNotFound, contracts.APIErrorCodeNotFoundV2, "Route not found.")
}

func handleProject(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMethod(response, request, http.MethodGet) || !rejectQuery(response, request) || !rejectRequestBody(response, request) {
		return
	}
	writeSnapshot(response, service.Snapshot())
}

func handleRenameProject(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload renameProjectPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Project rename request is invalid.")
		return
	}
	snapshot, err := service.RenameProject(request.Context(), body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleCreateCallable(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload createCallablePayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Create callable request is invalid.")
		return
	}
	snapshot, err := service.CreateCallable(request.Context(), body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleRenameCallable(response http.ResponseWriter, request *http.Request, service ProjectService, callableID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload renameCallablePayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Callable rename request is invalid.")
		return
	}
	snapshot, err := service.RenameCallable(request.Context(), callableID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleDeleteCallable(response http.ResponseWriter, request *http.Request, service ProjectService, callableID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload deleteCallablePayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Delete callable request is invalid.")
		return
	}
	snapshot, err := service.DeleteCallable(request.Context(), callableID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleCommitCallable(response http.ResponseWriter, request *http.Request, service ProjectService, callableID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload commitCallablePayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Callable commit request is invalid.")
		return
	}
	snapshot, err := service.CommitCallable(request.Context(), callableID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleRefreshCallableParameters(response http.ResponseWriter, request *http.Request, service ProjectService, callableID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload refreshCallableParametersPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Callable parameter refresh request is invalid.")
		return
	}
	snapshot, err := service.RefreshCallableParameters(request.Context(), callableID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleParameters(response http.ResponseWriter, request *http.Request, service ProjectService, callableID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload setParametersPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Parameter list request is invalid.")
		return
	}
	snapshot, err := service.SetCallableParameters(request.Context(), callableID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleTarget(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload setTargetPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Python target request is invalid.")
		return
	}
	snapshot, err := service.SetPythonTarget(request.Context(), body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleCallableCompletions(response http.ResponseWriter, request *http.Request, service ProjectService, callableID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload callableCompletionPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Callable completion request is invalid.")
		return
	}
	items, err := service.CompleteCallable(request.Context(), callableID, body)
	if err != nil {
		writeServiceError(response, service, err, 0)
		return
	}
	writeCompletionResponse(response, items)
}

func handleTargetCompletions(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload targetCompletionPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Python target completion request is invalid.")
		return
	}
	items, err := service.CompletePythonTarget(request.Context(), body)
	if err != nil {
		writeServiceError(response, service, err, 0)
		return
	}
	writeCompletionResponse(response, items)
}

func writeSnapshot(response http.ResponseWriter, snapshot contracts.ProjectSnapshotV2) {
	if err := snapshot.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeInternalV2, "Unable to publish the project snapshot.")
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}

func writeCompletionResponse(response http.ResponseWriter, items []contracts.CompletionItemV2) {
	result := contracts.CompletionResponseV2{Items: items}
	if err := result.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeInternalV2, "Unable to publish completion results.")
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func writeServiceError(response http.ResponseWriter, service ProjectService, err error, expectedRevision int) {
	switch {
	case errors.Is(err, aggregate.ErrRevisionConflict):
		writeRevisionConflict(response, expectedRevision, service.Snapshot().Project.Revision)
	case errors.Is(err, aggregate.ErrProjectNotFound), errors.Is(err, aggregate.ErrCallableNotFound),
		errors.Is(err, aggregate.ErrParameterDictionaryNotFound), errors.Is(err, aggregate.ErrListNotFound):
		writeError(response, http.StatusNotFound, contracts.APIErrorCodeNotFoundV2, "The requested project resource does not exist.")
	case errors.Is(err, coordinator.ErrProviderUnavailable), errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		writeError(response, http.StatusServiceUnavailable, contracts.APIErrorCodeProviderUnavailableV2, "Basedpyright is unavailable. Try again when it is ready.")
	case errors.Is(err, coordinator.ErrProviderFailed):
		writeError(response, http.StatusBadGateway, contracts.APIErrorCodeProviderFailedV2, "Basedpyright could not complete this request.")
	case errors.Is(err, aggregate.ErrValidation), errors.Is(err, coordinator.ErrCompletionInvalid):
		writeError(response, http.StatusUnprocessableEntity, contracts.APIErrorCodeValidationFailedV2, "The proposed project change is invalid.")
	case errors.Is(err, coordinator.ErrRenderFailed):
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeRenderFailedV2, "Unable to render the generated Python.")
	case errors.Is(err, coordinator.ErrMaterializationFailed):
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeMaterializationFailedV2, "Unable to materialize the generated Python.")
	case errors.Is(err, coordinator.ErrPersistenceFailed):
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodePersistenceFailedV2, "Unable to persist the project.")
	default:
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeInternalV2, "Unable to complete the project request.")
	}
}

func requireMutationMethod(response http.ResponseWriter, request *http.Request) bool {
	return requireMethod(response, request, http.MethodPost)
}

func requireMethod(response http.ResponseWriter, request *http.Request, method string) bool {
	if request.Method == method {
		return true
	}
	response.Header().Set("Allow", method)
	writeError(response, http.StatusMethodNotAllowed, contracts.APIErrorCodeMethodNotAllowedV2, "Method is not allowed.")
	return false
}

func rejectQuery(response http.ResponseWriter, request *http.Request) bool {
	if request.URL.RawQuery == "" && !request.URL.ForceQuery {
		return true
	}
	writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Query parameters are not accepted.")
	return false
}

func rejectRequestBody(response http.ResponseWriter, request *http.Request) bool {
	hasBody, err := requestHasBody(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Request body could not be read.")
		return false
	}
	if !hasBody {
		return true
	}
	writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "GET requests must not include a body.")
	return false
}

func callableRoute(request *http.Request) (string, string, bool) {
	return sectionRoute(request, contracts.ProjectCallablesPathV2)
}

func sectionRoute(request *http.Request, collectionPath string) (string, string, bool) {
	prefix := collectionPath + "/"
	escapedPath := request.URL.EscapedPath()
	if !strings.HasPrefix(escapedPath, prefix) {
		return "", "", false
	}
	parts := strings.Split(strings.TrimPrefix(escapedPath, prefix), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	callableID, err := url.PathUnescape(parts[0])
	if err != nil || callableID == "" || strings.ContainsRune(callableID, '\x00') || callableID != strings.TrimSpace(callableID) {
		return "", "", false
	}
	return callableID, parts[1], true
}

func isExactPath(request *http.Request, path string) bool {
	return request.URL.Path == path && request.URL.RawPath == "" && request.URL.EscapedPath() == path
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

// ServeLoopback binds the V2 service to loopback and shuts it down when the
// caller's service context ends.
func ServeLoopback(ctx context.Context, port uint16, service ProjectService, options HandlerOptions) error {
	listener, err := ListenLoopback(port)
	if err != nil {
		return err
	}
	return serve(ctx, listener, service, options)
}

func serve(ctx context.Context, listener net.Listener, service ProjectService, options HandlerOptions) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if options.Lifecycle == nil {
		options.Lifecycle = ctx
	}
	handler, err := NewHandler(service, options)
	if err != nil {
		_ = listener.Close()
		return err
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	serveResult := make(chan error, 1)
	go func() { serveResult <- server.Serve(listener) }()
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
