//go:build !windows

package terminal

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"

	"github.com/creack/pty"
)

type unixPTY struct {
	file      *os.File
	command   *exec.Cmd
	closeOnce sync.Once
}

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

func openPTY(command []string, directory string, columns int, rows int) (ptySession, error) {
	if len(command) == 0 {
		return nil, errors.New("terminal command is required")
	}
	cmd := exec.Command(command[0], command[1:]...)
	cmd.Dir = directory
	cmd.Env = os.Environ()
	// pty.StartWithSize creates the shell's session and controlling terminal;
	// its PID is consequently the process-group target used during shutdown.
	file, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(columns), Rows: uint16(rows)})
	if err != nil {
		return nil, fmt.Errorf("start terminal PTY: %w", err)
	}
	return &unixPTY{file: file, command: cmd}, nil
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
	var result error
	session.closeOnce.Do(func() {
		if session.command != nil && session.command.Process != nil {
			result = terminateProcessGroup(session.command.Process.Pid)
		}
		if session.file != nil {
			if err := session.file.Close(); err != nil && result == nil {
				result = err
			}
		}
	})
	return result
}

func terminateProcessGroup(pid int) error {
	if pid < 1 {
		return nil
	}
	groupID, err := syscall.Getpgid(pid)
	if err != nil {
		if err == syscall.ESRCH {
			return nil
		}
		return err
	}
	if err := syscall.Kill(-groupID, syscall.SIGTERM); err != nil && err != syscall.ESRCH {
		return err
	}
	// Interactive shells may deliberately ignore SIGTERM. The runtime has no
	// reusable process after Delete or shutdown, so immediately force the same
	// isolated process group down and let Wait reap it deterministically.
	if err := syscall.Kill(-groupID, syscall.SIGKILL); err != nil && err != syscall.ESRCH {
		return err
	}
	return nil
}

func (session *unixPTY) Wait() error {
	if session.command == nil {
		return nil
	}
	return session.command.Wait()
}

func managedRunCommand(interpreter string, artifact string) string {
	return shellQuote(interpreter) + " " + shellQuote(artifact) + "; __setta_status=$?; rm -f " + shellQuote(artifact) + "; unset __setta_status\n"
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\\"'\\\"'") + "'"
}
