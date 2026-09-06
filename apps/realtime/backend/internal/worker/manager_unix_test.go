//go:build darwin || linux

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
	marker := projectRoot + "/child.pid"
	writeFixtureEntrypoint(t, projectRoot, `import os
import signal
import subprocess
import sys
import time

def hang(marker):
    child = subprocess.Popen([
        sys.executable,
        "-c",
        "import os,signal,time;\ntry:\n os.setsid()\nexcept OSError:\n pass\nsignal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(60)",
    ])
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
	deadline := time.Now().Add(3 * time.Second)
	for {
		err = syscall.Kill(childPID, 0)
		if errors.Is(err, syscall.ESRCH) {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("descendant %d remains alive: %v", childPID, err)
		}
		time.Sleep(20 * time.Millisecond)
	}
	result := invokeManager(t, manager, "after-timeout", 2, "ping")
	if string(result.Outputs["value"]) != `"ready"` {
		t.Fatalf("replacement result = %#v", result)
	}
}
