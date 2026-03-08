package terminals

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/observability"
)

func TestBuildTerminalID(t *testing.T) {
	t.Parallel()

	if got := BuildTerminalID("section-a", ""); got != "section-a" {
		t.Fatalf("expected section id without share session, got %q", got)
	}
	if got := BuildTerminalID("section-a", "share-a"); got != "share-a::section-a" {
		t.Fatalf("expected share-scoped terminal id, got %q", got)
	}
}

func TestServiceListFiltersByShareSession(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	command := quietCatCommand(t)

	projectID := "project-alpha"
	terminalIDA := BuildTerminalID("section-a", "share-a")
	terminalIDB := BuildTerminalID("section-a", "share-b")

	if _, created, err := service.Open(OpenOptions{
		ID:             terminalIDA,
		ProjectID:      projectID,
		ShareSessionID: "share-a",
		AllowInput:     true,
		Command:        command,
	}); err != nil {
		t.Fatalf("open share-a terminal: %v", err)
	} else if !created {
		t.Fatal("expected share-a terminal to be created")
	}
	if _, created, err := service.Open(OpenOptions{
		ID:             terminalIDB,
		ProjectID:      projectID,
		ShareSessionID: "share-b",
		AllowInput:     true,
		Command:        command,
	}); err != nil {
		t.Fatalf("open share-b terminal: %v", err)
	} else if !created {
		t.Fatal("expected share-b terminal to be created")
	}

	shareA := service.List(projectID, "share-a")
	shareB := service.List(projectID, "share-b")
	if len(shareA) != 1 || shareA[0].ID != terminalIDA {
		t.Fatalf("expected only share-a terminal, got %#v", shareA)
	}
	if len(shareB) != 1 || shareB[0].ID != terminalIDB {
		t.Fatalf("expected only share-b terminal, got %#v", shareB)
	}
}

func TestServiceAttachWriteHistoryAndReattach(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-a", "")
	if _, created, err := service.Open(OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    readyQuietCatCommand(t),
	}); err != nil {
		t.Fatalf("open terminal: %v", err)
	} else if !created {
		t.Fatal("expected terminal to be created")
	}

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal: %v", err)
	}
	t.Cleanup(attachment.Close)

	initialOutput := waitForOutputContains(t, attachment, "ready")
	if !strings.Contains(initialOutput, "ready") {
		t.Fatalf("expected ready output, got %q", initialOutput)
	}

	if err := service.Write(sessionID, []byte("first line\n")); err != nil {
		t.Fatalf("write first line: %v", err)
	}
	firstLineOutput := waitForOutputContains(t, attachment, "first line")
	if !strings.Contains(firstLineOutput, "first line") {
		t.Fatalf("expected first line output, got %q", firstLineOutput)
	}

	attachment.Close()

	reattached, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("reattach terminal: %v", err)
	}
	t.Cleanup(reattached.Close)

	if !strings.Contains(string(reattached.History), "first line") {
		t.Fatalf("expected reattach history to include previous output, got %q", string(reattached.History))
	}

	if err := service.Write(sessionID, []byte("second line\n")); err != nil {
		t.Fatalf("write second line: %v", err)
	}
	secondLineOutput := waitForOutputContains(t, reattached, "second line")
	if !strings.Contains(secondLineOutput, "second line") {
		t.Fatalf("expected second line output, got %q", secondLineOutput)
	}
}

func TestServiceHistoryReturnsBufferedOutput(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-history", "")
	if _, created, err := service.Open(OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    readyQuietCatCommand(t),
	}); err != nil {
		t.Fatalf("open terminal: %v", err)
	} else if !created {
		t.Fatal("expected terminal to be created")
	}

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal: %v", err)
	}
	t.Cleanup(attachment.Close)

	waitForOutputContains(t, attachment, "ready")
	if err := service.Write(sessionID, []byte("history line\n")); err != nil {
		t.Fatalf("write history line: %v", err)
	}
	waitForOutputContains(t, attachment, "history line")

	history, err := service.History(sessionID)
	if err != nil {
		t.Fatalf("terminal history: %v", err)
	}
	if !strings.Contains(history, "ready") || !strings.Contains(history, "history line") {
		t.Fatalf("expected terminal history to include buffered output, got %q", history)
	}
}

func TestServiceResizeUpdatesSessionAndPTY(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-a", "")
	if _, created, err := service.Open(OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    resizeProbeCommand(t),
	}); err != nil {
		t.Fatalf("open terminal: %v", err)
	} else if !created {
		t.Fatal("expected terminal to be created")
	}

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal: %v", err)
	}
	t.Cleanup(attachment.Close)

	waitForOutputContains(t, attachment, "ready")

	if err := service.Resize(sessionID, 80, 24); err != nil {
		t.Fatalf("resize terminal: %v", err)
	}
	if err := service.Write(sessionID, []byte("size\n")); err != nil {
		t.Fatalf("write resize probe: %v", err)
	}

	output := waitForOutputContains(t, attachment, "24 80")
	if !strings.Contains(output, "24 80") {
		t.Fatalf("expected PTY-backed size output, got %q", output)
	}

	info, ok := service.Session(sessionID)
	if !ok {
		t.Fatal("expected terminal session to exist")
	}
	if info.Columns != 80 || info.Rows != 24 {
		t.Fatalf("expected stored terminal size 80x24, got %dx%d", info.Columns, info.Rows)
	}
}

func TestServiceRejectsWritesWhenInputDisabled(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-a", "share-a")
	if _, created, err := service.Open(OpenOptions{
		ID:             sessionID,
		ProjectID:      "project-alpha",
		ShareSessionID: "share-a",
		AllowInput:     false,
		Command:        readyQuietCatCommand(t),
	}); err != nil {
		t.Fatalf("open terminal: %v", err)
	} else if !created {
		t.Fatal("expected terminal to be created")
	}

	if err := service.Write(sessionID, []byte("blocked\n")); !errors.Is(err, ErrInputDisabled) {
		t.Fatalf("expected input-disabled error, got %v", err)
	}

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal: %v", err)
	}
	t.Cleanup(attachment.Close)

	if err := service.RunCommand(sessionID, []byte("printf 'RUN_OK\\n'\n")); err != nil {
		t.Fatalf("run command: %v", err)
	}
	output := waitForOutputContains(t, attachment, "RUN_OK")
	if !strings.Contains(output, "RUN_OK") {
		t.Fatalf("expected backend-owned command output, got %q", output)
	}
}

func TestServiceDeleteShareSessionRemovesOnlyMatchingSessions(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	command := quietCatCommand(t)

	sessionA := BuildTerminalID("section-a", "share-a")
	sessionB := BuildTerminalID("section-a", "share-b")

	openTerminalForTest(t, service, OpenOptions{
		ID:             sessionA,
		ProjectID:      "project-alpha",
		ShareSessionID: "share-a",
		AllowInput:     true,
		Command:        command,
	})
	openTerminalForTest(t, service, OpenOptions{
		ID:             sessionB,
		ProjectID:      "project-alpha",
		ShareSessionID: "share-b",
		AllowInput:     true,
		Command:        command,
	})

	deleteCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := service.DeleteShareSession(deleteCtx, "share-a"); err != nil {
		t.Fatalf("delete share session terminals: %v", err)
	}

	if sessions := service.List("project-alpha", "share-a"); len(sessions) != 0 {
		t.Fatalf("expected share-a terminals to be removed, got %#v", sessions)
	}
	if sessions := service.List("project-alpha", "share-b"); len(sessions) != 1 || sessions[0].ID != sessionB {
		t.Fatalf("expected share-b terminal to remain, got %#v", sessions)
	}
}

func TestServiceInterruptProjectLeavesIdleShellsAlone(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-a", "")
	openTerminalForTest(t, service, OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    interactiveBashCommand(t),
	})

	attachment := attachTerminalForTest(t, service, sessionID)
	prepareInterruptShell(t, service, sessionID, attachment)

	interruptedCount, err := service.InterruptProject("project-alpha", "")
	if err != nil {
		t.Fatalf("interrupt idle terminal shell: %v", err)
	}
	if interruptedCount != 0 {
		t.Fatalf("expected idle terminal shell to remain untouched, got %d interrupted sessions", interruptedCount)
	}

	if err := service.Write(sessionID, []byte("printf 'STILL_ALIVE\\n'\n")); err != nil {
		t.Fatalf("write alive probe: %v", err)
	}
	output := waitForOutputContains(t, attachment, "STILL_ALIVE")
	if !strings.Contains(output, "STILL_ALIVE") {
		t.Fatalf("expected alive probe output, got %q", output)
	}
}

func TestServiceReusableSessionReturnsTrueForIdleInteractiveShell(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-a", "")
	openTerminalForTest(t, service, OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    interactiveBashCommand(t),
	})

	attachment := attachTerminalForTest(t, service, sessionID)
	prepareInterruptShell(t, service, sessionID, attachment)

	if !service.ReusableSession(sessionID) {
		t.Fatal("expected idle interactive shell to be reusable")
	}
}

func TestServiceReusableSessionReturnsFalseForForegroundJob(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-a", "")
	openTerminalForTest(t, service, OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    interactiveBashCommand(t),
	})

	attachment := attachTerminalForTest(t, service, sessionID)
	prepareInterruptShell(t, service, sessionID, attachment)

	scriptPath := writeInterruptibleScript(t)
	startInterruptibleForegroundJob(t, service, sessionID, attachment, scriptPath)

	if service.ReusableSession(sessionID) {
		t.Fatal("did not expect a foreground job terminal to be reusable")
	}

	interruptedCount, err := service.InterruptProject("project-alpha", "")
	if err != nil {
		t.Fatalf("interrupt foreground job: %v", err)
	}
	if interruptedCount != 1 {
		t.Fatalf("expected one interrupted terminal, got %d", interruptedCount)
	}

	output := waitForOutputContains(t, attachment, "CHILD_EXIT:130")
	if !strings.Contains(output, "CHILD_INTERRUPTED") {
		t.Fatalf("expected interrupt output, got %q", output)
	}
}

func TestServiceInterruptProjectFiltersByShareSession(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	command := interactiveBashCommand(t)
	scriptPath := writeInterruptibleScript(t)

	sessionA := BuildTerminalID("section-a", "share-a")
	sessionB := BuildTerminalID("section-a", "share-b")

	openTerminalForTest(t, service, OpenOptions{
		ID:             sessionA,
		ProjectID:      "project-alpha",
		ShareSessionID: "share-a",
		AllowInput:     true,
		Command:        command,
	})
	openTerminalForTest(t, service, OpenOptions{
		ID:             sessionB,
		ProjectID:      "project-alpha",
		ShareSessionID: "share-b",
		AllowInput:     true,
		Command:        command,
	})

	attachmentA := attachTerminalForTest(t, service, sessionA)
	attachmentB := attachTerminalForTest(t, service, sessionB)
	prepareInterruptShell(t, service, sessionA, attachmentA)
	prepareInterruptShell(t, service, sessionB, attachmentB)

	startInterruptibleForegroundJob(t, service, sessionA, attachmentA, scriptPath)
	startInterruptibleForegroundJob(t, service, sessionB, attachmentB, scriptPath)

	interruptedCount, err := service.InterruptProject("project-alpha", "share-a")
	if err != nil {
		t.Fatalf("interrupt share-a terminals: %v", err)
	}
	if interruptedCount != 1 {
		t.Fatalf("expected one share-a terminal interrupt, got %d", interruptedCount)
	}

	outputA := waitForOutputContains(t, attachmentA, "CHILD_EXIT:130")
	if !strings.Contains(outputA, "CHILD_INTERRUPTED") {
		t.Fatalf("expected share-a terminal to report interrupt, got %q", outputA)
	}

	ensureNoOutputContains(t, attachmentB, "CHILD_INTERRUPTED", 300*time.Millisecond)

	interruptedCount, err = service.InterruptProject("project-alpha", "share-b")
	if err != nil {
		t.Fatalf("interrupt share-b terminals: %v", err)
	}
	if interruptedCount != 1 {
		t.Fatalf("expected one share-b terminal interrupt, got %d", interruptedCount)
	}

	outputB := waitForOutputContains(t, attachmentB, "CHILD_EXIT:130")
	if !strings.Contains(outputB, "CHILD_INTERRUPTED") {
		t.Fatalf("expected share-b terminal to report interrupt, got %q", outputB)
	}
}

func newTestService(t *testing.T) *Service {
	t.Helper()

	service, err := New(Options{
		Logger: observability.NewLogger(0, io.Discard),
	})
	if err != nil {
		t.Fatalf("new terminal service: %v", err)
	}

	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := service.Close(shutdownCtx); err != nil {
			t.Fatalf("close terminal service: %v", err)
		}
	})

	return service
}

func openTerminalForTest(t *testing.T, service *Service, options OpenOptions) {
	t.Helper()

	if _, created, err := service.Open(options); err != nil {
		t.Fatalf("open terminal %q: %v", options.ID, err)
	} else if !created {
		t.Fatalf("expected terminal %q to be created", options.ID)
	}
}

func attachTerminalForTest(t *testing.T, service *Service, sessionID string) *Attachment {
	t.Helper()

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal %q: %v", sessionID, err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func quietCatCommand(t *testing.T) []string {
	t.Helper()
	shell := requireCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func readyQuietCatCommand(t *testing.T) []string {
	t.Helper()
	shell := requireCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; printf 'ready\\n'; cat"}
}

func interactiveBashCommand(t *testing.T) []string {
	t.Helper()

	bash := requireCommand(t, "bash")
	return []string{bash, "--noprofile", "--norc", "-i"}
}

func resizeProbeCommand(t *testing.T) []string {
	t.Helper()
	shell := requireCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; printf 'ready\\n'; while IFS= read -r line; do if [ \"$line\" = size ]; then stty size; fi; done"}
}

func requireCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func prepareInterruptShell(t *testing.T, service *Service, sessionID string, attachment *Attachment) {
	t.Helper()

	if err := service.Write(sessionID, []byte("set -m\nstty -echo\nprintf 'READY\\n'\n")); err != nil {
		t.Fatalf("prepare interactive shell: %v", err)
	}
	output := waitForOutputContains(t, attachment, "READY")
	if !strings.Contains(output, "READY") {
		t.Fatalf("expected shell readiness output, got %q", output)
	}
}

func writeInterruptibleScript(t *testing.T) string {
	t.Helper()

	scriptPath := filepath.Join(t.TempDir(), "interruptible-child.sh")
	script := strings.Join([]string{
		"#!/bin/sh",
		"trap 'printf \"CHILD_INTERRUPTED\\n\"; exit 130' INT",
		"printf 'CHILD_RUNNING\\n'",
		"while :; do sleep 1; done",
		"",
	}, "\n")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write interruptible script: %v", err)
	}
	return scriptPath
}

func startInterruptibleForegroundJob(t *testing.T, service *Service, sessionID string, attachment *Attachment, scriptPath string) {
	t.Helper()

	command := "sh " + shellSingleQuote(scriptPath) + "; printf 'CHILD_EXIT:%s\\n' \"$?\"\n"
	if err := service.Write(sessionID, []byte(command)); err != nil {
		t.Fatalf("start foreground job: %v", err)
	}
	output := waitForOutputContains(t, attachment, "CHILD_RUNNING")
	if !strings.Contains(output, "CHILD_RUNNING") {
		t.Fatalf("expected child process to start, got %q", output)
	}
}

func ensureNoOutputContains(t *testing.T, attachment *Attachment, needle string, duration time.Duration) {
	t.Helper()

	timeout := time.NewTimer(duration)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				return
			}
			if strings.Contains(string(chunk), needle) {
				t.Fatalf("did not expect output %q, got chunk %q", needle, string(chunk))
			}
		case <-timeout.C:
			return
		}
	}
}

func shellSingleQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func waitForOutputContains(t *testing.T, attachment *Attachment, needle string) string {
	t.Helper()

	buffer := bytes.NewBuffer(nil)
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				t.Fatalf("attachment output closed before %q appeared; collected output: %q", needle, buffer.String())
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, buffer.String())
		}
	}
}

func skipIfWindows(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}
