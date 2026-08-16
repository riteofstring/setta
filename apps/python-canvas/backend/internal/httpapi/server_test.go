package httpapi

import (
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
	handler, err := NewHandler(project.InitialProjectSnapshot())
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}

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
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body = %s", response.Code, test.wantStatus, response.Body.String())
			}
			if contentType := response.Header().Get("Content-Type"); contentType != "application/json; charset=utf-8" {
				t.Fatalf("Content-Type = %q", contentType)
			}
			if allow := response.Header().Get("Allow"); allow != test.wantAllow {
				t.Fatalf("Allow = %q, want %q", allow, test.wantAllow)
			}

			if test.wantStatus == http.StatusOK {
				var snapshot contracts.ProjectSnapshotV1
				if err := json.Unmarshal(response.Body.Bytes(), &snapshot); err != nil {
					t.Fatalf("decode project response: %v", err)
				}
				if err := snapshot.Validate(); err != nil {
					t.Fatalf("decoded project response is invalid: %v", err)
				}
				return
			}

			var errorResponse contracts.ErrorResponseV1
			if err := json.Unmarshal(response.Body.Bytes(), &errorResponse); err != nil {
				t.Fatalf("decode error response: %v", err)
			}
			if errorResponse.Error.Code != test.wantCode {
				t.Fatalf("error code = %q, want %q", errorResponse.Error.Code, test.wantCode)
			}
		})
	}
}

func TestNewHandlerRejectsUnsupportedSnapshotVersion(t *testing.T) {
	snapshot := project.InitialProjectSnapshot()
	snapshot.Version = "v2"

	_, err := NewHandler(snapshot)
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

type stubListener struct{}

func (*stubListener) Accept() (net.Conn, error) { return nil, errors.New("not used") }
func (*stubListener) Close() error              { return nil }
func (*stubListener) Addr() net.Addr            { return stubAddress("127.0.0.1:8042") }

type stubAddress string

func (stubAddress) Network() string        { return "tcp4" }
func (address stubAddress) String() string { return string(address) }
