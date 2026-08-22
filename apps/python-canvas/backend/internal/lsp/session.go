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
}

// diagnosticsCallback receives either one valid publication or the terminal
// stream/protocol failure that prevents any later publication from arriving.
type diagnosticsCallback func(PublishDiagnosticsParams, error)

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

type publishDiagnosticsPayload struct {
	URI         *string              `json:"uri"`
	Version     *int                 `json:"version,omitempty"`
	Diagnostics *[]diagnosticPayload `json:"diagnostics"`
}

type diagnosticPayload struct {
	Range    *rangePayload             `json:"range"`
	Severity diagnosticSeverityPayload `json:"severity,omitempty"`
	Message  *string                   `json:"message"`
	Code     diagnosticCodePayload     `json:"code,omitempty"`
}

type rangePayload struct {
	Start *positionPayload `json:"start"`
	End   *positionPayload `json:"end"`
}

type positionPayload struct {
	Line      *int `json:"line"`
	Character *int `json:"character"`
}

type diagnosticSeverityPayload struct {
	present bool
	value   int
}

// diagnosticCodePayload accepts the provider's optional diagnostic code only
// as a nonblank string. The project layer receives the normalized string, not
// raw JSON, so semantic classification never depends on protocol shapes.
type diagnosticCodePayload struct {
	present bool
	value   string
}

type documentSynchronization struct {
	uri              string
	previousVersion  int
	alreadyOpen      bool
	previousCallback diagnosticsCallback
	hadCallback      bool
}

// Session owns one child language-server process and its JSON-RPC state. One
// project store serializes mutations, while this type also keeps protocol
// writes and pending requests safe on their own boundaries.
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

	readerDone chan struct{}
	stderrDone chan struct{}

	pending          map[string]chan rpcEnvelope
	documentVersions map[string]int
	callbacks        map[string]diagnosticsCallback
	terminalErr      error
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

// Start initializes the shared server independently from the request that
// happened to trigger startup. A canceled request must not close a session
// that later requests can use.
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

	synchronization, err := session.registerDocumentSynchronization(uri, version, callback)
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
	callback diagnosticsCallback,
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
	previousCallback, hadCallback := session.callbacks[uri]
	if alreadyOpen && version <= previousVersion {
		return documentSynchronization{}, fmt.Errorf("lsp: document version %d does not advance %d", version, previousVersion)
	}
	session.documentVersions[uri] = version
	if callback == nil {
		delete(session.callbacks, uri)
	} else {
		session.callbacks[uri] = callback
	}
	return documentSynchronization{
		uri:              uri,
		previousVersion:  previousVersion,
		alreadyOpen:      alreadyOpen,
		previousCallback: previousCallback,
		hadCallback:      hadCallback,
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
	if synchronization.hadCallback {
		session.callbacks[synchronization.uri] = synchronization.previousCallback
	} else {
		delete(session.callbacks, synchronization.uri)
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
	waitForSessionProcess(command, shutdownContext)
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

func waitForSessionProcess(command *exec.Cmd, ctx context.Context) {
	if command == nil || command.Process == nil {
		return
	}
	waitDone := make(chan error, 1)
	go func() { waitDone <- command.Wait() }()
	select {
	case <-ctx.Done():
		_ = command.Process.Kill()
		<-waitDone
	case <-waitDone:
	}
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

func (session *Session) readLoop(stdout io.Reader) {
	defer close(session.readerDone)
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
	params, err := decodePublishDiagnostics(envelope.Params)
	if err != nil {
		session.failSession(fmt.Errorf("lsp: decode publishDiagnostics: %w", err))
		return
	}
	session.mu.Lock()
	callback := session.callbacks[params.URI]
	session.mu.Unlock()
	if callback != nil {
		callback(params, nil)
	}
}

func decodePublishDiagnostics(raw json.RawMessage) (PublishDiagnosticsParams, error) {
	payload, err := decodePublishDiagnosticsPayload(raw)
	if err != nil {
		return PublishDiagnosticsParams{}, err
	}
	return publishDiagnosticsFromPayload(payload)
}

func decodePublishDiagnosticsPayload(raw json.RawMessage) (publishDiagnosticsPayload, error) {
	var payload publishDiagnosticsPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return publishDiagnosticsPayload{}, err
	}
	return payload, nil
}

func publishDiagnosticsFromPayload(payload publishDiagnosticsPayload) (PublishDiagnosticsParams, error) {
	if payload.URI == nil || strings.TrimSpace(*payload.URI) == "" {
		return PublishDiagnosticsParams{}, errors.New("publishDiagnostics URI is required")
	}
	if payload.Diagnostics == nil {
		return PublishDiagnosticsParams{}, errors.New("publishDiagnostics diagnostics array is required")
	}
	diagnostics, err := diagnosticsFromPayload(*payload.Diagnostics)
	if err != nil {
		return PublishDiagnosticsParams{}, err
	}
	return PublishDiagnosticsParams{
		URI:         *payload.URI,
		Version:     payload.Version,
		Diagnostics: diagnostics,
	}, nil
}

func diagnosticsFromPayload(payloads []diagnosticPayload) ([]Diagnostic, error) {
	diagnostics := make([]Diagnostic, len(payloads))
	for index, payload := range payloads {
		diagnostic, err := diagnosticFromPayload(payload)
		if err != nil {
			return nil, fmt.Errorf("publishDiagnostics diagnostic %d is malformed: %w", index, err)
		}
		diagnostics[index] = diagnostic
	}
	return diagnostics, nil
}

func diagnosticFromPayload(payload diagnosticPayload) (Diagnostic, error) {
	rangeValue, err := rangeFromPayload(payload.Range)
	if err != nil {
		return Diagnostic{}, err
	}
	if payload.Message == nil || strings.TrimSpace(*payload.Message) == "" {
		return Diagnostic{}, errors.New("message is required")
	}
	severity, err := severityFromPayload(payload.Severity)
	if err != nil {
		return Diagnostic{}, err
	}
	return Diagnostic{
		Range:    rangeValue,
		Severity: severity,
		Message:  *payload.Message,
		Code:     payload.Code.value,
	}, nil
}

func rangeFromPayload(payload *rangePayload) (Range, error) {
	if payload == nil {
		return Range{}, errors.New("range is required")
	}
	start, err := positionFromPayload(payload.Start)
	if err != nil {
		return Range{}, fmt.Errorf("start: %w", err)
	}
	end, err := positionFromPayload(payload.End)
	if err != nil {
		return Range{}, fmt.Errorf("end: %w", err)
	}
	if positionPrecedes(end, start) {
		return Range{}, errors.New("end position precedes start position")
	}
	return Range{Start: start, End: end}, nil
}

func positionFromPayload(payload *positionPayload) (Position, error) {
	if payload == nil {
		return Position{}, errors.New("position is required")
	}
	if payload.Line == nil || payload.Character == nil {
		return Position{}, errors.New("line and character are required")
	}
	if *payload.Line < 0 || *payload.Character < 0 {
		return Position{}, errors.New("line and character must be nonnegative")
	}
	return Position{Line: *payload.Line, Character: *payload.Character}, nil
}

func positionPrecedes(left Position, right Position) bool {
	return left.Line < right.Line || left.Line == right.Line && left.Character < right.Character
}

func severityFromPayload(payload diagnosticSeverityPayload) (int, error) {
	if !payload.present {
		return 0, nil
	}
	if payload.value < 1 || payload.value > 4 {
		return 0, errors.New("severity must be between 1 and 4")
	}
	return payload.value, nil
}

func (payload *diagnosticSeverityPayload) UnmarshalJSON(raw []byte) error {
	payload.present = true
	severity, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil {
		return errors.New("severity must be an integer")
	}
	payload.value = severity
	return nil
}

func (payload *diagnosticCodePayload) UnmarshalJSON(raw []byte) error {
	payload.present = true
	var code string
	if err := json.Unmarshal(raw, &code); err != nil {
		return errors.New("code must be a string")
	}
	if strings.TrimSpace(code) == "" {
		return errors.New("code must not be empty")
	}
	payload.value = code
	return nil
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
	callbacks := make([]diagnosticsCallback, 0, len(session.callbacks))
	for _, callback := range session.callbacks {
		if callback != nil {
			callbacks = append(callbacks, callback)
		}
	}
	session.mu.Unlock()

	session.failPending(failure)
	for _, callback := range callbacks {
		callback(PublishDiagnosticsParams{}, failure)
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
