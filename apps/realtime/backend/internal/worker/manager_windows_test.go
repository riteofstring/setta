//go:build windows

package worker

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strconv"
	"syscall"
	"testing"
	"time"
)

func TestManagerTimeoutReplacesWorkerAndKillsDescendants(t *testing.T) {
	projectRoot := t.TempDir()
	marker := projectRoot + `\child.pid`
	writeFixtureEntrypoint(t, projectRoot, `import subprocess
import sys
import time

def hang(marker):
    child = subprocess.Popen([
        sys.executable,
        "-c",
        "import time;time.sleep(60)",
    ], creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    with open(marker, "w", encoding="utf-8") as target:
        target.write(str(child.pid))
    while True:
        time.sleep(1)

def ping():
    return {"value": "ready"}

handlers = {"hang": hang, "ping": ping}
`)
	manager := newFixtureManager(t, Options{InvokeTimeout: 250 * time.Millisecond, ShutdownTimeout: 500 * time.Millisecond})
	initializeManager(t, manager, projectRoot, []string{"hang", "ping"})
	argument, err := json.Marshal(marker)
	if err != nil {
		t.Fatalf("marshal marker: %v", err)
	}
	_, err = manager.Invoke(testContext(t), fixtureInvokeParams("timeout", 1, "hang", map[string]json.RawMessage{"marker": argument}))
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Invoke(hang) error = %v, want deadline", err)
	}
	childBytes, err := os.ReadFile(marker)
	if err != nil {
		t.Fatalf("read child pid: %v", err)
	}
	childPID, err := strconv.Atoi(string(childBytes))
	if err != nil {
		t.Fatalf("parse child pid: %v", err)
	}
	waitForWindowsProcessExit(t, childPID)
	result := invokeManager(t, manager, "after-timeout", 2, "ping")
	if string(result.Outputs["value"]) != `"ready"` {
		t.Fatalf("replacement result = %#v", result)
	}
}

func waitForWindowsProcessExit(t *testing.T, processID int) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		alive, err := windowsProcessAlive(processID)
		if err != nil {
			t.Fatalf("inspect descendant %d: %v", processID, err)
		}
		if !alive {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("descendant %d remains alive", processID)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func windowsProcessAlive(processID int) (bool, error) {
	handle, err := syscall.OpenProcess(syscall.SYNCHRONIZE, false, uint32(processID))
	if err != nil {
		if errors.Is(err, syscall.Errno(87)) {
			return false, nil
		}
		return false, err
	}
	defer syscall.CloseHandle(handle)
	state, err := syscall.WaitForSingleObject(handle, 0)
	if err != nil {
		return false, err
	}
	return state == syscall.WAIT_TIMEOUT, nil
}
