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
	snapshot        contracts.ReviewSnapshot
	applyResult     contracts.MutationResult
	applyError      error
	applied         *contracts.ReviewMutation
	exportResult    contracts.ExportResult
	exportRequested *bool
	stream          <-chan contracts.ReviewSnapshot
	artifactPath    string
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
	file, err := os.Open(service.artifactPath)
	if err != nil {
		return nil, contracts.ArtifactEvidenceReference{}, err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, contracts.ArtifactEvidenceReference{}, err
	}
	return file, contracts.ArtifactEvidenceReference{Path: "candidate.png", MediaType: "image/png", ByteLength: info.Size(), SHA256: strings.Repeat("0", 64)}, nil
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

func TestHandlerStreamsSnapshotsAndServesArtifacts(t *testing.T) {
	stream := make(chan contracts.ReviewSnapshot, 1)
	stream <- contracts.ReviewSnapshot{Version: 1, Revision: 9}
	close(stream)
	artifact := filepath.Join(t.TempDir(), "candidate.png")
	if err := os.WriteFile(artifact, []byte("image-bytes"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	service := &fakeService{stream: stream, artifactPath: artifact}
	handler := newTestHandler(t, service)

	events := request(t, handler, http.MethodGet, "/api/v1/review/events", nil, "")
	if events.Code != http.StatusOK || events.Header().Get("Content-Type") != "text/event-stream" || !strings.Contains(events.Body.String(), `"revision":9`) {
		t.Fatalf("events response = %d, %#v, %s", events.Code, events.Header(), events.Body.String())
	}
	artifactResponse := request(t, handler, http.MethodGet, "/api/v1/evidence/request/candidate", nil, "")
	if artifactResponse.Code != http.StatusOK || artifactResponse.Header().Get("Content-Type") != "image/png" || artifactResponse.Body.String() != "image-bytes" {
		t.Fatalf("artifact response = %d, %#v, %q", artifactResponse.Code, artifactResponse.Header(), artifactResponse.Body.String())
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
