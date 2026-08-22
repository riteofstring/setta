package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/coordinator"
)

func TestHandlerExposesOnlyTheExactV2ProjectRoute(t *testing.T) {
	handler := newHandlerForTest(t, &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()})

	for _, test := range []struct {
		name       string
		method     string
		target     string
		wantStatus int
		wantCode   contracts.APIErrorCodeV2
	}{
		{"V2 project", http.MethodGet, contracts.ProjectPathV2, http.StatusOK, ""},
		{"retired project absent", http.MethodGet, retiredProjectPath(), http.StatusNotFound, contracts.APIErrorCodeNotFoundV2},
		{"trailing slash absent", http.MethodGet, contracts.ProjectPathV2 + "/", http.StatusNotFound, contracts.APIErrorCodeNotFoundV2},
		{"wrong method", http.MethodPost, contracts.ProjectPathV2, http.StatusMethodNotAllowed, contracts.APIErrorCodeMethodNotAllowedV2},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(test.method, test.target, nil))
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body = %s", response.Code, test.wantStatus, response.Body.String())
			}
			if test.wantCode == "" {
				var snapshot contracts.ProjectSnapshotV2
				if err := json.Unmarshal(response.Body.Bytes(), &snapshot); err != nil {
					t.Fatalf("decode V2 snapshot: %v", err)
				}
				if err := snapshot.Validate(); err != nil {
					t.Fatalf("V2 project response is invalid: %v", err)
				}
				return
			}
			assertErrorCode(t, response, test.wantCode)
		})
	}
}

func TestHandlerForwardsRevisionBoundProjectAndParameterMutations(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	var renamed contracts.RenameProjectRequestV2
	var parameterCallableID string
	var parameters contracts.SetCallableParametersRequestV2
	service.renameProject = func(_ context.Context, request contracts.RenameProjectRequestV2) (contracts.ProjectSnapshotV2, error) {
		renamed = request
		return service.snapshot, nil
	}
	service.setParameters = func(_ context.Context, callableID string, request contracts.SetCallableParametersRequestV2) (contracts.ProjectSnapshotV2, error) {
		parameterCallableID = callableID
		parameters = request
		return service.snapshot, nil
	}
	handler := newHandlerForTest(t, service)

	renameResponse := postJSON(
		handler,
		contracts.ProjectRenamePathV2,
		`{"projectId":"project:fixture","expectedRevision":1,"name":"Renamed project"}`,
	)
	if renameResponse.Code != http.StatusOK {
		t.Fatalf("rename status = %d; body = %s", renameResponse.Code, renameResponse.Body.String())
	}
	if renamed != (contracts.RenameProjectRequestV2{ProjectID: "project:fixture", ExpectedRevision: 1, Name: "Renamed project"}) {
		t.Fatalf("rename request = %#v", renamed)
	}

	callableID := "callable:dynamic"
	parametersResponse := postJSON(
		handler,
		contracts.ProjectCallablesPathV2+"/"+callableID+"/parameters",
		`{"projectId":"project:fixture","expectedRevision":1,"parameters":[{"id":"parameter:client","name":"scale","authoredExpression":"2"}]}`,
	)
	if parametersResponse.Code != http.StatusOK {
		t.Fatalf("parameter status = %d; body = %s", parametersResponse.Code, parametersResponse.Body.String())
	}
	if parameterCallableID != callableID {
		t.Fatalf("callable ID = %q, want %q", parameterCallableID, callableID)
	}
	if parameters.ProjectID != "project:fixture" || parameters.ExpectedRevision != 1 || len(parameters.Parameters) != 1 {
		t.Fatalf("parameter request = %#v", parameters)
	}
	if parameter := parameters.Parameters[0]; parameter != (contracts.ParameterProposalV2{ID: "parameter:client", Name: "scale", AuthoredExpression: "2"}) {
		t.Fatalf("parameter proposal = %#v", parameter)
	}

	invalid := postJSON(
		handler,
		contracts.ProjectCallablesPathV2+"/"+callableID+"/parameters",
		`{"projectId":"project:fixture","expectedRevision":1,"parameters":[],"legacy":true}`,
	)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("unknown request field status = %d; body = %s", invalid.Code, invalid.Body.String())
	}
	assertErrorCode(t, invalid, contracts.APIErrorCodeInvalidRequestV2)
}

func TestHandlerRoundTripsEncodedSlashInCallableID(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	var receivedCallableID string
	service.setParameters = func(_ context.Context, callableID string, _ contracts.SetCallableParametersRequestV2) (contracts.ProjectSnapshotV2, error) {
		receivedCallableID = callableID
		return service.snapshot, nil
	}
	handler := newHandlerForTest(t, service)

	response := postJSON(
		handler,
		contracts.ProjectCallablesPathV2+"/callable%3Aone%2Ftwo/parameters",
		`{"projectId":"project:fixture","expectedRevision":1,"parameters":[]}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", response.Code, response.Body.String())
	}
	if receivedCallableID != "callable:one/two" {
		t.Fatalf("callable ID = %q, want %q", receivedCallableID, "callable:one/two")
	}
}

func TestHandlerRejectsURLDecodedNULCallableIDsBeforeDispatch(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	called := false
	service.setParameters = func(context.Context, string, contracts.SetCallableParametersRequestV2) (contracts.ProjectSnapshotV2, error) {
		called = true
		return service.snapshot, nil
	}
	handler := newHandlerForTest(t, service)

	response := postJSON(
		handler,
		contracts.ProjectCallablesPathV2+"/callable%00dynamic/parameters",
		`{"projectId":"project:fixture","expectedRevision":1,"parameters":[]}`,
	)
	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body = %s", response.Code, http.StatusNotFound, response.Body.String())
	}
	assertErrorCode(t, response, contracts.APIErrorCodeNotFoundV2)
	if called {
		t.Fatal("SetCallableParameters() was called for a malformed route ID")
	}
}

func TestHandlerClassifiesMalformedProviderSignaturesAsProviderFailures(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	service.commitCallable = func(context.Context, string, contracts.CommitCallableRequestV2) (contracts.ProjectSnapshotV2, error) {
		return contracts.ProjectSnapshotV2{}, errors.Join(
			coordinator.ErrProviderFailed,
			aggregate.ErrProviderSignatureInvalid,
			aggregate.ErrValidation,
		)
	}
	handler := newHandlerForTest(t, service)

	response := postJSON(
		handler,
		contracts.ProjectCallablesPathV2+"/callable:dynamic/commit",
		`{"projectId":"project:fixture","expectedRevision":1,"authoredExpression":"fixture.dynamic"}`,
	)
	if response.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d; body = %s", response.Code, http.StatusBadGateway, response.Body.String())
	}
	assertErrorCode(t, response, contracts.APIErrorCodeProviderFailedV2)
}

func TestHandlerReturnsAClosedTypedRevisionConflict(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	service.snapshot.Project.Revision = 4
	service.renameProject = func(context.Context, contracts.RenameProjectRequestV2) (contracts.ProjectSnapshotV2, error) {
		return contracts.ProjectSnapshotV2{}, aggregate.ErrRevisionConflict
	}
	handler := newHandlerForTest(t, service)

	response := postJSON(
		handler,
		contracts.ProjectRenamePathV2,
		`{"projectId":"project:fixture","expectedRevision":3,"name":"Renamed project"}`,
	)
	if response.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d; body = %s", response.Code, http.StatusConflict, response.Body.String())
	}
	var payload contracts.ErrorResponseV2
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode conflict response: %v", err)
	}
	if payload.Error.Code != contracts.APIErrorCodeRevisionConflictV2 || payload.Error.ExpectedRevision == nil || payload.Error.CurrentRevision == nil || *payload.Error.ExpectedRevision != 3 || *payload.Error.CurrentRevision != 4 {
		t.Fatalf("revision conflict response = %#v", payload)
	}
}

func postJSON(handler http.Handler, target string, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, target, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func retiredProjectPath() string {
	return "/api/" + "v" + "1/project"
}

func newHandlerForTest(t *testing.T, service ProjectService) http.Handler {
	t.Helper()
	handler, err := NewHandler(service)
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}
	return handler
}

func assertErrorCode(t *testing.T, response *httptest.ResponseRecorder, want contracts.APIErrorCodeV2) {
	t.Helper()
	var payload contracts.ErrorResponseV2
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if payload.Error.Code != want {
		t.Fatalf("error code = %q, want %q", payload.Error.Code, want)
	}
}

type stubProjectService struct {
	snapshot contracts.ProjectSnapshotV2

	renameProject  func(context.Context, contracts.RenameProjectRequestV2) (contracts.ProjectSnapshotV2, error)
	commitCallable func(context.Context, string, contracts.CommitCallableRequestV2) (contracts.ProjectSnapshotV2, error)
	setParameters  func(context.Context, string, contracts.SetCallableParametersRequestV2) (contracts.ProjectSnapshotV2, error)
}

func (service *stubProjectService) Snapshot() contracts.ProjectSnapshotV2 { return service.snapshot }

func (service *stubProjectService) RenameProject(ctx context.Context, request contracts.RenameProjectRequestV2) (contracts.ProjectSnapshotV2, error) {
	if service.renameProject == nil {
		return service.snapshot, nil
	}
	return service.renameProject(ctx, request)
}

func (service *stubProjectService) CreateCallable(context.Context, contracts.CreateCallableRequestV2) (contracts.ProjectSnapshotV2, error) {
	return service.snapshot, nil
}

func (service *stubProjectService) RenameCallable(context.Context, string, contracts.RenameCallableRequestV2) (contracts.ProjectSnapshotV2, error) {
	return service.snapshot, nil
}

func (service *stubProjectService) DeleteCallable(context.Context, string, contracts.DeleteCallableRequestV2) (contracts.ProjectSnapshotV2, error) {
	return service.snapshot, nil
}

func (service *stubProjectService) CommitCallable(ctx context.Context, callableID string, request contracts.CommitCallableRequestV2) (contracts.ProjectSnapshotV2, error) {
	if service.commitCallable == nil {
		return service.snapshot, nil
	}
	return service.commitCallable(ctx, callableID, request)
}

func (service *stubProjectService) SetCallableParameters(ctx context.Context, callableID string, request contracts.SetCallableParametersRequestV2) (contracts.ProjectSnapshotV2, error) {
	if service.setParameters == nil {
		return service.snapshot, nil
	}
	return service.setParameters(ctx, callableID, request)
}

func (service *stubProjectService) SetPythonTarget(context.Context, contracts.SetPythonTargetRequestV2) (contracts.ProjectSnapshotV2, error) {
	return service.snapshot, nil
}

func (service *stubProjectService) CompleteCallable(context.Context, string, contracts.CallableCompletionRequestV2) ([]contracts.CompletionItemV2, error) {
	return nil, errors.New("completion is not expected in this test")
}

func (service *stubProjectService) CompletePythonTarget(context.Context, contracts.PythonTargetCompletionRequestV2) ([]contracts.CompletionItemV2, error) {
	return nil, errors.New("completion is not expected in this test")
}
