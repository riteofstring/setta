//go:build !windows

package httpapi

import (
	"context"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/runner"
)

func TestServeLifecycleCancellationStopsTheOwnedGeneratedRun(t *testing.T) {
	projectDirectory := t.TempDir()
	startedPath := filepath.Join(projectDirectory, "run-started")
	runnerPIDPath := filepath.Join(projectDirectory, "runner.pid")
	childPIDPath := filepath.Join(projectDirectory, "runner-child.pid")
	runtime, err := runner.New(runner.Options{
		Interpreter:      writeLifecycleInterpreter(t, projectDirectory),
		ProjectDirectory: projectDirectory,
		Environment: []string{
			"PATH=/usr/bin:/bin",
			"SETTA_RUN_STARTED=" + startedPath,
			"SETTA_RUN_PID=" + runnerPIDPath,
			"SETTA_RUN_CHILD_PID=" + childPIDPath,
		},
		DefaultTimeout: time.Minute,
		OutputLimit:    1_024,
	})
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}
	service := &stubProjectService{snapshot: contracts.FixtureProjectSnapshotV2()}
	service.captureGeneratedProgram = func(_ context.Context, projectID string, revision int) (GeneratedProgram, error) {
		return GeneratedProgram{ProjectID: projectID, Revision: revision, Code: "run until lifecycle shutdown"}, nil
	}
	lifecycle, cancelLifecycle := context.WithCancel(context.Background())
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	requestContext, cancelRequest := context.WithCancel(context.Background())
	serverFinished := make(chan struct{})
	var serverErr error
	go func() {
		serverErr = serve(lifecycle, listener, service, HandlerOptions{
			Terminal:       newTerminalRuntimeStub(),
			Runner:         runtime,
			RuntimeSession: runtimeSessionIdentityForTest(),
			AppOrigin:      "http://127.0.0.1:5173",
			Lifecycle:      lifecycle,
		})
		close(serverFinished)
	}()
	t.Cleanup(func() {
		cancelRequest()
		cancelLifecycle()
		_ = listener.Close()
		select {
		case <-serverFinished:
		case <-time.After(2 * time.Second):
			t.Error("loopback server did not stop during test cleanup")
		}
	})

	request, err := http.NewRequestWithContext(requestContext, http.MethodPost, "http://"+listener.Addr().String()+contracts.ProjectRunPathV2, strings.NewReader(`{"projectId":"project:fixture","expectedRevision":1}`))
	if err != nil {
		t.Fatalf("new run request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	type clientResult struct {
		response *http.Response
		err      error
	}
	result := make(chan clientResult, 1)
	go func() {
		response, requestErr := http.DefaultClient.Do(request)
		result <- clientResult{response: response, err: requestErr}
	}()
	waitForLifecycleFile(t, startedPath)

	cancelLifecycle()
	select {
	case <-serverFinished:
		if serverErr != nil {
			t.Fatalf("serve() error = %v", serverErr)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("server shutdown waited for the active generated run")
	}
	select {
	case completed := <-result:
		if completed.err != nil {
			t.Fatalf("run request error = %v", completed.err)
		}
		defer completed.response.Body.Close()
		if completed.response.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("run status = %d, want %d", completed.response.StatusCode, http.StatusServiceUnavailable)
		}
	case <-time.After(time.Second):
		t.Fatal("active run request did not finish after lifecycle cancellation")
	}
	assertLifecycleProcessStopped(t, readLifecyclePID(t, runnerPIDPath))
	assertLifecycleProcessStopped(t, readLifecyclePID(t, childPIDPath))
}

func writeLifecycleInterpreter(t *testing.T, directory string) string {
	t.Helper()
	path := filepath.Join(directory, "lifecycle-python")
	contents := `#!/bin/sh
(sleep 30) &
printf '%s\n' "$$" > "$SETTA_RUN_PID"
printf '%s\n' "$!" > "$SETTA_RUN_CHILD_PID"
: > "$SETTA_RUN_STARTED"
while :; do sleep 1; done
`
	if err := os.WriteFile(path, []byte(contents), 0o700); err != nil {
		t.Fatalf("write lifecycle interpreter: %v", err)
	}
	return path
}

func waitForLifecycleFile(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", path)
}

func readLifecyclePID(t *testing.T, path string) int {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read process ID: %v", err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(contents)))
	if err != nil || pid < 1 {
		t.Fatalf("process ID %q is invalid: %v", contents, err)
	}
	return pid
}

func assertLifecycleProcessStopped(t *testing.T, pid int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for lifecycleProcessExists(pid) && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if lifecycleProcessExists(pid) {
		t.Fatalf("generated run process %d survived lifecycle shutdown", pid)
	}
}

func lifecycleProcessExists(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || err == syscall.EPERM
}
