package lsp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	defaultShutdownTimeout = 3 * time.Second
	defaultRequestTimeout  = 5 * time.Second
)

var (
	ErrSessionCommandRequired = errors.New("lsp: command is required")
	ErrSessionClosed          = errors.New("lsp: session is closed")
	ErrSessionNotStarted      = errors.New("lsp: session is not started")
	ErrRequestTimedOut        = errors.New("lsp: request timed out")
)

type SessionOptions struct {
	WorkspaceRoot  string
	Command        string
	Args           []string
	Environment    []string
	WorkingDir     string
	Settings       map[string]any
	RequestTimeout time.Duration
}

type Position struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

type Range struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

type Diagnostic struct {
	Range    Range  `json:"range"`
	Severity int    `json:"severity,omitempty"`
	Source   string `json:"source,omitempty"`
	Message  string `json:"message"`
	Code     any    `json:"code,omitempty"`
}

type PublishDiagnosticsParams struct {
	URI         string       `json:"uri"`
	Version     *int         `json:"version,omitempty"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}

type CompletionItem struct {
	Label      string `json:"label"`
	Kind       int    `json:"kind,omitempty"`
	InsertText string `json:"insertText,omitempty"`
	Detail     string `json:"detail,omitempty"`
}

type CompletionResult struct {
	IsIncomplete bool             `json:"isIncomplete"`
	Items        []CompletionItem `json:"items"`
}

type SignatureHelpResult struct {
	Signatures      []SignatureInformation `json:"signatures,omitempty"`
	ActiveSignature *int                   `json:"activeSignature,omitempty"`
	ActiveParameter *int                   `json:"activeParameter,omitempty"`
}

type SignatureInformation struct {
	Label         string                 `json:"label"`
	Documentation any                    `json:"documentation,omitempty"`
	Parameters    []ParameterInformation `json:"parameters,omitempty"`
}

type ParameterInformation struct {
	Label         json.RawMessage `json:"label"`
	Documentation any             `json:"documentation,omitempty"`
}

type DiagnosticsCallback func(PublishDiagnosticsParams)

type SyncedDocument struct {
	Path       string
	LanguageID string
	Content    string
	Callback   DiagnosticsCallback
}

type Session struct {
	options SessionOptions

	writeMu sync.Mutex
	mu      sync.Mutex

	started    bool
	closed     bool
	cmd        *exec.Cmd
	stdin      io.WriteCloser
	readerErr  error
	readerDone chan struct{}

	pending             map[string]chan rpcEnvelope
	diagnosticsCallback map[string]DiagnosticsCallback
	documentVersion     map[string]int
	stderr              bytes.Buffer
	stderrDone          chan struct{}

	requestTimeout time.Duration
	requestSeq     uint64
}

type Service struct {
	session *Session

	mu      sync.Mutex
	tracked map[string]SyncedDocument
}

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

func NewSession(options SessionOptions) (*Session, error) {
	if strings.TrimSpace(options.Command) == "" {
		return nil, ErrSessionCommandRequired
	}
	if options.RequestTimeout <= 0 {
		options.RequestTimeout = defaultRequestTimeout
	}
	return &Session{
		options:             options,
		pending:             map[string]chan rpcEnvelope{},
		diagnosticsCallback: map[string]DiagnosticsCallback{},
		documentVersion:     map[string]int{},
		requestTimeout:      options.RequestTimeout,
	}, nil
}

func NewService(session *Session) *Service {
	if session == nil {
		return nil
	}
	return &Service{
		session: session,
		tracked: map[string]SyncedDocument{},
	}
}

func (s *Session) Start(ctx context.Context) error {
	if s == nil {
		return ErrSessionClosed
	}

	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return ErrSessionClosed
	}
	if s.started {
		s.mu.Unlock()
		return nil
	}

	cmd := exec.CommandContext(ctx, s.options.Command, s.options.Args...)
	if len(s.options.Environment) > 0 {
		cmd.Env = append([]string(nil), s.options.Environment...)
	}
	if strings.TrimSpace(s.options.WorkingDir) != "" {
		cmd.Dir = s.options.WorkingDir
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("lsp: stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("lsp: stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("lsp: stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		s.mu.Unlock()
		return fmt.Errorf("lsp: start process: %w", err)
	}

	s.cmd = cmd
	s.stdin = stdin
	s.started = true
	s.readerDone = make(chan struct{})
	s.stderrDone = make(chan struct{})
	s.readerErr = nil
	s.stderr.Reset()

	go s.readLoop(stdout)
	go s.captureStderr(stderr)
	s.mu.Unlock()

	initializeParams := map[string]any{
		"capabilities": map[string]any{
			"workspace": map[string]any{
				"didChangeWatchedFiles": map[string]any{
					"dynamicRegistration": true,
				},
			},
		},
	}
	if strings.TrimSpace(s.options.WorkspaceRoot) != "" {
		uri, err := pathToURI(s.options.WorkspaceRoot)
		if err != nil {
			return fmt.Errorf("lsp: workspace root uri: %w", err)
		}
		initializeParams["workspaceFolders"] = []map[string]string{
			{"uri": uri},
		}
	}

	var initializeResult map[string]any
	if err := s.callStarted(ctx, "initialize", initializeParams, &initializeResult); err != nil {
		_ = s.Close(context.Background())
		return err
	}

	if len(s.options.Settings) > 0 {
		if err := s.notify("workspace/didChangeConfiguration", map[string]any{
			"settings": s.options.Settings,
		}); err != nil {
			_ = s.Close(context.Background())
			return err
		}
	}

	return nil
}

func (s *Session) OpenDocument(ctx context.Context, path string, languageID string, content string, callback DiagnosticsCallback) error {
	if err := s.Start(ctx); err != nil {
		return err
	}
	uri, err := pathToURI(path)
	if err != nil {
		return fmt.Errorf("lsp: open document uri: %w", err)
	}

	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return ErrSessionClosed
	}
	if callback != nil {
		s.diagnosticsCallback[uri] = callback
	} else {
		delete(s.diagnosticsCallback, uri)
	}
	_, alreadyOpen := s.documentVersion[uri]
	if !alreadyOpen {
		s.documentVersion[uri] = 0
	}
	s.mu.Unlock()

	if alreadyOpen {
		return s.UpdateDocument(ctx, path, content)
	}

	return s.notify("textDocument/didOpen", map[string]any{
		"textDocument": map[string]any{
			"uri":        uri,
			"languageId": strings.TrimSpace(languageID),
			"version":    0,
			"text":       content,
		},
	})
}

func (s *Session) UpdateDocument(ctx context.Context, path string, content string) error {
	if err := s.Start(ctx); err != nil {
		return err
	}
	uri, err := pathToURI(path)
	if err != nil {
		return fmt.Errorf("lsp: update document uri: %w", err)
	}

	s.mu.Lock()
	version, ok := s.documentVersion[uri]
	if !ok {
		s.mu.Unlock()
		return ErrSessionNotStarted
	}
	version++
	s.documentVersion[uri] = version
	s.mu.Unlock()

	return s.notify("textDocument/didChange", map[string]any{
		"textDocument": map[string]any{
			"uri":     uri,
			"version": version,
		},
		"contentChanges": []map[string]any{
			{"text": content},
		},
	})
}

func (s *Session) CloseDocument(path string) error {
	if s == nil {
		return ErrSessionClosed
	}
	uri, err := pathToURI(path)
	if err != nil {
		return fmt.Errorf("lsp: close document uri: %w", err)
	}

	s.mu.Lock()
	if !s.started || s.closed {
		s.mu.Unlock()
		return nil
	}
	delete(s.documentVersion, uri)
	delete(s.diagnosticsCallback, uri)
	s.mu.Unlock()

	return s.notify("textDocument/didClose", map[string]any{
		"textDocument": map[string]any{
			"uri": uri,
		},
	})
}

func (s *Session) SetDiagnosticsCallback(path string, callback DiagnosticsCallback) error {
	if s == nil {
		return ErrSessionClosed
	}
	uri, err := pathToURI(path)
	if err != nil {
		return fmt.Errorf("lsp: callback document uri: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return ErrSessionClosed
	}
	if callback != nil {
		s.diagnosticsCallback[uri] = callback
	} else {
		delete(s.diagnosticsCallback, uri)
	}
	return nil
}

func (s *Session) Completion(ctx context.Context, path string, line int, character int) (CompletionResult, error) {
	var result CompletionResult
	if err := s.Start(ctx); err != nil {
		return result, err
	}
	uri, err := pathToURI(path)
	if err != nil {
		return result, fmt.Errorf("lsp: completion document uri: %w", err)
	}

	if err := s.callStarted(ctx, "textDocument/completion", map[string]any{
		"textDocument": map[string]any{
			"uri": uri,
		},
		"position": map[string]int{
			"line":      line,
			"character": character,
		},
	}, &result); err != nil {
		return CompletionResult{}, err
	}
	return result, nil
}

func (s *Session) SignatureHelp(ctx context.Context, path string, line int, character int) (SignatureHelpResult, error) {
	var result SignatureHelpResult
	if err := s.Start(ctx); err != nil {
		return result, err
	}
	uri, err := pathToURI(path)
	if err != nil {
		return result, fmt.Errorf("lsp: signature help document uri: %w", err)
	}

	if err := s.callStarted(ctx, "textDocument/signatureHelp", map[string]any{
		"textDocument": map[string]any{
			"uri": uri,
		},
		"position": map[string]int{
			"line":      line,
			"character": character,
		},
		"context": map[string]any{
			"triggerKind":      2,
			"triggerCharacter": "(",
		},
	}, &result); err != nil {
		return SignatureHelpResult{}, err
	}
	return result, nil
}

func (s *Session) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}

	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	started := s.started
	s.mu.Unlock()

	if !started {
		return nil
	}

	shutdownCtx := ctx
	if shutdownCtx == nil {
		shutdownCtx = context.Background()
	}
	var cancel context.CancelFunc
	shutdownCtx, cancel = context.WithTimeout(shutdownCtx, defaultShutdownTimeout)
	defer cancel()

	_ = s.callStarted(shutdownCtx, "shutdown", map[string]any{}, nil)
	_ = s.notify("exit", map[string]any{})

	s.mu.Lock()
	cmd := s.cmd
	readerDone := s.readerDone
	stderrDone := s.stderrDone
	s.mu.Unlock()

	if cmd != nil && cmd.Process != nil {
		waitDone := make(chan error, 1)
		go func() {
			waitDone <- cmd.Wait()
		}()
		select {
		case <-shutdownCtx.Done():
			_ = cmd.Process.Kill()
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

	s.failPending(ErrSessionClosed)
	return nil
}

func (s *Session) call(ctx context.Context, method string, params any, result any) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := s.Start(ctx); err != nil {
		return err
	}
	return s.callStarted(ctx, method, params, result)
}

func (s *Session) callStarted(ctx context.Context, method string, params any, result any) error {
	if ctx == nil {
		ctx = context.Background()
	}
	requestID := strconv.FormatUint(atomic.AddUint64(&s.requestSeq, 1), 10)
	responseCh := make(chan rpcEnvelope, 1)

	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return ErrSessionClosed
	}
	s.pending[requestID] = responseCh
	s.mu.Unlock()

	if err := s.writeEnvelope(map[string]any{
		"jsonrpc": "2.0",
		"id":      requestID,
		"method":  method,
		"params":  params,
	}); err != nil {
		s.mu.Lock()
		delete(s.pending, requestID)
		s.mu.Unlock()
		return err
	}

	timeout := s.requestTimeout
	if deadline, ok := ctx.Deadline(); ok {
		if remaining := time.Until(deadline); remaining > 0 && remaining < timeout {
			timeout = remaining
		}
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		s.mu.Lock()
		delete(s.pending, requestID)
		s.mu.Unlock()
		return ctx.Err()
	case <-timer.C:
		s.mu.Lock()
		delete(s.pending, requestID)
		stderr := strings.TrimSpace(s.stderr.String())
		s.mu.Unlock()
		if stderr != "" {
			return fmt.Errorf("%w: %s (%s)", ErrRequestTimedOut, method, stderr)
		}
		return fmt.Errorf("%w: %s", ErrRequestTimedOut, method)
	case envelope := <-responseCh:
		s.mu.Lock()
		delete(s.pending, requestID)
		s.mu.Unlock()
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

func (s *Service) SyncDocuments(ctx context.Context, desired map[string]SyncedDocument) error {
	if s == nil {
		return nil
	}
	if err := s.session.Start(ctx); err != nil {
		return err
	}

	s.mu.Lock()
	current := cloneSyncedDocuments(s.tracked)
	s.mu.Unlock()

	desiredPaths := sortedDocumentPaths(desired)
	currentPaths := sortedDocumentPaths(current)

	desiredSet := make(map[string]struct{}, len(desiredPaths))
	for _, path := range desiredPaths {
		desiredSet[path] = struct{}{}
	}

	for _, path := range currentPaths {
		if _, ok := desiredSet[path]; ok {
			continue
		}
		if err := s.session.CloseDocument(path); err != nil {
			return err
		}
	}

	for _, path := range desiredPaths {
		doc := desired[path]
		existing, ok := current[path]
		switch {
		case !ok:
			if err := s.session.OpenDocument(ctx, path, doc.LanguageID, doc.Content, doc.Callback); err != nil {
				return err
			}
		case existing.LanguageID != doc.LanguageID:
			if err := s.session.CloseDocument(path); err != nil {
				return err
			}
			if err := s.session.OpenDocument(ctx, path, doc.LanguageID, doc.Content, doc.Callback); err != nil {
				return err
			}
		default:
			if err := s.session.SetDiagnosticsCallback(path, doc.Callback); err != nil {
				return err
			}
			if existing.Content != doc.Content {
				if err := s.session.UpdateDocument(ctx, path, doc.Content); err != nil {
					return err
				}
			}
		}
	}

	s.mu.Lock()
	s.tracked = cloneSyncedDocuments(desired)
	s.mu.Unlock()
	return nil
}

func (s *Service) UpsertDocument(ctx context.Context, document SyncedDocument) error {
	if s == nil {
		return nil
	}
	if err := s.session.Start(ctx); err != nil {
		return err
	}

	path := strings.TrimSpace(document.Path)
	if path == "" {
		return fmt.Errorf("lsp: document path is required")
	}

	s.mu.Lock()
	existing, ok := s.tracked[path]
	s.mu.Unlock()

	switch {
	case !ok:
		if err := s.session.OpenDocument(ctx, path, document.LanguageID, document.Content, document.Callback); err != nil {
			return err
		}
	case existing.LanguageID != document.LanguageID:
		if err := s.session.CloseDocument(path); err != nil {
			return err
		}
		if err := s.session.OpenDocument(ctx, path, document.LanguageID, document.Content, document.Callback); err != nil {
			return err
		}
	default:
		if err := s.session.SetDiagnosticsCallback(path, document.Callback); err != nil {
			return err
		}
		if existing.Content != document.Content {
			if err := s.session.UpdateDocument(ctx, path, document.Content); err != nil {
				return err
			}
		}
	}

	s.mu.Lock()
	if s.tracked == nil {
		s.tracked = map[string]SyncedDocument{}
	}
	s.tracked[path] = document
	s.mu.Unlock()
	return nil
}

func (s *Service) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	s.tracked = map[string]SyncedDocument{}
	s.mu.Unlock()
	return s.session.Close(ctx)
}

func (s *Session) notify(method string, params any) error {
	return s.writeEnvelope(map[string]any{
		"jsonrpc": "2.0",
		"method":  method,
		"params":  params,
	})
}

func (s *Session) writeEnvelope(payload map[string]any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("lsp: encode request: %w", err)
	}
	header := []byte(fmt.Sprintf("Content-Length: %d\r\n\r\n", len(encoded)))

	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return ErrSessionClosed
	}
	stdin := s.stdin
	s.mu.Unlock()
	if stdin == nil {
		return ErrSessionNotStarted
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if _, err := stdin.Write(header); err != nil {
		return fmt.Errorf("lsp: write header: %w", err)
	}
	if _, err := stdin.Write(encoded); err != nil {
		return fmt.Errorf("lsp: write body: %w", err)
	}
	return nil
}

func (s *Session) readLoop(stdout io.Reader) {
	defer close(s.readerDone)
	reader := bufio.NewReader(stdout)
	for {
		envelope, err := readEnvelope(reader)
		if err != nil {
			if !errors.Is(err, io.EOF) {
				s.mu.Lock()
				s.readerErr = err
				s.mu.Unlock()
			}
			s.failPending(err)
			return
		}
		s.dispatchEnvelope(envelope)
	}
}

func (s *Session) captureStderr(stderr io.Reader) {
	defer close(s.stderrDone)
	_, _ = io.Copy(&s.stderr, stderr)
}

func (s *Session) dispatchEnvelope(envelope rpcEnvelope) {
	requestID := parseEnvelopeID(envelope.ID)
	if requestID != "" {
		s.mu.Lock()
		ch := s.pending[requestID]
		s.mu.Unlock()
		if ch != nil {
			ch <- envelope
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

	s.mu.Lock()
	callback := s.diagnosticsCallback[params.URI]
	s.mu.Unlock()
	if callback != nil {
		go callback(params)
	}
}

func (s *Session) failPending(err error) {
	if err == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, ch := range s.pending {
		select {
		case ch <- rpcEnvelope{Error: &rpcError{Message: err.Error()}}:
		default:
		}
		delete(s.pending, id)
	}
}

func readEnvelope(reader *bufio.Reader) (rpcEnvelope, error) {
	contentLength := 0
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return rpcEnvelope{}, err
		}
		if line == "\r\n" {
			break
		}
		line = strings.TrimSpace(line)
		if line == "" {
			break
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		if !strings.EqualFold(strings.TrimSpace(key), "Content-Length") {
			continue
		}
		parsed, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil {
			return rpcEnvelope{}, fmt.Errorf("lsp: invalid content length %q: %w", value, err)
		}
		contentLength = parsed
	}
	if contentLength <= 0 {
		return rpcEnvelope{}, io.EOF
	}

	body := make([]byte, contentLength)
	if _, err := io.ReadFull(reader, body); err != nil {
		return rpcEnvelope{}, err
	}

	var envelope rpcEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return rpcEnvelope{}, fmt.Errorf("lsp: decode envelope: %w", err)
	}
	return envelope, nil
}

func parseEnvelopeID(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var stringID string
	if err := json.Unmarshal(raw, &stringID); err == nil {
		return stringID
	}
	var intID int64
	if err := json.Unmarshal(raw, &intID); err == nil {
		return strconv.FormatInt(intID, 10)
	}
	return ""
}

func pathToURI(path string) (string, error) {
	resolved, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve path %q: %w", path, err)
	}
	return (&url.URL{
		Scheme: "file",
		Path:   filepath.ToSlash(resolved),
	}).String(), nil
}

func sortedDocumentPaths(documents map[string]SyncedDocument) []string {
	paths := make([]string, 0, len(documents))
	for path := range documents {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	return paths
}

func cloneSyncedDocuments(documents map[string]SyncedDocument) map[string]SyncedDocument {
	cloned := make(map[string]SyncedDocument, len(documents))
	for path, document := range documents {
		cloned[path] = document
	}
	return cloned
}
