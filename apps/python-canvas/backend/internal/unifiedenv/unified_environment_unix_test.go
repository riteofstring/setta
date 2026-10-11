//go:build !windows

package unifiedenv

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/terminal"
)

func TestProjectVenvDependencyReachesInteractiveRunAndTerminal(t *testing.T) {
	workspace := t.TempDir()
	launcher := systemPython(t)
	venvPython := createVenv(t, launcher, filepath.Join(workspace, ".venv"))
	module := fmt.Sprintf("setta_unified_terminal_%d", time.Now().UnixNano())
	writeVenvOnlyModule(t, venvPython, module)
	requireModuleUnavailable(t, launcher, workspace, module)
	environment := resolveProjectVenvEnvironment(t, filepath.Join(workspace, "project.json"), launcher)

	shell, err := exec.LookPath("sh")
	if err != nil {
		t.Skip("POSIX shell is unavailable")
	}
	service, err := terminal.New(terminal.Options{
		ProjectDirectory:  workspace,
		PythonEnvironment: environment,
		Shell:             []string{shell, "-i"},
	})
	if err != nil {
		t.Fatalf("create interactive terminal: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := service.Close(ctx); err != nil {
			t.Errorf("close interactive terminal: %v", err)
		}
	})
	if _, created, err := service.Open(80, 24); err != nil || !created {
		t.Fatalf("open interactive terminal = created %t error %v", created, err)
	}
	ticket, err := service.IssueTicket()
	if err != nil {
		t.Fatalf("issue terminal attachment ticket: %v", err)
	}
	attachment, err := service.Attach(ticket)
	if err != nil {
		t.Fatalf("attach terminal: %v", err)
	}
	t.Cleanup(attachment.Close)

	if _, created, err := service.Run(context.Background(), fmt.Sprintf(
		"import %s\nprint('__setta_interactive_run__' + %s.identify(9), flush=True)\n",
		module,
		module,
	), 80, 24); err != nil || created {
		t.Fatalf("run generated Python in interactive terminal = created %t error %v", created, err)
	}
	waitForTerminalMarker(t, attachment, "__setta_interactive_run__venv:9")

	command := "python -c " + quotePOSIX(fmt.Sprintf(
		"import %s; print('__setta_terminal__' + %s.identify(8))",
		module,
		module,
	)) + "\n"
	if err := service.Write([]byte(command)); err != nil {
		t.Fatalf("run venv-only import in terminal shell: %v", err)
	}
	waitForTerminalMarker(t, attachment, "__setta_terminal__venv:8")
}

func waitForTerminalMarker(t *testing.T, attachment *terminal.Attachment, marker string) {
	t.Helper()
	var output strings.Builder
	output.Write(attachment.History)
	if strings.Contains(output.String(), marker) {
		return
	}
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	for {
		select {
		case chunk, open := <-attachment.Output:
			if !open {
				t.Fatalf("terminal output closed before %q; received %q", marker, output.String())
			}
			output.Write(chunk)
			if strings.Contains(output.String(), marker) {
				return
			}
		case <-timer.C:
			t.Fatalf("terminal output did not contain %q; received %q", marker, output.String())
		}
	}
}

func quotePOSIX(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}
