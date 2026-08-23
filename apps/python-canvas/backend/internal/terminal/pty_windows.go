//go:build windows

package terminal

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/UserExistsError/conpty"
	"golang.org/x/sys/windows"
)

type windowsPTY struct {
	pty       *conpty.ConPty
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
	commandLine := make([]string, len(command))
	for index, argument := range command {
		commandLine[index] = windows.EscapeArg(argument)
	}
	instance, err := conpty.Start(
		strings.Join(commandLine, " "),
		conpty.ConPtyWorkDir(directory),
		conpty.ConPtyEnv(os.Environ()),
		conpty.ConPtyDimensions(columns, rows),
	)
	if err != nil {
		return nil, fmt.Errorf("start terminal PTY: %w", err)
	}
	return &windowsPTY{pty: instance}, nil
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
func (session *windowsPTY) Wait() error {
	_, err := session.pty.Wait(context.Background())
	return err
}

func managedRunCommand(interpreter string, artifact string) string {
	return windowsQuote(interpreter) + " " + windowsQuote(artifact) + "\r\n"
}

func windowsQuote(value string) string { return "\"" + strings.ReplaceAll(value, "\"", "\\\"") + "\"" }
