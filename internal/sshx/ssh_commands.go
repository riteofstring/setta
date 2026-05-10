package sshx

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

func (s *Service) resolvedSSHBin() string {
	if strings.TrimSpace(s.sshBin) != "" {
		return s.sshBin
	}
	return strings.TrimSpace(os.Getenv("SETTA_SSH_BIN"))
}

func (s *Service) runSSHCommand(sshTarget string, sshArgs []string, remoteCommand string, sshPrefix []string, timeout time.Duration) (sshCommandResult, error) {
	cmdArgs := append(append(append([]string(nil), sshPrefix...), sshArgs...), sshTarget, remoteCommand)
	if len(cmdArgs) == 0 {
		return sshCommandResult{}, &Error{
			Code:    "SshFailed",
			Message: "SSH command failed: missing ssh command",
		}
	}
	ctx := context.Background()
	var cancel context.CancelFunc
	if timeout > 0 {
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}
	command := exec.CommandContext(ctx, cmdArgs[0], cmdArgs[1:]...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	err := command.Run()
	if err == nil {
		return sshCommandResult{ExitCode: 0, Stdout: stdout.String(), Stderr: stderr.String()}, nil
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return sshCommandResult{}, &Error{
			Code:    "SshTimeout",
			Message: fmt.Sprintf("SSH command timed out: %v", cmdArgs),
		}
	}

	var execErr *exec.Error
	if errors.Is(err, exec.ErrNotFound) || (errors.As(err, &execErr) && errors.Is(execErr.Err, exec.ErrNotFound)) {
		sshBin := cmdArgs[0]
		if strings.TrimSpace(sshBin) == "" {
			sshBin = "ssh"
		}
		return sshCommandResult{}, &Error{
			Code:    "SshMissing",
			Message: fmt.Sprintf("ssh binary not found (%q). Install ssh or set SETTA_SSH_BIN.", sshBin),
		}
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return sshCommandResult{
			ExitCode: exitErr.ExitCode(),
			Stdout:   stdout.String(),
			Stderr:   stderr.String(),
		}, nil
	}
	return sshCommandResult{}, &Error{
		Code:    "SshFailed",
		Message: fmt.Sprintf("SSH command failed: %v", err),
	}
}

func (s *Service) resolveRemoteShell(sshTarget string, sshArgs []string, sshPrefix []string) (string, error) {
	for _, candidate := range []string{"bash", "sh"} {
		result, err := s.runSSHCommand(sshTarget, sshArgs, "command -v "+candidate, sshPrefix, defaultSSHCommandTimeout)
		if err != nil {
			return "", err
		}
		if result.ExitCode == 0 {
			return candidate, nil
		}
		if result.ExitCode == 255 {
			details := strings.TrimSpace(firstNonBlank(result.Stderr, result.Stdout))
			message := "SSH failed while probing remote shell."
			if details != "" {
				message += " " + details
			}
			return "", &Error{
				Code:    "SshFailed",
				Message: message,
			}
		}
	}
	return "", &Error{
		Code:    "RemoteShell",
		Message: "Remote shell not found (bash/sh missing).",
	}
}

func (s *Service) resolveRemoteWorkspace(sshTarget string, sshArgs []string, shell string, workspace string, sshPrefix []string) (string, error) {
	inner := ""
	tildePrefix, remainder, ok := splitTildePath(workspace)
	if strings.HasPrefix(workspace, "~") && !ok {
		unsupportedPrefix := workspace
		if index := strings.IndexRune(workspace, '/'); index >= 0 {
			unsupportedPrefix = workspace[:index]
		}
		return "", &Error{
			Code:    "RemoteWorkspace",
			Message: fmt.Sprintf("Invalid remote workspace path. Unsupported tilde prefix: %q", unsupportedPrefix),
		}
	}
	if ok {
		if remainder != "" {
			inner = "cd " + tildePrefix + " && cd " + shellQuote(remainder) + " && pwd -P"
		} else {
			inner = "cd " + tildePrefix + " && pwd -P"
		}
	} else {
		inner = "cd " + shellQuote(workspace) + " && pwd -P"
	}
	result, err := s.runSSHCommand(
		sshTarget,
		sshArgs,
		buildRemoteShellCommand(shell, inner),
		sshPrefix,
		defaultSSHCommandTimeout,
	)
	if err != nil {
		return "", err
	}
	if result.ExitCode != 0 {
		details := strings.TrimSpace(firstNonBlank(result.Stderr, result.Stdout))
		message := "Failed to resolve remote workspace."
		if details != "" {
			message += " " + details
		}
		return "", &Error{
			Code:    "RemoteWorkspace",
			Message: message,
		}
	}
	lines := nonBlankLines(result.Stdout)
	if len(lines) == 0 {
		return "", &Error{
			Code:    "RemoteWorkspace",
			Message: "Failed to resolve remote workspace path.",
		}
	}
	return lines[len(lines)-1], nil
}

func (s *Service) resolveRemoteSettaCommand(sshTarget string, sshArgs []string, shell string, workspace string, remoteCommand string, sshPrefix []string) (string, error) {
	if remoteCommand != "" {
		return remoteCommand, nil
	}
	quotedWorkspace := shellQuote(workspace)
	inner := "cd " + quotedWorkspace + " || exit 1;" +
		`if [ -x "./.venv/bin/python" ]; then printf '%s' "./.venv/bin/python -m setta"; exit 0; fi;` +
		`if [ -x "./venv/bin/python" ]; then printf '%s' "./venv/bin/python -m setta"; exit 0; fi;` +
		`if [ -x "./env/bin/python" ]; then printf '%s' "./env/bin/python -m setta"; exit 0; fi;` +
		`if [ -f "pyproject.toml" ] && command -v poetry >/dev/null 2>&1; then printf '%s' "poetry run python -m setta"; exit 0; fi;` +
		`if [ -f "pyproject.toml" ] && command -v uv >/dev/null 2>&1; then printf '%s' "uv run python -m setta"; exit 0; fi;` +
		`if command -v setta >/dev/null 2>&1; then printf '%s' "setta"; exit 0; fi;` +
		"exit 2;"
	result, err := s.runSSHCommand(
		sshTarget,
		sshArgs,
		buildRemoteShellCommand(shell, inner),
		sshPrefix,
		defaultSSHCommandTimeout,
	)
	if err != nil {
		return "", err
	}
	if result.ExitCode != 0 {
		return "", &Error{
			Code:    "RemoteSettaCmd",
			Message: "Unable to resolve remote Setta command. Provide remoteCmd or ensure setta is installed.",
		}
	}
	lines := nonBlankLines(result.Stdout)
	if len(lines) == 0 {
		return "", &Error{
			Code:    "RemoteSettaCmd",
			Message: "Remote Setta command resolution returned no output.",
		}
	}
	return lines[len(lines)-1], nil
}

func buildRemoteSettaPathArgs(profile string, settaHome string, settaFilesRoot string, settaFilesLocation string, runtimeRoot string) (string, error) {
	args := make([]string, 0, 4)
	if profile != "" {
		args = append(args, "--profile "+shellQuote(profile))
	}
	if settaHome != "" {
		args = append(args, "--setta-home "+shellQuote(settaHome))
	}
	normalizedLocation, err := NormalizeSettaFilesLocation(settaFilesLocation)
	if err != nil {
		return "", err
	}
	if settaFilesRoot != "" && normalizedLocation != "" {
		return "", &Error{
			Code:    "InvalidSettaFilesConfig",
			Message: "Cannot pass both --setta-files-root and --setta-files-location for remote commands.",
		}
	}
	if settaFilesRoot != "" {
		args = append(args, "--setta-files-root "+shellQuote(settaFilesRoot))
	} else if normalizedLocation != "" {
		args = append(args, "--setta-files-location "+shellQuote(normalizedLocation))
	}
	if runtimeRoot != "" {
		args = append(args, "--runtime-root "+shellQuote(runtimeRoot))
	}
	return strings.Join(args, " "), nil
}
