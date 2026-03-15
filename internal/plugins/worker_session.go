package plugins

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
	"time"
)

const workerSessionCloseTimeout = time.Second

var (
	ErrWorkerSessionCommandPrefixRequired = errors.New("plugins: worker session command prefix is required")
	ErrWorkerSessionPluginIDRequired      = errors.New("plugins: worker session plugin id is required")
	ErrWorkerSessionPluginVersionRequired = errors.New("plugins: worker session plugin version is required")
	ErrWorkerSessionPluginRootRequired    = errors.New("plugins: worker session plugin root is required")
	ErrWorkerSessionEntrypointRequired    = errors.New("plugins: worker session entrypoint is required")
	ErrWorkerSessionClosed                = errors.New("plugins: worker session is closed")
	ErrWorkerSessionStartFailed           = errors.New("plugins: worker session start failed")
	ErrWorkerSessionCloseFailed           = errors.New("plugins: worker session close failed")
)

type WorkerSessionOptions struct {
	CommandPrefix         []string
	PluginID              string
	PluginVersion         string
	PluginRoot            string
	Entrypoint            string
	EffectiveCapabilities []string
	Environment           []string
	WorkingDirectory      string
	Host                  *WorkerHost
	NextRequestID         int64
}

type WorkerSession struct {
	client *WorkerRPCClient
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stderr bytes.Buffer

	mu     sync.Mutex
	closed bool
}

func StartWorkerSession(options WorkerSessionOptions) (*WorkerSession, error) {
	commandPrefix, err := normalizeWorkerCommandPrefix(options.CommandPrefix)
	if err != nil {
		return nil, ErrWorkerSessionCommandPrefixRequired
	}
	pluginID := strings.TrimSpace(options.PluginID)
	if pluginID == "" {
		return nil, ErrWorkerSessionPluginIDRequired
	}
	pluginVersion := strings.TrimSpace(options.PluginVersion)
	if pluginVersion == "" {
		return nil, ErrWorkerSessionPluginVersionRequired
	}
	pluginRoot := strings.TrimSpace(options.PluginRoot)
	if pluginRoot == "" {
		return nil, ErrWorkerSessionPluginRootRequired
	}
	entrypoint := strings.TrimSpace(options.Entrypoint)
	if entrypoint == "" {
		return nil, ErrWorkerSessionEntrypointRequired
	}
	if options.Host == nil {
		return nil, ErrWorkerRPCHostRequired
	}

	command := append([]string{}, commandPrefix...)
	command = append(command,
		"--plugin-id",
		pluginID,
		"--plugin-version",
		pluginVersion,
		"--entrypoint",
		entrypoint,
	)

	cmd := exec.Command(command[0], command[1:]...)
	if strings.TrimSpace(options.WorkingDirectory) != "" {
		cmd.Dir = strings.TrimSpace(options.WorkingDirectory)
	}
	if len(options.Environment) > 0 {
		cmd.Env = append([]string(nil), options.Environment...)
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("%w: stdin pipe: %v", ErrWorkerSessionStartFailed, err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return nil, fmt.Errorf("%w: stdout pipe: %v", ErrWorkerSessionStartFailed, err)
	}

	session := &WorkerSession{
		cmd:   cmd,
		stdin: stdin,
	}
	cmd.Stderr = &session.stderr

	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		return nil, fmt.Errorf("%w: %v", ErrWorkerSessionStartFailed, err)
	}

	client, err := NewWorkerRPCClient(WorkerRPCClientOptions{
		Reader: stdout,
		Writer: stdin,
		Host:   options.Host,
		Worker: WorkerContext{
			PluginID:              pluginID,
			PluginRoot:            options.PluginRoot,
			EffectiveCapabilities: append([]string(nil), options.EffectiveCapabilities...),
		},
		NextRequestID: options.NextRequestID,
	})
	if err != nil {
		_ = stdin.Close()
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return nil, err
	}
	session.client = client

	return session, nil
}

func (s *WorkerSession) Initialize(ctx context.Context) (json.RawMessage, error) {
	return s.Call(ctx, "plugin.initialize", nil)
}

func (s *WorkerSession) Register(ctx context.Context) (json.RawMessage, error) {
	return s.Call(ctx, "plugin.register", nil)
}

func (s *WorkerSession) Shutdown(ctx context.Context) error {
	_, err := s.Call(ctx, "plugin.shutdown", nil)
	return err
}

func (s *WorkerSession) Call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	s.mu.Lock()
	closed := s.closed
	client := s.client
	s.mu.Unlock()

	if closed || client == nil {
		return nil, ErrWorkerSessionClosed
	}
	return client.Call(ctx, method, params)
}

func (s *WorkerSession) Close() error {
	if s == nil {
		return nil
	}

	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	cmd := s.cmd
	stdin := s.stdin
	s.mu.Unlock()

	var closeErr error
	if stdin != nil {
		if err := stdin.Close(); err != nil {
			closeErr = errors.Join(closeErr, fmt.Errorf("%w: close stdin: %v", ErrWorkerSessionCloseFailed, err))
		}
	}
	if cmd == nil {
		return closeErr
	}

	waitDone := make(chan error, 1)
	go func() {
		waitDone <- cmd.Wait()
	}()

	select {
	case err := <-waitDone:
		if err != nil {
			closeErr = errors.Join(closeErr, fmt.Errorf("%w: %v", ErrWorkerSessionCloseFailed, err))
		}
		return closeErr
	case <-time.After(workerSessionCloseTimeout):
		if cmd.Process != nil {
			if err := cmd.Process.Kill(); err != nil {
				closeErr = errors.Join(closeErr, fmt.Errorf("%w: kill process: %v", ErrWorkerSessionCloseFailed, err))
			}
		}
	}

	select {
	case err := <-waitDone:
		if err != nil {
			closeErr = errors.Join(closeErr, fmt.Errorf("%w: %v", ErrWorkerSessionCloseFailed, err))
		}
	case <-time.After(workerSessionCloseTimeout):
		closeErr = errors.Join(closeErr, fmt.Errorf("%w: process did not exit after kill", ErrWorkerSessionCloseFailed))
	}

	return closeErr
}

func (s *WorkerSession) Stderr() string {
	if s == nil {
		return ""
	}
	return s.stderr.String()
}
