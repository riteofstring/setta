//go:build windows

package terminal

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"

	goPty "github.com/aymanbagabas/go-pty"
)

type windowsPTY struct {
	pty       goPty.Pty
	command   *goPty.Cmd
	closeOnce sync.Once
}

func resolveShell(configured []string) ([]string, error) {
	if len(configured) != 0 {
		return resolveCommand(configured)
	}
	return resolveCommand([]string{"cmd.exe"})
}

func resolveCommand(command []string) ([]string, error) {
	if len(command) == 0 || strings.TrimSpace(command[0]) == "" {
		return nil, fmt.Errorf("terminal shell is required")
	}
	path, err := exec.LookPath(command[0])
	if err != nil {
		return nil, fmt.Errorf("resolve terminal shell %q: %w", command[0], err)
	}
	return append([]string{path}, command[1:]...), nil
}

func openPTY(command []string, directory string, columns int, rows int) (ptySession, error) {
	instance, err := goPty.New()
	if err != nil {
		return nil, fmt.Errorf("open terminal PTY: %w", err)
	}
	cmd := instance.Command(command[0], command[1:]...)
	cmd.Dir = directory
	cmd.Env = os.Environ()
	if err := cmd.Start(); err != nil {
		_ = instance.Close()
		return nil, fmt.Errorf("start terminal PTY: %w", err)
	}
	if err := instance.Resize(columns, rows); err != nil {
		_ = instance.Close()
		return nil, fmt.Errorf("resize terminal PTY: %w", err)
	}
	return &windowsPTY{pty: instance, command: cmd}, nil
}

func (session *windowsPTY) Read(data []byte) (int, error)  { return session.pty.Read(data) }
func (session *windowsPTY) Write(data []byte) (int, error) { return session.pty.Write(data) }
func (session *windowsPTY) Resize(columns int, rows int) error {
	return session.pty.Resize(columns, rows)
}
func (session *windowsPTY) Close() error {
	var result error
	session.closeOnce.Do(func() { result = session.pty.Close() })
	return result
}
func (session *windowsPTY) Wait() error { return session.command.Wait() }

func managedRunCommand(interpreter string, artifact string) string {
	return windowsQuote(interpreter) + " " + windowsQuote(artifact) + " & del /f /q " + windowsQuote(artifact) + "\r\n"
}

func windowsQuote(value string) string { return "\"" + strings.ReplaceAll(value, "\"", "\\\"") + "\"" }
