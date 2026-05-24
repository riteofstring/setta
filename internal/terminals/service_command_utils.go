package terminals

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

func resolveDefaultCommand(envLookup func(string) (string, bool)) ([]string, error) {
	var candidates []string
	switch runtime.GOOS {
	case "windows":
		if shell, ok := envLookup("COMSPEC"); ok && strings.TrimSpace(shell) != "" {
			candidates = append(candidates, shell)
		}
		candidates = append(candidates, "powershell.exe", "cmd.exe")
	case "darwin":
		if shell, ok := envLookup("SHELL"); ok && strings.TrimSpace(shell) != "" {
			candidates = append(candidates, shell)
		}
		candidates = append(candidates, "/bin/zsh", "/bin/bash", "/bin/sh")
	default:
		if shell, ok := envLookup("SHELL"); ok && strings.TrimSpace(shell) != "" {
			candidates = append(candidates, shell)
		}
		candidates = append(candidates, "/bin/bash", "/bin/sh")
	}

	for _, candidate := range candidates {
		resolved, err := exec.LookPath(strings.TrimSpace(candidate))
		if err == nil {
			return []string{resolved}, nil
		}
	}

	return nil, fmt.Errorf("resolve default terminal command: no supported shell found")
}

func resolveCommand(command []string) ([]string, error) {
	if len(command) == 0 {
		return nil, fmt.Errorf("terminal command is required")
	}
	path, err := exec.LookPath(strings.TrimSpace(command[0]))
	if err != nil {
		return nil, fmt.Errorf("resolve terminal command %q: %w", command[0], err)
	}
	resolved := append([]string{path}, command[1:]...)
	return resolved, nil
}

func equalStringSlices(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func waitForDone(ctx context.Context, done <-chan struct{}) error {
	if ctx == nil {
		<-done
		return nil
	}

	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func isExpectedReadError(err error) bool {
	return errors.Is(err, io.EOF) || errors.Is(err, os.ErrClosed)
}

func isExpectedWaitError(err error) bool {
	if err == nil {
		return true
	}
	var exitError *exec.ExitError
	return errors.As(err, &exitError)
}
