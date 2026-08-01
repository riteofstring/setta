package typescriptverifier

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"

	evalverifier "setta/internal/evalharness/verifier"
)

const (
	serverStartTimeout = 15 * time.Second
	serverStopTimeout  = 5 * time.Second
)

type fixtureServer struct {
	port    int
	command *exec.Cmd
	cancel  context.CancelFunc
	wait    <-chan error
}

type fixtureServerEvent struct {
	Event string `json:"event"`
	Port  int    `json:"port"`
}

func startFixtureServer(ctx context.Context, workspaceRoot string) (*fixtureServer, error) {
	serverContext, cancel := context.WithCancel(ctx)
	command := exec.CommandContext(serverContext, "node", "dist/server.js")
	command.Dir = workspaceRoot
	command.Env = append(verifierEnvironment(), "PORT=0")
	stdout, err := command.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("open built service stdout: %w", err)
	}
	diagnostic := newBoundedBuffer(maximumCommandOutputBytes)
	command.Stderr = diagnostic
	if err := command.Start(); err != nil {
		cancel()
		if errors.Is(err, exec.ErrNotFound) {
			return nil, fmt.Errorf("verifier command node is unavailable: %w", err)
		}
		return nil, fmt.Errorf("start built service: %w", err)
	}
	ready := make(chan serverReadiness, 1)
	go readServerReadiness(stdout, ready)
	wait := make(chan error, 1)
	go func() {
		wait <- command.Wait()
	}()
	startContext, stopWaiting := context.WithTimeout(ctx, serverStartTimeout)
	defer stopWaiting()
	select {
	case readiness := <-ready:
		if readiness.err != nil {
			return nil, errors.Join(
				readiness.err,
				stopFixtureProcess(cancel, command.Process, wait),
			)
		}
		return &fixtureServer{
			port:    readiness.port,
			command: command,
			cancel:  cancel,
			wait:    wait,
		}, nil
	case err := <-wait:
		cancel()
		return nil, fmt.Errorf(
			"built service exited before readiness: %v: %s",
			err,
			evalverifier.BoundedDetail(diagnostic.String()),
		)
	case <-startContext.Done():
		return nil, errors.Join(
			fmt.Errorf("built service did not become ready within %s", serverStartTimeout),
			stopFixtureProcess(cancel, command.Process, wait),
		)
	}
}

type serverReadiness struct {
	port int
	err  error
}

func readServerReadiness(reader io.Reader, ready chan<- serverReadiness) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 1024), maximumCommandOutputBytes)
	found := false
	for scanner.Scan() {
		if found {
			continue
		}
		var event fixtureServerEvent
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil || event.Event != "listening" {
			continue
		}
		if event.Port < 1 || event.Port > 65_535 {
			ready <- serverReadiness{err: fmt.Errorf("built service reported invalid port %d", event.Port)}
			found = true
			continue
		}
		ready <- serverReadiness{port: event.Port}
		found = true
	}
	if found {
		return
	}
	if err := scanner.Err(); err != nil {
		ready <- serverReadiness{err: fmt.Errorf("read built service readiness: %w", err)}
		return
	}
	ready <- serverReadiness{err: errors.New("built service closed stdout before readiness")}
}

func (server *fixtureServer) stop() error {
	return stopFixtureProcess(server.cancel, server.command.Process, server.wait)
}

func stopFixtureProcess(cancel context.CancelFunc, process *os.Process, wait <-chan error) error {
	cancel()
	var killErr error
	if process != nil {
		if err := process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
			killErr = fmt.Errorf("stop built service: %w", err)
		}
	}
	select {
	case <-wait:
		return killErr
	case <-time.After(serverStopTimeout):
		return errors.Join(
			killErr,
			fmt.Errorf("built service did not stop within %s", serverStopTimeout),
		)
	}
}
