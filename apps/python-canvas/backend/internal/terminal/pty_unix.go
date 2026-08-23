//go:build !windows

package terminal

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/creack/pty"
)

type unixPTY struct {
	file           *os.File
	command        *exec.Cmd
	lifetimeWriter *os.File
	closeOnce      sync.Once
	closeErr       error
	waitOnce       sync.Once
	waitErr        error
}

var resolveTerminalGuardianInvocation = defaultTerminalGuardianInvocation

func resolveShell(configured []string) ([]string, error) {
	if len(configured) != 0 {
		return resolveCommand(configured)
	}
	shell := strings.TrimSpace(os.Getenv("SHELL"))
	if shell == "" {
		shell = "/bin/sh"
	}
	return resolveCommand([]string{shell, "-i"})
}

func resolveCommand(command []string) ([]string, error) {
	if len(command) == 0 || strings.TrimSpace(command[0]) == "" {
		return nil, errors.New("terminal shell is required")
	}
	path, err := exec.LookPath(command[0])
	if err != nil {
		return nil, fmt.Errorf("resolve terminal shell %q: %w", command[0], err)
	}
	return append([]string{path}, command[1:]...), nil
}

func openPTY(command []string, directory string, environment []string, columns int, rows int) (ptySession, error) {
	if len(command) == 0 {
		return nil, errors.New("terminal command is required")
	}
	lifetimeReader, lifetimeWriter, err := os.Pipe()
	if err != nil {
		return nil, fmt.Errorf("create terminal guardian lifetime pipe: %w", err)
	}
	defer lifetimeReader.Close()
	guardian, err := newTerminalGuardianCommand(command, directory, environment, lifetimeReader)
	if err != nil {
		_ = lifetimeWriter.Close()
		return nil, err
	}
	// pty.StartWithSize creates the guardian's session and controlling terminal.
	// The guardian then starts the configured shell in that same session while
	// retaining the stable session identity needed after the shell has exited.
	file, err := pty.StartWithSize(guardian, &pty.Winsize{Cols: uint16(columns), Rows: uint16(rows)})
	if err != nil {
		_ = lifetimeWriter.Close()
		return nil, fmt.Errorf("start terminal PTY: %w", err)
	}
	return &unixPTY{
		file:           file,
		command:        guardian,
		lifetimeWriter: lifetimeWriter,
	}, nil
}

func defaultTerminalGuardianInvocation(shell []string) ([]string, error) {
	arguments, err := terminalGuardianArguments(shell)
	if err != nil {
		return nil, err
	}
	executable, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve terminal guardian executable: %w", err)
	}
	return append([]string{executable}, arguments...), nil
}

func newTerminalGuardianCommand(
	shell []string,
	directory string,
	environment []string,
	lifetimeReader *os.File,
) (*exec.Cmd, error) {
	if lifetimeReader == nil {
		return nil, errors.New("terminal guardian lifetime pipe is required")
	}
	invocation, err := resolveTerminalGuardianInvocation(shell)
	if err != nil {
		return nil, err
	}
	if len(invocation) == 0 || strings.TrimSpace(invocation[0]) == "" {
		return nil, errors.New("terminal guardian invocation is required")
	}
	command := exec.Command(invocation[0], invocation[1:]...)
	// cwd and environment are inherited by the shell through the guardian. They
	// deliberately do not cross its private argv boundary or appear as metadata.
	command.Dir = directory
	command.Env = append([]string(nil), environment...)
	command.ExtraFiles = []*os.File{lifetimeReader}
	return command, nil
}

func (session *unixPTY) Read(data []byte) (int, error) {
	return session.file.Read(data)
}

func (session *unixPTY) Write(data []byte) (int, error) {
	return session.file.Write(data)
}

func (session *unixPTY) Resize(columns int, rows int) error {
	return pty.Setsize(session.file, &pty.Winsize{Cols: uint16(columns), Rows: uint16(rows)})
}

func (session *unixPTY) Close() error {
	session.closeOnce.Do(func() {
		if session.lifetimeWriter != nil {
			session.closeErr = session.lifetimeWriter.Close()
		}
	})
	return session.closeErr
}

func (session *unixPTY) Wait() error {
	if session == nil {
		return nil
	}
	session.waitOnce.Do(func() {
		if session.command != nil {
			session.waitErr = session.command.Wait()
		}
		if err := session.Close(); err != nil {
			session.waitErr = errors.Join(session.waitErr, fmt.Errorf("close terminal guardian lifetime pipe: %w", err))
		}
		if session.file != nil {
			_ = session.file.Close()
		}
	})
	return session.waitErr
}

func managedRunCommand(interpreter string, artifact string) string {
	return shellQuote(interpreter) + " " + shellQuote(artifact) + "\n"
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\\"'\\\"'") + "'"
}
