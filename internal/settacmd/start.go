package settacmd

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

const (
	defaultLocalStartHost = "127.0.0.1"
	defaultLocalStartPort = "0"
)

type startCommandDependencies struct {
	resolveCurrentExecutable func() (string, error)
	resolveServerExecutable  func(string, func(string) (string, bool)) (string, error)
	runServer                func(string, []string, io.Reader, io.Writer, io.Writer) error
}

func runDefaultStart(global globalFlags, stdin io.Reader, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool)) error {
	return runDefaultStartWithDeps(global, stdin, stdout, stderr, envLookup, defaultStartCommandDependencies())
}

func runDefaultStartWithDeps(global globalFlags, stdin io.Reader, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), deps startCommandDependencies) error {
	if global.reload {
		return &ExitError{
			Code: 2,
			Err:  fmt.Errorf("--reload is not supported in the Go CLI; use the dev scripts for reload workflows"),
		}
	}

	currentExecutable, err := deps.resolveCurrentExecutable()
	if err != nil {
		return fmt.Errorf("resolve current executable: %w", err)
	}
	serverExecutable, err := deps.resolveServerExecutable(currentExecutable, envLookup)
	if err != nil {
		return err
	}

	return deps.runServer(serverExecutable, buildDefaultStartArgs(global), stdin, stdout, stderr)
}

func defaultStartCommandDependencies() startCommandDependencies {
	return startCommandDependencies{
		resolveCurrentExecutable: os.Executable,
		resolveServerExecutable:  resolveLauncherServerExecutable,
		runServer:                runServerForeground,
	}
}

func buildDefaultStartArgs(global globalFlags) []string {
	args := []string{
		"--mode", "ide",
		"--host", defaultStartStringValue(global.host, defaultLocalStartHost),
		"--port", defaultStartStringValue(global.port, defaultLocalStartPort),
	}
	if global.noOpen {
		args = append(args, "--no-open")
	}
	if value := strings.TrimSpace(global.workspaceRoot); value != "" {
		args = append(args, "--workspace", value)
	}
	if value := strings.TrimSpace(global.profile); value != "" {
		args = append(args, "--profile", value)
	}
	if value := strings.TrimSpace(global.profileLookupHome); value != "" {
		args = append(args, "--profile-lookup-home", value)
	}
	if value := strings.TrimSpace(global.settaHome); value != "" {
		args = append(args, "--setta-home", value)
	}
	if value := strings.TrimSpace(global.settaFilesRoot); value != "" {
		args = append(args, "--setta-files-root", value)
	}
	if value := strings.TrimSpace(global.settaFilesLocation); value != "" {
		args = append(args, "--setta-files-location", value)
	}
	if value := strings.TrimSpace(global.runtimeRoot); value != "" {
		args = append(args, "--runtime-root", value)
	}
	if value := strings.TrimSpace(global.logLevel); value != "" {
		args = append(args, "--log-level", value)
	}
	return args
}

func defaultStartStringValue(raw string, fallback string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

func runServerForeground(serverExecutable string, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
	command := exec.Command(serverExecutable, args...)
	command.Stdin = stdin
	command.Stdout = stdout
	command.Stderr = stderr
	if err := command.Run(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return &ExitError{Code: exitErr.ExitCode(), Silent: true}
		}
		return fmt.Errorf("run setta-server: %w", err)
	}
	return nil
}
