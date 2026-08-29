package lsp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/coordinator"
	"github.com/setta/python-canvas/backend/internal/pythonenv"
)

const defaultDiagnosticTimeout = 8 * time.Second

var (
	ErrBasedpyrightCommandRequired = errors.New("lsp: Basedpyright command is required")
	ErrInvalidBasedpyrightCommand  = errors.New("lsp: Basedpyright command is invalid")
	ErrWorkspaceRootRequired       = errors.New("lsp: workspace root is required")
	ErrPythonEnvironmentRequired   = errors.New("lsp: resolved Python environment is required")
	ErrProviderClosed              = errors.New("lsp: provider is closed")
	ErrDiagnosticsNotReady         = errors.New("lsp: exact diagnostics are not ready")
)

type BasedpyrightOptions struct {
	Command           string
	WorkspaceRoot     string
	PythonEnvironment pythonenv.ResolvedPythonEnvironment
	RequestTimeout    time.Duration
	DiagnosticTimeout time.Duration
}

// BasedpyrightProvider owns exactly one session backed by the command supplied
// by the packaged launcher. It never searches PATH and accepts one canonical
// generated file.
type BasedpyrightProvider struct {
	mu sync.Mutex

	workspaceRoot     string
	session           *Session
	diagnosticTimeout time.Duration
	canonicalPath     string
	closed            bool
}

func NewBasedpyrightProvider(options BasedpyrightOptions) (*BasedpyrightProvider, error) {
	executable, err := ResolveBasedpyrightExecutable(options.Command)
	if err != nil {
		return nil, err
	}
	interpreter := options.PythonEnvironment.InterpreterPath()
	if strings.TrimSpace(interpreter) == "" || len(options.PythonEnvironment.ChildEnvironment()) == 0 {
		return nil, ErrPythonEnvironmentRequired
	}
	workspaceRoot := strings.TrimSpace(options.WorkspaceRoot)
	if workspaceRoot == "" {
		return nil, ErrWorkspaceRootRequired
	}
	workspaceRoot, err = filepath.Abs(workspaceRoot)
	if err != nil {
		return nil, fmt.Errorf("lsp: resolve workspace root: %w", err)
	}
	if info, err := os.Stat(workspaceRoot); err != nil || !info.IsDir() {
		return nil, fmt.Errorf("lsp: workspace root %q is not a directory", workspaceRoot)
	}

	session, err := NewSession(SessionOptions{
		Command:        executable,
		Args:           []string{"--stdio"},
		WorkspaceRoot:  workspaceRoot,
		RequestTimeout: options.RequestTimeout,
		Environment:    options.PythonEnvironment.ChildEnvironment(),
		Configuration: map[string]any{
			"python": map[string]string{"pythonPath": interpreter},
		},
	})
	if err != nil {
		return nil, err
	}
	diagnosticTimeout := options.DiagnosticTimeout
	if diagnosticTimeout <= 0 {
		diagnosticTimeout = defaultDiagnosticTimeout
	}
	return &BasedpyrightProvider{
		workspaceRoot:     workspaceRoot,
		session:           session,
		diagnosticTimeout: diagnosticTimeout,
	}, nil
}

// ResolveBasedpyrightExecutable accepts only an exact absolute executable
// path supplied at startup. The server must never discover source-checkout or
// global dependencies at runtime.
func ResolveBasedpyrightExecutable(command string) (string, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return "", ErrBasedpyrightCommandRequired
	}
	if !filepath.IsAbs(command) {
		return "", fmt.Errorf("%w: path must be absolute", ErrInvalidBasedpyrightCommand)
	}
	command = filepath.Clean(command)
	info, err := os.Stat(command)
	if err != nil {
		return "", fmt.Errorf("%w: stat %q: %v", ErrInvalidBasedpyrightCommand, command, err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%w: %q is not a regular file", ErrInvalidBasedpyrightCommand, command)
	}
	if info.Mode().Perm()&0o111 == 0 && runtime.GOOS != "windows" {
		return "", fmt.Errorf("%w: %q is not executable", ErrInvalidBasedpyrightCommand, command)
	}
	return command, nil
}

func (provider *BasedpyrightProvider) ResolveCallableSignature(
	ctx context.Context,
	request coordinator.SignatureRequest,
) ([]aggregate.ProviderParameter, error) {
	if provider == nil {
		return nil, ErrProviderClosed
	}
	provider.mu.Lock()
	defer provider.mu.Unlock()
	if provider.closed {
		return nil, ErrProviderClosed
	}
	if strings.TrimSpace(request.Code) == "" {
		return nil, fmt.Errorf("lsp: signature snapshot is empty")
	}
	position, err := positionForByteOffset(request.Code, request.CallOffset)
	if err != nil {
		return nil, fmt.Errorf("lsp: resolve signature position: %w", err)
	}

	snapshotPath, err := provider.createSignatureSnapshot(request.Code)
	if err != nil {
		return nil, err
	}
	defer os.Remove(snapshotPath)

	if err := provider.session.SynchronizeDocument(ctx, snapshotPath, "python", 1, request.Code); err != nil {
		return nil, err
	}
	closedDocument := false
	defer func() {
		if !closedDocument {
			_ = provider.session.CloseDocument(snapshotPath)
		}
	}()
	result, err := provider.session.SignatureHelp(ctx, snapshotPath, position)
	if err != nil {
		return nil, err
	}
	if err := provider.session.CloseDocument(snapshotPath); err != nil {
		return nil, err
	}
	closedDocument = true
	return normalizeSignatureHelp(result)
}

func (provider *BasedpyrightProvider) createSignatureSnapshot(code string) (string, error) {
	snapshot, err := os.CreateTemp(provider.workspaceRoot, ".setta-signature-*.py")
	if err != nil {
		return "", fmt.Errorf("lsp: create signature snapshot: %w", err)
	}
	snapshotPath := snapshot.Name()
	defer func() {
		if err != nil {
			_ = os.Remove(snapshotPath)
		}
	}()
	if _, err = snapshot.WriteString(code); err != nil {
		_ = snapshot.Close()
		return "", fmt.Errorf("lsp: write signature snapshot: %w", err)
	}
	if err = snapshot.Close(); err != nil {
		return "", fmt.Errorf("lsp: close signature snapshot: %w", err)
	}
	return snapshotPath, nil
}

func (provider *BasedpyrightProvider) SynchronizeGeneratedDocument(
	ctx context.Context,
	request coordinator.GeneratedDocumentRequest,
) (coordinator.GeneratedDocumentResult, error) {
	if provider == nil {
		return coordinator.GeneratedDocumentResult{}, ErrProviderClosed
	}
	provider.mu.Lock()
	defer provider.mu.Unlock()
	if provider.closed {
		return coordinator.GeneratedDocumentResult{}, ErrProviderClosed
	}
	if request.Revision < 1 {
		return coordinator.GeneratedDocumentResult{}, fmt.Errorf("lsp: generated document revision must be positive")
	}
	path, err := provider.resolveCanonicalPath(request.Path)
	if err != nil {
		return coordinator.GeneratedDocumentResult{}, err
	}
	// The coordinator materializes this exact code before scheduling analysis.
	// A newer structural commit may replace the disposable on-disk document while
	// this queued revision is waiting for serialized provider access, so the
	// request payload—not a later disk read—is the exact LSP document boundary.
	if err := provider.session.SynchronizeDocument(ctx, path, "python", request.Revision, request.Code); err != nil {
		return coordinator.GeneratedDocumentResult{}, err
	}
	diagnostics, err := provider.pullGeneratedDocumentDiagnostics(ctx, path, request)
	if err != nil {
		return coordinator.GeneratedDocumentResult{}, err
	}
	return coordinator.GeneratedDocumentResult{
		Diagnostics:    diagnostics,
		ProviderStatus: readyProviderStatus(),
	}, nil
}

func (provider *BasedpyrightProvider) pullGeneratedDocumentDiagnostics(
	ctx context.Context,
	path string,
	request coordinator.GeneratedDocumentRequest,
) ([]coordinator.ProviderDiagnostic, error) {
	diagnosticContext, cancel, err := contextWithDiagnosticTimeout(ctx, provider.diagnosticTimeout)
	if err != nil {
		return nil, err
	}
	defer cancel()
	pulled, err := provider.session.PullDiagnostics(diagnosticContext, path, request.Revision)
	if err != nil {
		if cause := diagnosticContext.Err(); cause != nil {
			return nil, diagnosticsNotReadyError(cause)
		}
		return nil, fmt.Errorf("lsp: pull diagnostics: %w", err)
	}
	diagnostics, err := normalizeDiagnostics(request.Code, pulled.Diagnostics)
	if err != nil {
		return nil, err
	}
	return diagnostics, nil
}

func (provider *BasedpyrightProvider) resolveCanonicalPath(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", fmt.Errorf("lsp: canonical generated document path is required")
	}
	resolvedPath, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("lsp: resolve canonical generated document: %w", err)
	}
	relativePath, err := filepath.Rel(provider.workspaceRoot, resolvedPath)
	if err != nil || relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("lsp: canonical generated document is outside its workspace")
	}
	if provider.canonicalPath != "" && provider.canonicalPath != resolvedPath {
		return "", fmt.Errorf("lsp: provider already owns a different canonical generated document")
	}
	provider.canonicalPath = resolvedPath
	return resolvedPath, nil
}

func contextWithDiagnosticTimeout(
	ctx context.Context,
	configured time.Duration,
) (context.Context, context.CancelFunc, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, nil, diagnosticsNotReadyError(err)
	}
	timeout, expired := effectiveDiagnosticTimeout(ctx, configured)
	if expired {
		return nil, nil, diagnosticsNotReadyError(ctx.Err())
	}
	diagnosticContext, cancel := context.WithTimeout(ctx, timeout)
	return diagnosticContext, cancel, nil
}

func effectiveDiagnosticTimeout(ctx context.Context, configured time.Duration) (time.Duration, bool) {
	deadline, hasDeadline := ctx.Deadline()
	if !hasDeadline {
		return configured, false
	}
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return 0, true
	}
	if remaining < configured {
		return remaining, false
	}
	return configured, false
}

func diagnosticsNotReadyError(cause error) error {
	if cause != nil {
		return fmt.Errorf("%w: %w", ErrDiagnosticsNotReady, cause)
	}
	return fmt.Errorf("%w: timed out pulling exact diagnostics", ErrDiagnosticsNotReady)
}

func normalizeDiagnostics(code string, diagnostics []Diagnostic) ([]coordinator.ProviderDiagnostic, error) {
	normalized := make([]coordinator.ProviderDiagnostic, 0, len(diagnostics))
	for index, diagnostic := range diagnostics {
		start, end, err := byteOffsetsForRange(code, diagnostic.Range)
		if err != nil {
			return nil, fmt.Errorf("lsp: diagnostic %d has an invalid range: %w", index, err)
		}
		message := strings.TrimSpace(diagnostic.Message)
		if message == "" {
			return nil, fmt.Errorf("lsp: diagnostic %d has an empty message", index)
		}
		severity := coordinator.ProviderDiagnosticInformation
		switch diagnostic.Severity {
		case 1:
			severity = coordinator.ProviderDiagnosticError
		case 2:
			severity = coordinator.ProviderDiagnosticWarning
		case 0, 3, 4:
			severity = coordinator.ProviderDiagnosticInformation
		default:
			return nil, fmt.Errorf("lsp: diagnostic %d has unsupported severity %d", index, diagnostic.Severity)
		}
		normalized = append(normalized, coordinator.ProviderDiagnostic{
			Start:    start,
			End:      end,
			Severity: severity,
			Message:  message,
			Code:     diagnostic.Code,
		})
	}
	return normalized, nil
}

func readyProviderStatus() coordinator.ProviderStatus {
	return coordinator.ProviderStatus{
		Provider:     "basedpyright",
		Availability: coordinator.ProviderAvailabilityAvailable,
		State:        coordinator.ProviderLifecycleReady,
	}
}

func (provider *BasedpyrightProvider) Close() error {
	if provider == nil {
		return nil
	}
	provider.mu.Lock()
	if provider.closed {
		provider.mu.Unlock()
		return nil
	}
	provider.closed = true
	session := provider.session
	provider.mu.Unlock()
	if session == nil {
		return nil
	}
	return session.Close()
}
