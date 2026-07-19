package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRuntimeEndpointAccessAllowsConfiguredHTTPSOriginAndHost(t *testing.T) {
	handler, err := NewHandlerWithError(HandlerConfig{
		Metadata:        BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeMetadata: RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
		RuntimeEndpointAccess: RuntimeEndpointAccessConfig{
			AllowedHTTPSOrigins: []string{"https://runtime.gateway.example"},
			AllowedRequestHosts: []string{"runtime.gateway.example"},
		},
	})
	if err != nil {
		t.Fatalf("NewHandlerWithError: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/runtime/info", nil)
	request.Host = "runtime.gateway.example"
	request.Header.Set("Origin", "https://runtime.gateway.example")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "https://runtime.gateway.example" {
		t.Fatalf("allow origin = %q, want configured origin", got)
	}
	if got := response.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("allow credentials = %q, want true", got)
	}
}

func TestRuntimeEndpointAccessRegressionMatrix(t *testing.T) {
	tests := []struct {
		name            string
		access          RuntimeEndpointAccessConfig
		host            string
		origin          string
		wantStatus      int
		wantAllowOrigin string
		wantErrorCode   string
	}{
		{
			name: "allowed origin and host",
			access: RuntimeEndpointAccessConfig{
				AllowedHTTPSOrigins: []string{"https://runtime.gateway.example"},
				AllowedRequestHosts: []string{"runtime.gateway.example"},
			},
			host:            "runtime.gateway.example",
			origin:          "https://runtime.gateway.example",
			wantStatus:      http.StatusOK,
			wantAllowOrigin: "https://runtime.gateway.example",
		},
		{
			name: "rejected origin",
			access: RuntimeEndpointAccessConfig{
				AllowedHTTPSOrigins: []string{"https://runtime.gateway.example"},
			},
			host:          "runtime.gateway.example",
			origin:        "https://other.gateway.example",
			wantStatus:    http.StatusForbidden,
			wantErrorCode: "forbidden_origin",
		},
		{
			name: "rejected origin scheme",
			access: RuntimeEndpointAccessConfig{
				AllowedHTTPSOrigins: []string{"https://runtime.gateway.example"},
			},
			host:          "runtime.gateway.example",
			origin:        "http://runtime.gateway.example",
			wantStatus:    http.StatusForbidden,
			wantErrorCode: "forbidden_origin",
		},
		{
			name: "host allowlist on rejects host",
			access: RuntimeEndpointAccessConfig{
				AllowedRequestHosts: []string{"runtime.gateway.example"},
			},
			host:          "other.gateway.example",
			wantStatus:    http.StatusForbidden,
			wantErrorCode: "forbidden_host",
		},
		{
			name:       "host allowlist off allows host",
			access:     RuntimeEndpointAccessConfig{},
			host:       "other.gateway.example",
			wantStatus: http.StatusOK,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler, err := NewHandlerWithError(HandlerConfig{
				Metadata:              BackendMetadata{Name: BackendName, Version: "test"},
				RuntimeMetadata:       RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
				RuntimeEndpointAccess: test.access,
			})
			if err != nil {
				t.Fatalf("NewHandlerWithError: %v", err)
			}
			request := httptest.NewRequest(http.MethodGet, "/runtime/info", nil)
			request.Host = test.host
			if test.origin != "" {
				request.Header.Set("Origin", test.origin)
			}
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body: %s", response.Code, test.wantStatus, response.Body.String())
			}
			if test.wantAllowOrigin != "" && response.Header().Get("Access-Control-Allow-Origin") != test.wantAllowOrigin {
				t.Fatalf("allow origin = %q, want %q", response.Header().Get("Access-Control-Allow-Origin"), test.wantAllowOrigin)
			}
			if test.wantErrorCode != "" && !strings.Contains(response.Body.String(), test.wantErrorCode) {
				t.Fatalf("body = %s, want %s", response.Body.String(), test.wantErrorCode)
			}
		})
	}
}

func TestRuntimeEndpointAccessRejectsUnconfiguredOrigin(t *testing.T) {
	handler, err := NewHandlerWithError(HandlerConfig{
		Metadata:        BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeMetadata: RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
		RuntimeEndpointAccess: RuntimeEndpointAccessConfig{
			AllowedHTTPSOrigins: []string{"https://runtime.gateway.example"},
		},
	})
	if err != nil {
		t.Fatalf("NewHandlerWithError: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/runtime/info", nil)
	request.Header.Set("Origin", "https://other.gateway.example")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", response.Code)
	}
	if !strings.Contains(response.Body.String(), "forbidden_origin") {
		t.Fatalf("body = %s, want forbidden_origin", response.Body.String())
	}
}

func TestRuntimeEndpointAccessRejectsUnconfiguredHost(t *testing.T) {
	handler, err := NewHandlerWithError(HandlerConfig{
		Metadata:        BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeMetadata: RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
		RuntimeEndpointAccess: RuntimeEndpointAccessConfig{
			AllowedRequestHosts: []string{"runtime.gateway.example"},
		},
	})
	if err != nil {
		t.Fatalf("NewHandlerWithError: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/runtime/info", nil)
	request.Host = "other.gateway.example"
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", response.Code)
	}
	if !strings.Contains(response.Body.String(), "forbidden_host") {
		t.Fatalf("body = %s, want forbidden_host", response.Body.String())
	}
}

func TestRuntimeEndpointAccessHandlesConfiguredPreflight(t *testing.T) {
	handler, err := NewHandlerWithError(HandlerConfig{
		Metadata:        BackendMetadata{Name: BackendName, Version: "test"},
		RuntimeMetadata: RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
		RuntimeEndpointAccess: RuntimeEndpointAccessConfig{
			AllowedHTTPSOrigins: []string{"https://runtime.gateway.example"},
		},
	})
	if err != nil {
		t.Fatalf("NewHandlerWithError: %v", err)
	}

	request := httptest.NewRequest(http.MethodOptions, "/pairing/complete", nil)
	request.Header.Set("Origin", "https://runtime.gateway.example")
	request.Header.Set("Access-Control-Request-Method", http.MethodPost)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body: %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Access-Control-Allow-Methods"); got != http.MethodPost {
		t.Fatalf("allow methods = %q, want POST", got)
	}
}

func TestRuntimeEndpointAccessRejectsInvalidConfiguredOrigin(t *testing.T) {
	_, err := NewHandlerWithError(HandlerConfig{
		RuntimeEndpointAccess: RuntimeEndpointAccessConfig{
			AllowedHTTPSOrigins: []string{"http://runtime.gateway.example"},
		},
	})
	if err == nil {
		t.Fatal("NewHandlerWithError succeeded, want invalid origin error")
	}
}
