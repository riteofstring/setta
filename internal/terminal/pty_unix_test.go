//go:build !windows

package terminal

import (
	"bytes"
	"context"
	"io"
	"strings"
	"testing"
	"time"
)

func TestSystemPTYStarterDoesNotBindProcessLifetimeToStartContext(t *testing.T) {
	starter := NewSystemPTYStarter()
	ctx, cancel := context.WithCancel(context.Background())
	handle, err := starter.Start(ctx, Profile{
		ShellPath: "/bin/sh",
		Args:      []string{"-c", "printf ready; sleep 0.2; printf done"},
		CWD:       t.TempDir(),
		Term:      DefaultTerm,
		Cols:      80,
		Rows:      24,
	})
	if err != nil {
		t.Fatalf("start pty: %v", err)
	}
	defer func() {
		_ = handle.Kill()
		_ = handle.Close()
		_ = handle.Wait()
	}()

	cancel()
	output := readPTYUntil(t, handle, "done")
	if !strings.Contains(output, "ready") || !strings.Contains(output, "done") {
		t.Fatalf("pty output = %q, want ready and done after context cancellation", output)
	}
}

func readPTYUntil(t *testing.T, handle PTYHandle, want string) string {
	t.Helper()
	result := make(chan string, 1)
	go func() {
		var output bytes.Buffer
		buffer := make([]byte, 128)
		for {
			count, err := handle.Read(buffer)
			if count > 0 {
				output.Write(buffer[:count])
				if strings.Contains(output.String(), want) {
					result <- output.String()
					return
				}
			}
			if err != nil {
				if err == io.EOF {
					result <- output.String()
					return
				}
				result <- output.String()
				return
			}
		}
	}()
	select {
	case output := <-result:
		return output
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for pty output containing %q", want)
		return ""
	}
}

func TestUnixShellCloseSafetyAssessment(t *testing.T) {
	tests := []struct {
		name                        string
		processes                   map[int]*unixProcessInfo
		foregroundProcessGroup      int
		foregroundProcessGroupKnown bool
		wantReason                  TerminalCloseAssessmentReason
		wantRequiresConfirmation    bool
		wantSafety                  TerminalCloseSafety
	}{
		{
			name:                     "already exited when shell process is gone",
			processes:                map[int]*unixProcessInfo{},
			wantReason:               TerminalCloseAssessmentAlreadyClosed,
			wantRequiresConfirmation: false,
			wantSafety:               TerminalCloseSafetySafe,
		},
		{
			name: "idle shell has no child processes",
			processes: map[int]*unixProcessInfo{
				100: {pgid: 100, pid: 100, ppid: 1},
			},
			wantReason:               TerminalCloseAssessmentIdleShell,
			wantRequiresConfirmation: false,
			wantSafety:               TerminalCloseSafetySafe,
		},
		{
			name: "foreground child process is destructive",
			processes: map[int]*unixProcessInfo{
				100: {pgid: 100, pid: 100, ppid: 1},
				101: {pgid: 101, pid: 101, ppid: 100},
			},
			foregroundProcessGroup:      101,
			foregroundProcessGroupKnown: true,
			wantReason:                  TerminalCloseAssessmentForegroundProcess,
			wantRequiresConfirmation:    true,
			wantSafety:                  TerminalCloseSafetyDestructive,
		},
		{
			name: "background child process is destructive",
			processes: map[int]*unixProcessInfo{
				100: {pgid: 100, pid: 100, ppid: 1},
				101: {pgid: 101, pid: 101, ppid: 100},
			},
			foregroundProcessGroup:      100,
			foregroundProcessGroupKnown: true,
			wantReason:                  TerminalCloseAssessmentBackgroundJobs,
			wantRequiresConfirmation:    true,
			wantSafety:                  TerminalCloseSafetyDestructive,
		},
		{
			name: "same session orphan process is destructive",
			processes: map[int]*unixProcessInfo{
				100: {pgid: 100, pid: 100, ppid: 1, sid: 200},
				101: {pgid: 101, pid: 101, ppid: 1, sid: 200},
			},
			foregroundProcessGroup:      100,
			foregroundProcessGroupKnown: true,
			wantReason:                  TerminalCloseAssessmentBackgroundJobs,
			wantRequiresConfirmation:    true,
			wantSafety:                  TerminalCloseSafetyDestructive,
		},
		{
			name: "unknown foreground process group treats child process as foreground risk",
			processes: map[int]*unixProcessInfo{
				100: {pgid: 100, pid: 100, ppid: 1},
				101: {pgid: 101, pid: 101, ppid: 100},
			},
			wantReason:               TerminalCloseAssessmentForegroundProcess,
			wantRequiresConfirmation: true,
			wantSafety:               TerminalCloseSafetyDestructive,
		},
		{
			name: "descendant foreground process is destructive",
			processes: map[int]*unixProcessInfo{
				100: {pgid: 100, pid: 100, ppid: 1},
				101: {pgid: 101, pid: 101, ppid: 100},
				102: {pgid: 102, pid: 102, ppid: 101},
			},
			foregroundProcessGroup:      102,
			foregroundProcessGroupKnown: true,
			wantReason:                  TerminalCloseAssessmentForegroundProcess,
			wantRequiresConfirmation:    true,
			wantSafety:                  TerminalCloseSafetyDestructive,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assessment := unixShellCloseSafetyAssessment(
				100,
				test.processes,
				test.foregroundProcessGroup,
				test.foregroundProcessGroupKnown,
			)
			if assessment.Safety != test.wantSafety ||
				assessment.Reason != test.wantReason ||
				assessment.RequiresConfirmation != test.wantRequiresConfirmation {
				t.Fatalf(
					"assessment = %+v, want safety %s reason %s requiresConfirmation %t",
					assessment,
					test.wantSafety,
					test.wantReason,
					test.wantRequiresConfirmation,
				)
			}
			if assessment.Summary == "" {
				t.Fatal("assessment summary is empty")
			}
		})
	}
}
