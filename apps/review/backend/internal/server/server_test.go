package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/setta/review/backend/internal/contracts"
	"github.com/setta/review/backend/internal/coordinator"
)

type fakeService struct {
	snapshot         contracts.ReviewSnapshot
	applyResult      contracts.MutationResult
	applyError       error
	applied          *contracts.ReviewMutation
	exportResult     contracts.ExportResult
	exportRequested  *bool
	stream           <-chan contracts.ReviewSnapshot
	artifactPath     string
	artifactMetadata contracts.ArtifactEvidenceReference
	artifactOpens    int
}

func (service *fakeService) Snapshot() (contracts.ReviewSnapshot, error) {
	return service.snapshot, nil
}

func (service *fakeService) Apply(mutation contracts.ReviewMutation) (contracts.MutationResult, error) {
	service.applied = &mutation
	return service.applyResult, service.applyError
}

func (service *fakeService) Export(includeContinuations bool) (contracts.ExportResult, error) {
	service.exportRequested = &includeContinuations
	return service.exportResult, nil
}

func (service *fakeService) Subscribe(context.Context) (<-chan contracts.ReviewSnapshot, error) {
	return service.stream, nil
}

func (service *fakeService) OpenArtifact(string, string) (*os.File, contracts.ArtifactEvidenceReference, error) {
	service.artifactOpens++
	file, err := os.Open(service.artifactPath)
	if err != nil {
		return nil, contracts.ArtifactEvidenceReference{}, err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, contracts.ArtifactEvidenceReference{}, err
	}
	metadata := service.artifactMetadata
	if metadata.Path == "" {
		metadata.Path = filepath.Base(service.artifactPath)
	}
	if metadata.MediaType == "" {
		metadata.MediaType = "image/png"
	}
	if metadata.SHA256 == "" {
		metadata.SHA256 = strings.Repeat("0", 64)
	}
	metadata.ByteLength = info.Size()
	return file, metadata, nil
}

func TestHandlerServesSnapshotAndExactIdentity(t *testing.T) {
	service := &fakeService{snapshot: contracts.ReviewSnapshot{Version: 1, Revision: 7}}
	handler := newTestHandler(t, service)

	snapshotResponse := request(t, handler, http.MethodGet, "/api/v1/review", nil, "")
	if snapshotResponse.Code != http.StatusOK || snapshotResponse.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("snapshot response = %d, %#v", snapshotResponse.Code, snapshotResponse.Header())
	}
	var snapshot contracts.ReviewSnapshot
	if err := json.Unmarshal(snapshotResponse.Body.Bytes(), &snapshot); err != nil || snapshot.Revision != 7 {
		t.Fatalf("snapshot = %#v, %v", snapshot, err)
	}

	identityResponse := request(t, handler, http.MethodGet, "/api/v2/runtime/session", nil, "")
	var identity map[string]string
	if err := json.Unmarshal(identityResponse.Body.Bytes(), &identity); err != nil {
		t.Fatalf("identity decode error = %v", err)
	}
	if len(identity) != 4 || identity["schemaVersion"] != "review-session/v1" || identity["appId"] != "review" || identity["instanceNonce"] != "nonce" {
		t.Fatalf("identity = %#v", identity)
	}
}

func TestHandlerRequiresExactOriginAndValidMutation(t *testing.T) {
	service := &fakeService{applyResult: contracts.MutationResult{Version: 1}}
	handler := newTestHandler(t, service)
	mutation := contracts.ReviewMutation{
		ProjectID: "project", ExpectedRevision: 3,
		Operations: []json.RawMessage{json.RawMessage(`{"op":"deleteResponse","requestId":"request"}`)},
	}
	body, _ := json.Marshal(mutation)
	forbidden := request(t, handler, http.MethodPost, "/api/v1/review/apply", bytes.NewReader(body), "http://attacker.invalid:4100")
	if forbidden.Code != http.StatusForbidden || service.applied != nil {
		t.Fatalf("forbidden response = %d, applied = %#v", forbidden.Code, service.applied)
	}
	accepted := request(t, handler, http.MethodPost, "/api/v1/review/apply", bytes.NewReader(body), "http://127.0.0.1:4100")
	if accepted.Code != http.StatusOK || service.applied == nil || service.applied.ExpectedRevision != 3 {
		t.Fatalf("accepted response = %d, applied = %#v, body = %s", accepted.Code, service.applied, accepted.Body.String())
	}
}

func TestHandlerMapsRevisionConflictAndExportsContinuations(t *testing.T) {
	service := &fakeService{applyError: coordinator.ErrRevisionConflict, exportResult: contracts.ExportResult{Version: 1}}
	handler := newTestHandler(t, service)
	mutation := contracts.ReviewMutation{
		ProjectID: "project", ExpectedRevision: 3,
		Operations: []json.RawMessage{json.RawMessage(`{"op":"deleteResponse","requestId":"request"}`)},
	}
	body, _ := json.Marshal(mutation)
	conflict := request(t, handler, http.MethodPost, "/api/v1/review/apply", bytes.NewReader(body), "http://127.0.0.1:4100")
	if conflict.Code != http.StatusConflict || !strings.Contains(conflict.Body.String(), "revision_conflict") {
		t.Fatalf("conflict response = %d, %s", conflict.Code, conflict.Body.String())
	}
	exported := request(t, handler, http.MethodPost, "/api/v1/review/export?continuations=true", nil, "http://127.0.0.1:4100")
	if exported.Code != http.StatusOK || service.exportRequested == nil || !*service.exportRequested {
		t.Fatalf("export response = %d, requested = %v", exported.Code, service.exportRequested)
	}
}

func TestHandlerStreamsSnapshots(t *testing.T) {
	stream := make(chan contracts.ReviewSnapshot, 1)
	stream <- contracts.ReviewSnapshot{Version: 1, Revision: 9}
	close(stream)
	service := &fakeService{stream: stream}
	handler := newTestHandler(t, service)

	events := request(t, handler, http.MethodGet, "/api/v1/review/events", nil, "")
	if events.Code != http.StatusOK || events.Header().Get("Content-Type") != "text/event-stream" || !strings.Contains(events.Body.String(), `"revision":9`) {
		t.Fatalf("events response = %d, %#v, %s", events.Code, events.Header(), events.Body.String())
	}
}

func TestHandlerServesSafeArtifactPreview(t *testing.T) {
	service := artifactService(t, "candidate.png", "image/png", "image-bytes")
	handler := newTestHandler(t, service)

	response := request(t, handler, http.MethodGet, "/api/v1/evidence/request/candidate", nil, "")
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "image/png" || response.Body.String() != "image-bytes" {
		t.Fatalf("artifact response = %d, %#v, %q", response.Code, response.Header(), response.Body.String())
	}
	if disposition := response.Header().Get("Content-Disposition"); !strings.HasPrefix(disposition, "inline;") || !strings.Contains(disposition, "candidate.png") {
		t.Fatalf("Content-Disposition = %q", disposition)
	}
}

func TestHandlerContainsScriptedSVGPreview(t *testing.T) {
	payload := `<svg xmlns="http://www.w3.org/2000/svg"><script>fetch('/api/v1/review')</script></svg>`
	service := artifactService(t, "candidate.svg", "image/svg+xml", payload)
	handler := newTestHandler(t, service)

	response := request(t, handler, http.MethodGet, "/api/v1/evidence/request/candidate", nil, "")
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "image/svg+xml" || response.Body.String() != payload {
		t.Fatalf("artifact response = %d, %#v, %q", response.Code, response.Header(), response.Body.String())
	}
	csp := response.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "default-src 'none'") || !strings.Contains(csp, "sandbox") || !strings.Contains(csp, "base-uri 'none'") {
		t.Fatalf("Content-Security-Policy = %q", csp)
	}
	for name, want := range map[string]string{
		"Cross-Origin-Opener-Policy":   "same-origin",
		"Cross-Origin-Resource-Policy": "same-origin",
		"Referrer-Policy":              "no-referrer",
		"X-Frame-Options":              "SAMEORIGIN",
	} {
		if got := response.Header().Get(name); got != want {
			t.Fatalf("%s = %q, want %q", name, got, want)
		}
	}
}

func TestHandlerRejectsActiveInlineArtifactAndAllowsDownload(t *testing.T) {
	payload := `<script>fetch('/api/v1/review')</script>`
	service := artifactService(t, "candidate.html", "text/html", payload)
	handler := newTestHandler(t, service)

	preview := request(t, handler, http.MethodGet, "/api/v1/evidence/request/candidate", nil, "")
	if preview.Code != http.StatusUnsupportedMediaType || !strings.Contains(preview.Body.String(), "unsupported_media_type") {
		t.Fatalf("preview response = %d, %#v, %q", preview.Code, preview.Header(), preview.Body.String())
	}
	download := request(t, handler, http.MethodGet, "/api/v1/evidence/request/candidate?download=1", nil, "")
	if download.Code != http.StatusOK || download.Header().Get("Content-Type") != "text/html" || download.Body.String() != payload {
		t.Fatalf("download response = %d, %#v, %q", download.Code, download.Header(), download.Body.String())
	}
	if disposition := download.Header().Get("Content-Disposition"); !strings.HasPrefix(disposition, "attachment;") || !strings.Contains(disposition, "candidate.html") {
		t.Fatalf("Content-Disposition = %q", disposition)
	}
}

func TestHandlerRejectsInvalidArtifactQueries(t *testing.T) {
	service := artifactService(t, "candidate.png", "image/png", "image-bytes")
	handler := newTestHandler(t, service)
	targets := []string{
		"/api/v1/evidence/request/candidate?download=",
		"/api/v1/evidence/request/candidate?download=0",
		"/api/v1/evidence/request/candidate?download=1&download=1",
		"/api/v1/evidence/request/candidate?download=1&preview=1",
		"/api/v1/evidence/request/candidate?download=1;preview=1",
		"/api/v1/evidence/request/candidate?preview=1",
	}

	for _, target := range targets {
		response := request(t, handler, http.MethodGet, target, nil, "")
		if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "invalid_request") {
			t.Fatalf("%s response = %d, %#v, %q", target, response.Code, response.Header(), response.Body.String())
		}
	}
	if service.artifactOpens != 0 {
		t.Fatalf("artifact opens = %d", service.artifactOpens)
	}
}

func TestHandlerRejectsMalformedJSONAndMethods(t *testing.T) {
	service := &fakeService{}
	handler := newTestHandler(t, service)
	malformed := request(t, handler, http.MethodPost, "/api/v1/review/apply", strings.NewReader(`{"projectId":`), "http://127.0.0.1:4100")
	if malformed.Code != http.StatusBadRequest || service.applied != nil {
		t.Fatalf("malformed response = %d, applied = %#v", malformed.Code, service.applied)
	}
	method := request(t, handler, http.MethodDelete, "/api/v1/review", nil, "")
	if method.Code != http.StatusMethodNotAllowed || method.Header().Get("Allow") != "GET" {
		t.Fatalf("method response = %d, %#v", method.Code, method.Header())
	}
}

func artifactService(t *testing.T, name string, mediaType string, content string) *fakeService {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	return &fakeService{
		artifactPath: path,
		artifactMetadata: contracts.ArtifactEvidenceReference{
			Path:      name,
			MediaType: mediaType,
		},
	}
}

func newTestHandler(t *testing.T, service Service) *Handler {
	t.Helper()
	handler, err := New(service, t.TempDir(), "nonce", "http://127.0.0.1:4100")
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	return handler
}

func request(t *testing.T, handler http.Handler, method string, target string, body io.Reader, origin string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(method, target, body)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if origin != "" {
		request.Header.Set("Origin", origin)
	}
	handler.ServeHTTP(recorder, request)
	return recorder
}

var _ Service = (*fakeService)(nil)
