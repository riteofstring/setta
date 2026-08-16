package lsp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	defaultRequestTimeout  = 10 * time.Second
	defaultShutdownTimeout = 3 * time.Second
)

var (
	ErrSessionCommandRequired = errors.New("lsp: command is required")
	ErrSessionClosed          = errors.New("lsp: session is closed")
	ErrSessionNotStarted      = errors.New("lsp: session is not started")
	ErrRequestTimedOut        = errors.New("lsp: request timed out")
)

type SessionOptions struct {
	Command        string
	Args           []string
	WorkspaceRoot  string
	RequestTimeout time.Duration
}

type diagnosticsCallback func(PublishDiagnosticsParams)

type rpcEnvelope struct {
	ID     json.RawMessage `json:"id,omitempty"`
	Method string          `json:"method,omitempty"`
	Params json.RawMessage `json:"params,omitempty"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Session owns one child language-server process and its JSON-RPC state. One
// project store serializes mutations, while this type also keeps protocol
// writes and pending requests safe on their own boundaries.
type Session struct {
	options SessionOptions

	mu      sync.Mutex
	writeMu sync.Mutex

	started bool
	closing bool
	closed  bool
	cmd     *exec.Cmd
	stdin   io.WriteCloser

	readerDone chan struct{}
	stderrDone chan struct{}

	pending          map[string]chan rpcEnvelope
	documentVersions map[string]int
	callbacks        map[string]diagnosticsCallback
	requestID        uint64
}

func NewSession(options SessionOptions) (*Session, error) {
	if strings.TrimSpace(options.Command) == "" {
		return nil, ErrSessionCommandRequired
	}
	if options.RequestTimeout <= 0 {
		options.RequestTimeout = defaultRequestTimeout
	}
	if strings.TrimSpace(options.WorkspaceRoot) != "" {
		workspaceRoot, err := filepath.Abs(options.WorkspaceRoot)
		if err != nil {
			return nil, fmt.Errorf("lsp: resolve workspace root: %w", err)
		}
		options.WorkspaceRoot = workspaceRoot
	}
	return &Session{
		options:          options,
		pending:          make(map[string]chan rpcEnvelope),
		documentVersions: make(map[string]int),
		callbacks:        make(map[string]diagnosticsCallback),
	}, nil
}

func (session *Session) Start(ctx context.Context) error {
	if session == nil {
		return ErrSessionClosed
	}

	session.mu.Lock()
	if session.closed || session.closing {
		session.mu.Unlock()
		return ErrSessionClosed
	}
	if session.started {
		session.mu.Unlock()
		return nil
	}
	if err := session.startProcessLocked(); err != nil {
		session.mu.Unlock()
		return err
	}
	session.mu.Unlock()

	if err := session.initialize(ctx); err != nil {
		_ = session.Close()
		return err
	}
	return nil
}

func (session *Session) startProcessLocked() error {
	command := exec.Command(session.options.Command, session.options.Args...)
	command.Env = os.Environ()
	command.Dir = session.options.WorkspaceRoot

	stdin, err := command.StdinPipe()
	if err != nil {
		return fmt.Errorf("lsp: create stdin pipe: %w", err)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		return fmt.Errorf("lsp: create stdout pipe: %w", err)
	}
	stderr, err := command.StderrPipe()
	if err != nil {
		return fmt.Errorf("lsp: create stderr pipe: %w", err)
	}
	if err := command.Start(); err != nil {
		return fmt.Errorf("lsp: start process: %w", err)
	}

	session.cmd = command
	session.stdin = stdin
	session.started = true
	session.readerDone = make(chan struct{})
	session.stderrDone = make(chan struct{})
	go session.readLoop(stdout)
	go session.drainStderr(stderr)
	return nil
}

func (session *Session) initialize(ctx context.Context) error {
	workspaceURI := ""
	if session.options.WorkspaceRoot != "" {
		uri, err := pathToURI(session.options.WorkspaceRoot)
		if err != nil {
			return err
		}
		workspaceURI = uri
	}

	params := map[string]any{
		"processId": nil,
		"capabilities": map[string]any{
			"textDocument": map[string]any{
				"publishDiagnostics": map[string]any{"versionSupport": true},
			},
		},
	}
	if workspaceURI != "" {
		params["rootUri"] = workspaceURI
		params["workspaceFolders"] = []map[string]string{{
			"uri":  workspaceURI,
			"name": filepath.Base(session.options.WorkspaceRoot),
		}}
	}

	var result json.RawMessage
	if err := session.call(ctx, "initialize", params, &result, false); err != nil {
		return err
	}
	return session.notify("initialized", map[string]any{}, false)
}

// SynchronizeDocument publishes the exact positive project revision as an LSP
// document version. It registers the diagnostic callback before emitting the
// corresponding didOpen or didChange notification.
func (session *Session) SynchronizeDocument(
	ctx context.Context,
	path string,
	languageID string,
	version int,
	content string,
	callback diagnosticsCallback,
) error {
	if version < 1 {
		return fmt.Errorf("lsp: document version must be positive")
	}
	if err := session.Start(ctx); err != nil {
		return err
	}
	uri, err := pathToURI(path)
	if err != nil {
		return err
	}

	session.mu.Lock()
	if session.closed || session.closing {
		session.mu.Unlock()
		return ErrSessionClosed
	}
	previousVersion, alreadyOpen := session.documentVersions[uri]
	previousCallback, hadCallback := session.callbacks[uri]
	if alreadyOpen && version <= previousVersion {
		session.mu.Unlock()
		return fmt.Errorf("lsp: document version %d does not advance %d", version, previousVersion)
	}
	session.documentVersions[uri] = version
	if callback == nil {
		delete(session.callbacks, uri)
	} else {
		session.callbacks[uri] = callback
	}
	session.mu.Unlock()

	var params map[string]any
	if alreadyOpen {
		params = map[string]any{
			"textDocument":   map[string]any{"uri": uri, "version": version},
			"contentChanges": []map[string]string{{"text": content}},
		}
	} else {
		params = map[string]any{
			"textDocument": map[string]any{
				"uri":        uri,
				"languageId": languageID,
				"version":    version,
				"text":       content,
			},
		}
	}
	method := "textDocument/didOpen"
	if alreadyOpen {
		method = "textDocument/didChange"
	}
	if err := session.notify(method, params, false); err != nil {
		session.mu.Lock()
		if alreadyOpen {
			session.documentVersions[uri] = previousVersion
		} else {
			delete(session.documentVersions, uri)
		}
		if hadCallback {
			session.callbacks[uri] = previousCallback
		} else {
			delete(session.callbacks, uri)
		}
		session.mu.Unlock()
		return err
	}
	return nil
}

func (session *Session) CloseDocument(path string) error {
	if session == nil {
		return ErrSessionClosed
	}
	uri, err := pathToURI(path)
	if err != nil {
		return err
	}
	session.mu.Lock()
	if !session.started || session.closed || session.closing {
		session.mu.Unlock()
		return nil
	}
	_, open := session.documentVersions[uri]
	delete(session.documentVersions, uri)
	delete(session.callbacks, uri)
	session.mu.Unlock()
	if !open {
		return nil
	}
	return session.notify("textDocument/didClose", map[string]any{
		"textDocument": map[string]string{"uri": uri},
	}, false)
}

func (session *Session) SignatureHelp(ctx context.Context, path string, position Position) (SignatureHelpResult, error) {
	if err := session.Start(ctx); err != nil {
		return SignatureHelpResult{}, err
	}
	uri, err := pathToURI(path)
	if err != nil {
		return SignatureHelpResult{}, err
	}
	var result SignatureHelpResult
	err = session.call(ctx, "textDocument/signatureHelp", map[string]any{
		"textDocument": map[string]string{"uri": uri},
		"position":     position,
		"context": map[string]any{
			"triggerKind":      2,
			"triggerCharacter": "(",
			"isRetrigger":      false,
		},
	}, &result, false)
	if err != nil {
		return SignatureHelpResult{}, err
	}
	return result, nil
}

func (session *Session) Close() error {
	if session == nil {
		return nil
	}

	session.mu.Lock()
	if session.closed || session.closing {
		session.mu.Unlock()
		return nil
	}
	session.closing = true
	if !session.started {
		session.closed = true
		session.closing = false
		session.mu.Unlock()
		return nil
	}
	command := session.cmd
	stdin := session.stdin
	readerDone := session.readerDone
	stderrDone := session.stderrDone
	session.mu.Unlock()

	shutdownContext, cancel := context.WithTimeout(context.Background(), defaultShutdownTimeout)
	defer cancel()
	_ = session.call(shutdownContext, "shutdown", map[string]any{}, nil, true)
	_ = session.notify("exit", map[string]any{}, true)
	if stdin != nil {
		_ = stdin.Close()
	}
	if command != nil && command.Process != nil {
		waitDone := make(chan error, 1)
		go func() { waitDone <- command.Wait() }()
		select {
		case <-shutdownContext.Done():
			_ = command.Process.Kill()
			<-waitDone
		case <-waitDone:
		}
	}
	if readerDone != nil {
		<-readerDone
	}
	if stderrDone != nil {
		<-stderrDone
	}

	session.failPending(ErrSessionClosed)
	session.mu.Lock()
	session.closed = true
	session.closing = false
	session.cmd = nil
	session.stdin = nil
	session.readerDone = nil
	session.stderrDone = nil
	session.mu.Unlock()
	return nil
}

func (session *Session) call(ctx context.Context, method string, params any, result any, allowClosing bool) error {
	if ctx == nil {
		ctx = context.Background()
	}
	requestID := strconv.FormatUint(atomic.AddUint64(&session.requestID, 1), 10)
	response := make(chan rpcEnvelope, 1)
	session.mu.Lock()
	if session.closed || !session.started || (session.closing && !allowClosing) {
		session.mu.Unlock()
		return ErrSessionClosed
	}
	session.pending[requestID] = response
	session.mu.Unlock()

	if err := session.writeEnvelope(map[string]any{
		"jsonrpc": "2.0",
		"id":      requestID,
		"method":  method,
		"params":  params,
	}, allowClosing); err != nil {
		session.removePending(requestID)
		return err
	}

	timeout := session.options.RequestTimeout
	if deadline, ok := ctx.Deadline(); ok {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			session.removePending(requestID)
			return ctx.Err()
		}
		if remaining < timeout {
			timeout = remaining
		}
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		session.removePending(requestID)
		return ctx.Err()
	case <-timer.C:
		session.removePending(requestID)
		return fmt.Errorf("%w: %s", ErrRequestTimedOut, method)
	case envelope := <-response:
		session.removePending(requestID)
		if envelope.Error != nil {
			return fmt.Errorf("lsp: %s failed (%d): %s", method, envelope.Error.Code, envelope.Error.Message)
		}
		if result == nil || len(envelope.Result) == 0 || string(envelope.Result) == "null" {
			return nil
		}
		if err := json.Unmarshal(envelope.Result, result); err != nil {
			return fmt.Errorf("lsp: decode %s result: %w", method, err)
		}
		return nil
	}
}

func (session *Session) notify(method string, params any, allowClosing bool) error {
	return session.writeEnvelope(map[string]any{
		"jsonrpc": "2.0",
		"method":  method,
		"params":  params,
	}, allowClosing)
}

func (session *Session) writeEnvelope(payload map[string]any, allowClosing bool) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("lsp: encode request: %w", err)
	}
	session.mu.Lock()
	if session.closed || !session.started || (session.closing && !allowClosing) {
		session.mu.Unlock()
		return ErrSessionClosed
	}
	stdin := session.stdin
	session.mu.Unlock()
	if stdin == nil {
		return ErrSessionNotStarted
	}

	session.writeMu.Lock()
	defer session.writeMu.Unlock()
	if _, err := io.WriteString(stdin, fmt.Sprintf("Content-Length: %d\r\n\r\n", len(encoded))); err != nil {
		return fmt.Errorf("lsp: write header: %w", err)
	}
	if _, err := stdin.Write(encoded); err != nil {
		return fmt.Errorf("lsp: write body: %w", err)
	}
	return nil
}

func (session *Session) readLoop(stdout io.Reader) {
	defer close(session.readerDone)
	reader := bufio.NewReader(stdout)
	for {
		envelope, err := readEnvelope(reader)
		if err != nil {
			session.failPending(err)
			return
		}
		session.dispatch(envelope)
	}
}

func (session *Session) drainStderr(stderr io.Reader) {
	defer close(session.stderrDone)
	_, _ = io.Copy(io.Discard, stderr)
}

func (session *Session) dispatch(envelope rpcEnvelope) {
	if requestID := envelopeID(envelope.ID); requestID != "" {
		session.mu.Lock()
		response := session.pending[requestID]
		session.mu.Unlock()
		if response != nil {
			select {
			case response <- envelope:
			default:
			}
		}
		return
	}
	if envelope.Method != "textDocument/publishDiagnostics" {
		return
	}
	var params PublishDiagnosticsParams
	if err := json.Unmarshal(envelope.Params, &params); err != nil {
		return
	}
	session.mu.Lock()
	callback := session.callbacks[params.URI]
	session.mu.Unlock()
	if callback != nil {
		callback(params)
	}
}

func (session *Session) failPending(cause error) {
	if cause == nil {
		cause = ErrSessionClosed
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	for requestID, response := range session.pending {
		select {
		case response <- rpcEnvelope{Error: &rpcError{Code: -32000, Message: cause.Error()}}:
		default:
		}
		delete(session.pending, requestID)
	}
}

func (session *Session) removePending(requestID string) {
	session.mu.Lock()
	delete(session.pending, requestID)
	session.mu.Unlock()
}

func readEnvelope(reader *bufio.Reader) (rpcEnvelope, error) {
	contentLength := -1
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return rpcEnvelope{}, err
		}
		if line == "\r\n" || line == "\n" {
			break
		}
		key, value, found := strings.Cut(strings.TrimSpace(line), ":")
		if !found || !strings.EqualFold(strings.TrimSpace(key), "Content-Length") {
			continue
		}
		parsed, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || parsed < 0 {
			return rpcEnvelope{}, fmt.Errorf("lsp: invalid content length %q", value)
		}
		contentLength = parsed
	}
	if contentLength < 0 {
		return rpcEnvelope{}, fmt.Errorf("lsp: response omitted Content-Length")
	}
	body := make([]byte, contentLength)
	if _, err := io.ReadFull(reader, body); err != nil {
		return rpcEnvelope{}, err
	}
	var envelope rpcEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return rpcEnvelope{}, fmt.Errorf("lsp: decode response: %w", err)
	}
	return envelope, nil
}

func envelopeID(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var stringID string
	if err := json.Unmarshal(raw, &stringID); err == nil {
		return stringID
	}
	var numericID int64
	if err := json.Unmarshal(raw, &numericID); err == nil {
		return strconv.FormatInt(numericID, 10)
	}
	return ""
}

func pathToURI(path string) (string, error) {
	resolved, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("lsp: resolve document path: %w", err)
	}
	return (&url.URL{Scheme: "file", Path: filepath.ToSlash(resolved)}).String(), nil
}
