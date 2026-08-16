package lsp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project"
)

const defaultDiagnosticTimeout = 8 * time.Second

var (
	ErrAppRootRequired       = errors.New("lsp: app root is required")
	ErrWorkspaceRootRequired = errors.New("lsp: workspace root is required")
	ErrProviderClosed        = errors.New("lsp: provider is closed")
)

type BasedpyrightOptions struct {
	AppRoot           string
	WorkspaceRoot     string
	RequestTimeout    time.Duration
	DiagnosticTimeout time.Duration
}

// BasedpyrightProvider owns exactly one session backed by the app's pinned
// dependency. It never searches PATH and accepts one canonical generated file.
type BasedpyrightProvider struct {
	mu sync.Mutex

	workspaceRoot     string
	session           *Session
	diagnosticTimeout time.Duration
	canonicalPath     string
	closed            bool
}

func NewBasedpyrightProvider(options BasedpyrightOptions) (*BasedpyrightProvider, error) {
	executable, err := ResolvePinnedBasedpyrightExecutable(options.AppRoot)
	if err != nil {
		return nil, err
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

// ResolvePinnedBasedpyrightExecutable resolves only the exact executable that
// pnpm installed for this app. The resolved symlink target must remain within
// appRoot/node_modules, so a global server can never become a fallback.
func ResolvePinnedBasedpyrightExecutable(appRoot string) (string, error) {
	appRoot = strings.TrimSpace(appRoot)
	if appRoot == "" {
		return "", ErrAppRootRequired
	}
	resolvedAppRoot, err := filepath.Abs(appRoot)
	if err != nil {
		return "", fmt.Errorf("lsp: resolve app root: %w", err)
	}
	nodeModulesRoot := filepath.Join(resolvedAppRoot, "node_modules")
	executable := filepath.Join(nodeModulesRoot, ".bin", "basedpyright-langserver")
	resolvedExecutable, err := filepath.EvalSymlinks(executable)
	if err != nil {
		return "", fmt.Errorf("lsp: resolve pinned Basedpyright executable: %w", err)
	}
	insideNodeModules, err := filepath.Rel(nodeModulesRoot, resolvedExecutable)
	if err != nil || insideNodeModules == ".." || strings.HasPrefix(insideNodeModules, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("lsp: pinned Basedpyright executable resolves outside app node_modules")
	}
	info, err := os.Stat(resolvedExecutable)
	if err != nil {
		return "", fmt.Errorf("lsp: stat pinned Basedpyright executable: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("lsp: pinned Basedpyright executable is not a regular file")
	}
	return executable, nil
}

func (provider *BasedpyrightProvider) ResolveCallableSignature(
	ctx context.Context,
	request project.SignatureRequest,
) (project.CallableSignature, error) {
	if provider == nil {
		return project.CallableSignature{}, ErrProviderClosed
	}
	provider.mu.Lock()
	defer provider.mu.Unlock()
	if provider.closed {
		return project.CallableSignature{}, ErrProviderClosed
	}
	if strings.TrimSpace(request.Code) == "" {
		return project.CallableSignature{}, fmt.Errorf("lsp: signature snapshot is empty")
	}
	position, err := positionForByteOffset(request.Code, request.CallOffset)
	if err != nil {
		return project.CallableSignature{}, fmt.Errorf("lsp: resolve signature position: %w", err)
	}

	snapshotPath, err := provider.createSignatureSnapshot(request.Code)
	if err != nil {
		return project.CallableSignature{}, err
	}
	defer os.Remove(snapshotPath)

	if err := provider.session.SynchronizeDocument(ctx, snapshotPath, "python", 1, request.Code, nil); err != nil {
		return project.CallableSignature{}, err
	}
	closedDocument := false
	defer func() {
		if !closedDocument {
			_ = provider.session.CloseDocument(snapshotPath)
		}
	}()
	result, err := provider.session.SignatureHelp(ctx, snapshotPath, position)
	if err != nil {
		return project.CallableSignature{}, err
	}
	if err := provider.session.CloseDocument(snapshotPath); err != nil {
		return project.CallableSignature{}, err
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
	request project.GeneratedDocumentRequest,
) (project.GeneratedDocumentResult, error) {
	if provider == nil {
		return project.GeneratedDocumentResult{}, ErrProviderClosed
	}
	provider.mu.Lock()
	defer provider.mu.Unlock()
	if provider.closed {
		return project.GeneratedDocumentResult{}, ErrProviderClosed
	}
	if request.Revision < 1 {
		return project.GeneratedDocumentResult{}, fmt.Errorf("lsp: generated document revision must be positive")
	}
	path, err := provider.resolveCanonicalPath(request.Path)
	if err != nil {
		return project.GeneratedDocumentResult{}, err
	}
	diskCode, err := os.ReadFile(path)
	if err != nil {
		return project.GeneratedDocumentResult{}, fmt.Errorf("lsp: read generated document: %w", err)
	}
	if string(diskCode) != request.Code {
		return project.GeneratedDocumentResult{}, fmt.Errorf("lsp: generated document does not match its canonical revision")
	}

	published := make(chan PublishDiagnosticsParams, 16)
	callback := func(params PublishDiagnosticsParams) {
		select {
		case published <- params:
		default:
		}
	}
	if err := provider.session.SynchronizeDocument(ctx, path, "python", request.Revision, request.Code, callback); err != nil {
		return project.GeneratedDocumentResult{}, err
	}
	return provider.waitForExactDiagnostics(ctx, request, published)
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

func (provider *BasedpyrightProvider) waitForExactDiagnostics(
	ctx context.Context,
	request project.GeneratedDocumentRequest,
	published <-chan PublishDiagnosticsParams,
) (project.GeneratedDocumentResult, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	timeout := provider.diagnosticTimeout
	if deadline, ok := ctx.Deadline(); ok {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return pendingDiagnosticsResult(), nil
		}
		if remaining < timeout {
			timeout = remaining
		}
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return pendingDiagnosticsResult(), nil
		case <-timer.C:
			return pendingDiagnosticsResult(), nil
		case publication := <-published:
			if publication.Version == nil || *publication.Version != request.Revision {
				continue
			}
			return project.GeneratedDocumentResult{
				Diagnostics:    normalizeDiagnostics(request.Code, publication.Diagnostics),
				ProviderStatus: readyProviderStatus(),
			}, nil
		}
	}
}

func normalizeDiagnostics(code string, diagnostics []Diagnostic) []project.ProviderDiagnostic {
	normalized := make([]project.ProviderDiagnostic, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		start, end, err := byteOffsetsForRange(code, diagnostic.Range)
		if err != nil {
			continue
		}
		severity := project.ProviderDiagnosticSeverityInformation
		switch diagnostic.Severity {
		case 1:
			severity = project.ProviderDiagnosticSeverityError
		case 2:
			severity = project.ProviderDiagnosticSeverityWarning
		case 3, 4:
			severity = project.ProviderDiagnosticSeverityInformation
		}
		normalized = append(normalized, project.ProviderDiagnostic{
			Start:    start,
			End:      end,
			Severity: severity,
			Message:  diagnostic.Message,
		})
	}
	return normalized
}

func readyProviderStatus() contracts.ProviderStatusV1 {
	return contracts.ProviderStatusV1{
		Provider: contracts.ProviderBasedpyrightV1,
		Status:   contracts.ProviderAvailabilityAvailableV1,
		State:    contracts.ProviderLifecycleStateReadyV1,
	}
}

func pendingDiagnosticsResult() project.GeneratedDocumentResult {
	return project.GeneratedDocumentResult{
		Diagnostics: []project.ProviderDiagnostic{},
		ProviderStatus: contracts.ProviderStatusV1{
			Provider: contracts.ProviderBasedpyrightV1,
			Status:   contracts.ProviderAvailabilityAvailableV1,
			State:    contracts.ProviderLifecycleStatePendingV1,
		},
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
