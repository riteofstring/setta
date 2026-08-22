package lsp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/setta/python-canvas/backend/internal/project"
)

func TestBasedpyrightProviderCompletesThroughTemporarySnapshot(t *testing.T) {
	provider, writer, workspaceRoot := newCompletionProviderForTest(t, fakeCompletionSuccess)
	canonicalCode := "import math\n# 😀\nstate = SettaState()"
	authoredExpression := "math.😀sq"
	items, err := provider.CompleteCallable(
		context.Background(),
		completionRequest(canonicalCode, authoredExpression, 7),
	)
	if err != nil {
		t.Fatalf("CompleteCallable() error = %v", err)
	}
	wantItems := []project.CompletionItem{
		{Label: "sqrt", InsertText: "sqrt"},
		{Label: "floor", InsertText: "floor"},
	}
	if !reflect.DeepEqual(items, wantItems) {
		t.Fatalf("completion items = %#v, want %#v", items, wantItems)
	}
	requireCompletionSnapshotLifecycle(
		t,
		writer,
		workspaceRoot,
		canonicalCode+completionSnapshotSeparator+authoredExpression,
		Position{Line: 4, Character: 7},
	)
}

func TestBasedpyrightProviderCompletesPythonTargetThroughTheSameTemporarySnapshotLifecycle(t *testing.T) {
	provider, writer, workspaceRoot := newCompletionProviderForTest(t, fakeCompletionSuccess)
	code := "import mat\n\nclass SettaState:\n    pass\n\nstate = SettaState()"
	items, err := provider.CompletePythonTarget(
		context.Background(),
		project.PythonTargetCompletionRequest{
			Code:             code,
			CursorOffsetByte: 9,
		},
	)
	if err != nil {
		t.Fatalf("CompletePythonTarget() error = %v", err)
	}
	if want := []project.CompletionItem{{Label: "sqrt", InsertText: "sqrt"}, {Label: "floor", InsertText: "floor"}}; !reflect.DeepEqual(items, want) {
		t.Fatalf("target completion items = %#v, want %#v", items, want)
	}
	requireCompletionSnapshotLifecycle(
		t,
		writer,
		workspaceRoot,
		code,
		Position{Line: 0, Character: 9},
	)
}

func TestBasedpyrightProviderCleansCompletionSnapshotAfterFailureAndCancellation(t *testing.T) {
	for _, testCase := range []struct {
		name    string
		outcome fakeCompletionOutcome
	}{
		{name: "provider failure", outcome: fakeCompletionFailure},
		{name: "caller cancellation", outcome: fakeCompletionWait},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			provider, writer, workspaceRoot := newCompletionProviderForTest(t, testCase.outcome)
			request := completionRequest("import math", "math.sq", 7)
			if testCase.outcome == fakeCompletionFailure {
				_, err := provider.CompleteCallable(context.Background(), request)
				if err == nil {
					t.Fatal("CompleteCallable() error = nil, want provider failure")
				}
			} else {
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				completionDone := make(chan error, 1)
				go func() {
					_, err := provider.CompleteCallable(ctx, request)
					completionDone <- err
				}()
				select {
				case <-writer.completionStarted:
				case <-time.After(time.Second):
					t.Fatal("completion request did not reach the session")
				}
				cancel()
				select {
				case err := <-completionDone:
					if !errors.Is(err, context.Canceled) {
						t.Fatalf("CompleteCallable() error = %v, want cancellation", err)
					}
				case <-time.After(time.Second):
					t.Fatal("CompleteCallable() did not return after cancellation")
				}
			}

			requireCompletionSnapshotLifecycle(
				t,
				writer,
				workspaceRoot,
				"import math"+completionSnapshotSeparator+"math.sq",
				Position{Line: 2, Character: 7},
			)
		})
	}
}

func TestBasedpyrightProviderRejectsMalformedCompletionItems(t *testing.T) {
	for _, testCase := range []struct {
		name    string
		outcome fakeCompletionOutcome
	}{
		{name: "missing items", outcome: fakeCompletionMissingItems},
		{name: "null items", outcome: fakeCompletionNullItems},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			provider, writer, workspaceRoot := newCompletionProviderForTest(t, testCase.outcome)
			_, err := provider.CompleteCallable(
				context.Background(),
				completionRequest("import math", "math.sq", 7),
			)
			if !errors.Is(err, ErrMalformedCompletionResult) {
				t.Fatalf("CompleteCallable() error = %v, want malformed completion result", err)
			}
			requireCompletionSnapshotLifecycle(
				t,
				writer,
				workspaceRoot,
				"import math"+completionSnapshotSeparator+"math.sq",
				Position{Line: 2, Character: 7},
			)
		})
	}
}

func completionRequest(canonicalCode string, authoredExpression string, cursorOffsetUTF16 int) project.CallableCompletionRequest {
	return project.CallableCompletionRequest{
		ProjectID:          "project:python-canvas",
		SectionID:          "callable:square-root",
		CanonicalCode:      canonicalCode,
		AuthoredExpression: authoredExpression,
		CursorOffsetUTF16:  cursorOffsetUTF16,
	}
}

func requireCompletionSnapshotLifecycle(
	t *testing.T,
	writer *recordingLSPWriter,
	workspaceRoot string,
	wantDocument string,
	wantPosition Position,
) {
	t.Helper()
	messages := writer.messagesSnapshot()
	if len(messages) != 3 {
		t.Fatalf("session messages = %#v, want didOpen, completion, and didClose", messageMethods(messages))
	}
	if wantMethods := []string{"textDocument/didOpen", "textDocument/completion", "textDocument/didClose"}; !reflect.DeepEqual(messageMethods(messages), wantMethods) {
		t.Fatalf("session message methods = %#v, want %#v", messageMethods(messages), wantMethods)
	}

	var openParams struct {
		TextDocument struct {
			Text string `json:"text"`
		} `json:"textDocument"`
	}
	if err := json.Unmarshal(messages[0].Params, &openParams); err != nil {
		t.Fatalf("decode didOpen params: %v", err)
	}
	if openParams.TextDocument.Text != wantDocument {
		t.Fatalf("temporary completion document = %q, want %q", openParams.TextDocument.Text, wantDocument)
	}

	var completionParams struct {
		Position Position `json:"position"`
	}
	if err := json.Unmarshal(messages[1].Params, &completionParams); err != nil {
		t.Fatalf("decode completion params: %v", err)
	}
	if completionParams.Position != wantPosition {
		t.Fatalf("completion position = %#v, want %#v", completionParams.Position, wantPosition)
	}

	snapshots, err := filepath.Glob(filepath.Join(workspaceRoot, ".setta-completion-*.py"))
	if err != nil {
		t.Fatalf("find completion snapshots: %v", err)
	}
	if len(snapshots) != 0 {
		t.Fatalf("completion snapshots after request = %#v, want none", snapshots)
	}
}

type fakeCompletionOutcome string

const (
	fakeCompletionSuccess      fakeCompletionOutcome = "success"
	fakeCompletionFailure      fakeCompletionOutcome = "failure"
	fakeCompletionWait         fakeCompletionOutcome = "wait"
	fakeCompletionMissingItems fakeCompletionOutcome = "missing items"
	fakeCompletionNullItems    fakeCompletionOutcome = "null items"
)

func newCompletionProviderForTest(
	t *testing.T,
	outcome fakeCompletionOutcome,
) (*BasedpyrightProvider, *recordingLSPWriter, string) {
	t.Helper()
	writer := &recordingLSPWriter{
		outcome:           outcome,
		completionStarted: make(chan struct{}),
	}
	session := &Session{
		options:          SessionOptions{RequestTimeout: time.Second},
		started:          true,
		initialized:      true,
		stdin:            writer,
		pending:          make(map[string]chan rpcEnvelope),
		documentVersions: make(map[string]int),
		callbacks:        make(map[string]diagnosticsCallback),
	}
	writer.session = session
	provider := &BasedpyrightProvider{
		workspaceRoot:     t.TempDir(),
		session:           session,
		diagnosticTimeout: time.Second,
	}
	t.Cleanup(func() {
		if err := provider.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})
	return provider, writer, provider.workspaceRoot
}

type recordingLSPWriter struct {
	mu sync.Mutex

	session *Session
	outcome fakeCompletionOutcome

	buffer              []byte
	messages            []rpcEnvelope
	completionStarted   chan struct{}
	completionStartOnce sync.Once
}

func (writer *recordingLSPWriter) Write(data []byte) (int, error) {
	writer.mu.Lock()
	writer.buffer = append(writer.buffer, data...)
	messages, err := writer.takeMessagesLocked()
	writer.mu.Unlock()
	if err != nil {
		return 0, err
	}
	for _, message := range messages {
		writer.respond(message)
	}
	return len(data), nil
}

func (writer *recordingLSPWriter) Close() error {
	return nil
}

func (writer *recordingLSPWriter) messagesSnapshot() []rpcEnvelope {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	return append([]rpcEnvelope(nil), writer.messages...)
}

func (writer *recordingLSPWriter) takeMessagesLocked() ([]rpcEnvelope, error) {
	parsed := []rpcEnvelope{}
	for {
		headerEnd := bytes.Index(writer.buffer, []byte("\r\n\r\n"))
		if headerEnd < 0 {
			return parsed, nil
		}
		contentLength, err := contentLength(writer.buffer[:headerEnd])
		if err != nil {
			return nil, err
		}
		bodyStart := headerEnd + len("\r\n\r\n")
		bodyEnd := bodyStart + contentLength
		if len(writer.buffer) < bodyEnd {
			return parsed, nil
		}
		var message rpcEnvelope
		if err := json.Unmarshal(writer.buffer[bodyStart:bodyEnd], &message); err != nil {
			return nil, err
		}
		writer.messages = append(writer.messages, message)
		parsed = append(parsed, message)
		writer.buffer = writer.buffer[bodyEnd:]
	}
}

func contentLength(header []byte) (int, error) {
	for _, line := range strings.Split(string(header), "\r\n") {
		if !strings.HasPrefix(line, "Content-Length: ") {
			continue
		}
		return strconv.Atoi(strings.TrimPrefix(line, "Content-Length: "))
	}
	return 0, errors.New("test LSP writer: missing Content-Length")
}

func (writer *recordingLSPWriter) respond(message rpcEnvelope) {
	switch message.Method {
	case "textDocument/completion":
		writer.completionStartOnce.Do(func() {
			close(writer.completionStarted)
		})
		switch writer.outcome {
		case fakeCompletionSuccess:
			writer.session.dispatch(rpcEnvelope{
				ID:     message.ID,
				Result: json.RawMessage(`{"items":[{"label":" sqrt ","insertText":" sqrt "},{"label":" "},{"label":"floor"}]}`),
			})
		case fakeCompletionFailure:
			writer.session.dispatch(rpcEnvelope{
				ID:    message.ID,
				Error: &rpcError{Code: -32001, Message: "completion unavailable"},
			})
		case fakeCompletionMissingItems:
			writer.session.dispatch(rpcEnvelope{
				ID:     message.ID,
				Result: json.RawMessage(`{}`),
			})
		case fakeCompletionNullItems:
			writer.session.dispatch(rpcEnvelope{
				ID:     message.ID,
				Result: json.RawMessage(`{"items":null}`),
			})
		}
	case "shutdown":
		writer.session.dispatch(rpcEnvelope{ID: message.ID, Result: json.RawMessage(`{}`)})
	}
}

func messageMethods(messages []rpcEnvelope) []string {
	methods := make([]string, 0, len(messages))
	for _, message := range messages {
		methods = append(methods, message.Method)
	}
	return methods
}
