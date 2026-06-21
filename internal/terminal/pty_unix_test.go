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
