package worker

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/setta/realtime/backend/bootstrap"
	"github.com/setta/realtime/backend/internal/contracts"
)

const (
	DefaultInitializeTimeout = 10 * time.Second
	DefaultInvokeTimeout     = 30 * time.Second
	DefaultShutdownTimeout   = 3 * time.Second
	DefaultLogLimit          = 1 << 20
	artifactRootEnvironment  = "SETTA_WORKER_ARTIFACT_ROOT"
)

var (
	ErrManagerClosed  = errors.New("worker: manager is closed")
	ErrWorkerNotReady = errors.New("worker: process is not ready")
)

type Options struct {
	LauncherPython    string
	Environment       []string
	StagingRoot       string
	ContentOpener     ContentOpener
	InitializeTimeout time.Duration
	InvokeTimeout     time.Duration
	ShutdownTimeout   time.Duration
	LogLimit          int
	MaximumFrameBytes int
}

type LogSnapshot struct {
	Stdout          string
	Stderr          string
	StdoutTruncated bool
	StderrTruncated bool
}

type reloadSpec struct {
	projectRoot string
	runtime     contracts.RuntimeDeclaration
}

type managedProcess struct {
	command        *exec.Cmd
	owner          ownedProcess
	client         *Client
	hostInput      *os.File
	hostOutput     *os.File
	root           string
	spec           reloadSpec
	stdout         *BoundedLog
	stderr         *BoundedLog
	waitDone       chan struct{}
	waitMu         sync.Mutex
	waitErr        error
	stopOnce       sync.Once
	stopErr        error
	canReplace     atomic.Bool
	forwardStopped chan struct{}
}

type Manager struct {
	options       Options
	root          string
	bootstrapPath string
	updates       chan contracts.RuntimeUpdate
	logs          chan contracts.RuntimeLog
	lifecycle     sync.Mutex
	mu            sync.Mutex
	active        *managedProcess
	scopes        map[string]invocationScope
	lastLogs      LogSnapshot
	closed        bool
	closeOnce     sync.Once
	closeErr      error
}

type scopedArtifactReader struct {
	io.ReadCloser
	manager *Manager
	key     string
	root    string
	path    string
	once    sync.Once
}

func NewManager(options Options) (*Manager, error) {
	python, err := validatePython(options.LauncherPython)
	if err != nil {
		return nil, err
	}
	options.LauncherPython = python
	if options.InitializeTimeout == 0 {
		options.InitializeTimeout = DefaultInitializeTimeout
	}
	if options.InvokeTimeout == 0 {
		options.InvokeTimeout = DefaultInvokeTimeout
	}
	if options.ShutdownTimeout == 0 {
		options.ShutdownTimeout = DefaultShutdownTimeout
	}
	if options.LogLimit == 0 {
		options.LogLimit = DefaultLogLimit
	}
	if options.MaximumFrameBytes == 0 {
		options.MaximumFrameBytes = DefaultMaximumFrameBytes
	}
	if options.InitializeTimeout <= 0 || options.InvokeTimeout <= 0 || options.ShutdownTimeout <= 0 || options.LogLimit < 1 || options.MaximumFrameBytes < 1 {
		return nil, errors.New("worker: manager bounds must be positive")
	}
	parent := options.StagingRoot
	if parent == "" {
		parent = os.TempDir()
	}
	if !filepath.IsAbs(parent) || strings.ContainsRune(parent, '\x00') {
		return nil, errors.New("worker: staging root must be absolute")
	}
	if err := os.MkdirAll(parent, 0o700); err != nil {
		return nil, fmt.Errorf("worker: create staging parent: %w", err)
	}
	root, err := os.MkdirTemp(parent, ".setta-realtime-worker-")
	if err != nil {
		return nil, fmt.Errorf("worker: create staging root: %w", err)
	}
	bootstrapPath := filepath.Join(root, "setta_worker.py")
	if err := os.WriteFile(bootstrapPath, bootstrap.Source(), 0o600); err != nil {
		_ = os.RemoveAll(root)
		return nil, fmt.Errorf("worker: materialize Python bootstrap: %w", err)
	}
	return &Manager{options: options, root: root, bootstrapPath: bootstrapPath, updates: make(chan contracts.RuntimeUpdate, 64), logs: make(chan contracts.RuntimeLog, 64), scopes: make(map[string]invocationScope)}, nil
}

func (manager *Manager) Reload(ctx context.Context, projectRoot string, declaration contracts.RuntimeDeclaration) (contracts.InitializeResult, error) {
	if manager == nil {
		return contracts.InitializeResult{}, ErrManagerClosed
	}
	root, err := resolveProjectRoot(projectRoot)
	if err != nil {
		return contracts.InitializeResult{}, err
	}
	if declaration.Kind != "python" {
		return contracts.InitializeResult{}, ErrUnsupportedKind
	}
	manager.lifecycle.Lock()
	defer manager.lifecycle.Unlock()
	manager.mu.Lock()
	if manager.closed {
		manager.mu.Unlock()
		return contracts.InitializeResult{}, ErrManagerClosed
	}
	previous := manager.active
	manager.active = nil
	if previous != nil {
		manager.lastLogs = previous.logs()
		manager.dropScopesLocked(previous.root)
	}
	manager.mu.Unlock()
	if previous != nil {
		if err := manager.stopProcess(previous, true); err != nil {
			return contracts.InitializeResult{}, err
		}
	}
	spec := reloadSpec{projectRoot: root, runtime: declaration}
	process, result, err := manager.startProcess(ctx, spec, true)
	if err != nil {
		return contracts.InitializeResult{}, err
	}
	manager.install(process)
	return result, nil
}

func (manager *Manager) Invoke(ctx context.Context, params contracts.InvokeParams) (contracts.InvokeResult, error) {
	if manager == nil {
		return contracts.InvokeResult{}, ErrManagerClosed
	}
	manager.mu.Lock()
	process := manager.active
	closed := manager.closed
	manager.mu.Unlock()
	if closed {
		return contracts.InvokeResult{}, ErrManagerClosed
	}
	if process == nil {
		return contracts.InvokeResult{}, ErrWorkerNotReady
	}
	prepared, invocationRoot, err := stageInvocation(process.root, manager.options.ContentOpener, params)
	if err != nil {
		return contracts.InvokeResult{}, err
	}
	manager.mu.Lock()
	if manager.closed || manager.active != process {
		manager.mu.Unlock()
		_ = os.RemoveAll(invocationRoot)
		return contracts.InvokeResult{}, ErrWorkerNotReady
	}
	manager.scopes[scopeKey(params.Identity)] = invocationScope{identity: params.Identity, root: invocationRoot}
	manager.mu.Unlock()
	callContext, cancel := boundedContext(ctx, manager.options.InvokeTimeout)
	result, invokeErr := process.client.Invoke(callContext, prepared)
	contextErr := callContext.Err()
	cancel()
	if invokeErr == nil {
		_ = os.RemoveAll(filepath.Join(invocationRoot, "content"))
		manager.releaseScopeIfEmpty(scopeKey(params.Identity), invocationRoot)
		process.canReplace.Store(true)
		return result, nil
	}
	if errors.Is(contextErr, context.DeadlineExceeded) || process.client.Err() != nil || process.exited() {
		replacementErr := manager.hardReplace(process)
		_ = os.RemoveAll(filepath.Join(invocationRoot, "content"))
		if replacementErr != nil {
			return contracts.InvokeResult{}, errors.Join(invokeErr, replacementErr)
		}
	} else {
		_ = os.RemoveAll(invocationRoot)
		manager.mu.Lock()
		delete(manager.scopes, scopeKey(params.Identity))
		manager.mu.Unlock()
	}
	return contracts.InvokeResult{}, invokeErr
}

func (manager *Manager) Updates() <-chan contracts.RuntimeUpdate {
	if manager == nil {
		closed := make(chan contracts.RuntimeUpdate)
		close(closed)
		return closed
	}
	return manager.updates
}

func (manager *Manager) OpenArtifact(identity contracts.InvocationIdentity, path string) (io.ReadCloser, error) {
	if manager == nil {
		return nil, ErrManagerClosed
	}
	if err := validateIdentity(identity); err != nil {
		return nil, err
	}
	manager.mu.Lock()
	scope, exists := manager.scopes[scopeKey(identity)]
	closed := manager.closed
	manager.mu.Unlock()
	if closed {
		return nil, ErrManagerClosed
	}
	if !exists {
		return nil, errors.New("worker: invocation staging is unavailable")
	}
	reader, resolved, err := openScopedArtifact(scope, identity, path)
	if err != nil {
		return nil, err
	}
	return &scopedArtifactReader{ReadCloser: reader, manager: manager, key: scopeKey(identity), root: scope.root, path: resolved}, nil
}

func (manager *Manager) Logs() <-chan contracts.RuntimeLog {
	if manager == nil {
		closed := make(chan contracts.RuntimeLog)
		close(closed)
		return closed
	}
	return manager.logs
}

func (manager *Manager) LogSnapshot() LogSnapshot {
	if manager == nil {
		return LogSnapshot{}
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.active != nil {
		return manager.active.logs()
	}
	return manager.lastLogs
}

func (manager *Manager) Close() error {
	if manager == nil {
		return nil
	}
	manager.closeOnce.Do(func() {
		manager.lifecycle.Lock()
		defer manager.lifecycle.Unlock()
		manager.mu.Lock()
		manager.closed = true
		process := manager.active
		manager.active = nil
		manager.scopes = nil
		if process != nil {
			manager.lastLogs = process.logs()
		}
		manager.mu.Unlock()
		if process != nil {
			manager.closeErr = manager.stopProcess(process, true)
		}
		close(manager.updates)
		close(manager.logs)
		if err := os.RemoveAll(manager.root); err != nil {
			manager.closeErr = errors.Join(manager.closeErr, fmt.Errorf("worker: remove staging root: %w", err))
		}
	})
	return manager.closeErr
}

func (manager *Manager) startProcess(ctx context.Context, spec reloadSpec, canReplace bool) (*managedProcess, contracts.InitializeResult, error) {
	interpreter, virtualEnvRoot, err := selectPython(spec.projectRoot, manager.options.LauncherPython)
	if err != nil {
		return nil, contracts.InitializeResult{}, err
	}
	processRoot, err := os.MkdirTemp(manager.root, "generation-")
	if err != nil {
		return nil, contracts.InitializeResult{}, fmt.Errorf("worker: create process staging: %w", err)
	}
	stdout, err := NewBoundedLog(manager.options.LogLimit)
	if err != nil {
		_ = os.RemoveAll(processRoot)
		return nil, contracts.InitializeResult{}, err
	}
	stderr, err := NewBoundedLog(manager.options.LogLimit)
	if err != nil {
		_ = os.RemoveAll(processRoot)
		return nil, contracts.InitializeResult{}, err
	}
	workerInput, hostInput, err := os.Pipe()
	if err != nil {
		_ = os.RemoveAll(processRoot)
		return nil, contracts.InitializeResult{}, fmt.Errorf("worker: create protocol input: %w", err)
	}
	hostOutput, workerOutput, err := os.Pipe()
	if err != nil {
		_ = workerInput.Close()
		_ = hostInput.Close()
		_ = os.RemoveAll(processRoot)
		return nil, contracts.InitializeResult{}, fmt.Errorf("worker: create protocol output: %w", err)
	}
	environment := pythonEnvironment(manager.options.Environment, interpreter, virtualEnvRoot)
	environment = append(environment, artifactRootEnvironment+"="+processRoot)
	command, owner, err := startContainedWorker(interpreter, manager.bootstrapPath, spec.projectRoot, environment, workerInput, workerOutput, newProcessLogWriter(manager, "stdout", stdout, manager.options.LogLimit), newProcessLogWriter(manager, "stderr", stderr, manager.options.LogLimit))
	_ = workerInput.Close()
	_ = workerOutput.Close()
	if err != nil {
		_ = hostInput.Close()
		_ = hostOutput.Close()
		_ = os.RemoveAll(processRoot)
		return nil, contracts.InitializeResult{}, err
	}
	client, err := NewClient(hostOutput, hostInput, manager.options.MaximumFrameBytes)
	if err != nil {
		_ = owner.terminate()
		_ = hostInput.Close()
		_ = hostOutput.Close()
		_ = os.RemoveAll(processRoot)
		return nil, contracts.InitializeResult{}, err
	}
	process := &managedProcess{command: command, owner: owner, client: client, hostInput: hostInput, hostOutput: hostOutput, root: processRoot, spec: spec, stdout: stdout, stderr: stderr, waitDone: make(chan struct{}), forwardStopped: make(chan struct{})}
	process.canReplace.Store(canReplace)
	go process.wait()
	initializeContext, cancel := boundedContext(ctx, manager.options.InitializeTimeout)
	result, err := client.Initialize(initializeContext, contracts.InitializeParams{ProtocolVersion: contracts.WorkerProtocolVersion, ProjectRoot: spec.projectRoot, Entrypoint: spec.runtime.Entrypoint})
	cancel()
	if err != nil {
		cleanupErr := manager.stopProcess(process, false)
		return nil, contracts.InitializeResult{}, errors.Join(err, cleanupErr)
	}
	return process, result, nil
}

func (manager *Manager) install(process *managedProcess) {
	manager.mu.Lock()
	if manager.closed {
		manager.mu.Unlock()
		_ = manager.stopProcess(process, false)
		return
	}
	manager.active = process
	manager.mu.Unlock()
	go manager.forward(process)
	go manager.monitor(process)
}

func (manager *Manager) forward(process *managedProcess) {
	defer close(process.forwardStopped)
	for update := range process.client.Updates() {
		manager.mu.Lock()
		if manager.closed || manager.active != process {
			manager.mu.Unlock()
			return
		}
		select {
		case manager.updates <- update:
			manager.mu.Unlock()
		default:
			manager.mu.Unlock()
			_ = manager.hardReplace(process)
			return
		}
	}
}

func (manager *Manager) monitor(process *managedProcess) {
	select {
	case <-process.client.Done():
	case <-process.waitDone:
	}
	_ = manager.hardReplace(process)
}

func (manager *Manager) hardReplace(failed *managedProcess) error {
	manager.lifecycle.Lock()
	defer manager.lifecycle.Unlock()
	manager.mu.Lock()
	if manager.closed || manager.active != failed {
		manager.mu.Unlock()
		return nil
	}
	manager.active = nil
	manager.lastLogs = failed.logs()
	manager.dropScopesLocked(failed.root)
	manager.mu.Unlock()
	cleanupErr := manager.stopProcess(failed, false)
	if !failed.canReplace.Load() {
		return errors.Join(cleanupErr, errors.New("worker: automatic replacement failed repeatedly"))
	}
	process, _, startErr := manager.startProcess(context.Background(), failed.spec, false)
	if startErr != nil {
		return errors.Join(cleanupErr, fmt.Errorf("worker: start replacement: %w", startErr))
	}
	manager.install(process)
	return cleanupErr
}

func (manager *Manager) stopProcess(process *managedProcess, graceful bool) error {
	if process == nil {
		return nil
	}
	process.stopOnce.Do(func() {
		deadline := time.Now().Add(manager.options.ShutdownTimeout)
		if graceful && !process.exited() {
			ctx, cancel := context.WithDeadline(context.Background(), deadline)
			_ = process.client.Shutdown(ctx)
			cancel()
		}
		if !graceful && !process.exited() {
			process.stopErr = errors.Join(process.stopErr, process.owner.terminate())
		}
		if !process.waitUntil(deadline) {
			process.stopErr = errors.Join(process.stopErr, process.owner.terminate())
			if !process.waitUntil(time.Now().Add(manager.options.ShutdownTimeout)) && process.command != nil && process.command.Process != nil {
				if err := process.command.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
					process.stopErr = errors.Join(process.stopErr, err)
				}
				_ = process.waitUntil(time.Now().Add(manager.options.ShutdownTimeout))
			}
		}
		process.stopErr = errors.Join(process.stopErr, process.owner.finalize())
		_ = process.client.Close()
		process.stopErr = errors.Join(process.stopErr, process.hostInput.Close(), process.hostOutput.Close())
	})
	return process.stopErr
}

func (process *managedProcess) wait() {
	err := process.command.Wait()
	process.waitMu.Lock()
	process.waitErr = err
	process.waitMu.Unlock()
	close(process.waitDone)
}

func (process *managedProcess) exited() bool {
	select {
	case <-process.waitDone:
		return true
	default:
		return false
	}
}

func (process *managedProcess) waitUntil(deadline time.Time) bool {
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return process.exited()
	}
	timer := time.NewTimer(remaining)
	defer timer.Stop()
	select {
	case <-process.waitDone:
		return true
	case <-timer.C:
		return false
	}
}

func (process *managedProcess) logs() LogSnapshot {
	stdout, stdoutTruncated := process.stdout.Snapshot()
	stderr, stderrTruncated := process.stderr.Snapshot()
	return LogSnapshot{Stdout: string(stdout), Stderr: string(stderr), StdoutTruncated: stdoutTruncated, StderrTruncated: stderrTruncated}
}

func boundedContext(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if parent == nil {
		parent = context.Background()
	}
	return context.WithTimeout(parent, timeout)
}

func scopeKey(identity contracts.InvocationIdentity) string {
	return identity.SessionID + "\x00" + identity.BindingID + "\x00" + identity.InvocationID + "\x00" + fmt.Sprint(identity.Sequence)
}

type processLogWriter struct {
	manager *Manager
	stream  string
	bounded *BoundedLog
	mu      *sync.Mutex
	remain  *int
}

func (writer processLogWriter) Write(value []byte) (int, error) {
	count, err := writer.bounded.Write(value)
	writer.mu.Lock()
	emitted := count
	if emitted > *writer.remain {
		emitted = *writer.remain
	}
	*writer.remain -= emitted
	writer.mu.Unlock()
	if emitted > 0 {
		writer.manager.emitLog(contracts.RuntimeLog{Stream: writer.stream, Text: strings.ToValidUTF8(string(value[:emitted]), "�")})
	}
	return count, err
}

func newProcessLogWriter(manager *Manager, stream string, bounded *BoundedLog, maximum int) processLogWriter {
	return processLogWriter{manager: manager, stream: stream, bounded: bounded, mu: &sync.Mutex{}, remain: &maximum}
}

func (manager *Manager) emitLog(entry contracts.RuntimeLog) {
	if entry.Text == "" {
		return
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.closed {
		return
	}
	select {
	case manager.logs <- entry:
	default:
		select {
		case <-manager.logs:
		default:
		}
		manager.logs <- entry
	}
}

func (reader *scopedArtifactReader) Close() error {
	var result error
	reader.once.Do(func() {
		result = reader.ReadCloser.Close()
		if err := os.Remove(reader.path); err != nil && !errors.Is(err, os.ErrNotExist) {
			result = errors.Join(result, err)
		}
		_ = os.Remove(filepath.Dir(reader.path))
		reader.manager.releaseScopeIfEmpty(reader.key, reader.root)
	})
	return result
}

func (manager *Manager) releaseScopeIfEmpty(key string, root string) {
	if err := os.Remove(root); err != nil && !errors.Is(err, os.ErrNotExist) {
		return
	}
	manager.mu.Lock()
	if scope, exists := manager.scopes[key]; exists && scope.root == root {
		delete(manager.scopes, key)
	}
	manager.mu.Unlock()
}

func (manager *Manager) dropScopesLocked(root string) {
	for key, scope := range manager.scopes {
		relative, err := filepath.Rel(root, scope.root)
		if err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
			delete(manager.scopes, key)
		}
	}
}
