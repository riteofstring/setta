package artifacthttp

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDownloadRequestedAcceptsOnlyClosedQuery(t *testing.T) {
	tests := []struct {
		raw      string
		download bool
		valid    bool
	}{
		{"", false, true},
		{"download=1", true, true},
		{"download=", false, false},
		{"download=0", false, false},
		{"download=1&download=1", false, false},
		{"download=1&preview=1", false, false},
		{"download=1;preview=1", false, false},
		{"preview=1", false, false},
	}
	for _, test := range tests {
		download, valid := DownloadRequested(test.raw)
		if download != test.download || valid != test.valid {
			t.Fatalf("DownloadRequested(%q) = %t, %t; want %t, %t", test.raw, download, valid, test.download, test.valid)
		}
	}
}

func TestInlineMediaTypeUsesPassiveAllowlist(t *testing.T) {
	for _, mediaType := range []string{"audio/mpeg", "image/png", "image/svg+xml", "video/mp4"} {
		if !InlineMediaType(mediaType) {
			t.Fatalf("InlineMediaType(%q) = false", mediaType)
		}
	}
	for _, mediaType := range []string{"application/javascript", "application/pdf", "text/html", "text/plain", "image/png; charset=utf-8"} {
		if InlineMediaType(mediaType) {
			t.Fatalf("InlineMediaType(%q) = true", mediaType)
		}
	}
}

func TestServeAppliesPreviewAndDownloadBoundaries(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "candidate.svg")
	payload := `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		t.Fatal(err)
	}
	metadata := Metadata{Path: "nested/candidate.svg", MediaType: "image/svg+xml", ByteLength: int64(len(payload))}

	preview := serveFile(t, path, metadata, false)
	if preview.Code != http.StatusOK || preview.Body.String() != payload {
		t.Fatalf("preview = %d, %q", preview.Code, preview.Body.String())
	}
	if got := preview.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "inline;") || !strings.Contains(got, "candidate.svg") {
		t.Fatalf("preview Content-Disposition = %q", got)
	}
	for name, want := range map[string]string{
		"Content-Type":                 "image/svg+xml",
		"Cross-Origin-Opener-Policy":   "same-origin",
		"Cross-Origin-Resource-Policy": "same-origin",
		"Referrer-Policy":              "no-referrer",
		"X-Frame-Options":              "SAMEORIGIN",
	} {
		if got := preview.Header().Get(name); got != want {
			t.Fatalf("preview %s = %q, want %q", name, got, want)
		}
	}
	if got := preview.Header().Get("Content-Security-Policy"); !strings.Contains(got, "default-src 'none'") || !strings.Contains(got, "sandbox") {
		t.Fatalf("preview Content-Security-Policy = %q", got)
	}

	download := serveFile(t, path, metadata, true)
	if got := download.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "attachment;") {
		t.Fatalf("download Content-Disposition = %q", got)
	}
	if got := download.Header().Get("Content-Security-Policy"); got != "" {
		t.Fatalf("download Content-Security-Policy = %q", got)
	}
}

func serveFile(t *testing.T, path string, metadata Metadata, download bool) *httptest.ResponseRecorder {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1/artifact", nil)
	if err := Serve(response, request, file, metadata, download); err != nil {
		t.Fatal(err)
	}
	return response
}
