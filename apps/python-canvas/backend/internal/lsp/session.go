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
	sessionDrainTimeout    = 250 * time.Millisecond
)

var (
	ErrSessionCommandRequired    = errors.New("lsp: command is required")
	ErrSessionClosed             = errors.New("lsp: session is closed")
	ErrSessionNotStarted         = errors.New("lsp: session is not started")
	ErrRequestTimedOut           = errors.New("lsp: request timed out")
	ErrSessionStreamFailed       = errors.New("lsp: session stream failed")
	ErrMalformedCompletionResult = errors.New("lsp: malformed completion result")
)

type SessionOptions struct {
	Command        string
	Args           []string
	WorkspaceRoot  string
	RequestTimeout time.Duration
	Environment    []string
	Configuration  map[string]any
}

type rpcEnvelope struct {
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
	failure error
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type documentSynchronization struct {
	uri             string
	previousVersion int
	alreadyOpen     bool
}

type Session struct {
	options SessionOptions

	mu      sync.Mutex
	writeMu sync.Mutex

	started     bool
	starting    bool
	initialized bool
	closing     bool
	closed      bool
	startDone   chan struct{}
	startErr    error
	cmd         *exec.Cmd
	stdin       io.WriteCloser
	stdout      io.ReadCloser
	stderr      io.ReadCloser

	readerDone chan struct{}
	stderrDone chan struct{}
	stopDone   chan struct{}
	forceStop  chan struct{}
	stopOnce   sync.Once
	forcedStop bool

	pending                       map[string]chan rpcEnvelope
	documentVersions              map[string]int
	pullDiagnosticsReady          chan struct{}
	pullDiagnosticsReadyOnce      sync.Once
	pullDiagnosticsRegistered     bool
	pullDiagnosticsRegistrationID string
	terminalErr                   error
	requestID                     uint64
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
	if options.Environment != nil {
		options.Environment = append([]string(nil), options.Environment...)
	}
	if options.Configuration != nil {
		configuration, err := cloneConfiguration(options.Configuration)
		if err != nil {
			return nil, err
		}
		options.Configuration = configuration
	}
	return &Session{
		options:              options,
		pending:              make(map[string]chan rpcEnvelope),
		documentVersions:     make(map[string]int),
		pullDiagnosticsReady: make(chan struct{}),
	}, nil
}

func (session *Session) Start(ctx context.Context) error {
	if session == nil {
		return ErrSessionClosed
	}
	ctx = requestContext(ctx)
	if err := ctx.Err(); err != nil {
		return err
	}

	session.mu.Lock()
	if session.isClosingOrClosedLocked() {
		session.mu.Unlock()
		return ErrSessionClosed
	}
	if session.terminalErr != nil {
		failure := session.terminalErr
		session.mu.Unlock()
		return failure
	}
	if session.initialized {
		session.mu.Unlock()
		return nil
	}
	if session.starting {
		startDone := session.startDone
		session.mu.Unlock()
		return session.awaitInitialization(ctx, startDone)
	}
	if session.started {
		session.mu.Unlock()
		return ErrSessionClosed
	}
	if err := session.startProcessLocked(); err != nil {
		session.mu.Unlock()
		return err
	}
	session.starting = true
	session.startDone = make(chan struct{})
	session.startErr = nil
	startDone := session.startDone
	session.mu.Unlock()

	go session.initializeStartedProcess()
	return session.awaitInitialization(ctx, startDone)
}

func (session *Session) initializeStartedProcess() {
	err := session.initialize(context.Background())
	if err != nil {
		_ = session.Close()
	}

	session.mu.Lock()
	if err == nil && session.isClosingOrClosedLocked() {
		err = ErrSessionClosed
	}
	session.starting = false
	session.initialized = err == nil
	session.startErr = err
	startDone := session.startDone
	session.mu.Unlock()
	close(startDone)
}

func (session *Session) awaitInitialization(ctx context.Context, startDone <-chan struct{}) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-startDone:
	}

	session.mu.Lock()
	defer session.mu.Unlock()
	if session.initialized && !session.isClosingOrClosedLocked() {
		return nil
	}
	if session.startErr != nil {
		return session.startErr
	}
	if session.terminalErr != nil {
		return session.terminalErr
	}
	return ErrSessionClosed
}

func (session *Session) startProcessLocked() error {
	command := exec.Command(session.options.Command, session.options.Args...)
	if session.options.Environment == nil {
		command.Env = os.Environ()
	} else {
		command.Env = append([]string(nil), session.options.Environment...)
	}
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
	session.stdout = stdout
	session.stderr = stderr
	session.started = true
	session.readerDone = make(chan struct{})
	session.stderrDone = make(chan struct{})
	session.stopDone = make(chan struct{})
	session.forceStop = make(chan struct{})
	go session.readLoop(stdout, session.readerDone)
	go session.drainStderr(stderr, session.stderrDone)
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
				"diagnostic": map[string]any{
					"dynamicRegistration": true,
					"relatedInformation":  true,
				},
			},
			"workspace": map[string]any{
				"diagnostics": map[string]any{"refreshSupport": true},
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
	if err := session.notify("initialized", map[string]any{}, false); err != nil {
		return err
	}
	if session.options.Configuration == nil {
		return nil
	}
	return session.notify("workspace/didChangeConfiguration", map[string]any{
		"settings": session.options.Configuration,
	}, false)
}

func cloneConfiguration(configuration map[string]any) (map[string]any, error) {
	encoded, err := json.Marshal(configuration)
	if err != nil {
		return nil, fmt.Errorf("lsp: encode session configuration: %w", err)
	}
	var cloned map[string]any
	if err := json.Unmarshal(encoded, &cloned); err != nil {
		return nil, fmt.Errorf("lsp: decode session configuration: %w", err)
	}
	return cloned, nil
}

func (session *Session) SynchronizeDocument(
	ctx context.Context,
	path string,
	languageID string,
	version int,
	content string,
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

	synchronization, err := session.registerDocumentSynchronization(uri, version)
	if err != nil {
		return err
	}

	method, params := documentSynchronizationNotification(synchronization.alreadyOpen, uri, languageID, version, content)
	if err := session.notify(method, params, false); err != nil {
		session.rollbackDocumentSynchronization(synchronization)
		return err
	}
	return nil
}

func (session *Session) registerDocumentSynchronization(
	uri string,
	version int,
) (documentSynchronization, error) {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.isClosingOrClosedLocked() {
		return documentSynchronization{}, ErrSessionClosed
	}
	if session.terminalErr != nil {
		return documentSynchronization{}, session.terminalErr
	}
	previousVersion, alreadyOpen := session.documentVersions[uri]
	if alreadyOpen && version <= previousVersion {
		return documentSynchronization{}, fmt.Errorf("lsp: document version %d does not advance %d", version, previousVersion)
	}
	session.documentVersions[uri] = version
	return documentSynchronization{
		uri:             uri,
		previousVersion: previousVersion,
		alreadyOpen:     alreadyOpen,
	}, nil
}

func (session *Session) rollbackDocumentSynchronization(synchronization documentSynchronization) {
	session.mu.Lock()
	defer session.mu.Unlock()
	if synchronization.alreadyOpen {
		session.documentVersions[synchronization.uri] = synchronization.previousVersion
	} else {
		delete(session.documentVersions, synchronization.uri)
	}
}

func (session *Session) isClosingOrClosedLocked() bool {
	return session.closed || session.closing
}

func documentSynchronizationNotification(
	alreadyOpen bool,
	uri string,
	languageID string,
	version int,
	content string,
) (string, map[string]any) {
	if alreadyOpen {
		return "textDocument/didChange", map[string]any{
			"textDocument":   map[string]any{"uri": uri, "version": version},
			"contentChanges": []map[string]string{{"text": content}},
		}
	}
	return "textDocument/didOpen", map[string]any{
		"textDocument": map[string]any{
			"uri":        uri,
			"languageId": languageID,
			"version":    version,
			"text":       content,
		},
	}
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

func (session *Session) Completion(ctx context.Context, path string, position Position) (CompletionResult, error) {
	if err := session.Start(ctx); err != nil {
		return CompletionResult{}, err
	}
	uri, err := pathToURI(path)
	if err != nil {
		return CompletionResult{}, err
	}
	var result CompletionResult
	err = session.call(ctx, "textDocument/completion", map[string]any{
		"textDocument": map[string]string{"uri": uri},
		"position":     position,
		"context": map[string]any{
			"triggerKind": 1,
		},
	}, &result, false)
	if err != nil {
		return CompletionResult{}, err
	}
	if result.Items == nil {
		return CompletionResult{}, fmt.Errorf("%w: items array is required", ErrMalformedCompletionResult)
	}
	return result, nil
}

func (session *Session) Close() error {
	if session == nil {
		return nil
	}

	stopDone := session.requestStop(false)
	if stopDone != nil {
		<-stopDone
	}
	return nil
}

func (session *Session) requestStop(force bool) <-chan struct{} {
	session.mu.Lock()
	if session.closed {
		session.mu.Unlock()
		return nil
	}
	if !session.started {
		session.closed = true
		session.mu.Unlock()
		return nil
	}
	if force && !session.forcedStop {
		close(session.forceStop)
		session.forcedStop = true
	}
	session.closing = true
	command := session.cmd
	stdin := session.stdin
	stdout := session.stdout
	stderr := session.stderr
	readerDone := session.readerDone
	stderrDone := session.stderrDone
	forceStop := session.forceStop
	stopDone := session.stopDone
	session.mu.Unlock()

	session.stopOnce.Do(func() {
		go session.stopStartedProcess(command, stdin, stdout, stderr, readerDone, stderrDone, forceStop, stopDone)
	})
	return stopDone
}

func (session *Session) stopStartedProcess(
	command *exec.Cmd,
	stdin io.WriteCloser,
	stdout io.ReadCloser,
	stderr io.ReadCloser,
	readerDone <-chan struct{},
	stderrDone <-chan struct{},
	forceStop <-chan struct{},
	stopDone chan struct{},
) {
	shutdownContext, cancel := context.WithTimeout(context.Background(), defaultShutdownTimeout)
	defer cancel()

	if !stopForced(forceStop) {
		_ = session.call(shutdownContext, "shutdown", map[string]any{}, nil, true)
		_ = session.notify("exit", map[string]any{}, true)
	}
	if stdin != nil {
		_ = stdin.Close()
	}
	waitForSessionProcess(command, stdout, stderr, readerDone, stderrDone, shutdownContext, forceStop)

	session.failPending(ErrSessionClosed)
	session.mu.Lock()
	session.closed = true
	session.closing = false
	session.cmd = nil
	session.stdin = nil
	session.stdout = nil
	session.stderr = nil
	session.readerDone = nil
	session.stderrDone = nil
	session.forceStop = nil
	session.mu.Unlock()
	close(stopDone)
}

func stopForced(forceStop <-chan struct{}) bool {
	select {
	case <-forceStop:
		return true
	default:
		return false
	}
}

func waitForSessionProcess(
	command *exec.Cmd,
	stdout io.Closer,
	stderr io.Closer,
	readerDone <-chan struct{},
	stderrDone <-chan struct{},
	shutdownContext context.Context,
	forceStop <-chan struct{},
) {
	if command == nil || command.Process == nil {
		return
	}

	terminated := !waitForSessionStreams(readerDone, stderrDone, shutdownContext.Done(), forceStop)
	if terminated {
		_ = command.Process.Kill()
		waitForSessionStreamDrain(stdout, stderr, readerDone, stderrDone)
	}
	waitDone := make(chan error, 1)
	go func() { waitDone <- command.Wait() }()
	if terminated {
		<-waitDone
		return
	}
	select {
	case <-waitDone:
	case <-shutdownContext.Done():
		_ = command.Process.Kill()
		<-waitDone
	case <-forceStop:
		_ = command.Process.Kill()
		<-waitDone
	}
}

func waitForSessionStreams(
	readerDone <-chan struct{},
	stderrDone <-chan struct{},
	shutdownDone <-chan struct{},
	forceStop <-chan struct{},
) bool {
	for readerDone != nil || stderrDone != nil {
		select {
		case <-readerDone:
			readerDone = nil
		case <-stderrDone:
			stderrDone = nil
		case <-shutdownDone:
			return false
		case <-forceStop:
			return false
		}
	}
	return true
}

func waitForSessionStreamDrain(
	stdout io.Closer,
	stderr io.Closer,
	readerDone <-chan struct{},
	stderrDone <-chan struct{},
) {
	drainContext, cancel := context.WithTimeout(context.Background(), sessionDrainTimeout)
	defer cancel()
	if waitForSessionStreams(readerDone, stderrDone, drainContext.Done(), nil) {
		return
	}
	if stdout != nil {
		_ = stdout.Close()
	}
	if stderr != nil {
		_ = stderr.Close()
	}
	_ = waitForSessionStreams(readerDone, stderrDone, nil, nil)
}

func (session *Session) call(ctx context.Context, method string, params any, result any, allowClosing bool) error {
	ctx = requestContext(ctx)
	requestID, response, err := session.registerCall(allowClosing)
	if err != nil {
		return err
	}

	if err := session.writeEnvelope(map[string]any{
		"jsonrpc": "2.0",
		"id":      requestID,
		"method":  method,
		"params":  params,
	}, allowClosing); err != nil {
		session.removePending(requestID)
		return err
	}
	return session.awaitCallResponse(ctx, method, requestID, response, result)
}

func requestContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

func (session *Session) registerCall(allowClosing bool) (string, chan rpcEnvelope, error) {
	requestID := strconv.FormatUint(atomic.AddUint64(&session.requestID, 1), 10)
	response := make(chan rpcEnvelope, 1)
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.terminalErr != nil {
		return "", nil, session.terminalErr
	}
	if !session.acceptsCallLocked(allowClosing) {
		return "", nil, ErrSessionClosed
	}
	session.pending[requestID] = response
	return requestID, response, nil
}

func (session *Session) acceptsCallLocked(allowClosing bool) bool {
	if session.closed || !session.started {
		return false
	}
	return !session.closing || allowClosing
}

func (session *Session) awaitCallResponse(
	ctx context.Context,
	method string,
	requestID string,
	response <-chan rpcEnvelope,
	result any,
) error {
	timeout, err := effectiveRequestTimeout(ctx, session.options.RequestTimeout)
	if err != nil {
		session.removePending(requestID)
		return err
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
		return session.decodeCallResponse(method, requestID, envelope, result)
	}
}

func effectiveRequestTimeout(ctx context.Context, configured time.Duration) (time.Duration, error) {
	deadline, hasDeadline := ctx.Deadline()
	if !hasDeadline {
		return configured, nil
	}
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return 0, ctx.Err()
	}
	if remaining < configured {
		return remaining, nil
	}
	return configured, nil
}

func (session *Session) decodeCallResponse(
	method string,
	requestID string,
	envelope rpcEnvelope,
	result any,
) error {
	session.removePending(requestID)
	if envelope.failure != nil {
		return envelope.failure
	}
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
	if session.terminalErr != nil {
		failure := session.terminalErr
		session.mu.Unlock()
		return failure
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

func (session *Session) readLoop(stdout io.Reader, readerDone chan<- struct{}) {
	defer close(readerDone)
	reader := bufio.NewReader(stdout)
	for {
		envelope, err := readEnvelope(reader)
		if err != nil {
			session.failSession(fmt.Errorf("lsp: read server stream: %w", err))
			return
		}
		session.dispatch(envelope)
	}
}

func (session *Session) drainStderr(stderr io.Reader, stderrDone chan<- struct{}) {
	defer close(stderrDone)
	_, _ = io.Copy(io.Discard, stderr)
}

func (session *Session) dispatch(envelope rpcEnvelope) {
	if requestID := envelopeID(envelope.ID); requestID != "" {
		if envelope.Method != "" {
			session.dispatchServerRequest(envelope)
			return
		}
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
	session.dispatchServerNotification(envelope)
}

func (session *Session) failSession(cause error) {
	if cause == nil {
		cause = ErrSessionClosed
	}
	failure := fmt.Errorf("%w: %w", ErrSessionStreamFailed, cause)

	session.mu.Lock()
	if session.terminalErr != nil {
		session.mu.Unlock()
		return
	}
	session.terminalErr = failure
	session.mu.Unlock()

	session.failPending(failure)
	session.requestStop(true)
}

func (session *Session) failPending(cause error) {
	if cause == nil {
		cause = ErrSessionClosed
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	for requestID, response := range session.pending {
		select {
		case response <- rpcEnvelope{failure: cause}:
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
		parsed, found, err := contentLengthHeader(line)
		if err != nil {
			return rpcEnvelope{}, err
		}
		if found {
			contentLength = parsed
		}
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

func contentLengthHeader(line string) (int, bool, error) {
	key, value, found := strings.Cut(strings.TrimSpace(line), ":")
	if !found || !strings.EqualFold(strings.TrimSpace(key), "Content-Length") {
		return 0, false, nil
	}
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || parsed < 0 {
		return 0, false, fmt.Errorf("lsp: invalid content length %q", value)
	}
	return parsed, true, nil
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
