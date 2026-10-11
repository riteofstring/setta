package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/contracts"
	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/coordinator"
	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/testsupport"
)

func TestHandlerRejectsReferentiallyInvalidSelectionAsBadRequest(t *testing.T) {
	fixture, err := testsupport.Write(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	application, err := coordinator.Open(fixture.Root)
	if err != nil {
		t.Fatal(err)
	}
	defer application.Close()
	handler, err := New(application, fixture.Root, "nonce", "http://127.0.0.1:43123")
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := application.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	selection := contracts.EmptySelection()
	selection.SelectedObservationIDs = []string{"missing"}
	mutation := contracts.LensMutation{
		ExperimentID: snapshot.Experiment.ID, ManifestSHA256: snapshot.ManifestSHA256,
		ObservationSourceSHA256: snapshot.ObservationSourceSHA256, ExpectedRevision: snapshot.Revision,
		Selection: selection,
	}
	body, err := json.Marshal(mutation)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:43123/api/v1/experiment-lens/apply", bytes.NewReader(body))
	request.Header.Set("Origin", "http://127.0.0.1:43123")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), `"code":"invalid_request"`) {
		t.Fatalf("unexpected invalid selection response %d %s", response.Code, response.Body.String())
	}
}

func TestHandlerExposesSnapshotExportIdentityArtifactAndSSE(t *testing.T) {
	fixture, err := testsupport.Write(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	application, err := coordinator.Open(fixture.Root)
	if err != nil {
		t.Fatal(err)
	}
	defer application.Close()
	handler, err := New(application, fixture.Root, "nonce", "http://127.0.0.1:43123")
	if err != nil {
		t.Fatal(err)
	}
	for path := range map[string]struct{}{
		"/api/v1/experiment-lens":        {},
		"/api/v1/experiment-lens/export": {},
		"/api/v2/runtime/session":        {},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:43123"+path, nil))
		if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Fatalf("unexpected %s response %d %s", path, response.Code, response.Body.String())
		}
	}
	artifactResponse := httptest.NewRecorder()
	handler.ServeHTTP(artifactResponse, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:43123/api/v1/artifacts/thermal-b", nil))
	if artifactResponse.Code != http.StatusOK || artifactResponse.Header().Get("Content-Type") != "image/svg+xml" || !strings.Contains(artifactResponse.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Fatalf("unexpected artifact response %d %#v", artifactResponse.Code, artifactResponse.Header())
	}
	snapshot, err := application.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	stub := &streamService{snapshot: snapshot}
	streamHandler, err := New(stub, fixture.Root, "nonce", "http://127.0.0.1:43123")
	if err != nil {
		t.Fatal(err)
	}
	streamResponse := httptest.NewRecorder()
	streamHandler.ServeHTTP(streamResponse, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:43123/api/v1/experiment-lens/events", nil))
	if streamResponse.Code != http.StatusOK || !strings.Contains(streamResponse.Body.String(), "event: snapshot\n") {
		t.Fatalf("unexpected stream response %d %s", streamResponse.Code, streamResponse.Body.String())
	}
}

type streamService struct {
	snapshot contracts.LensSnapshot
}

func (service *streamService) Snapshot() (contracts.LensSnapshot, error) {
	return service.snapshot, nil
}

func (service *streamService) Apply(contracts.LensMutation) (contracts.MutationResult, error) {
	return contracts.MutationResult{}, nil
}

func (service *streamService) Export() (contracts.ExportResult, error) {
	return contracts.ExportResult{}, nil
}

func (service *streamService) Subscribe(_ context.Context) (<-chan contracts.LensSnapshot, error) {
	stream := make(chan contracts.LensSnapshot, 1)
	stream <- service.snapshot
	close(stream)
	return stream, nil
}

func (service *streamService) OpenArtifact(string) (*os.File, contracts.ArtifactReference, error) {
	return nil, contracts.ArtifactReference{}, errors.New("unused")
}
