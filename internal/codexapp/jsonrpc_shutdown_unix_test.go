//go:build !windows

package codexapp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"testing"
	"time"
)

func TestJSONRPCShutdownKillsProcessGroupChildren(t *testing.T) {
	client, err := StartProcess(ProcessConfig{
		Command:             os.Args[0],
		Args:                []string{"-test.run=TestCodexAppShutdownFakeServer", "--"},
		Env:                 []string{"SETTA_CODEXAPP_SHUTDOWN_FAKE=1"},
		ShutdownGracePeriod: 50 * time.Millisecond,
		ShutdownKillPeriod:  2 * time.Second,
	})
	if err != nil {
		t.Fatalf("start client: %v", err)
	}

	raw, err := client.Call(context.Background(), "spawnChild", map[string]any{})
	if err != nil {
		t.Fatalf("spawn child: %v", err)
	}
	var response struct {
		PID int `json:"pid"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		t.Fatalf("decode child pid: %v", err)
	}
	if response.PID <= 0 {
		t.Fatalf("child pid = %d, want process id", response.PID)
	}
	if !testProcessExists(response.PID) {
		t.Fatalf("child process %d was not running before shutdown", response.PID)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.shutdown(ctx); err != nil {
		t.Fatalf("shutdown client: %v", err)
	}
	waitForTestProcessGone(t, response.PID)
}

func TestCodexAppShutdownFakeServer(t *testing.T) {
	if os.Getenv("SETTA_CODEXAPP_SHUTDOWN_FAKE") == "" {
		return
	}
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var message map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			panic(err)
		}
		if message["method"] != "spawnChild" {
			writeShutdownFakeResponse(message["id"], map[string]any{})
			continue
		}
		cmd := exec.Command(os.Args[0], "-test.run=TestCodexAppShutdownFakeChild", "--")
		cmd.Env = append(os.Environ(), "SETTA_CODEXAPP_SHUTDOWN_CHILD=1")
		cmd.Stdin = nil
		cmd.Stdout = io.Discard
		cmd.Stderr = io.Discard
		if err := cmd.Start(); err != nil {
			panic(err)
		}
		writeShutdownFakeResponse(message["id"], map[string]any{"pid": cmd.Process.Pid})
	}
	os.Exit(0)
}

func TestCodexAppShutdownFakeChild(t *testing.T) {
	if os.Getenv("SETTA_CODEXAPP_SHUTDOWN_CHILD") == "" {
		return
	}
	signal.Ignore(syscall.SIGTERM)
	select {}
}

func writeShutdownFakeResponse(id any, result any) {
	data, err := json.Marshal(map[string]any{"id": id, "result": result})
	if err != nil {
		panic(err)
	}
	os.Stdout.Write(append(data, '\n'))
}

func waitForTestProcessGone(t *testing.T, pid int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if !testProcessExists(pid) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("process %d remained alive after codex app-server shutdown", pid)
}

func testProcessExists(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}
