package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEndpointRejectsOversizedOrdinaryJSONBeforeHandler(t *testing.T) {
	handler := NewHandler(HandlerConfig{Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	body := `{"id":"` + strings.Repeat("x", int(defaultRequestBodyLimitBytes)+1) + `"}`

	errResponse := postRaw[ErrorResponse](t, handler, "/workspaces/select", body, http.StatusRequestEntityTooLarge)

	if errResponse.Error.Code != "request_body_too_large" {
		t.Fatalf("error code = %q, want request_body_too_large", errResponse.Error.Code)
	}
	if !strings.Contains(errResponse.Error.Message, "request body exceeds") {
		t.Fatalf("error message = %q, want request body limit", errResponse.Error.Message)
	}
}

func TestEndpointRejectsOversizedStreamedJSONDuringDecode(t *testing.T) {
	handler := newWorkspaceHandler(t, nil, nil)
	body := `{"id":"` + strings.Repeat("x", int(defaultRequestBodyLimitBytes)+1) + `"}`
	request := httptest.NewRequest(http.MethodPost, "/workspaces/select", bytes.NewBufferString(body))
	request.ContentLength = -1
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d, body: %s", response.Code, http.StatusRequestEntityTooLarge, response.Body.String())
	}
	var errResponse ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&errResponse); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if errResponse.Error.Code != "request_body_too_large" {
		t.Fatalf("error code = %q, want request_body_too_large", errResponse.Error.Code)
	}
}
