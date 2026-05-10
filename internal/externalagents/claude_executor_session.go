package externalagents

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
)

type claudeRunController struct {
	session *claudeSession

	runtimeReady     chan struct{}
	runtimeReadyOnce sync.Once
	cancelled        chan struct{}
	cancelledOnce    sync.Once
}

func (c *claudeRunController) Cancel() error {
	if c == nil || c.session == nil {
		return nil
	}
	c.cancelledOnce.Do(func() {
		close(c.cancelled)
	})
	return c.session.terminate()
}

func (c *claudeRunController) SendApprovalResponse(approvalID string, approved bool) error {
	if c == nil || c.session == nil {
		return ErrRunNotActive
	}
	return c.session.writeJSON(map[string]any{
		"type":       "approval_response",
		"approvalId": approvalID,
		"approved":   approved,
	})
}

func (c *claudeRunController) SendToolResponse(toolCallID string, payload map[string]any) error {
	if c == nil || c.session == nil {
		return ErrRunNotActive
	}
	message := map[string]any{
		"type":       "tool_response",
		"toolCallId": toolCallID,
	}
	for key, value := range payload {
		message[key] = deepCloneJSONValue(value)
	}
	return c.session.writeJSON(message)
}

func (c *claudeRunController) markRuntimeReady() {
	if c == nil {
		return
	}
	c.runtimeReadyOnce.Do(func() {
		close(c.runtimeReady)
	})
}

func (c *claudeRunController) waitForRuntimeReady() bool {
	if c == nil {
		return false
	}
	select {
	case <-c.runtimeReady:
		return true
	case <-c.cancelled:
		return false
	}
}

type claudeSession struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser

	writeMu sync.Mutex

	stderrMu    sync.Mutex
	stderrLines []string

	termMu     sync.Mutex
	terminated bool

	waitCh chan error
	events chan map[string]any
}

func newClaudeSession(cmd *exec.Cmd, stdin io.WriteCloser) *claudeSession {
	return &claudeSession{
		cmd:    cmd,
		stdin:  stdin,
		waitCh: make(chan error, 1),
		events: make(chan map[string]any, 128),
	}
}

func (s *claudeSession) start(stdout io.Reader, stderr io.Reader) {
	go func() {
		s.readStdout(stdout)
		s.waitCh <- s.cmd.Wait()
		close(s.events)
	}()
	go s.readStderr(stderr)
}

func (s *claudeSession) readStdout(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 16*1024), claudeStdoutBufferSize)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		payload := map[string]any{}
		if err := json.Unmarshal([]byte(line), &payload); err != nil {
			s.events <- map[string]any{
				"type":    "error",
				"message": fmt.Sprintf("invalid claude sidecar event: %v", err),
			}
			continue
		}
		s.events <- payload
	}
	if err := scanner.Err(); err != nil {
		s.events <- map[string]any{
			"type":    "error",
			"message": fmt.Sprintf("read claude sidecar stdout: %v", err),
		}
	}
}

func (s *claudeSession) readStderr(stderr io.Reader) {
	scanner := bufio.NewScanner(stderr)
	scanner.Buffer(make([]byte, 0, 16*1024), claudeStdoutBufferSize)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		s.stderrMu.Lock()
		s.stderrLines = append(s.stderrLines, line)
		if len(s.stderrLines) > claudeMaxStderrLines {
			s.stderrLines = append([]string(nil), s.stderrLines[len(s.stderrLines)-claudeMaxStderrLines:]...)
		}
		s.stderrMu.Unlock()
	}
}

func (s *claudeSession) writeJSON(payload map[string]any) error {
	if s == nil || s.stdin == nil {
		return ErrRunNotActive
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	content, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode claude payload: %w", err)
	}
	if _, err := s.stdin.Write(append(content, '\n')); err != nil {
		return fmt.Errorf("write claude payload: %w", err)
	}
	return nil
}

func (s *claudeSession) terminate() error {
	if s == nil || s.cmd == nil || s.cmd.Process == nil {
		return nil
	}
	s.termMu.Lock()
	if s.terminated {
		s.termMu.Unlock()
		return nil
	}
	s.terminated = true
	s.termMu.Unlock()
	_ = s.stdin.Close()
	if err := s.cmd.Process.Signal(os.Interrupt); err != nil && !errors.Is(err, os.ErrProcessDone) {
		_ = s.cmd.Process.Kill()
	}
	return nil
}

func (s *claudeSession) processErr() error {
	if s == nil {
		return nil
	}
	return <-s.waitCh
}

func (s *claudeSession) stderrTail() []string {
	s.stderrMu.Lock()
	defer s.stderrMu.Unlock()
	return append([]string(nil), s.stderrLines...)
}
