//go:build darwin

package runner

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/setta/local-backend/proctree"
)

var errDarwinWorkerInjected = errors.New("injected Darwin worker failure")

func TestDarwinContainmentProfileBlocksSessionEscapeAndPermitsNormalChildren(t *testing.T) {
	if err := validateDarwinContainmentLauncher(); err != nil {
		t.Skipf("macOS containment launcher is unavailable: %v", err)
	}
	interpreter := darwinContainmentInterpreter(t)
	script := filepath.Join(t.TempDir(), "containment.py")
	contents := `import os
import subprocess

child = os.fork()
if child == 0:
    os._exit(0)
os.waitpid(child, 0)
subprocess.run(["/usr/bin/true"], check=True)

for escape in (lambda: os.setsid(), lambda: os.setpgid(0, 0)):
    try:
        escape()
    except PermissionError:
        pass
    else:
        raise RuntimeError("process escape was allowed")
print("contained")
`
	if err := os.WriteFile(script, []byte(contents), 0o600); err != nil {
		t.Fatalf("write containment program: %v", err)
	}
	command, err := proctree.DarwinCommand(interpreter, script)
	if err != nil {
		t.Fatalf("build containment command: %v", err)
	}
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("run containment program: %v\n%s", err, output)
	}
	if got := strings.TrimSpace(string(output)); got != "contained" {
		t.Fatalf("containment program output = %q, want contained", got)
	}
}

func TestDarwinWorkerContainsItsGroupAfterTargetLifecycleFailures(t *testing.T) {
	for _, testCase := range []struct {
		name        string
		closeOutput error
		startReport error
		waitTarget  error
		exitReport  error
	}{
		{name: "output close", closeOutput: errDarwinWorkerInjected},
		{name: "started report", startReport: errDarwinWorkerInjected},
		{name: "target wait", waitTarget: errDarwinWorkerInjected},
		{name: "exit report", exitReport: errDarwinWorkerInjected},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			reportReader, reportWriter, err := os.Pipe()
			if err != nil {
				t.Fatalf("create worker report pipe: %v", err)
			}
			t.Cleanup(func() {
				_ = reportReader.Close()
				_ = reportWriter.Close()
			})
			targetDone := make(chan error, 1)
			if testCase.waitTarget != nil {
				targetDone <- testCase.waitTarget
			} else {
				targetDone <- nil
			}
			var statuses []byte
			killCalls := 0
			holdCalls := 0
			runtime := darwinGuardianWorkerRuntime{
				startTarget: func(string, string) (*exec.Cmd, error) {
					return &exec.Cmd{}, nil
				},
				closeOutput: func() error { return testCase.closeOutput },
				writeStatus: func(_ *os.File, status byte) error {
					statuses = append(statuses, status)
					if status == darwinWorkerStarted {
						return testCase.startReport
					}
					return nil
				},
				writeExit:  func(*os.File, privateGuardianExit) error { return testCase.exitReport },
				waitTarget: func(*exec.Cmd) <-chan error { return targetDone },
				killGroup: func() error {
					killCalls++
					return nil
				},
				hold: func() error {
					holdCalls++
					return errDarwinWorkerHeld
				},
				signals: make(chan os.Signal),
			}

			err = runDarwinPrivateGuardianWorkerWithRuntime("interpreter", "artifact", reportWriter, runtime)
			if !errors.Is(err, errDarwinWorkerInjected) {
				t.Fatalf("worker error = %v, want injected failure", err)
			}
			if !errors.Is(err, errDarwinWorkerHeld) {
				t.Fatalf("worker error = %v, want containment hold", err)
			}
			if killCalls != 1 || holdCalls != 1 {
				t.Fatalf("worker containment calls = kill %d hold %d, want one each", killCalls, holdCalls)
			}
			if len(statuses) == 0 || statuses[len(statuses)-1] != darwinWorkerFailure {
				t.Fatalf("worker statuses = %#v, want terminal failure report", statuses)
			}
		})
	}
}

func TestTerminateDarwinWorkerSignalsZombieLeaderGroup(t *testing.T) {
	interpreter := darwinContainmentInterpreter(t)
	childPIDPath := filepath.Join(t.TempDir(), "term-ignoring-child-pid")
	command := exec.Command(interpreter, "-c", `import os, signal, sys, time
child_pid_path = sys.argv[1]
child = os.fork()
if child == 0:
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    with open(child_pid_path, "w", encoding="utf-8") as marker:
        marker.write(str(os.getpid()))
        marker.flush()
        os.fsync(marker.fileno())
    while True:
        time.sleep(1)
os._exit(0)
`, childPIDPath)
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := command.Start(); err != nil {
		t.Fatalf("start worker group: %v", err)
	}
	childPID := 0
	terminated := false
	t.Cleanup(func() {
		if childPID > 0 {
			_ = syscall.Kill(childPID, syscall.SIGKILL)
		}
		if !terminated && command.Process != nil {
			_ = command.Process.Kill()
			_ = command.Wait()
		}
	})

	waitForTestFile(t, childPIDPath)
	childPID = darwinWorkerChildPID(t, childPIDPath)
	waitForDarwinWorkerLeaderGone(t, command.Process.Pid)
	if err := terminateDarwinWorker(command); err != nil {
		t.Fatalf("terminate zombie-led worker group: %v", err)
	}
	terminated = true
	assertDarwinWorkerChildGone(t, childPID)
}

var errDarwinWorkerHeld = errors.New("darwin worker held for outer cleanup")

func darwinContainmentInterpreter(t *testing.T) string {
	t.Helper()
	for _, candidate := range []string{"/usr/bin/python3", "python3"} {
		path, err := exec.LookPath(candidate)
		if err == nil {
			return path
		}
	}
	t.Skip("python3 is required for macOS process-containment coverage")
	return ""
}

func darwinWorkerChildPID(t *testing.T, path string) int {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read term-ignoring child PID: %v", err)
	}
	processID, err := strconv.Atoi(strings.TrimSpace(string(contents)))
	if err != nil || processID < 1 {
		t.Fatalf("term-ignoring child PID = %q, want positive integer", contents)
	}
	return processID
}

func waitForDarwinWorkerLeaderGone(t *testing.T, processID int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		_, err := syscall.Getpgid(processID)
		if errors.Is(err, syscall.ESRCH) {
			return
		}
		if err != nil {
			t.Fatalf("check worker leader %d: %v", processID, err)
		}
		if time.Now().After(deadline) {
			t.Fatalf("worker leader %d did not become an unreaped zombie", processID)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func assertDarwinWorkerChildGone(t *testing.T, processID int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		err := syscall.Kill(processID, 0)
		if errors.Is(err, syscall.ESRCH) {
			return
		}
		if err != nil {
			t.Fatalf("check contained child %d: %v", processID, err)
		}
		if time.Now().After(deadline) {
			t.Fatalf("TERM-ignoring worker child %d survived cleanup", processID)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
