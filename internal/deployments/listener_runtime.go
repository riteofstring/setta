package deployments

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"
)

var (
	ErrDeploymentListenerSessionRequired     = errors.New("deployment listener session id is required")
	ErrDeploymentListenerProjectRequired     = errors.New("deployment listener project config id is required")
	ErrDeploymentListenerEntrypointMissing   = errors.New("deployment listener entrypoint was not found")
	ErrDeploymentListenerLauncherUnavailable = errors.New("deployment listener launcher was not found")
	ErrDeploymentListenerInterpreterRequired = errors.New("deployment listener python interpreter is required")
)

const (
	DeploymentListenerReadySentinel = "SETTA_DEPLOYMENT_LISTENER_READY"
	deploymentListenerStartTimeout  = 5 * time.Second
	deploymentListenerStopTimeout   = 2 * time.Second

	deploymentListenerLauncherEnv = "SETTA_DEPLOYMENT_LISTENER_LAUNCHER"
	defaultListenerBackendHost    = "127.0.0.1"
	defaultListenerBackendPort    = 8000
)

type deploymentListenerHandleKey struct {
	SessionID string
	ProjectID string
}

type deploymentListenerHandle struct {
	key        deploymentListenerHandleKey
	command    *exec.Cmd
	cancel     context.CancelFunc
	done       chan struct{}
	stderrDone chan string
	waitErr    error
}

type deploymentListenerRuntime struct {
	deploymentRoot string
	entrypointPath string
	launcherPath   string
	pythonPath     string
	runtimeRoot    string
	host           string
	port           int

	mu      sync.Mutex
	handles map[deploymentListenerHandleKey]*deploymentListenerHandle
}

func newDeploymentListenerRuntime(deploymentRoot string, runtimeRoot string, opts RuntimeOptions, manifest Manifest) (*deploymentListenerRuntime, error) {
	if manifest.Listener == nil || !manifest.Listener.Enabled {
		return nil, nil
	}

	deploymentRoot = strings.TrimSpace(deploymentRoot)
	entrypointPath := filepath.Clean(filepath.Join(deploymentRoot, manifest.Listener.Entrypoint))
	if info, err := os.Stat(entrypointPath); err != nil || info.IsDir() {
		return nil, fmt.Errorf("%w: %s", ErrDeploymentListenerEntrypointMissing, entrypointPath)
	}

	launcherPath, err := resolveDeploymentListenerLauncherPath()
	if err != nil {
		return nil, err
	}

	pythonPath := strings.TrimSpace(opts.ListenerPython)
	if pythonPath == "" {
		return nil, ErrDeploymentListenerInterpreterRequired
	}

	host := normalizeDeploymentListenerHost(opts.ListenerHost)
	port := opts.ListenerPort
	if port <= 0 {
		port = defaultListenerBackendPort
	}

	return &deploymentListenerRuntime{
		deploymentRoot: deploymentRoot,
		entrypointPath: entrypointPath,
		launcherPath:   launcherPath,
		pythonPath:     pythonPath,
		runtimeRoot:    strings.TrimSpace(runtimeRoot),
		host:           host,
		port:           port,
		handles:        map[deploymentListenerHandleKey]*deploymentListenerHandle{},
	}, nil
}

func resolveDeploymentListenerLauncherPath() (string, error) {
	if explicit := strings.TrimSpace(os.Getenv(deploymentListenerLauncherEnv)); explicit != "" {
		if info, err := os.Stat(explicit); err == nil && !info.IsDir() {
			return explicit, nil
		}
		return "", fmt.Errorf("%w: %s", ErrDeploymentListenerLauncherUnavailable, explicit)
	}

	if cwd, err := os.Getwd(); err == nil {
		for current := cwd; ; current = filepath.Dir(current) {
			candidate := filepath.Join(current, "backend", "setta", "share", "deployment_listener_process.py")
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				return candidate, nil
			}
			parent := filepath.Dir(current)
			if parent == current {
				break
			}
		}
	}

	if _, file, _, ok := goruntime.Caller(0); ok {
		repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
		candidate := filepath.Join(repoRoot, "backend", "setta", "share", "deployment_listener_process.py")
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}

	return "", ErrDeploymentListenerLauncherUnavailable
}

func normalizeDeploymentListenerHost(host string) string {
	trimmed := strings.TrimSpace(host)
	if trimmed == "" {
		return defaultListenerBackendHost
	}
	switch trimmed {
	case "0.0.0.0", "::", "[::]":
		return defaultListenerBackendHost
	default:
		return trimmed
	}
}

func (r *deploymentListenerRuntime) ensure(sessionID string, projectID string) error {
	if r == nil {
		return nil
	}

	trimmedSessionID := strings.TrimSpace(sessionID)
	if trimmedSessionID == "" {
		return ErrDeploymentListenerSessionRequired
	}
	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return ErrDeploymentListenerProjectRequired
	}

	key := deploymentListenerHandleKey{
		SessionID: trimmedSessionID,
		ProjectID: trimmedProjectID,
	}

	r.mu.Lock()
	if current := r.handles[key]; current != nil {
		select {
		case <-current.done:
			delete(r.handles, key)
		default:
			r.mu.Unlock()
			return nil
		}
	}
	r.mu.Unlock()

	return r.startHandle(key)
}

func (r *deploymentListenerRuntime) startHandle(key deploymentListenerHandleKey) error {
	ctx, cancel := context.WithCancel(context.Background())
	command := exec.CommandContext(
		ctx,
		r.pythonPath,
		r.launcherPath,
		"--deployment-root", r.deploymentRoot,
		"--entrypoint", r.entrypointPath,
		"--session-id", key.SessionID,
		"--project-config-id", key.ProjectID,
		"--host", r.host,
		"--port", fmt.Sprintf("%d", r.port),
		"--runtime-root", r.runtimeRoot,
	)
	command.Dir = r.deploymentRoot

	stdout, err := command.StdoutPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("deployment listener stdout pipe: %w", err)
	}
	stderr, err := command.StderrPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("deployment listener stderr pipe: %w", err)
	}
	if err := command.Start(); err != nil {
		cancel()
		return fmt.Errorf("start deployment listener: %w", err)
	}

	handle := &deploymentListenerHandle{
		key:        key,
		command:    command,
		cancel:     cancel,
		done:       make(chan struct{}),
		stderrDone: make(chan string, 1),
	}

	go func() {
		output, _ := io.ReadAll(stderr)
		handle.stderrDone <- strings.TrimSpace(string(output))
	}()

	ready := make(chan error, 1)
	go func() {
		line, err := bufio.NewReader(stdout).ReadString('\n')
		if err != nil {
			ready <- err
			return
		}
		if strings.TrimSpace(line) != DeploymentListenerReadySentinel {
			ready <- fmt.Errorf("unexpected startup response %q", strings.TrimSpace(line))
			return
		}
		ready <- nil
		_, _ = io.Copy(io.Discard, stdout)
	}()

	r.mu.Lock()
	r.handles[key] = handle
	r.mu.Unlock()

	go func() {
		err := command.Wait()
		handle.waitErr = err
		close(handle.done)

		r.mu.Lock()
		if current := r.handles[key]; current == handle {
			delete(r.handles, key)
		}
		r.mu.Unlock()
	}()

	timer := time.NewTimer(deploymentListenerStartTimeout)
	defer timer.Stop()

	select {
	case err := <-ready:
		if err == nil {
			return nil
		}
		r.stopHandle(handle)
		return r.startupError(handle, err)
	case <-handle.done:
		return r.startupError(handle, errors.New("deployment listener exited before startup completed"))
	case <-timer.C:
		r.stopHandle(handle)
		return errors.New("deployment listener startup timed out")
	}
}

func (r *deploymentListenerRuntime) startupError(handle *deploymentListenerHandle, err error) error {
	stderr := ""
	select {
	case stderr = <-handle.stderrDone:
	default:
	}
	if stderr != "" {
		return fmt.Errorf("%w: %s", err, stderr)
	}
	if handle.waitErr != nil && !errors.Is(handle.waitErr, context.Canceled) {
		return fmt.Errorf("%w: %v", err, handle.waitErr)
	}
	return err
}

func (r *deploymentListenerRuntime) stopSessionListener(sessionID string, projectID string) error {
	if r == nil {
		return nil
	}

	key := deploymentListenerHandleKey{
		SessionID: strings.TrimSpace(sessionID),
		ProjectID: strings.TrimSpace(projectID),
	}
	if key.SessionID == "" {
		return ErrDeploymentListenerSessionRequired
	}
	if key.ProjectID == "" {
		return ErrDeploymentListenerProjectRequired
	}

	r.mu.Lock()
	handle := r.handles[key]
	r.mu.Unlock()
	if handle == nil {
		return fmt.Errorf("%w: %s/%s", ErrUnknownSession, key.SessionID, key.ProjectID)
	}

	r.stopHandle(handle)
	return nil
}

func (r *deploymentListenerRuntime) dropSession(sessionID string) {
	if r == nil {
		return
	}

	trimmedSessionID := strings.TrimSpace(sessionID)
	if trimmedSessionID == "" {
		return
	}

	r.mu.Lock()
	handles := make([]*deploymentListenerHandle, 0)
	for key, handle := range r.handles {
		if key.SessionID == trimmedSessionID {
			handles = append(handles, handle)
		}
	}
	r.mu.Unlock()

	for _, handle := range handles {
		r.stopHandle(handle)
	}
}

func (r *deploymentListenerRuntime) close() error {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	handles := make([]*deploymentListenerHandle, 0, len(r.handles))
	for _, handle := range r.handles {
		handles = append(handles, handle)
	}
	r.mu.Unlock()

	for _, handle := range handles {
		r.stopHandle(handle)
	}
	return nil
}

func (r *deploymentListenerRuntime) stopHandle(handle *deploymentListenerHandle) {
	if handle == nil {
		return
	}

	handle.cancel()

	timer := time.NewTimer(deploymentListenerStopTimeout)
	defer timer.Stop()

	select {
	case <-handle.done:
		return
	case <-timer.C:
		if handle.command.Process != nil {
			_ = handle.command.Process.Kill()
		}
		<-handle.done
	}
}
