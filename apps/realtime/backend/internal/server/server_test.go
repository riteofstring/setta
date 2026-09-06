package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/setta/realtime/backend/internal/content"
	"github.com/setta/realtime/backend/internal/contracts"
	"github.com/setta/realtime/backend/internal/project"
)

type fakeCoordinator struct {
	mu      sync.Mutex
	project contracts.Project
	runtime contracts.RuntimeSnapshot
	events  []contracts.RuntimeEvent
}

func (coordinator *fakeCoordinator) ProjectSnapshot() (contracts.Project, error) {
	return coordinator.project, nil
}

func (coordinator *fakeCoordinator) Apply(request contracts.ApplyRequest) (contracts.Project, error) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if request.ProjectID != coordinator.project.ID || request.ExpectedRevision != coordinator.project.Revision {
		return contracts.Project{}, project.ErrRevisionConflict
	}
	coordinator.project.Revision++
	return coordinator.project, nil
}

func (coordinator *fakeCoordinator) Reload(context.Context) (contracts.InitializeResult, error) {
	return contracts.InitializeResult{ProtocolVersion: 1, RuntimeKind: "python", Handlers: []string{}}, nil
}

func (coordinator *fakeCoordinator) Invoke(context.Context, string, contracts.DirectInvokeRequest) (contracts.InvokeResult, error) {
	return contracts.InvokeResult{Outputs: map[string]json.RawMessage{}, Error: nil}, nil
}

func (coordinator *fakeCoordinator) Snapshot() (contracts.RuntimeSnapshot, error) {
	return coordinator.runtime, nil
}

func (coordinator *fakeCoordinator) Subscribe(ctx context.Context) (<-chan contracts.RuntimeEnvelope, error) {
	stream := make(chan contracts.RuntimeEnvelope, 1)
	stream <- contracts.RuntimeEnvelope{Type: "snapshot", Snapshot: &coordinator.runtime}
	go func() {
		<-ctx.Done()
		close(stream)
	}()
	return stream, nil
}

func (coordinator *fakeCoordinator) HandleEvent(event contracts.RuntimeEvent) (int, error) {
	if err := event.Validate(); err != nil {
		return 0, err
	}
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	coordinator.events = append(coordinator.events, event)
	return 1, nil
}

func (coordinator *fakeCoordinator) Cancel(request contracts.RuntimeCancelRequest) error {
	return request.Validate()
}

func testHandler(t *testing.T, serverURL string) (*Handler, *fakeCoordinator, *content.Store, func()) {
	t.Helper()
	projectRoot := t.TempDir()
	projectPath := filepath.Join(projectRoot, ".local", "realtime", "project.json")
	projects, err := project.Open(projectPath, true)
	if err != nil {
		t.Fatalf("project.Open() error = %v", err)
	}
	projectSnapshot, err := projects.Snapshot()
	if err != nil {
		t.Fatalf("project.Snapshot() error = %v", err)
	}
	contentStore, err := content.Open(filepath.Dir(projectPath))
	if err != nil {
		_ = projects.Close()
		t.Fatalf("content.Open() error = %v", err)
	}
	coordinator := &fakeCoordinator{project: projectSnapshot, runtime: contracts.RuntimeSnapshot{SessionID: "session-1", WorkerState: "ready", Values: map[string]json.RawMessage{}, Invocations: map[string]contracts.InvocationStatus{}}}
	handler, err := New(coordinator, projects, contentStore, projectRoot, "nonce", serverURL)
	if err != nil {
		_ = projects.Close()
		_ = contentStore.Close()
		t.Fatalf("New() error = %v", err)
	}
	cleanup := func() {
		_ = projects.Close()
		_ = contentStore.Close()
	}
	return handler, coordinator, contentStore, cleanup
}

func TestIdentityIsExactAndRejectsQuery(t *testing.T) {
	handler, _, _, cleanup := testHandler(t, "http://127.0.0.1:8123")
	defer cleanup()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v2/runtime/session", nil))
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("identity response = %d %q", response.Code, response.Body.String())
	}
	var document map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &document); err != nil {
		t.Fatalf("identity JSON error = %v", err)
	}
	if document["schemaVersion"] != "realtime-session/v1" || document["appId"] != "realtime" || document["instanceNonce"] != "nonce" {
		t.Fatalf("identity = %#v", document)
	}
	rejected := httptest.NewRecorder()
	handler.ServeHTTP(rejected, httptest.NewRequest(http.MethodGet, "/api/v2/runtime/session?x=1", nil))
	if rejected.Code != http.StatusBadRequest {
		t.Fatalf("query response = %d", rejected.Code)
	}
}

func TestMutationRequiresExactOriginAndStrictJSON(t *testing.T) {
	handler, coordinator, _, cleanup := testHandler(t, "http://127.0.0.1:8123")
	defer cleanup()
	payload := `{"projectId":"` + coordinator.project.ID + `","expectedRevision":0,"operations":[]}`
	forbidden := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/project/apply", strings.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://evil.example")
	handler.ServeHTTP(forbidden, request)
	if forbidden.Code != http.StatusForbidden {
		t.Fatalf("forbidden response = %d", forbidden.Code)
	}
	invalid := httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/api/v1/project/apply", strings.NewReader(strings.TrimSuffix(payload, "}")+`,"extra":true}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://127.0.0.1:8123")
	handler.ServeHTTP(invalid, request)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid response = %d %q", invalid.Code, invalid.Body.String())
	}
}

func TestContentUsesOneReferencePath(t *testing.T) {
	handler, _, _, cleanup := testHandler(t, "http://127.0.0.1:8123")
	defer cleanup()
	uploaded := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/content", strings.NewReader("pixels"))
	request.Header.Set("Origin", "http://127.0.0.1:8123")
	request.Header.Set("Content-Type", "image/png")
	request.Header.Set("X-Setta-Invocation-ID", "browser-stage")
	handler.ServeHTTP(uploaded, request)
	if uploaded.Code != http.StatusCreated {
		t.Fatalf("upload response = %d %q", uploaded.Code, uploaded.Body.String())
	}
	var reference contracts.ContentReference
	if err := json.Unmarshal(uploaded.Body.Bytes(), &reference); err != nil {
		t.Fatalf("reference JSON error = %v", err)
	}
	downloaded := httptest.NewRecorder()
	handler.ServeHTTP(downloaded, httptest.NewRequest(http.MethodGet, "/api/v1/content/"+reference.ID, nil))
	if downloaded.Code != http.StatusOK || downloaded.Body.String() != "pixels" || downloaded.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("download response = %d %q", downloaded.Code, downloaded.Body.String())
	}
}

func TestProjectStreamBeginsWithCompleteSnapshot(t *testing.T) {
	handler, coordinator, _, cleanup := testHandler(t, "http://127.0.0.1:8123")
	defer cleanup()
	ctx, cancel := context.WithCancel(context.Background())
	request := httptest.NewRequest(http.MethodGet, "/api/v1/project/events", nil).WithContext(ctx)
	response := newFlushRecorder()
	done := make(chan struct{})
	go func() {
		handler.ServeHTTP(response, request)
		close(done)
	}()
	deadline := time.Now().Add(time.Second)
	for !strings.Contains(response.String(), coordinator.project.ID) && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	cancel()
	<-done
	if !strings.HasPrefix(response.String(), "data: ") || !strings.Contains(response.String(), `"sections":{}`) {
		t.Fatalf("SSE response = %q", response.String())
	}
}

func TestRuntimeSocketStartsWithSnapshotAndAcceptsStrictEvent(t *testing.T) {
	projectRoot := t.TempDir()
	projectPath := filepath.Join(projectRoot, ".local", "realtime", "project.json")
	projects, err := project.Open(projectPath, true)
	if err != nil {
		t.Fatalf("project.Open() error = %v", err)
	}
	defer projects.Close()
	projectSnapshot, _ := projects.Snapshot()
	contentStore, err := content.Open(filepath.Dir(projectPath))
	if err != nil {
		t.Fatalf("content.Open() error = %v", err)
	}
	defer contentStore.Close()
	coordinator := &fakeCoordinator{project: projectSnapshot, runtime: contracts.RuntimeSnapshot{SessionID: "session-1", WorkerState: "ready", Values: map[string]json.RawMessage{}, Invocations: map[string]contracts.InvocationStatus{}}}
	testServer := httptest.NewUnstartedServer(nil)
	serverURL := "http://" + testServer.Listener.Addr().String()
	handler, err := New(coordinator, projects, contentStore, projectRoot, "nonce", serverURL)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	testServer.Config.Handler = handler
	testServer.Start()
	defer testServer.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	connection, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(testServer.URL, "http")+"/api/v1/runtime", &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{testServer.URL}}})
	if err != nil {
		t.Fatalf("websocket.Dial() error = %v", err)
	}
	defer connection.CloseNow()
	var initial contracts.RuntimeEnvelope
	if err := wsjson.Read(ctx, connection, &initial); err != nil {
		t.Fatalf("initial read error = %v", err)
	}
	if initial.Type != "snapshot" || initial.Snapshot == nil || initial.Snapshot.SessionID != "session-1" {
		t.Fatalf("initial envelope = %#v", initial)
	}
	event := contracts.RuntimeEvent{Type: "event", SessionID: "session-1", SectionID: "button", Event: "press", Payload: json.RawMessage(`{}`)}
	if err := wsjson.Write(ctx, connection, event); err != nil {
		t.Fatalf("event write error = %v", err)
	}
	deadline := time.Now().Add(time.Second)
	for {
		coordinator.mu.Lock()
		count := len(coordinator.events)
		coordinator.mu.Unlock()
		if count == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("runtime event was not accepted")
		}
		time.Sleep(time.Millisecond)
	}
}

type flushRecorder struct {
	mu     sync.Mutex
	header http.Header
	body   strings.Builder
}

func newFlushRecorder() *flushRecorder {
	return &flushRecorder{header: make(http.Header)}
}

func (recorder *flushRecorder) Header() http.Header { return recorder.header }

func (recorder *flushRecorder) WriteHeader(int) {}

func (recorder *flushRecorder) Write(data []byte) (int, error) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	return recorder.body.Write(data)
}

func (recorder *flushRecorder) Flush() {}

func (recorder *flushRecorder) String() string {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	return recorder.body.String()
}
