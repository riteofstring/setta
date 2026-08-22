package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project"
)

type requestContextKey struct{}

func TestProjectEndpointAcceptsOnlyExactBodylessGET(t *testing.T) {
	service := newStubService()
	handler := newHandlerForTest(t, service)

	zeroContentLength := int64(0)
	tests := []struct {
		name       string
		method     string
		target     string
		body       string
		contentLen *int64
		forceQuery bool
		wantStatus int
		wantCode   contracts.APIErrorCodeV1
		wantAllow  string
	}{
		{name: "project", method: http.MethodGet, target: contracts.ProjectPathV1, wantStatus: http.StatusOK},
		{name: "trailing slash", method: http.MethodGet, target: contracts.ProjectPathV1 + "/", wantStatus: http.StatusNotFound, wantCode: contracts.APIErrorCodeNotFoundV1},
		{name: "encoded path", method: http.MethodGet, target: "/api/v1/%70roject", wantStatus: http.StatusNotFound, wantCode: contracts.APIErrorCodeNotFoundV1},
		{name: "query", method: http.MethodGet, target: contracts.ProjectPathV1 + "?view=full", wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "empty query", method: http.MethodGet, target: contracts.ProjectPathV1, forceQuery: true, wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "body", method: http.MethodGet, target: contracts.ProjectPathV1, body: "{}", wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "body with zero content length", method: http.MethodGet, target: contracts.ProjectPathV1, body: "{}", contentLen: &zeroContentLength, wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "method", method: http.MethodPost, target: contracts.ProjectPathV1, wantStatus: http.StatusMethodNotAllowed, wantCode: contracts.APIErrorCodeMethodNotAllowedV1, wantAllow: http.MethodGet},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.target, strings.NewReader(test.body))
			request.URL.ForceQuery = test.forceQuery
			if test.contentLen != nil {
				request.ContentLength = *test.contentLen
			}
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)
			assertResponse(t, response, test.wantStatus, test.wantCode, test.wantAllow)
			if test.wantStatus != http.StatusOK {
				return
			}
			var snapshot contracts.ProjectSnapshotV1
			if err := json.Unmarshal(response.Body.Bytes(), &snapshot); err != nil {
				t.Fatalf("decode project response: %v", err)
			}
			if err := snapshot.Validate(); err != nil {
				t.Fatalf("decoded project response is invalid: %v", err)
			}
		})
	}
}

func TestCallableEndpointStrictlyDecodesAndPropagatesRequestContext(t *testing.T) {
	service := newStubService()
	contextKey := requestContextKey{}
	var receivedContext context.Context
	var received contracts.CommitCallableRequestV1
	service.commitCallable = func(ctx context.Context, projectID, sectionID, expression string) (contracts.ProjectSnapshotV1, error) {
		receivedContext = ctx
		received = contracts.CommitCallableRequestV1{
			ProjectID:          projectID,
			SectionID:          sectionID,
			AuthoredExpression: expression,
		}
		return service.snapshot, nil
	}
	handler := newHandlerForTest(t, service)

	request := httptest.NewRequest(
		http.MethodPost,
		contracts.ProjectCallablePathV1,
		strings.NewReader(`{"projectId":"project:python-canvas","sectionId":"callable:square-root","authoredExpression":"math.sqrt"}`),
	).WithContext(context.WithValue(context.Background(), contextKey, "request context"))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	assertResponse(t, response, http.StatusOK, "", "")
	if receivedContext.Value(contextKey) != "request context" {
		t.Fatal("callable mutation did not receive the request context")
	}
	if received.AuthoredExpression != "math.sqrt" || received.ProjectID == "" || received.SectionID == "" {
		t.Fatalf("callable mutation request = %#v", received)
	}
}

func TestCallableCompletionsEndpointStrictlyDecodesMapsFailuresAndLeavesAReadOnlyResponse(t *testing.T) {
	service := newStubService()
	contextKey := requestContextKey{}
	var receivedContext context.Context
	var received contracts.CallableCompletionRequestV1
	service.completeCallable = func(ctx context.Context, projectID, sectionID, expression string, cursorOffsetUTF16 int) ([]project.CallableCompletionItem, error) {
		receivedContext = ctx
		received = contracts.CallableCompletionRequestV1{
			ProjectID:          projectID,
			SectionID:          sectionID,
			AuthoredExpression: expression,
			CursorOffsetUTF16:  cursorOffsetUTF16,
		}
		return []project.CallableCompletionItem{{Label: "sqrt", InsertText: "sqrt"}}, nil
	}
	handler := newHandlerForTest(t, service)

	request := httptest.NewRequest(
		http.MethodPost,
		contracts.ProjectCallableCompletionsPathV1,
		strings.NewReader(`{"projectId":"project:python-canvas","sectionId":"callable:square-root","authoredExpression":"math.sq","cursorOffsetUtf16":7}`),
	).WithContext(context.WithValue(context.Background(), contextKey, "request context"))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	assertResponse(t, response, http.StatusOK, "", "")
	if receivedContext.Value(contextKey) != "request context" {
		t.Fatal("callable completion did not receive the request context")
	}
	if received != (contracts.CallableCompletionRequestV1{
		ProjectID:          "project:python-canvas",
		SectionID:          "callable:square-root",
		AuthoredExpression: "math.sq",
		CursorOffsetUTF16:  7,
	}) {
		t.Fatalf("callable completion request = %#v", received)
	}
	var completion contracts.CallableCompletionResponseV1
	if err := json.Unmarshal(response.Body.Bytes(), &completion); err != nil {
		t.Fatalf("decode callable completion response: %v", err)
	}
	if err := completion.Validate(); err != nil {
		t.Fatalf("callable completion response validation: %v", err)
	}
	if len(completion.Items) != 1 || completion.Items[0].Label != "sqrt" {
		t.Fatalf("callable completion response = %#v", completion)
	}
}

func TestCallableCompletionsEndpointRejectsInvalidRequestsAndMapsProviderFailures(t *testing.T) {
	service := newStubService()
	service.completeCallable = func(_ context.Context, projectID, _ string, expression string, _ int) ([]project.CallableCompletionItem, error) {
		if projectID == "project:missing" {
			return nil, project.ErrProjectNotFound
		}
		if expression == "invalid" {
			return nil, project.ErrCallableCompletionInvalid
		}
		return nil, project.ErrProviderUnavailable
	}
	handler := newHandlerForTest(t, service)

	tests := []struct {
		name        string
		method      string
		target      string
		contentType string
		body        string
		wantStatus  int
		wantCode    contracts.APIErrorCodeV1
		wantAllow   string
	}{
		{name: "method", method: http.MethodGet, target: contracts.ProjectCallableCompletionsPathV1, wantStatus: http.StatusMethodNotAllowed, wantCode: contracts.APIErrorCodeMethodNotAllowedV1, wantAllow: http.MethodPost},
		{name: "query", method: http.MethodPost, target: contracts.ProjectCallableCompletionsPathV1 + "?unexpected=true", wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "missing cursor", method: http.MethodPost, target: contracts.ProjectCallableCompletionsPathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","sectionId":"callable:square-root","authoredExpression":"math.sq"}`, wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "unknown field", method: http.MethodPost, target: contracts.ProjectCallableCompletionsPathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","sectionId":"callable:square-root","authoredExpression":"math.sq","cursorOffsetUtf16":7,"unexpected":true}`, wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "trailing value", method: http.MethodPost, target: contracts.ProjectCallableCompletionsPathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","sectionId":"callable:square-root","authoredExpression":"math.sq","cursorOffsetUtf16":7} {}`, wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "unknown project", method: http.MethodPost, target: contracts.ProjectCallableCompletionsPathV1, contentType: "application/json", body: `{"projectId":"project:missing","sectionId":"callable:square-root","authoredExpression":"math.sq","cursorOffsetUtf16":7}`, wantStatus: http.StatusNotFound, wantCode: contracts.APIErrorCodeNotFoundV1},
		{name: "project validation", method: http.MethodPost, target: contracts.ProjectCallableCompletionsPathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","sectionId":"callable:square-root","authoredExpression":"invalid","cursorOffsetUtf16":7}`, wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "provider unavailable", method: http.MethodPost, target: contracts.ProjectCallableCompletionsPathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","sectionId":"callable:square-root","authoredExpression":"math.sq","cursorOffsetUtf16":7}`, wantStatus: http.StatusServiceUnavailable, wantCode: contracts.APIErrorCodeProviderUnavailableV1},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.target, strings.NewReader(test.body))
			if test.contentType != "" {
				request.Header.Set("Content-Type", test.contentType)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			assertResponse(t, response, test.wantStatus, test.wantCode, test.wantAllow)
		})
	}
}

func TestMutationEndpointsRequireTheirCompleteRequest(t *testing.T) {
	tests := []struct {
		name   string
		target string
		body   string
	}{
		{
			name:   "callable",
			target: contracts.ProjectCallablePathV1,
			body:   `{"projectId":"project:python-canvas","sectionId":"callable:square-root"}`,
		},
		{
			name:   "parameter list without a revision",
			target: contracts.ProjectParametersPathV1,
			body:   `{"projectId":"project:python-canvas","callableId":"callable:square-root","parameters":[]}`,
		},
		{
			name:   "parameter list without its records",
			target: contracts.ProjectParametersPathV1,
			body:   `{"projectId":"project:python-canvas","callableId":"callable:square-root","expectedRevision":2}`,
		},
		{
			name:   "parameter record without a name",
			target: contracts.ProjectParametersPathV1,
			body:   `{"projectId":"project:python-canvas","callableId":"callable:square-root","expectedRevision":2,"parameters":[{"id":"parameter:square-root:provider","authoredExpression":"3"}]}`,
		},
		{
			name:   "Python target without a revision",
			target: contracts.ProjectTargetPathV1,
			body:   `{"projectId":"project:python-canvas","prefix":"import os","suffix":""}`,
		},
		{
			// An omitted region is not an emptied one: the request carries the whole
			// target or it carries nothing this store can act on.
			name:   "Python target without its suffix",
			target: contracts.ProjectTargetPathV1,
			body:   `{"projectId":"project:python-canvas","expectedRevision":2,"prefix":"import os"}`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := newStubService()
			mutationCalled := false
			service.commitCallable = func(context.Context, string, string, string) (contracts.ProjectSnapshotV1, error) {
				mutationCalled = true
				return service.snapshot, nil
			}
			service.setCallableParameters = func(context.Context, string, string, int, []project.ParameterProposal) (contracts.ProjectSnapshotV1, error) {
				mutationCalled = true
				return service.snapshot, nil
			}
			service.setPythonTarget = func(context.Context, string, int, string, string) (contracts.ProjectSnapshotV1, error) {
				mutationCalled = true
				return service.snapshot, nil
			}
			handler := newHandlerForTest(t, service)

			request := httptest.NewRequest(http.MethodPost, test.target, strings.NewReader(test.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			assertResponse(t, response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV1, "")
			if mutationCalled {
				t.Fatal("mutation service was invoked for an incomplete request")
			}
		})
	}
}

func TestTargetEndpointPropagatesBothAuthoredRegions(t *testing.T) {
	service := newStubService()
	var receivedProjectID, receivedPrefix, receivedSuffix string
	receivedRevision := 0
	service.setPythonTarget = func(
		_ context.Context,
		projectID string,
		expectedRevision int,
		prefix string,
		suffix string,
	) (contracts.ProjectSnapshotV1, error) {
		receivedProjectID = projectID
		receivedRevision = expectedRevision
		receivedPrefix = prefix
		receivedSuffix = suffix
		return service.snapshot, nil
	}
	handler := newHandlerForTest(t, service)

	// An emptied region is a real proposal, so it crosses this boundary as the empty
	// string rather than as a missing field.
	request := httptest.NewRequest(
		http.MethodPost,
		contracts.ProjectTargetPathV1,
		strings.NewReader(`{"projectId":"project:python-canvas","expectedRevision":2,"prefix":"import math\nimport os","suffix":""}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	assertResponse(t, response, http.StatusOK, "", "")
	if receivedProjectID != "project:python-canvas" || receivedRevision != 2 ||
		receivedPrefix != "import math\nimport os" || receivedSuffix != "" {
		t.Fatalf(
			"Python target mutation = projectID %q, revision %d, prefix %q, suffix %q",
			receivedProjectID,
			receivedRevision,
			receivedPrefix,
			receivedSuffix,
		)
	}
}

func TestParameterListEndpointPropagatesTheCompleteOrderedCandidate(t *testing.T) {
	service := newStubService()
	var receivedProjectID, receivedCallableID string
	receivedRevision := 0
	var receivedParameters []project.ParameterProposal
	service.setCallableParameters = func(
		_ context.Context,
		projectID string,
		callableID string,
		expectedRevision int,
		parameters []project.ParameterProposal,
	) (contracts.ProjectSnapshotV1, error) {
		receivedProjectID = projectID
		receivedCallableID = callableID
		receivedRevision = expectedRevision
		receivedParameters = parameters
		return service.snapshot, nil
	}
	handler := newHandlerForTest(t, service)

	request := httptest.NewRequest(
		http.MethodPost,
		contracts.ProjectParametersPathV1,
		strings.NewReader(`{"projectId":"project:python-canvas","callableId":"callable:square-root","expectedRevision":2,`+
			`"parameters":[{"id":"parameter:square-root:provider","name":"x","authoredExpression":""},`+
			`{"id":"parameter:authored:1","name":"scale","authoredExpression":"2"}]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	assertResponse(t, response, http.StatusOK, "", "")
	wantParameters := []project.ParameterProposal{
		{ID: "parameter:square-root:provider", Name: "x", AuthoredExpression: ""},
		{ID: "parameter:authored:1", Name: "scale", AuthoredExpression: "2"},
	}
	if receivedProjectID != "project:python-canvas" || receivedCallableID != "callable:square-root" ||
		receivedRevision != 2 || !reflect.DeepEqual(receivedParameters, wantParameters) {
		t.Fatalf(
			"parameter list mutation = projectID %q, callableID %q, revision %d, parameters %#v",
			receivedProjectID,
			receivedCallableID,
			receivedRevision,
			receivedParameters,
		)
	}
}

func TestMutationRoutesRejectMalformedBodiesAndMapTypedFailures(t *testing.T) {
	service := newStubService()
	service.commitCallable = func(context.Context, string, string, string) (contracts.ProjectSnapshotV1, error) {
		return contracts.ProjectSnapshotV1{}, project.ErrUnsupportedSignature
	}
	service.setCallableParameters = func(
		_ context.Context,
		_ string,
		_ string,
		expectedRevision int,
		parameters []project.ParameterProposal,
	) (contracts.ProjectSnapshotV1, error) {
		if expectedRevision != 2 {
			return contracts.ProjectSnapshotV1{}, project.ErrProjectRevisionStale
		}
		if len(parameters) == 1 && parameters[0].Name == "class" {
			return contracts.ProjectSnapshotV1{}, project.ErrParameterNameInvalid
		}
		return contracts.ProjectSnapshotV1{}, project.ErrParameterExpressionInvalid
	}
	service.setPythonTarget = func(
		_ context.Context,
		_ string,
		expectedRevision int,
		_ string,
		_ string,
	) (contracts.ProjectSnapshotV1, error) {
		if expectedRevision != 2 {
			return contracts.ProjectSnapshotV1{}, project.ErrProjectRevisionStale
		}
		return contracts.ProjectSnapshotV1{}, project.ErrPythonTargetInvalid
	}
	handler := newHandlerForTest(t, service)

	tests := []struct {
		name        string
		method      string
		target      string
		contentType string
		body        string
		wantStatus  int
		wantCode    contracts.APIErrorCodeV1
		wantAllow   string
	}{
		{name: "callable method", method: http.MethodGet, target: contracts.ProjectCallablePathV1, wantStatus: http.StatusMethodNotAllowed, wantCode: contracts.APIErrorCodeMethodNotAllowedV1, wantAllow: http.MethodPost},
		{name: "callable content type", method: http.MethodPost, target: contracts.ProjectCallablePathV1, contentType: "text/plain", body: `{}`, wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "callable unknown field", method: http.MethodPost, target: contracts.ProjectCallablePathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","sectionId":"callable:square-root","authoredExpression":"math.sqrt","unexpected":true}`, wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "callable trailing value", method: http.MethodPost, target: contracts.ProjectCallablePathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","sectionId":"callable:square-root","authoredExpression":"math.sqrt"} {}`, wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "callable unsupported signature", method: http.MethodPost, target: contracts.ProjectCallablePathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","sectionId":"callable:square-root","authoredExpression":"math.sqrt"}`, wantStatus: http.StatusUnprocessableEntity, wantCode: contracts.APIErrorCodeUnsupportedSignatureV1},
		{name: "parameter list invalid expression", method: http.MethodPost, target: contracts.ProjectParametersPathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","callableId":"callable:square-root","expectedRevision":2,"parameters":[{"id":"parameter:square-root:provider","name":"x","authoredExpression":"value; other"}]}`, wantStatus: http.StatusUnprocessableEntity, wantCode: contracts.APIErrorCodeInvalidParameterExpressionV1},
		{name: "parameter list invalid name", method: http.MethodPost, target: contracts.ProjectParametersPathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","callableId":"callable:square-root","expectedRevision":2,"parameters":[{"id":"parameter:authored:1","name":"class","authoredExpression":"2"}]}`, wantStatus: http.StatusUnprocessableEntity, wantCode: contracts.APIErrorCodeInvalidParameterNameV1},
		{name: "parameter list stale revision", method: http.MethodPost, target: contracts.ProjectParametersPathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","callableId":"callable:square-root","expectedRevision":1,"parameters":[{"id":"parameter:square-root:provider","name":"x","authoredExpression":"3"}]}`, wantStatus: http.StatusConflict, wantCode: contracts.APIErrorCodeRevisionConflictV1},
		{name: "parameter list blank record id", method: http.MethodPost, target: contracts.ProjectParametersPathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","callableId":"callable:square-root","expectedRevision":2,"parameters":[{"id":"","name":"x","authoredExpression":"3"}]}`, wantStatus: http.StatusBadRequest, wantCode: contracts.APIErrorCodeInvalidRequestV1},
		{name: "parameter list with a path id", method: http.MethodPost, target: contracts.ProjectParametersPathV1 + "/parameter:square-root:provider", contentType: "application/json", body: `{"projectId":"project:python-canvas","callableId":"callable:square-root","expectedRevision":2,"parameters":[]}`, wantStatus: http.StatusNotFound, wantCode: contracts.APIErrorCodeNotFoundV1},
		{name: "Python target method", method: http.MethodGet, target: contracts.ProjectTargetPathV1, wantStatus: http.StatusMethodNotAllowed, wantCode: contracts.APIErrorCodeMethodNotAllowedV1, wantAllow: http.MethodPost},
		{name: "Python target invalid region", method: http.MethodPost, target: contracts.ProjectTargetPathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","expectedRevision":2,"prefix":"import os","suffix":""}`, wantStatus: http.StatusUnprocessableEntity, wantCode: contracts.APIErrorCodeInvalidPythonTargetV1},
		{name: "Python target stale revision", method: http.MethodPost, target: contracts.ProjectTargetPathV1, contentType: "application/json", body: `{"projectId":"project:python-canvas","expectedRevision":1,"prefix":"import os","suffix":""}`, wantStatus: http.StatusConflict, wantCode: contracts.APIErrorCodeRevisionConflictV1},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.target, strings.NewReader(test.body))
			if test.contentType != "" {
				request.Header.Set("Content-Type", test.contentType)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			assertResponse(t, response, test.wantStatus, test.wantCode, test.wantAllow)
		})
	}
}

func TestNewHandlerRejectsInvalidServiceSnapshot(t *testing.T) {
	service := newStubService()
	service.snapshot.Version = "v2"

	_, err := NewHandler(service)
	var versionError contracts.UnsupportedVersionError
	if !errors.As(err, &versionError) {
		t.Fatalf("NewHandler() error = %T %v, want UnsupportedVersionError", err, err)
	}
}

func TestListenLoopbackRequestsExactIPv4LoopbackAddress(t *testing.T) {
	wantListener := &stubListener{}
	listener, err := listenLoopback(8042, func(network, address string) (net.Listener, error) {
		if network != "tcp4" {
			t.Fatalf("network = %q, want tcp4", network)
		}
		if address != "127.0.0.1:8042" {
			t.Fatalf("address = %q, want 127.0.0.1:8042", address)
		}
		return wantListener, nil
	})
	if err != nil {
		t.Fatalf("listenLoopback() error = %v", err)
	}
	if listener != wantListener {
		t.Fatalf("listener = %T %v, want injected listener", listener, listener)
	}
}

func newHandlerForTest(t *testing.T, service *stubService) http.Handler {
	t.Helper()
	handler, err := NewHandler(service)
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}
	return handler
}

func assertResponse(
	t *testing.T,
	response *httptest.ResponseRecorder,
	wantStatus int,
	wantCode contracts.APIErrorCodeV1,
	wantAllow string,
) {
	t.Helper()
	if response.Code != wantStatus {
		t.Fatalf("status = %d, want %d; body = %s", response.Code, wantStatus, response.Body.String())
	}
	if contentType := response.Header().Get("Content-Type"); contentType != "application/json; charset=utf-8" {
		t.Fatalf("Content-Type = %q", contentType)
	}
	if allow := response.Header().Get("Allow"); allow != wantAllow {
		t.Fatalf("Allow = %q, want %q", allow, wantAllow)
	}
	if wantStatus == http.StatusOK {
		return
	}
	var errorResponse contracts.ErrorResponseV1
	if err := json.Unmarshal(response.Body.Bytes(), &errorResponse); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if errorResponse.Error.Code != wantCode {
		t.Fatalf("error code = %q, want %q", errorResponse.Error.Code, wantCode)
	}
}

type stubService struct {
	snapshot              contracts.ProjectSnapshotV1
	commitCallable        func(context.Context, string, string, string) (contracts.ProjectSnapshotV1, error)
	completeCallable      func(context.Context, string, string, string, int) ([]project.CallableCompletionItem, error)
	setCallableParameters func(context.Context, string, string, int, []project.ParameterProposal) (contracts.ProjectSnapshotV1, error)
	setPythonTarget       func(context.Context, string, int, string, string) (contracts.ProjectSnapshotV1, error)
}

func newStubService() *stubService {
	return &stubService{snapshot: project.InitialProjectSnapshot()}
}

func (service *stubService) Snapshot() contracts.ProjectSnapshotV1 {
	return service.snapshot
}

func (service *stubService) CommitCallable(
	ctx context.Context,
	projectID string,
	sectionID string,
	expression string,
) (contracts.ProjectSnapshotV1, error) {
	if service.commitCallable == nil {
		return service.snapshot, nil
	}
	return service.commitCallable(ctx, projectID, sectionID, expression)
}

func (service *stubService) CompleteCallable(
	ctx context.Context,
	projectID string,
	sectionID string,
	expression string,
	cursorOffsetUTF16 int,
) ([]project.CallableCompletionItem, error) {
	if service.completeCallable == nil {
		return []project.CallableCompletionItem{}, nil
	}
	return service.completeCallable(ctx, projectID, sectionID, expression, cursorOffsetUTF16)
}

func (service *stubService) SetCallableParameters(
	ctx context.Context,
	projectID string,
	callableID string,
	expectedRevision int,
	parameters []project.ParameterProposal,
) (contracts.ProjectSnapshotV1, error) {
	if service.setCallableParameters == nil {
		return service.snapshot, nil
	}
	return service.setCallableParameters(ctx, projectID, callableID, expectedRevision, parameters)
}

func (service *stubService) SetPythonTarget(
	ctx context.Context,
	projectID string,
	expectedRevision int,
	prefix string,
	suffix string,
) (contracts.ProjectSnapshotV1, error) {
	if service.setPythonTarget == nil {
		return service.snapshot, nil
	}
	return service.setPythonTarget(ctx, projectID, expectedRevision, prefix, suffix)
}

type stubListener struct{}

func (*stubListener) Accept() (net.Conn, error) { return nil, errors.New("not used") }
func (*stubListener) Close() error              { return nil }
func (*stubListener) Addr() net.Addr            { return stubAddress("127.0.0.1:8042") }

type stubAddress string

func (stubAddress) Network() string        { return "tcp4" }
func (address stubAddress) String() string { return string(address) }
