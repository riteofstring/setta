package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/setta/bench/backend/internal/contracts"
	"github.com/setta/bench/backend/internal/coordinator"
	"github.com/setta/bench/backend/internal/project"
	"github.com/setta/bench/backend/internal/runstore"
)

func TestHandlerServesSnapshotAndSessionAndProtectsMutations(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	projects, err := project.Open(root, true)
	if err != nil {
		t.Fatalf("project.Open() = %v", err)
	}
	runs, err := runstore.Open(projects.StateRoot())
	if err != nil {
		t.Fatalf("runstore.Open() = %v", err)
	}
	control, err := coordinator.New(projects, runs)
	if err != nil {
		t.Fatalf("coordinator.New() = %v", err)
	}
	defer control.Close()
	handler, err := New(control, projects.Root(), "session-one", "http://127.0.0.1:4312")
	if err != nil {
		t.Fatalf("New() = %v", err)
	}
	snapshotResponse := httptest.NewRecorder()
	handler.ServeHTTP(snapshotResponse, httptest.NewRequest(http.MethodGet, "/api/v1/snapshot", nil))
	if snapshotResponse.Code != http.StatusOK {
		t.Fatalf("snapshot status = %d, body = %s", snapshotResponse.Code, snapshotResponse.Body.String())
	}
	var snapshot contracts.ApplicationSnapshotV1
	if err := json.Unmarshal(snapshotResponse.Body.Bytes(), &snapshot); err != nil || snapshot.Version != contracts.SnapshotVersion || snapshot.Validation.Ready {
		t.Fatalf("snapshot = %#v, %v", snapshot, err)
	}
	sessionResponse := httptest.NewRecorder()
	handler.ServeHTTP(sessionResponse, httptest.NewRequest(http.MethodGet, "/api/v1/runtime/session", nil))
	var session contracts.RuntimeSessionV1
	if sessionResponse.Code != http.StatusOK || json.Unmarshal(sessionResponse.Body.Bytes(), &session) != nil || session.InstanceNonce != "session-one" || session.ProjectPath != projects.Root() {
		t.Fatalf("session status = %d, body = %s", sessionResponse.Code, sessionResponse.Body.String())
	}
	forbidden := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/v1/project", strings.NewReader(`{}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(forbidden, request)
	if forbidden.Code != http.StatusForbidden {
		t.Fatalf("mutation without origin status = %d", forbidden.Code)
	}
	invalid := httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPut, "/api/v1/project", strings.NewReader(`{"unexpected":true}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://127.0.0.1:4312")
	handler.ServeHTTP(invalid, request)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid mutation status = %d, body = %s", invalid.Code, invalid.Body.String())
	}
}
