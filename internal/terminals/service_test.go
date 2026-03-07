package terminals

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os/exec"
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
