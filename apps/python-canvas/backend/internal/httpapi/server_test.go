package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project"
)

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
	contextKey := struct{}{}
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

func TestMutationRoutesRejectMalformedBodiesAndMapTypedFailures(t *testing.T) {
	service := newStubService()
	service.commitCallable = func(context.Context, string, string, string) (contracts.ProjectSnapshotV1, error) {
		return contracts.ProjectSnapshotV1{}, project.ErrUnsupportedSignature
	}
	service.setParameterExpression = func(context.Context, string, string, string) (contracts.ProjectSnapshotV1, error) {
		return contracts.ProjectSnapshotV1{}, project.ErrParameterExpressionInvalid
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
		{name: "parameter invalid expression", method: http.MethodPost, target: contracts.ProjectParameterPathV1 + "parameter:square-root:1", contentType: "application/json", body: `{"projectId":"project:python-canvas","authoredExpression":"value; other"}`, wantStatus: http.StatusUnprocessableEntity, wantCode: contracts.APIErrorCodeInvalidParameterExpressionV1},
		{name: "parameter encoded id", method: http.MethodPost, target: contracts.ProjectParameterPathV1 + "%70arameter", contentType: "application/json", body: `{"projectId":"project:python-canvas","authoredExpression":"3"}`, wantStatus: http.StatusNotFound, wantCode: contracts.APIErrorCodeNotFoundV1},
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
	snapshot               contracts.ProjectSnapshotV1
	commitCallable         func(context.Context, string, string, string) (contracts.ProjectSnapshotV1, error)
	setParameterExpression func(context.Context, string, string, string) (contracts.ProjectSnapshotV1, error)
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

func (service *stubService) SetParameterExpression(
	ctx context.Context,
	projectID string,
	parameterID string,
	expression string,
) (contracts.ProjectSnapshotV1, error) {
	if service.setParameterExpression == nil {
		return service.snapshot, nil
	}
	return service.setParameterExpression(ctx, projectID, parameterID, expression)
}

type stubListener struct{}

func (*stubListener) Accept() (net.Conn, error) { return nil, errors.New("not used") }
func (*stubListener) Close() error              { return nil }
func (*stubListener) Addr() net.Addr            { return stubAddress("127.0.0.1:8042") }

type stubAddress string

func (stubAddress) Network() string        { return "tcp4" }
func (address stubAddress) String() string { return string(address) }
