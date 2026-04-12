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

func TestResolveDefaultCommandUsesRealShellPathVerbatim(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	shellPath := requireCommand(t, "bash")
	command, err := resolveDefaultCommand(func(key string) (string, bool) {
		if key == "SHELL" {
			return shellPath, true
		}
		return "", false
	})
	if err != nil {
		t.Fatalf("resolve default command: %v", err)
	}
	if len(command) != 1 || command[0] != shellPath {
		t.Fatalf("expected resolved shell path %q, got %#v", shellPath, command)
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

func TestServiceAttachAfterProcessExitReturnsBufferedHistory(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-exit-history", "")
	shell := requireCommand(t, "sh")
	if _, created, err := service.Open(OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: false,
		Command:    []string{shell, "-c", "printf 'done\\n'"},
	}); err != nil {
		t.Fatalf("open terminal: %v", err)
	} else if !created {
		t.Fatal("expected terminal to be created")
	}

	history := waitForHistoryContains(t, service, sessionID, "done")
	if !strings.Contains(history, "done") {
		t.Fatalf("expected exited terminal history to include output, got %q", history)
	}

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach exited terminal: %v", err)
	}
	t.Cleanup(attachment.Close)

	if !strings.Contains(string(attachment.History), "done") {
		t.Fatalf("expected exited terminal attachment history to include output, got %q", string(attachment.History))
	}
	if _, ok := <-attachment.Output; ok {
		t.Fatal("expected exited terminal attachment output to be closed")
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

func TestServiceRunCommandWaitsForDefaultShellPromptAndHandlesLongEcho(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-default-shell", "")
	if _, created, err := service.Open(OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Env:        defaultShellEnv(),
	}); err != nil {
		t.Fatalf("open default-shell terminal: %v", err)
	} else if !created {
		t.Fatal("expected default-shell terminal to be created")
	}

	// A long echoed command previously flaked when backend dispatch raced the
	// fresh shell startup path.
	command := "printf 'RUN_DEFAULT_SHELL_OK\\n' #" + strings.Repeat("x", 256)
	if err := service.RunCommand(sessionID, []byte(command+"\n")); err != nil {
		t.Fatalf("run long command in default-shell terminal: %v", err)
	}

	attachment := attachTerminalForTest(t, service, sessionID)
	ensureNoOutputContains(t, attachment, "RUN_DEFAULT_SHELL_OK", 200*time.Millisecond)
	syncInitialTerminalSizeForTest(t, service, sessionID)

	output := waitForOutputContains(t, attachment, "RUN_DEFAULT_SHELL_OK")
	if !strings.Contains(output, "RUN_DEFAULT_SHELL_OK") {
		t.Fatalf("expected backend-owned output from default-shell terminal, got %q", output)
	}
}

func TestSessionCaptureOutputSuppressesPromptReadyBootstrapTraffic(t *testing.T) {
	t.Parallel()

	marker := buildPromptReadyMarker(42)
	session := &session{
		promptReadyMarker: marker,
		promptReadyActive: true,
		history: historyBuffer{
			limit: defaultHistoryLimitBytes,
		},
	}

	output, ready := session.captureOutput([]byte(marker + "\r\n"))
	if !ready || len(output) != 0 {
		t.Fatalf("expected prompt-ready marker output to complete readiness without leaking output, got ready=%t output=%q", ready, string(output))
	}

	output, ready = session.captureOutput([]byte("kevins-MacBook-Pro% "))
	if ready {
		t.Fatal("expected post-ready prompt output to pass through without re-triggering readiness")
	}
	if got := string(output); got != "kevins-MacBook-Pro% " {
		t.Fatalf("expected post-ready prompt output to pass through unchanged, got %q", got)
	}
	if session.promptReadyMarker != "" {
		t.Fatalf("expected prompt-ready marker to be cleared after detection, got %q", session.promptReadyMarker)
	}
	if len(session.promptReadyBuffer) != 0 {
		t.Fatalf("expected prompt-ready buffer to be cleared after detection, got %q", string(session.promptReadyBuffer))
	}
}

func TestFindPromptReadyLineEndRawOffsetNormalizesTerminalRedisplayNoise(t *testing.T) {
	t.Parallel()

	raw := []byte(
		"\x1b[1m\x1b[7m%\x1b[27m\x1b[1m\x1b[0m " +
			"S\b" +
			"SETTA_RDY" +
			"\x1b[?2004l\r\r\n" +
			"prompt% ",
	)

	offset, ok := findPromptReadyLineEndRawOffset(raw, "SETTA_RDY")
	if !ok {
		t.Fatal("expected normalized prompt-ready detection to find the marker")
	}
	if got := string(raw[offset:]); got != "prompt% " {
		t.Fatalf("expected raw offset to point at post-marker output, got %q", got)
	}
}

func TestFindPromptReadyLineEndRawOffsetPrefersDirectRawMarkerSlice(t *testing.T) {
	t.Parallel()

	raw := []byte(
		"printf 'PRE_ATTACH_RUN_OK\\n'\r\n" +
			"SETTA_RDY\r\n" +
			"kevins-MacBook-Pro% printf 'PRE_ATTACH_RUN_OK\\n'\r\n" +
			"PRE_ATTACH_RUN_OK\r\n",
	)

	offset, ok := findPromptReadyLineEndRawOffset(raw, "SETTA_RDY")
	if !ok {
		t.Fatal("expected prompt-ready detection to find the raw marker line")
	}
	if got := string(raw[offset:]); got != "kevins-MacBook-Pro% printf 'PRE_ATTACH_RUN_OK\\n'\r\nPRE_ATTACH_RUN_OK\r\n" {
		t.Fatalf("expected prompt-ready offset to drop pre-marker junk, got %q", got)
	}
}

func TestNormalizeTerminalSearchBufferStripsOSCSequences(t *testing.T) {
	t.Parallel()

	raw := []byte(
		"start" +
			"\x1b]0;title\x07" +
			"\x1b]0;second\x1b\\" +
			"\b" +
			"!\r\n",
	)

	normalized, offsets := normalizeTerminalSearchBuffer(raw)
	if got := string(normalized); got != "star!\n" {
		t.Fatalf("expected OSC sequences and redisplay noise to be stripped, got %q", got)
	}
	if len(offsets) != len(normalized) {
		t.Fatalf("expected offsets to match normalized bytes, got %d offsets for %d bytes", len(offsets), len(normalized))
	}
	if got := raw[offsets[len(offsets)-1]-1]; got != '\n' {
		t.Fatalf("expected final offset to map to newline byte, got %q", got)
	}
}

func TestServiceDefaultShellStartupDoesNotExposePromptReadyProbe(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-default-shell-clean-start", "")
	if _, created, err := service.Open(OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Env:        defaultShellEnv(),
	}); err != nil {
		t.Fatalf("open default-shell terminal: %v", err)
	} else if !created {
		t.Fatal("expected default-shell terminal to be created")
	}

	attachment := attachTerminalForTest(t, service, sessionID)
	output := waitForTerminalHistory(t, service, sessionID, func(history string) bool {
		return len(history) > 0
	})
	renderedOutput := renderVisibleTerminalHistory(output)
	if strings.Contains(renderedOutput, "SETTA_CLEAR_CMD") {
		t.Fatalf("expected prompt-ready bootstrap command to stay hidden from terminal history, got %q", renderedOutput)
	}
	if history := renderVisibleTerminalHistory(string(attachment.History)); strings.Contains(history, "SETTA_CLEAR_CMD") {
		t.Fatalf("expected initial attachment history to stay clean, got %q", history)
	}
}

func TestServiceRunCommandBeforeFirstAttachKeepsPromptReadyProbeOutOfHistory(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-pre-attach-run", "")
	if _, created, err := service.Open(OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Env:        defaultShellEnv(),
	}); err != nil {
		t.Fatalf("open default-shell terminal: %v", err)
	} else if !created {
		t.Fatal("expected default-shell terminal to be created")
	}

	if err := service.RunCommand(sessionID, []byte("printf 'PRE_ATTACH_RUN_OK\\n'\n")); err != nil {
		t.Fatalf("run command before attach: %v", err)
	}

	attachment := attachTerminalForTest(t, service, sessionID)
	renderedAttachmentHistory := renderVisibleTerminalHistory(string(attachment.History))
	if strings.Contains(renderedAttachmentHistory, "PRE_ATTACH_RUN_OK") {
		t.Fatalf("did not expect deferred command output before initial resize, got %q", renderedAttachmentHistory)
	}
	ensureNoOutputContains(t, attachment, "PRE_ATTACH_RUN_OK", 200*time.Millisecond)
	syncInitialTerminalSizeForTest(t, service, sessionID)

	history := waitForHistoryContains(t, service, sessionID, "PRE_ATTACH_RUN_OK")
	if !strings.Contains(history, "PRE_ATTACH_RUN_OK") {
		t.Fatalf("expected pre-attach history to include run output, got %q", history)
	}
	renderedHistory := renderVisibleTerminalHistory(history)
	if strings.Contains(renderedHistory, "SETTA_CLEAR_CMD") {
		t.Fatalf("expected pre-attach history to hide prompt-ready bootstrap command, got %q", renderedHistory)
	}
}

func TestServiceRunCommandBeforeFirstAttachStartsVisibleTranscriptWithTheCommand(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-pre-attach-first-line", "")
	if _, created, err := service.Open(OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Env:        defaultShellEnv(),
	}); err != nil {
		t.Fatalf("open default-shell terminal: %v", err)
	} else if !created {
		t.Fatal("expected default-shell terminal to be created")
	}

	commandText := "printf 'FIRST_VISIBLE_LINE_OK\\n'\n"
	if err := service.RunCommand(sessionID, []byte(commandText)); err != nil {
		t.Fatalf("run command before attach: %v", err)
	}

	attachTerminalForTest(t, service, sessionID)
	syncInitialTerminalSizeForTest(t, service, sessionID)

	history := waitForTerminalHistory(t, service, sessionID, func(history string) bool {
		renderedHistory := renderVisibleTerminalHistory(history)
		return strings.Contains(renderedHistory, "FIRST_VISIBLE_LINE_OK")
	})
	renderedHistory := renderVisibleTerminalHistory(history)
	firstLine := firstNonEmptyLine(renderedHistory)
	if !strings.Contains(firstLine, "printf 'FIRST_VISIBLE_LINE_OK\\n'") {
		t.Fatalf("expected first visible line to contain the echoed command, got %q in %q", firstLine, renderedHistory)
	}
}

func TestServiceRunCommandBeforeFirstAttachPreservesRegularShellTranscript(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	const prompt = "SETTA_PROMPT> "

	service := newTestService(t)
	sessionID := BuildTerminalID("section-regular-shell-transcript", "")
	if _, created, err := service.Open(OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Env:        interactivePromptEnv(prompt),
	}); err != nil {
		t.Fatalf("open default-shell terminal: %v", err)
	} else if !created {
		t.Fatal("expected default-shell terminal to be created")
	}

	commandText := "printf 'HELLO_SIMPLE\\n'\n"
	if err := service.RunCommand(sessionID, []byte(commandText)); err != nil {
		t.Fatalf("run command before attach: %v", err)
	}

	attachTerminalForTest(t, service, sessionID)
	syncInitialTerminalSizeForTest(t, service, sessionID)

	history := waitForTerminalHistory(t, service, sessionID, func(history string) bool {
		renderedHistory := renderVisibleTerminalHistory(history)
		return strings.Contains(renderedHistory, "HELLO_SIMPLE") && strings.HasSuffix(renderedHistory, prompt)
	})
	renderedHistory := renderVisibleTerminalHistory(history)
	if count := strings.Count(renderedHistory, "printf 'HELLO_SIMPLE\\n'"); count != 1 {
		t.Fatalf("expected exactly one echoed command, got %d in %q", count, renderedHistory)
	}
	if !strings.Contains(renderedHistory, prompt+"printf 'HELLO_SIMPLE\\n'") {
		t.Fatalf("expected echoed command to follow the shell prompt, got %q", renderedHistory)
	}
	resultIndex := strings.LastIndex(renderedHistory, "HELLO_SIMPLE\n")
	promptIndex := strings.LastIndex(renderedHistory, prompt)
	if resultIndex < 0 || promptIndex <= resultIndex {
		t.Fatalf("expected terminal history to show the prompt again after the command result, got %q", renderedHistory)
	}
}

func TestServiceRunCommandClearsPendingPromptInput(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-pending-input", "")
	if _, created, err := service.Open(OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Env:        defaultShellEnv(),
	}); err != nil {
		t.Fatalf("open default-shell terminal: %v", err)
	} else if !created {
		t.Fatal("expected default-shell terminal to be created")
	}

	attachTerminalForTest(t, service, sessionID)
	syncInitialTerminalSizeForTest(t, service, sessionID)

	if err := service.Write(sessionID, []byte("printf 'STALE_INPUT'")); err != nil {
		t.Fatalf("write pending shell input: %v", err)
	}
	if err := service.RunCommand(sessionID, []byte("printf 'RUN_CLEAR_OK\\n'\n")); err != nil {
		t.Fatalf("run command after pending shell input: %v", err)
	}

	output := waitForHistoryContains(t, service, sessionID, "RUN_CLEAR_OK")
	if !strings.Contains(output, "RUN_CLEAR_OK") {
		t.Fatalf("expected cleared-prompt run output, got %q", output)
	}
}

func TestServiceRunCommandBeforeInitialResizeDefersExecutionForDefaultShell(t *testing.T) {
	t.Parallel()
	skipIfWindows(t)

	service := newTestService(t)
	sessionID := BuildTerminalID("section-deferred-until-resize", "")
	if _, created, err := service.Open(OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Env:        defaultShellEnv(),
	}); err != nil {
		t.Fatalf("open default-shell terminal: %v", err)
	} else if !created {
		t.Fatal("expected default-shell terminal to be created")
	}

	if err := service.RunCommand(sessionID, []byte("printf 'DEFERRED_RESIZE_OK\\n'\n")); err != nil {
		t.Fatalf("run command before initial resize: %v", err)
	}

	attachment := attachTerminalForTest(t, service, sessionID)
	if history := renderVisibleTerminalHistory(string(attachment.History)); strings.Contains(history, "DEFERRED_RESIZE_OK") {
		t.Fatalf("did not expect deferred command output before initial resize, got %q", history)
	}
	ensureNoOutputContains(t, attachment, "DEFERRED_RESIZE_OK", 200*time.Millisecond)

	syncInitialTerminalSizeForTest(t, service, sessionID)

	output := waitForOutputContains(t, attachment, "DEFERRED_RESIZE_OK")
	if !strings.Contains(output, "DEFERRED_RESIZE_OK") {
		t.Fatalf("expected deferred command output after initial resize, got %q", output)
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

	waitForReusableSession(t, service, sessionID, true)
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

	return newTestServiceWithOptions(t, Options{
		Logger: observability.NewLogger(0, io.Discard),
		Shell:  interactiveBashCommand(t),
	})
}

func newTestServiceWithOptions(t *testing.T, options Options) *Service {
	t.Helper()

	if options.Logger == nil {
		options.Logger = observability.NewLogger(0, io.Discard)
	}

	service, err := New(Options{
		Logger:            options.Logger,
		HistoryLimitBytes: options.HistoryLimitBytes,
		SubscriberBuffer:  options.SubscriberBuffer,
		ReadBufferSize:    options.ReadBufferSize,
		Shell:             options.Shell,
		EnvLookup:         options.EnvLookup,
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

func interactivePromptEnv(prompt string) []string {
	env := defaultShellEnv()
	env = append(env, "PS1="+prompt, "PROMPT="+prompt)
	return env
}

func defaultShellEnv() []string {
	env := append([]string(nil), os.Environ()...)
	env = append(env, "BASH_SILENCE_DEPRECATION_WARNING=1")
	return env
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

func syncInitialTerminalSizeForTest(t *testing.T, service *Service, sessionID string) {
	t.Helper()

	if err := service.Resize(sessionID, 120, 30); err != nil {
		t.Fatalf("sync initial terminal size: %v", err)
	}
}

func shellSingleQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func renderVisibleTerminalHistory(history string) string {
	raw := []byte(history)
	clearOffsets := []int{
		bytes.LastIndex(raw, []byte("\x1b[H\x1b[2J")),
		bytes.LastIndex(raw, []byte("\x1b[2J\x1b[H")),
		bytes.LastIndex(raw, []byte("\x1b[3J\x1b[H\x1b[2J")),
		bytes.LastIndex(raw, []byte("\f")),
	}
	start := 0
	for _, offset := range clearOffsets {
		if offset >= 0 && offset > start {
			start = offset
		}
	}
	if start > 0 {
		raw = raw[start:]
	}
	normalized, _ := normalizeTerminalSearchBuffer(raw)
	return string(normalized)
}

func firstNonEmptyLine(history string) string {
	for _, line := range strings.Split(history, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		return line
	}
	return ""
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

func waitForReusableSession(t *testing.T, service *Service, sessionID string, want bool) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	last := service.ReusableSession(sessionID)
	for time.Now().Before(deadline) {
		last = service.ReusableSession(sessionID)
		if last == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for reusable=%t for terminal %q; last=%t", want, sessionID, last)
}

func waitForHistoryContains(t *testing.T, service *Service, sessionID string, needle string) string {
	t.Helper()
	return waitForTerminalHistory(t, service, sessionID, func(history string) bool {
		return strings.Contains(history, needle)
	})
}

func waitForTerminalHistory(
	t *testing.T,
	service *Service,
	sessionID string,
	matches func(string) bool,
) string {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	lastHistory := ""
	for time.Now().Before(deadline) {
		history, err := service.History(sessionID)
		if err == nil {
			lastHistory = history
			if matches(history) {
				return history
			}
		} else if errors.Is(err, ErrUnknownSession) {
			t.Fatalf("terminal session %q closed before history condition was met; last history: %q", sessionID, lastHistory)
		} else {
			t.Fatalf("read terminal history for %q: %v", sessionID, err)
		}
		time.Sleep(25 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for terminal history condition; last history: %q", lastHistory)
	return ""
}

func skipIfWindows(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}
