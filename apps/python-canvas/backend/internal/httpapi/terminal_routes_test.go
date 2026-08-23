package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/terminal"
)

func TestTerminalRoutesRunExactCaptureAndClose(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	runtime := newTerminalRuntimeStub()
	var capturedProjectID string
	var capturedRevision int
	service.captureGeneratedProgram = func(_ context.Context, projectID string, expectedRevision int) (GeneratedProgram, error) {
		capturedProjectID = projectID
		capturedRevision = expectedRevision
		if expectedRevision != service.snapshot.Project.Revision {
			return GeneratedProgram{}, aggregate.ErrRevisionConflict
		}
		return GeneratedProgram{ProjectID: projectID, Revision: expectedRevision, Code: "print('exact terminal program')\n"}, nil
	}
	handler := newTerminalHandlerForTest(t, service, runtime)

	opened := postJSON(handler, contracts.ProjectTerminalPathV2, `{"projectId":"project:fixture","columns":80,"rows":24}`)
	if opened.Code != http.StatusOK {
		t.Fatalf("open status = %d; body = %s", opened.Code, opened.Body.String())
	}
	var openResult contracts.TerminalSessionV2
	if err := json.Unmarshal(opened.Body.Bytes(), &openResult); err != nil {
		t.Fatalf("decode open response: %v", err)
	}
	if !openResult.Created || openResult.Columns != 80 || openResult.Rows != 24 {
		t.Fatalf("open response = %#v", openResult)
	}

	ran := postJSON(handler, contracts.ProjectTerminalRunPathV2, `{"projectId":"project:fixture","expectedRevision":1,"columns":91,"rows":31}`)
	if ran.Code != http.StatusOK {
		t.Fatalf("run status = %d; body = %s", ran.Code, ran.Body.String())
	}
	if capturedProjectID != "project:fixture" || capturedRevision != 1 {
		t.Fatalf("captured run boundary = project %q revision %d", capturedProjectID, capturedRevision)
	}
	if runs := runtime.runs(); len(runs) != 1 || runs[0].code != "print('exact terminal program')\n" || runs[0].columns != 91 || runs[0].rows != 31 {
		t.Fatalf("runtime runs = %#v", runs)
	}

	stale := postJSON(handler, contracts.ProjectTerminalRunPathV2, `{"projectId":"project:fixture","expectedRevision":2,"columns":91,"rows":31}`)
	if stale.Code != http.StatusConflict {
		t.Fatalf("stale run status = %d; body = %s", stale.Code, stale.Body.String())
	}
	assertErrorCode(t, stale, contracts.APIErrorCodeRevisionConflictV2)
	if runs := runtime.runs(); len(runs) != 1 {
		t.Fatalf("stale request ran generated code: %#v", runs)
	}

	closed := postJSON(handler, contracts.ProjectTerminalClosePathV2, `{"projectId":"project:fixture"}`)
	if closed.Code != http.StatusNoContent || closed.Body.Len() != 0 {
		t.Fatalf("close response = status %d body %q", closed.Code, closed.Body.String())
	}
	if runtime.deleteCount() != 1 {
		t.Fatalf("terminal deletes = %d, want 1", runtime.deleteCount())
	}
}

func TestTerminalRoutesRejectOversizedSizesBeforeRuntimeAdmission(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	runtime := newTerminalRuntimeStub()
	handler := newTerminalHandlerForTest(t, service, runtime)

	response := postJSON(
		handler,
		contracts.ProjectTerminalPathV2,
		fmt.Sprintf(
			`{"projectId":"project:fixture","columns":%d,"rows":24}`,
			contracts.MaxTerminalDimensionV2+1,
		),
	)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("oversized open status = %d; body = %s", response.Code, response.Body.String())
	}
	assertErrorCode(t, response, contracts.APIErrorCodeInvalidRequestV2)
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if len(runtime.openCalls) != 0 {
		t.Fatalf("oversized terminal request reached runtime: %#v", runtime.openCalls)
	}
}

func TestTerminalStreamUsesReadyHistoryLiveAndValidatedInput(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	runtime := newTerminalRuntimeStub()
	runtime.history = []byte("retained marker\n")
	handler := newTerminalHandlerForTest(t, service, runtime)
	ctx, connection := openTerminalStreamForTest(t, handler)

	assertTerminalReadyAndHistory(t, ctx, connection)
	assertTerminalLiveOutput(t, ctx, connection, runtime)
	assertTerminalInput(t, ctx, connection, runtime)
	assertTerminalResize(t, ctx, connection, runtime)
}

func openTerminalStreamForTest(t *testing.T, handler http.Handler) (context.Context, *websocket.Conn) {
	t.Helper()
	return openTerminalStreamWithOriginForTest(t, handler, "http://127.0.0.1:5173")
}

func openTerminalStreamWithOriginForTest(t *testing.T, handler http.Handler, origin string) (context.Context, *websocket.Conn) {
	t.Helper()
	opened := postJSON(handler, contracts.ProjectTerminalPathV2, `{"projectId":"project:fixture","columns":80,"rows":24}`)
	if opened.Code != http.StatusOK {
		t.Fatalf("open status = %d; body = %s", opened.Code, opened.Body.String())
	}
	ticketResponse := postJSON(handler, contracts.ProjectTerminalTicketPathV2, `{"projectId":"project:fixture"}`)
	if ticketResponse.Code != http.StatusOK {
		t.Fatalf("ticket status = %d; body = %s", ticketResponse.Code, ticketResponse.Body.String())
	}
	var ticket contracts.TerminalTicketV2
	if err := json.Unmarshal(ticketResponse.Body.Bytes(), &ticket); err != nil {
		t.Fatalf("decode ticket: %v", err)
	}

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	streamURL := "ws" + strings.TrimPrefix(server.URL, "http") + contracts.ProjectTerminalStreamPathV2 + "?ticket=" + url.QueryEscape(ticket.Ticket)
	connection, response, err := websocket.Dial(ctx, streamURL, &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{origin}},
	})
	if err != nil {
		if response != nil {
			t.Fatalf("dial terminal stream: %v (status %d)", err, response.StatusCode)
		}
		t.Fatalf("dial terminal stream: %v", err)
	}
	t.Cleanup(func() { _ = connection.Close(websocket.StatusNormalClosure, "") })
	return ctx, connection
}

func TestTerminalStreamAcceptsMainParityLocalhostAlias(t *testing.T) {
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	runtime := newTerminalRuntimeStub()
	runtime.history = []byte("retained marker\n")
	handler := newTerminalHandlerForTest(t, service, runtime)

	ctx, connection := openTerminalStreamWithOriginForTest(t, handler, "http://localhost:5173")
	assertTerminalReadyAndHistory(t, ctx, connection)
}

func TestTerminalOriginAliasesStayOnTheConfiguredLoopbackPort(t *testing.T) {
	routes, err := newTerminalRoutes(HandlerOptions{
		Terminal:  newTerminalRuntimeStub(),
		AppOrigin: "http://127.0.0.1:5173",
	})
	if err != nil {
		t.Fatalf("new terminal routes: %v", err)
	}
	for _, origin := range []string{
		"http://127.0.0.1:5173",
		"http://localhost:5173",
	} {
		if !routes.allowsOrigin(origin) {
			t.Fatalf("terminal routes rejected allowed origin %q", origin)
		}
	}
	for _, origin := range []string{
		"http://127.0.0.1:4173",
		"http://localhost:4173",
		"http://[::1]:5173",
		"https://localhost:5173",
		"http://example.com:5173",
	} {
		if routes.allowsOrigin(origin) {
			t.Fatalf("terminal routes accepted unconfigured origin %q", origin)
		}
	}
	localhostRoutes, err := newTerminalRoutes(HandlerOptions{
		Terminal:  newTerminalRuntimeStub(),
		AppOrigin: "http://localhost:5173",
	})
	if err != nil {
		t.Fatalf("new localhost terminal routes: %v", err)
	}
	if localhostRoutes.allowsOrigin("http://127.0.0.1:5173") {
		t.Fatal("localhost terminal configuration gained an unconfigured IPv4 alias")
	}
}

func assertTerminalReadyAndHistory(t *testing.T, ctx context.Context, connection *websocket.Conn) {
	t.Helper()
	messageType, data, err := connection.Read(ctx)
	if err != nil {
		t.Fatalf("read ready message: %v", err)
	}
	if messageType != websocket.MessageText {
		t.Fatalf("ready message type = %v, want text", messageType)
	}
	var ready contracts.TerminalStreamReadyV2
	if err := json.Unmarshal(data, &ready); err != nil || ready.Validate() != nil {
		t.Fatalf("ready message = %q; decode/validate error = %v", string(data), err)
	}

	messageType, data, err = connection.Read(ctx)
	if err != nil {
		t.Fatalf("read retained history: %v", err)
	}
	if messageType != websocket.MessageBinary || string(data) != "retained marker\n" {
		t.Fatalf("history frame = type %v data %q", messageType, string(data))
	}
}

func assertTerminalLiveOutput(t *testing.T, ctx context.Context, connection *websocket.Conn, runtime *terminalRuntimeStub) {
	t.Helper()
	runtime.publish([]byte("live marker\n"))
	messageType, data, err := connection.Read(ctx)
	if err != nil {
		t.Fatalf("read live output: %v", err)
	}
	if messageType != websocket.MessageBinary || string(data) != "live marker\n" {
		t.Fatalf("live frame = type %v data %q", messageType, string(data))
	}
}

func assertTerminalInput(t *testing.T, ctx context.Context, connection *websocket.Conn, runtime *terminalRuntimeStub) {
	t.Helper()
	if err := connection.Write(ctx, websocket.MessageBinary, []byte("printf terminal-input\\n\n")); err != nil {
		t.Fatalf("write binary terminal input: %v", err)
	}
	select {
	case input := <-runtime.writes:
		if string(input) != "printf terminal-input\\n\n" {
			t.Fatalf("terminal input = %q", string(input))
		}
	case <-ctx.Done():
		t.Fatal("server did not receive binary terminal input")
	}
}

func assertTerminalResize(t *testing.T, ctx context.Context, connection *websocket.Conn, runtime *terminalRuntimeStub) {
	t.Helper()
	resize := contracts.TerminalStreamResizeV2{Type: contracts.TerminalStreamResizeTypeV2, Columns: 101, Rows: 37}
	resizeData, err := json.Marshal(resize)
	if err != nil {
		t.Fatalf("marshal resize: %v", err)
	}
	if err := connection.Write(ctx, websocket.MessageText, resizeData); err != nil {
		t.Fatalf("write resize control: %v", err)
	}
	select {
	case size := <-runtime.resizes:
		if size.Columns != 101 || size.Rows != 37 {
			t.Fatalf("terminal resize = %#v", size)
		}
	case <-ctx.Done():
		t.Fatal("server did not receive resize control")
	}
}

func TestTerminalStreamRejectsNonLoopbackOrigins(t *testing.T) {
	if _, ok := normalizeOrigin("https://example.com"); ok {
		t.Fatal("accepted non-loopback terminal origin")
	}
	for _, origin := range []string{"http://127.0.0.1:5173", "http://localhost:4173", "http://[::1]:5173"} {
		if _, ok := normalizeOrigin(origin); !ok {
			t.Fatalf("reject loopback terminal origin %q", origin)
		}
	}

	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	runtime := newTerminalRuntimeStub()
	handler := newTerminalHandlerForTest(t, service, runtime)
	if response := postJSON(handler, contracts.ProjectTerminalPathV2, `{"projectId":"project:fixture","columns":80,"rows":24}`); response.Code != http.StatusOK {
		t.Fatalf("open status = %d; body = %s", response.Code, response.Body.String())
	}
	ticketResponse := postJSON(handler, contracts.ProjectTerminalTicketPathV2, `{"projectId":"project:fixture"}`)
	var ticket contracts.TerminalTicketV2
	if err := json.Unmarshal(ticketResponse.Body.Bytes(), &ticket); err != nil {
		t.Fatalf("decode ticket: %v", err)
	}
	server := httptest.NewServer(handler)
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	streamURL := "ws" + strings.TrimPrefix(server.URL, "http") + contracts.ProjectTerminalStreamPathV2 + "?ticket=" + url.QueryEscape(ticket.Ticket)
	connection, response, err := websocket.Dial(ctx, streamURL, &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"http://example.com"}},
	})
	if connection != nil {
		_ = connection.Close(websocket.StatusNormalClosure, "")
		t.Fatal("non-loopback origin established a terminal stream")
	}
	if err == nil || response == nil || response.StatusCode != http.StatusForbidden {
		status := 0
		if response != nil {
			status = response.StatusCode
		}
		t.Fatalf("non-loopback stream result = connection %v error %v status %d", connection, err, status)
	}
}

func TestDecodeTerminalResizeIsClosedAndExact(t *testing.T) {
	for _, test := range []struct {
		name  string
		data  string
		valid bool
	}{
		{"valid", `{"type":"resize","columns":80,"rows":24}`, true},
		{"wrong type", `{"type":"ready","columns":80,"rows":24}`, false},
		{"unknown field", `{"type":"resize","columns":80,"rows":24,"extra":true}`, false},
		{"trailing object", `{"type":"resize","columns":80,"rows":24}{}`, false},
		{"zero rows", `{"type":"resize","columns":80,"rows":0}`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			resize, valid := decodeTerminalResize([]byte(test.data))
			if valid != test.valid {
				t.Fatalf("decodeTerminalResize(%q) = %#v, valid %t", test.data, resize, valid)
			}
		})
	}
}

func newTerminalHandlerForTest(t *testing.T, service ProjectService, runtime terminal.Runtime) http.Handler {
	t.Helper()
	handler, err := NewHandler(service, HandlerOptions{
		Terminal:       runtime,
		Runner:         newGeneratedProgramRuntimeStub(),
		RuntimeSession: runtimeSessionIdentityForTest(),
		AppOrigin:      "http://127.0.0.1:5173",
	})
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}
	return handler
}

type terminalRunCall struct {
	code    string
	columns int
	rows    int
}

type terminalRuntimeStub struct {
	mu sync.Mutex

	session terminal.Session
	opened  bool
	history []byte
	output  chan []byte
	tickets map[string]struct{}
	next    int
	active  bool

	openCalls []terminal.Session
	runCalls  []terminalRunCall
	writes    chan []byte
	resizes   chan terminal.Session
	deletes   int
	closed    bool
}

func newTerminalRuntimeStub() *terminalRuntimeStub {
	return &terminalRuntimeStub{
		output:  make(chan []byte, 8),
		tickets: make(map[string]struct{}),
		writes:  make(chan []byte, 8),
		resizes: make(chan terminal.Session, 8),
	}
}

func (runtime *terminalRuntimeStub) Open(columns int, rows int) (terminal.Session, bool, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if runtime.closed {
		return terminal.Session{}, false, terminal.ErrClosed
	}
	created := !runtime.opened
	runtime.opened = true
	runtime.session = terminal.Session{Columns: columns, Rows: rows}
	runtime.openCalls = append(runtime.openCalls, runtime.session)
	return runtime.session, created, nil
}

func (runtime *terminalRuntimeStub) Run(ctx context.Context, code string, columns int, rows int) (terminal.Session, bool, error) {
	if err := ctx.Err(); err != nil {
		return terminal.Session{}, false, err
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if runtime.closed {
		return terminal.Session{}, false, terminal.ErrClosed
	}
	created := !runtime.opened
	runtime.opened = true
	runtime.session = terminal.Session{Columns: columns, Rows: rows}
	runtime.runCalls = append(runtime.runCalls, terminalRunCall{code: code, columns: columns, rows: rows})
	return runtime.session, created, nil
}

func (runtime *terminalRuntimeStub) IssueTicket() (string, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if runtime.closed {
		return "", terminal.ErrClosed
	}
	if !runtime.opened {
		return "", terminal.ErrSessionNotFound
	}
	runtime.next++
	ticket := fmt.Sprintf("ticket-%032d", runtime.next)
	runtime.tickets[ticket] = struct{}{}
	return ticket, nil
}

func (runtime *terminalRuntimeStub) Attach(ticket string) (*terminal.Attachment, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if runtime.closed {
		return nil, terminal.ErrClosed
	}
	if _, found := runtime.tickets[ticket]; !found {
		return nil, terminal.ErrInvalidTicket
	}
	delete(runtime.tickets, ticket)
	if runtime.active {
		return nil, terminal.ErrAttachmentActive
	}
	runtime.active = true
	return &terminal.Attachment{
		History: append([]byte(nil), runtime.history...),
		Output:  runtime.output,
	}, nil
}

func (runtime *terminalRuntimeStub) Write(data []byte) error {
	runtime.mu.Lock()
	closed := runtime.closed
	runtime.mu.Unlock()
	if closed {
		return terminal.ErrClosed
	}
	runtime.writes <- append([]byte(nil), data...)
	return nil
}

func (runtime *terminalRuntimeStub) Resize(columns int, rows int) error {
	runtime.mu.Lock()
	if runtime.closed {
		runtime.mu.Unlock()
		return terminal.ErrClosed
	}
	runtime.session = terminal.Session{Columns: columns, Rows: rows}
	size := runtime.session
	runtime.mu.Unlock()
	runtime.resizes <- size
	return nil
}

func (runtime *terminalRuntimeStub) Delete(context.Context) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if runtime.closed {
		return terminal.ErrClosed
	}
	if !runtime.opened {
		return terminal.ErrSessionNotFound
	}
	runtime.opened = false
	runtime.deletes++
	return nil
}

func (runtime *terminalRuntimeStub) Close(context.Context) error {
	runtime.mu.Lock()
	runtime.closed = true
	runtime.mu.Unlock()
	return nil
}

func (runtime *terminalRuntimeStub) publish(data []byte) {
	runtime.output <- append([]byte(nil), data...)
}

func (runtime *terminalRuntimeStub) runs() []terminalRunCall {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]terminalRunCall(nil), runtime.runCalls...)
}

func (runtime *terminalRuntimeStub) deleteCount() int {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return runtime.deletes
}

var _ terminal.Runtime = (*terminalRuntimeStub)(nil)
