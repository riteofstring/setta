package webapp

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestManifestServedWithManifestContentType(t *testing.T) {
	handler := NewHandler(http.NotFoundHandler())
	request := httptest.NewRequest(http.MethodGet, "/manifest.webmanifest", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("manifest status = %d, want %d", response.Code, http.StatusOK)
	}
	contentType := response.Header().Get("Content-Type")
	if !strings.HasPrefix(contentType, "application/manifest+json") {
		t.Fatalf("manifest content type = %q, want application/manifest+json", contentType)
	}
}
