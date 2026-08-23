//go:build !windows

package terminal

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
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

	if err := service.Write([]byte("sh -c 'printf \"__setta_running__\\n\"; sleep 30; printf \"__setta_not_interrupted__\\n\"'\n")); err != nil {
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
	if _, err := exec.LookPath("python3"); err != nil {
		if _, fallbackErr := exec.LookPath("python"); fallbackErr != nil {
			t.Skip("Python interpreter is unavailable")
		}
	}
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

func newUnixTerminalService(t *testing.T) *Service {
	t.Helper()
	return newUnixTerminalServiceAt(t, t.TempDir())
}

func newUnixTerminalServiceAt(t *testing.T, directory string) *Service {
	t.Helper()
	shell, err := exec.LookPath("sh")
	if err != nil {
		t.Skip("POSIX shell is unavailable")
	}
	service, err := New(Options{ProjectDirectory: directory, Shell: []string{shell, "-i"}})
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
