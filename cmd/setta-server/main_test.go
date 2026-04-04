package main

import (
	"bytes"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

const settaServerHelperEnvVar = "GO_WANT_SETTA_SERVER_HELPER"

type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func TestSettaServerHelperProcess(t *testing.T) {
	if os.Getenv(settaServerHelperEnvVar) != "1" {
		return
	}

	args := os.Args
	separator := -1
	for i, arg := range args {
		if arg == "--" {
			separator = i
			break
		}
	}
	if separator == -1 || separator == len(args)-1 {
		os.Exit(2)
	}
	if err := run(args[separator+1:]); err != nil {
		_, _ = os.Stderr.WriteString(err.Error())
		_, _ = os.Stderr.WriteString("\n")
		os.Exit(1)
	}
	os.Exit(0)
}

func TestRunExitsCleanlyOnInterrupt(t *testing.T) {
	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve port: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatalf("close reserved port: %v", err)
	}

	var stdout lockedBuffer
	var stderr lockedBuffer
	command := exec.Command(
		os.Args[0],
		"-test.run=TestSettaServerHelperProcess",
		"--",
		"--workspace", workspaceRoot,
		"--setta-home", settaHome,
		"--host", "127.0.0.1",
		"--port", strconv.Itoa(port),
		"--no-open",
	)
	command.Env = append(os.Environ(), settaServerHelperEnvVar+"=1")
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Start(); err != nil {
		t.Fatalf("start setta-server helper: %v", err)
	}

	waitErrCh := make(chan error, 1)
	go func() {
		waitErrCh <- command.Wait()
	}()

	t.Cleanup(func() {
		if command.Process == nil || command.ProcessState != nil {
			return
		}
		_ = command.Process.Kill()
		select {
		case <-waitErrCh:
		case <-time.After(2 * time.Second):
		}
	})

	if err := waitForServerStartup(waitErrCh, &stdout, &stderr); err != nil {
		t.Fatal(err)
	}

	if err := command.Process.Signal(os.Interrupt); err != nil {
		t.Fatalf("interrupt setta-server helper: %v", err)
	}

	select {
	case err := <-waitErrCh:
		if err != nil {
			t.Fatalf(
				"expected interrupt to exit cleanly: %v\nstdout:\n%s\nstderr:\n%s",
				err,
				stdout.String(),
				stderr.String(),
			)
		}
	case <-time.After(10 * time.Second):
		t.Fatalf("timed out waiting for setta-server helper to exit after interrupt")
	}

	combined := stdout.String() + stderr.String()
	if strings.Contains(combined, "Aborted!") {
		t.Fatalf("expected clean interrupt shutdown, got output %q", combined)
	}
}

func waitForServerStartup(waitErrCh <-chan error, stdout *lockedBuffer, stderr *lockedBuffer) error {
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(stderr.String(), `"msg":"setta server listening"`) ||
			strings.Contains(stdout.String(), "Bootstrap URL (recommended):") {
			time.Sleep(500 * time.Millisecond)
			return nil
		}
		select {
		case err := <-waitErrCh:
			return &serverStartError{
				err:    err,
				stdout: stdout.String(),
				stderr: stderr.String(),
			}
		default:
		}
		time.Sleep(50 * time.Millisecond)
	}
	return &serverStartError{
		err:    ErrServerStartTimeout,
		stdout: stdout.String(),
		stderr: stderr.String(),
	}
}

var ErrServerStartTimeout = &serverStartError{err: errServerStartTimeoutSentinel}

var errServerStartTimeoutSentinel = timeoutError("timed out waiting for setta-server helper to listen")

type serverStartError struct {
	err    error
	stdout string
	stderr string
}

func (e *serverStartError) Error() string {
	return e.err.Error() + "\nstdout:\n" + e.stdout + "\nstderr:\n" + e.stderr
}

type timeoutError string

func (e timeoutError) Error() string {
	return string(e)
}
