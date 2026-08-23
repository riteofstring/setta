package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/runner"
)

func TestRunRouteCapturesTheExactRevisionAndPublishesCompletedPythonFailure(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	var capturedProjectID string
	var capturedRevision int
	service.captureGeneratedProgram = func(_ context.Context, projectID string, expectedRevision int) (GeneratedProgram, error) {
		capturedProjectID = projectID
		capturedRevision = expectedRevision
		return GeneratedProgram{ProjectID: projectID, Revision: expectedRevision, Code: "print('captured exact revision')\n"}, nil
	}
	zero := 7
	runtime := newGeneratedProgramRuntimeStub()
	runtime.run = func(_ context.Context, program runner.Program, request runner.Request) (runner.Result, error) {
		if program.Code != "print('captured exact revision')\n" {
			t.Errorf("runner program = %#v", program)
		}
		if request.Timeout != 125*time.Millisecond {
			t.Errorf("runner timeout = %s, want 125ms", request.Timeout)
		}
		return runner.Result{
			ProjectID:   program.ProjectID,
			Revision:    program.Revision,
			Stdout:      "out\n",
			Stderr:      "err\n",
			ExitCode:    &zero,
			Termination: runner.TerminationExited,
			Elapsed:     23 * time.Millisecond,
		}, nil
	}
	handler := newHandlerWithRunRuntimeForTest(t, service, runtime)

	response := postJSON(handler, contracts.ProjectRunPathV2, `{"projectId":"project:fixture","expectedRevision":1,"runTimeoutMilliseconds":125}`)
	if response.Code != http.StatusOK {
		t.Fatalf("run status = %d; body = %s", response.Code, response.Body.String())
	}
	if capturedProjectID != "project:fixture" || capturedRevision != 1 {
		t.Fatalf("capture = project %q revision %d", capturedProjectID, capturedRevision)
	}
	var result contracts.GeneratedProgramRunResultV2
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode run response: %v", err)
	}
	if err := result.Validate(); err != nil {
		t.Fatalf("run result contract: %v", err)
	}
	if result.ExitCode == nil || *result.ExitCode != 7 || result.Stdout != "out\n" || result.Stderr != "err\n" || result.ElapsedMillis != 23 {
		t.Fatalf("run result = %#v", result)
	}
	if calls := runtime.calls(); len(calls) != 1 || calls[0].program.ProjectID != "project:fixture" || calls[0].program.Revision != 1 {
		t.Fatalf("runner calls = %#v", calls)
	}
}

func TestRunRouteUsesTheRunnerDefaultWhenTimeoutIsOmitted(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	runtime := newGeneratedProgramRuntimeStub()
	runtime.run = func(_ context.Context, program runner.Program, request runner.Request) (runner.Result, error) {
		if request.Timeout != 0 {
			t.Errorf("runner request timeout = %s, want zero for the startup-owned default", request.Timeout)
		}
		zero := 0
		return runner.Result{ProjectID: program.ProjectID, Revision: program.Revision, ExitCode: &zero, Termination: runner.TerminationExited}, nil
	}
	handler := newHandlerWithRunRuntimeForTest(t, service, runtime)

	response := postJSON(handler, contracts.ProjectRunPathV2, `{"projectId":"project:fixture","expectedRevision":1}`)
	if response.Code != http.StatusOK {
		t.Fatalf("run status = %d; body = %s", response.Code, response.Body.String())
	}
}

func TestRunRouteCancelsExecutionWhenRequestOrServiceLifecycleEnds(t *testing.T) {
	for _, source := range []string{"request", "service lifecycle"} {
		t.Run(source, func(t *testing.T) {
			lifecycle, cancelLifecycle := context.WithCancel(context.Background())
			defer cancelLifecycle()
			requestContext, cancelRequest := context.WithCancel(context.Background())
			defer cancelRequest()
			runtime := newGeneratedProgramRuntimeStub()
			runStarted := make(chan struct{})
			runtime.run = func(ctx context.Context, _ runner.Program, _ runner.Request) (runner.Result, error) {
				close(runStarted)
				<-ctx.Done()
				return runner.Result{}, ctx.Err()
			}
			handler := newHandlerWithRunRuntimeAndLifecycleForTest(t, &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}, runtime, lifecycle)
			request := httptest.NewRequest(http.MethodPost, contracts.ProjectRunPathV2, strings.NewReader(`{"projectId":"project:fixture","expectedRevision":1}`)).WithContext(requestContext)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			completed := make(chan struct{})
			go func() {
				handler.ServeHTTP(response, request)
				close(completed)
			}()
			select {
			case <-runStarted:
			case <-time.After(time.Second):
				t.Fatal("runner did not start")
			}
			if source == "request" {
				cancelRequest()
			} else {
				cancelLifecycle()
			}
			select {
			case <-completed:
			case <-time.After(time.Second):
				t.Fatal("run request did not finish after cancellation")
			}
			if source == "service lifecycle" && requestContext.Err() != nil {
				t.Fatal("service lifecycle cancellation propagated into the request context")
			}
			if response.Code != http.StatusServiceUnavailable {
				t.Fatalf("run status = %d; body = %s", response.Code, response.Body.String())
			}
			assertErrorCode(t, response, contracts.APIErrorCodeRunnerUnavailableV2)
		})
	}
}

func TestRunRouteRejectsInvalidTimeoutsBeforeCapture(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	captures := 0
	service.captureGeneratedProgram = func(context.Context, string, int) (GeneratedProgram, error) {
		captures++
		return GeneratedProgram{}, nil
	}
	runtime := newGeneratedProgramRuntimeStub()
	handler := newHandlerWithRunRuntimeForTest(t, service, runtime)

	for _, body := range []string{
		`{"projectId":"project:fixture","expectedRevision":1,"runTimeoutMilliseconds":0}`,
		`{"projectId":"project:fixture","expectedRevision":1,"runTimeoutMilliseconds":300001}`,
		`{"projectId":"project:fixture","expectedRevision":1,"unexpected":true}`,
	} {
		response := postJSON(handler, contracts.ProjectRunPathV2, body)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("run status = %d for %s; body = %s", response.Code, body, response.Body.String())
		}
		assertErrorCode(t, response, contracts.APIErrorCodeInvalidRequestV2)
	}
	if captures != 0 || len(runtime.calls()) != 0 {
		t.Fatalf("invalid request crossed execution boundary: captures %d runs %#v", captures, runtime.calls())
	}
}

func TestRunRouteDoesNotRunOnRevisionConflict(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	service.captureGeneratedProgram = func(context.Context, string, int) (GeneratedProgram, error) {
		return GeneratedProgram{}, aggregate.ErrRevisionConflict
	}
	runtime := newGeneratedProgramRuntimeStub()
	handler := newHandlerWithRunRuntimeForTest(t, service, runtime)

	response := postJSON(handler, contracts.ProjectRunPathV2, `{"projectId":"project:fixture","expectedRevision":1}`)
	if response.Code != http.StatusConflict {
		t.Fatalf("run status = %d; body = %s", response.Code, response.Body.String())
	}
	assertErrorCode(t, response, contracts.APIErrorCodeRevisionConflictV2)
	if len(runtime.calls()) != 0 {
		t.Fatalf("runner executed after revision conflict: %#v", runtime.calls())
	}
}

func TestRunRouteRejectsInvalidRunnerResults(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	runtime := newGeneratedProgramRuntimeStub()
	runtime.run = func(_ context.Context, program runner.Program, _ runner.Request) (runner.Result, error) {
		zero := 0
		return runner.Result{ProjectID: program.ProjectID, Revision: program.Revision + 1, ExitCode: &zero, Termination: runner.TerminationExited}, nil
	}
	handler := newHandlerWithRunRuntimeForTest(t, service, runtime)

	response := postJSON(handler, contracts.ProjectRunPathV2, `{"projectId":"project:fixture","expectedRevision":1}`)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("run status = %d; body = %s", response.Code, response.Body.String())
	}
	assertErrorCode(t, response, contracts.APIErrorCodeRunnerFailedV2)
}

func TestRunRouteRejectsWrongMethodAndQuery(t *testing.T) {
	handler := newHandlerWithRunRuntimeForTest(t, &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}, newGeneratedProgramRuntimeStub())

	method := httptest.NewRecorder()
	handler.ServeHTTP(method, httptest.NewRequest(http.MethodGet, contracts.ProjectRunPathV2, nil))
	if method.Code != http.StatusMethodNotAllowed || method.Header().Get("Allow") != http.MethodPost {
		t.Fatalf("method response = %d allow %q body %s", method.Code, method.Header().Get("Allow"), method.Body.String())
	}
	assertErrorCode(t, method, contracts.APIErrorCodeMethodNotAllowedV2)

	query := postJSON(handler, contracts.ProjectRunPathV2+"?ignored=true", `{"projectId":"project:fixture","expectedRevision":1}`)
	if query.Code != http.StatusBadRequest {
		t.Fatalf("query response = %d; body = %s", query.Code, query.Body.String())
	}
	assertErrorCode(t, query, contracts.APIErrorCodeInvalidRequestV2)
}

func TestNewHandlerRequiresRunnerAndRuntimeSessionIdentity(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	base := HandlerOptions{Terminal: newTerminalRuntimeStub(), AppOrigin: "http://127.0.0.1:5173"}
	if _, err := NewHandler(service, base); !errors.Is(err, ErrRunnerRequired) {
		t.Fatalf("missing runner error = %v", err)
	}
	base.Runner = newGeneratedProgramRuntimeStub()
	if _, err := NewHandler(service, base); !errors.Is(err, ErrRuntimeSessionIdentityRequired) {
		t.Fatalf("missing runtime identity error = %v", err)
	}
	base.RuntimeSession = contracts.RuntimeSessionIdentityV2{SchemaVersion: contracts.RuntimeSessionSchemaVersionV1, AppID: contracts.RuntimeSessionAppIDV1, ProjectPath: "relative", InstanceNonce: "nonce-with-enough-length"}
	if _, err := NewHandler(service, base); err == nil {
		t.Fatal("NewHandler accepted an invalid runtime identity")
	}
}

func TestRuntimeSessionRouteIsExactAndStrict(t *testing.T) {
	handler := newHandlerWithRunRuntimeForTest(t, &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}, newGeneratedProgramRuntimeStub())
	want := runtimeSessionIdentityForTest()

	get := httptest.NewRecorder()
	handler.ServeHTTP(get, httptest.NewRequest(http.MethodGet, contracts.RuntimeSessionPathV2, nil))
	if get.Code != http.StatusOK {
		t.Fatalf("identity status = %d; body = %s", get.Code, get.Body.String())
	}
	var got contracts.RuntimeSessionIdentityV2
	if err := json.Unmarshal(get.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode identity response: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("identity = %#v, want %#v", got, want)
	}
	if err := got.Validate(); err != nil {
		t.Fatalf("identity contract = %v", err)
	}

	wrongMethod := httptest.NewRecorder()
	handler.ServeHTTP(wrongMethod, httptest.NewRequest(http.MethodPost, contracts.RuntimeSessionPathV2, strings.NewReader(`{}`)))
	if wrongMethod.Code != http.StatusMethodNotAllowed || wrongMethod.Header().Get("Allow") != http.MethodGet {
		t.Fatalf("identity method response = %d allow %q", wrongMethod.Code, wrongMethod.Header().Get("Allow"))
	}
	assertErrorCode(t, wrongMethod, contracts.APIErrorCodeMethodNotAllowedV2)

	query := httptest.NewRecorder()
	handler.ServeHTTP(query, httptest.NewRequest(http.MethodGet, contracts.RuntimeSessionPathV2+"?project=ignored", nil))
	if query.Code != http.StatusBadRequest {
		t.Fatalf("identity query response = %d; body = %s", query.Code, query.Body.String())
	}
	assertErrorCode(t, query, contracts.APIErrorCodeInvalidRequestV2)

	body := httptest.NewRecorder()
	handler.ServeHTTP(body, httptest.NewRequest(http.MethodGet, contracts.RuntimeSessionPathV2, strings.NewReader("unexpected")))
	if body.Code != http.StatusBadRequest {
		t.Fatalf("identity body response = %d; body = %s", body.Code, body.Body.String())
	}
	assertErrorCode(t, body, contracts.APIErrorCodeInvalidRequestV2)
}

func newHandlerWithRunRuntimeForTest(t *testing.T, service ProjectService, runtime runner.Runtime) http.Handler {
	return newHandlerWithRunRuntimeAndLifecycleForTest(t, service, runtime, context.Background())
}

func newHandlerWithRunRuntimeAndLifecycleForTest(t *testing.T, service ProjectService, runtime runner.Runtime, lifecycle context.Context) http.Handler {
	t.Helper()
	handler, err := NewHandler(service, HandlerOptions{
		Terminal:       newTerminalRuntimeStub(),
		Runner:         runtime,
		RuntimeSession: runtimeSessionIdentityForTest(),
		AppOrigin:      "http://127.0.0.1:5173",
		Lifecycle:      lifecycle,
	})
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}
	return handler
}

func runtimeSessionIdentityForTest() contracts.RuntimeSessionIdentityV2 {
	return contracts.RuntimeSessionIdentityV2{
		SchemaVersion: contracts.RuntimeSessionSchemaVersionV1,
		AppID:         contracts.RuntimeSessionAppIDV1,
		ProjectPath:   filepath.Join(os.TempDir(), "setta-python-canvas-project.json"),
		InstanceNonce: "test-runtime-instance-nonce",
	}
}

type generatedProgramRunCall struct {
	program runner.Program
	request runner.Request
}

type generatedProgramRuntimeStub struct {
	mu        sync.Mutex
	run       func(context.Context, runner.Program, runner.Request) (runner.Result, error)
	callsList []generatedProgramRunCall
}

func newGeneratedProgramRuntimeStub() *generatedProgramRuntimeStub {
	return &generatedProgramRuntimeStub{}
}

func (stub *generatedProgramRuntimeStub) Run(ctx context.Context, program runner.Program, request runner.Request) (runner.Result, error) {
	stub.mu.Lock()
	stub.callsList = append(stub.callsList, generatedProgramRunCall{program: program, request: request})
	callback := stub.run
	stub.mu.Unlock()
	if callback != nil {
		return callback(ctx, program, request)
	}
	zero := 0
	return runner.Result{ProjectID: program.ProjectID, Revision: program.Revision, ExitCode: &zero, Termination: runner.TerminationExited}, nil
}

func (stub *generatedProgramRuntimeStub) calls() []generatedProgramRunCall {
	stub.mu.Lock()
	defer stub.mu.Unlock()
	return append([]generatedProgramRunCall(nil), stub.callsList...)
}

var _ runner.Runtime = (*generatedProgramRuntimeStub)(nil)
