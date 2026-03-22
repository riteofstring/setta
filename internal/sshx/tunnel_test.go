package sshx

import (
	"encoding/json"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/shirou/gopsutil/v4/process"
)

func TestWaitForLocalPortReturnsTrueWhenListening(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen on loopback: %v", err)
	}
	defer listener.Close()

	port := listener.Addr().(*net.TCPAddr).Port
	if !waitForLocalPort("127.0.0.1", port, 500*time.Millisecond) {
		t.Fatalf("expected waitForLocalPort to observe listener on %d", port)
	}
}

func TestWaitForLocalPortReturnsFalseWhenNotListening(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen on loopback: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatalf("close loopback listener: %v", err)
	}

	if waitForLocalPort("127.0.0.1", port, 200*time.Millisecond) {
		t.Fatalf("did not expect waitForLocalPort to observe closed port %d", port)
	}
}

func TestServicePIDMatchesCreateTimeDetectsPIDReuse(t *testing.T) {
	t.Parallel()

	service := newTunnelTestService(t)
	command := startTunnelHelperProcess(t)

	createTime, ok := service.pidCreateTime(command.Process.Pid)
	if !ok {
		t.Fatal("expected helper process create time")
	}
	if !service.pidMatchesCreateTime(command.Process.Pid, createTime) {
		t.Fatalf("expected pid %d to match create time %.3f", command.Process.Pid, createTime)
	}
	if service.pidMatchesCreateTime(command.Process.Pid, createTime+10) {
		t.Fatalf("did not expect pid %d to match mismatched create time", command.Process.Pid)
	}
}

func TestServiceStopPIDSkipsWhenCreateTimeMismatch(t *testing.T) {
	t.Parallel()

	service := newTunnelTestService(t)
	command := startTunnelHelperProcess(t)

	createTime, ok := service.pidCreateTime(command.Process.Pid)
	if !ok {
		t.Fatal("expected helper process create time")
	}
	service.stopPID(command.Process.Pid, createTime+10)

	if !tunnelHelperRunning(command.Process.Pid) {
		t.Fatalf("expected pid %d to keep running after create-time mismatch", command.Process.Pid)
	}
}

func TestServiceStopPIDTerminatesWhenCreateTimeMatches(t *testing.T) {
	t.Parallel()

	service := newTunnelTestService(t)
	command := startTunnelHelperProcess(t)

	createTime, ok := service.pidCreateTime(command.Process.Pid)
	if !ok {
		t.Fatal("expected helper process create time")
	}
	service.stopPID(command.Process.Pid, createTime)
	waitForTunnelHelperExit(t, command, 5*time.Second)

	if tunnelHelperRunning(command.Process.Pid) {
		t.Fatalf("expected pid %d to stop after matching create time", command.Process.Pid)
	}
}

func TestServiceStopPIDTreatsMissingProcessAsSuccess(t *testing.T) {
	t.Parallel()

	service := newTunnelTestService(t)
	command := startTunnelHelperProcess(t)

	createTime, ok := service.pidCreateTime(command.Process.Pid)
	if !ok {
		t.Fatal("expected helper process create time")
	}
	if err := command.Process.Kill(); err != nil {
		t.Fatalf("kill helper process: %v", err)
	}
	waitForTunnelHelperExit(t, command, 5*time.Second)

	// A disappeared process should fail closed as a no-op instead of surfacing a rollback error.
	service.stopPID(command.Process.Pid, createTime)
}

func TestWriteTunnelMetadataExcludesSensitiveConnectionFields(t *testing.T) {
	t.Parallel()

	service := newTunnelTestService(t)
	path := filepath.Join(t.TempDir(), "tunnel.json")
	metadata := TunnelMetadata{
		KeyHash:       strings.Repeat("0", 64),
		RemoteHost:    "example.com",
		RemotePort:    8000,
		LocalPort:     61000,
		PID:           123,
		PIDCreateTime: 1.23,
		CreatedAt:     "2025-01-01T00:00:00+00:00",
		LastUsedAt:    "2025-01-01T00:00:00+00:00",
	}
	if err := service.writeTunnelMetadata(path, metadata); err != nil {
		t.Fatalf("write tunnel metadata: %v", err)
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read tunnel metadata: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode tunnel metadata: %v", err)
	}
	if _, ok := payload["sshTarget"]; ok {
		t.Fatalf("did not expect sshTarget in persisted metadata: %#v", payload)
	}
	if _, ok := payload["sshArgs"]; ok {
		t.Fatalf("did not expect sshArgs in persisted metadata: %#v", payload)
	}
	if _, ok := payload["key"]; ok {
		t.Fatalf("did not expect raw key in persisted metadata: %#v", payload)
	}
	if got := payload["keyHash"]; got != metadata.KeyHash {
		t.Fatalf("expected keyHash %q, got %#v", metadata.KeyHash, got)
	}
}

func TestRemoteConnectResultOmitsUnusedLauncherOriginField(t *testing.T) {
	t.Parallel()

	fieldNames := make([]string, 0, reflect.TypeOf(RemoteConnectResult{}).NumField())
	resultType := reflect.TypeOf(RemoteConnectResult{})
	for index := range resultType.NumField() {
		fieldNames = append(fieldNames, resultType.Field(index).Name)
	}
	if slicesContains(fieldNames, "LauncherOrigin") {
		t.Fatalf("did not expect LauncherOrigin field in RemoteConnectResult: %#v", fieldNames)
	}
	if !slicesContains(fieldNames, "LauncherOriginProof") {
		t.Fatalf("expected LauncherOriginProof field in RemoteConnectResult: %#v", fieldNames)
	}
}

func TestServiceEnsureSSHTunnelReportsMissingBinary(t *testing.T) {
	t.Parallel()

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      "ssh-does-not-exist",
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	_, err = service.EnsureSSHTunnel(EnsureSSHTunnelInput{
		SSHTarget:  "user@host",
		RemoteHost: "127.0.0.1",
		RemotePort: 61234,
	})
	requireSSHErrorCode(t, err, "SshMissing")
}

const tunnelHelperEnvVar = "GO_WANT_SSHX_TUNNEL_HELPER"

func TestSSHTunnelHelperProcess(t *testing.T) {
	if os.Getenv(tunnelHelperEnvVar) != "1" {
		return
	}
	for {
		time.Sleep(time.Hour)
	}
}

func newTunnelTestService(t *testing.T) *Service {
	t.Helper()

	service, err := NewService(ServiceOptions{RuntimeRoot: t.TempDir()})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}
	return service
}

func startTunnelHelperProcess(t *testing.T) *exec.Cmd {
	t.Helper()

	command := exec.Command(os.Args[0], "-test.run=TestSSHTunnelHelperProcess")
	command.Env = append(os.Environ(), tunnelHelperEnvVar+"=1")
	command.Stdout = io.Discard
	command.Stderr = io.Discard
	if err := command.Start(); err != nil {
		t.Fatalf("start tunnel helper process: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	t.Cleanup(func() {
		if command.Process == nil {
			return
		}
		if tunnelHelperRunning(command.Process.Pid) {
			_ = command.Process.Signal(syscall.SIGKILL)
		}
		_, _ = command.Process.Wait()
	})
	return command
}

func tunnelHelperRunning(pid int) bool {
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return false
	}
	running, err := proc.IsRunning()
	if err != nil || !running {
		return false
	}
	status, err := proc.Status()
	if err != nil {
		return true
	}
	for _, entry := range status {
		if strings.EqualFold(strings.TrimSpace(entry), "zombie") {
			return false
		}
	}
	return true
}

func waitForTunnelHelperExit(t *testing.T, command *exec.Cmd, timeout time.Duration) {
	t.Helper()

	if command == nil || command.Process == nil {
		t.Fatal("command process is required")
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !tunnelHelperRunning(command.Process.Pid) {
			_, _ = command.Process.Wait()
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("process %d did not exit", command.Process.Pid)
}

func slicesContains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
