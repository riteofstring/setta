//go:build !windows

package terminal

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/pythonenv"
)

func TestServicePTYInputResizeInterruptReconnectAndDelete(t *testing.T) {
	service := newUnixTerminalService(t)
	if _, created, err := service.Open(80, 24); err != nil || !created {
		t.Fatalf("open terminal = created %t error %v", created, err)
	}
	attachment := attachUnixTerminal(t, service)

	if err := service.Write([]byte("stty -echo\nprintf '__setta_echo_off__\\n'\n")); err != nil {
		t.Fatalf("disable terminal echo: %v", err)
	}
	waitForTerminalOutput(t, attachment, "__setta_echo_off__")
	if err := service.Resize(101, 37); err != nil {
		t.Fatalf("resize terminal: %v", err)
	}
	if err := service.Write([]byte("stty size\n")); err != nil {
		t.Fatalf("write terminal size probe: %v", err)
	}
	waitForTerminalOutput(t, attachment, "37 101")

	if err := service.Write([]byte("printf '__setta_running__\\n'; while :; do :; done; printf '__setta_not_interrupted__\\n'\n")); err != nil {
		t.Fatalf("start long-running foreground command: %v", err)
	}
	waitForTerminalOutput(t, attachment, "__setta_running__")
	if err := service.Write([]byte{0x03}); err != nil {
		t.Fatalf("send terminal Ctrl-C: %v", err)
	}
	if err := service.Write([]byte("printf '__setta_interrupted__\\n'\n")); err != nil {
		t.Fatalf("write post-interrupt command: %v", err)
	}
	waitForTerminalOutput(t, attachment, "__setta_interrupted__")

	attachment.Close()
	reattached := attachUnixTerminal(t, service)
	if history := string(reattached.History); !strings.Contains(history, "__setta_interrupted__") {
		t.Fatalf("reconnected terminal history does not contain post-interrupt output: %q", history)
	}
	reattached.Close()

	deleteContext, cancelDelete := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelDelete()
	if err := service.Delete(deleteContext); err != nil {
		t.Fatalf("delete terminal: %v", err)
	}
	if _, created, err := service.Open(80, 24); err != nil || !created {
		t.Fatalf("open fresh terminal after delete = created %t error %v", created, err)
	}
	fresh := attachUnixTerminal(t, service)
	if strings.Contains(string(fresh.History), "__setta_interrupted__") {
		t.Fatalf("fresh terminal retained old history: %q", string(fresh.History))
	}
}

func TestServiceRunArtifactIsReadOnlyAndLifecycleCleansIt(t *testing.T) {
	for _, lifecycle := range []struct {
		name   string
		finish func(context.Context, *Service) error
	}{
		{
			name: "Delete",
			finish: func(ctx context.Context, service *Service) error {
				return service.Delete(ctx)
			},
		},
		{
			name: "Close",
			finish: func(ctx context.Context, service *Service) error {
				return service.Close(ctx)
			},
		},
	} {
		t.Run(lifecycle.name, func(t *testing.T) {
			directory := t.TempDir()
			service := newUnixTerminalServiceAt(t, directory)
			if _, created, err := service.Open(80, 24); err != nil || !created {
				t.Fatalf("open terminal = created %t error %v", created, err)
			}
			attachment := attachUnixTerminal(t, service)

			_, created, err := service.Run(context.Background(), "import time\nprint('__setta_run_marker__', flush=True)\ntime.sleep(30)\n", 80, 24)
			if err != nil || created {
				t.Fatalf("run generated Python = created %t error %v", created, err)
			}
			artifact := trackedArtifactPath(t, service)
			info, err := os.Stat(artifact)
			if err != nil {
				t.Fatalf("stat run artifact %q: %v", artifact, err)
			}
			if info.Mode().Perm() != 0o400 {
				t.Fatalf("run artifact mode = %o, want 0400", info.Mode().Perm())
			}
			waitForTerminalOutput(t, attachment, "__setta_run_marker__")

			shutdownContext, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancelShutdown()
			if err := lifecycle.finish(shutdownContext, service); err != nil {
				t.Fatalf("%s terminal: %v", lifecycle.name, err)
			}
			if _, err := os.Stat(artifact); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("run artifact after %s stat error = %v, want not exist", lifecycle.name, err)
			}
			if matches, err := filepath.Glob(filepath.Join(directory, ".setta-run-*.py")); err != nil || len(matches) != 0 {
				t.Fatalf("run artifacts after %s = %q error %v", lifecycle.name, matches, err)
			}
		})
	}
}

func TestServicePTYAndRunUseResolvedProjectVenv(t *testing.T) {
	directory := t.TempDir()
	launcher := terminalTestPython(t)
	venvRoot := filepath.Join(directory, ".venv")
	createTerminalVenv(t, launcher, venvRoot)
	environment, err := pythonenv.Resolve(context.Background(), pythonenv.Options{
		ProjectPath:    filepath.Join(directory, "project.json"),
		LauncherPython: launcher,
		InheritedEnvironment: []string{
			"PATH=/ambient/bin",
			"VIRTUAL_ENV=/ambient/venv",
			"PYTHONPATH=/ambient/imports",
			"SETTA_PYTHON=/ambient/python",
		},
	})
	if err != nil {
		t.Fatalf("resolve project Python environment: %v", err)
	}
	service := newUnixTerminalServiceWithEnvironment(t, directory, environment)
	if _, created, err := service.Open(80, 24); err != nil || !created {
		t.Fatalf("open terminal = created %t error %v", created, err)
	}
	attachment := attachUnixTerminal(t, service)
	if err := service.Write([]byte("printf '__setta_venv__%s\\n' \"$VIRTUAL_ENV\"\n")); err != nil {
		t.Fatalf("write VIRTUAL_ENV probe: %v", err)
	}
	if output := waitForTerminalOutput(t, attachment, "__setta_venv__"+venvRoot); !strings.Contains(output, "__setta_venv__"+venvRoot) {
		t.Fatalf("terminal VIRTUAL_ENV output = %q, want %q", output, venvRoot)
	}
	if err := service.Write([]byte("printf '__setta_python__%s\\n' \"$(command -v python)\"\n")); err != nil {
		t.Fatalf("write Python PATH probe: %v", err)
	}
	if output := waitForTerminalOutput(t, attachment, "__setta_python__"+environment.InterpreterPath()); !strings.Contains(output, "__setta_python__"+environment.InterpreterPath()) {
		t.Fatalf("terminal Python path output = %q, want %q", output, environment.InterpreterPath())
	}
	runCode := "import os, sys\nprint('__setta_run_python__' + str(os.path.samefile(sys.executable, " + strconv.Quote(environment.InterpreterPath()) + ")), flush=True)\n"
	if _, created, err := service.Run(context.Background(), runCode, 80, 24); err != nil || created {
		t.Fatalf("run generated Python = created %t error %v", created, err)
	}
	if output := waitForTerminalOutput(t, attachment, "__setta_run_python__True"); !strings.Contains(output, "__setta_run_python__True") {
		t.Fatalf("Run interpreter output = %q, want resolved interpreter", output)
	}
}

func newUnixTerminalService(t *testing.T) *Service {
	t.Helper()
	return newUnixTerminalServiceAt(t, t.TempDir())
}

func newUnixTerminalServiceAt(t *testing.T, directory string) *Service {
	t.Helper()
	environment := resolvedTerminalPythonEnvironment(t, directory)
	return newUnixTerminalServiceWithEnvironment(t, directory, environment)
}

func newUnixTerminalServiceWithEnvironment(t *testing.T, directory string, environment pythonenv.ResolvedPythonEnvironment) *Service {
	t.Helper()
	shell, err := exec.LookPath("sh")
	if err != nil {
		t.Skip("POSIX shell is unavailable")
	}
	service, err := New(Options{
		ProjectDirectory:  directory,
		PythonEnvironment: environment,
		Shell:             []string{shell, "-i"},
	})
	if err != nil {
		t.Fatalf("create terminal service: %v", err)
	}
	t.Cleanup(func() {
		cleanupContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := service.Close(cleanupContext); err != nil {
			t.Errorf("close terminal service: %v", err)
		}
	})
	return service
}

func resolvedTerminalPythonEnvironment(t *testing.T, directory string) pythonenv.ResolvedPythonEnvironment {
	t.Helper()
	environment, err := pythonenv.Resolve(context.Background(), pythonenv.Options{
		ProjectPath:    filepath.Join(directory, "project.json"),
		LauncherPython: terminalTestPython(t),
	})
	if err != nil {
		t.Fatalf("resolve terminal Python environment: %v", err)
	}
	return environment
}

func terminalTestPython(t *testing.T) string {
	t.Helper()
	for _, name := range []string{"python3", "python"} {
		path, err := exec.LookPath(name)
		if err != nil {
			continue
		}
		path, err = filepath.Abs(path)
		if err != nil {
			t.Fatalf("resolve %s path: %v", name, err)
		}
		return path
	}
	t.Skip("a Python interpreter is unavailable")
	return ""
}

func createTerminalVenv(t *testing.T, launcher string, root string) {
	t.Helper()
	venvContext, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	output, err := exec.CommandContext(venvContext, launcher, "-m", "venv", "--without-pip", root).CombinedOutput()
	if err != nil {
		t.Skipf("create real venv with %q: %v: %s", launcher, err, strings.TrimSpace(string(output)))
	}
}

func attachUnixTerminal(t *testing.T, service *Service) *Attachment {
	t.Helper()
	ticket, err := service.IssueTicket()
	if err != nil {
		t.Fatalf("issue terminal ticket: %v", err)
	}
	attachment, err := service.Attach(ticket)
	if err != nil {
		t.Fatalf("attach terminal: %v", err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func waitForTerminalOutput(t *testing.T, attachment *Attachment, marker string) string {
	t.Helper()
	deadline := time.NewTimer(5 * time.Second)
	defer deadline.Stop()
	var output strings.Builder
	for {
		select {
		case chunk, open := <-attachment.Output:
			if !open {
				t.Fatalf("terminal output closed before marker %q; received %q", marker, output.String())
			}
			output.Write(chunk)
			if strings.Contains(output.String(), marker) {
				return output.String()
			}
		case <-deadline.C:
			t.Fatalf("terminal output did not contain marker %q; received %q", marker, output.String())
		}
	}
}

func trackedArtifactPath(t *testing.T, service *Service) string {
	t.Helper()
	service.mu.Lock()
	session := service.session
	service.mu.Unlock()
	if session == nil {
		t.Fatal("run did not retain a terminal session")
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	if len(session.artifacts) != 1 {
		t.Fatalf("tracked run artifacts = %#v", session.artifacts)
	}
	for path := range session.artifacts {
		return path
	}
	return ""
}
