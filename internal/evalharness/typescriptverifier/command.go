package typescriptverifier

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	evalverifier "setta/internal/evalharness/verifier"
)

const (
	maximumCommandOutputBytes = 16 * 1024
	commandTimeout            = 2 * time.Minute
)

func runCommandCheck(
	ctx context.Context,
	workspaceRoot string,
	checkID string,
	label string,
	name string,
	args ...string,
) (evalverifier.Check, error) {
	commandContext, cancel := context.WithTimeout(ctx, commandTimeout)
	defer cancel()
	command := exec.CommandContext(commandContext, name, args...)
	command.Dir = workspaceRoot
	command.Env = verifierEnvironment()
	output := newBoundedBuffer(maximumCommandOutputBytes)
	command.Stdout = output
	command.Stderr = output
	err := command.Run()
	if ctx.Err() != nil {
		return evalverifier.Check{}, fmt.Errorf("verifier context ended while running %s: %w", label, ctx.Err())
	}
	if errors.Is(err, exec.ErrNotFound) {
		return evalverifier.Check{}, fmt.Errorf("verifier command %s is unavailable: %w", name, err)
	}
	if errors.Is(commandContext.Err(), context.DeadlineExceeded) {
		return evalverifier.Check{
			ID:     checkID,
			Passed: false,
			Detail: fmt.Sprintf("%s exceeded %s.", label, commandTimeout),
		}, nil
	}
	if err != nil {
		detail := fmt.Sprintf("%s failed: %v", label, err)
		if diagnostic := output.String(); diagnostic != "" {
			detail += ": " + diagnostic
		}
		return evalverifier.Check{
			ID:     checkID,
			Passed: false,
			Detail: evalverifier.BoundedDetail(detail),
		}, nil
	}
	return evalverifier.Check{
		ID:     checkID,
		Passed: true,
		Detail: label + " completed successfully.",
	}, nil
}

func skippedTestCheck() evalverifier.Check {
	return evalverifier.Check{
		ID:     "tests",
		Passed: false,
		Detail: "The tests were not run because the fixture build failed.",
	}
}

func verifierEnvironment() []string {
	return []string{
		"CI=1",
		"HOME=/tmp",
		"LANG=C.UTF-8",
		"NO_COLOR=1",
		"PATH=" + os.Getenv("PATH"),
		"TMPDIR=/tmp",
	}
}

type boundedBuffer struct {
	mutex     sync.Mutex
	content   []byte
	maximum   int
	truncated bool
}

func newBoundedBuffer(maximum int) *boundedBuffer {
	return &boundedBuffer{maximum: maximum}
}

func (buffer *boundedBuffer) Write(value []byte) (int, error) {
	buffer.mutex.Lock()
	defer buffer.mutex.Unlock()
	written := len(value)
	remaining := buffer.maximum - len(buffer.content)
	if remaining <= 0 {
		buffer.truncated = true
		return written, nil
	}
	if len(value) > remaining {
		buffer.content = append(buffer.content, value[:remaining]...)
		buffer.truncated = true
		return written, nil
	}
	buffer.content = append(buffer.content, value...)
	return written, nil
}

func (buffer *boundedBuffer) String() string {
	buffer.mutex.Lock()
	defer buffer.mutex.Unlock()
	value := strings.TrimSpace(string(buffer.content))
	if buffer.truncated {
		value += "…"
	}
	return value
}
