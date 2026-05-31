package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

const testAuthToken = "test-token"

func TestHealthEndpointReturnsStructuredJSON(t *testing.T) {
	handler := NewHandler(HandlerConfig{AuthToken: testAuthToken, Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	authorizeTestRequest(request)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if response.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("content type = %q, want application/json", response.Header().Get("Content-Type"))
	}

	var payload BackendHealth
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode health response: %v", err)
	}
	if payload != (BackendHealth{OK: true, Name: BackendName, Version: "test"}) {
		t.Fatalf("payload = %+v", payload)
	}
}

func TestUnknownEndpointReturnsNotFound(t *testing.T) {
	handler := NewHandler(HandlerConfig{AuthToken: testAuthToken, Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	request := httptest.NewRequest(http.MethodGet, "/missing", nil)
	authorizeTestRequest(request)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

func TestHandlerRejectsMissingBackendAuth(t *testing.T) {
	handler := NewHandler(HandlerConfig{AuthToken: testAuthToken, Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnauthorized)
	}
	var payload ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode unauthorized response: %v", err)
	}
	if payload.Error.Code != "backend_auth_failed" {
		t.Fatalf("error code = %q, want backend_auth_failed", payload.Error.Code)
	}
}

func authorizeTestRequest(request *http.Request) {
	request.Header.Set("Authorization", "Bearer "+testAuthToken)
}
