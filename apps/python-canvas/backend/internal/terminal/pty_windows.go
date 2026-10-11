//go:build windows

package terminal

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"sync"

	"github.com/riteofstring/setta/packages/local-backend/proctree"
	"golang.org/x/sys/windows"
)

type conPTY interface {
	Read([]byte) (int, error)
	Write([]byte) (int, error)
	Resize(int, int) error
	Close() error
	Wait(context.Context) (uint32, error)
	Pid() int
}

type suspendedConPTY interface {
	conPTY

	Abort() error
	Resume() error
}

type windowsPTYConfiguration struct {
	directory   string
	environment []string
	columns     int
	rows        int
}

type windowsPTYOperations struct {
	startSuspended func(string, windowsPTYConfiguration) (suspendedConPTY, error)
	newJob         func() (windowsProcessJob, error)
}

type windowsProcessJob interface {
	Assign(int) error
	Close() error
}

type windowsPTY struct {
	pty       conPTY
	job       windowsProcessJob
	closeOnce sync.Once
	closeErr  error
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

func openPTY(command []string, directory string, environment []string, columns int, rows int) (ptySession, error) {
	commandLine := make([]string, len(command))
	for index, argument := range command {
		commandLine[index] = windows.EscapeArg(argument)
	}
	return startWindowsPTY(
		strings.Join(commandLine, " "),
		windowsPTYConfiguration{directory: directory, environment: append([]string(nil), environment...), columns: columns, rows: rows},
		defaultWindowsPTYOperations(),
	)
}

func startWindowsPTY(commandLine string, configuration windowsPTYConfiguration, operations windowsPTYOperations) (*windowsPTY, error) {
	if operations.startSuspended == nil || operations.newJob == nil {
		return nil, errors.New("terminal: Windows PTY operations are unavailable")
	}
	job, err := operations.newJob()
	if err != nil {
		return nil, fmt.Errorf("terminal: create process owner: %w", err)
	}
	if job == nil {
		return nil, errors.New("terminal: create process owner returned no owner")
	}
	instance, err := operations.startSuspended(commandLine, configuration)
	if err != nil || instance == nil {
		return nil, cleanupWindowsPTYStart(
			startWindowsPTYError(err),
			instance,
			job,
		)
	}
	if err := job.Assign(instance.Pid()); err != nil {
		return nil, cleanupWindowsPTYStart(
			fmt.Errorf("assign terminal PTY root process to job: %w", err),
			instance,
			job,
		)
	}
	if err := instance.Resume(); err != nil {
		return nil, cleanupWindowsPTYStart(
			fmt.Errorf("resume terminal PTY root process: %w", err),
			instance,
			job,
		)
	}
	return &windowsPTY{pty: instance, job: job}, nil
}

func defaultWindowsPTYOperations() windowsPTYOperations {
	return windowsPTYOperations{
		startSuspended: startSuspendedConPTY,
		newJob: func() (windowsProcessJob, error) {
			return proctree.NewJob()
		},
	}
}

func startWindowsPTYError(err error) error {
	if err != nil {
		return fmt.Errorf("start terminal PTY: %w", err)
	}
	return errors.New("start terminal PTY: no PTY instance returned")
}

func cleanupWindowsPTYStart(
	cause error,
	instance suspendedConPTY,
	job windowsProcessJob,
) error {
	var cleanup []error
	if instance != nil {
		if err := instance.Abort(); err != nil {
			cleanup = append(cleanup, fmt.Errorf("abort terminal PTY root: %w", err))
		}
	}
	if job != nil {
		if err := job.Close(); err != nil {
			cleanup = append(cleanup, fmt.Errorf("close terminal process job: %w", err))
		}
	}
	if instance != nil {
		if err := instance.Close(); err != nil {
			cleanup = append(cleanup, fmt.Errorf("close terminal PTY: %w", err))
		}
	}
	return errors.Join(append([]error{cause}, cleanup...)...)
}

func (session *windowsPTY) Read(data []byte) (int, error)  { return session.pty.Read(data) }
func (session *windowsPTY) Write(data []byte) (int, error) { return session.pty.Write(data) }
func (session *windowsPTY) Resize(columns int, rows int) error {
	return session.pty.Resize(columns, rows)
}
func (session *windowsPTY) Close() error {
	session.closeOnce.Do(func() {
		session.closeErr = errors.Join(session.job.Close(), session.pty.Close())
	})
	return session.closeErr
}
func (session *windowsPTY) Wait() error {
	_, waitErr := session.pty.Wait(context.Background())
	return errors.Join(waitErr, session.Close())
}

func managedRunCommand(interpreter string, artifact string) string {
	return windowsQuote(interpreter) + " " + windowsQuote(artifact) + "\r\n"
}

func windowsQuote(value string) string { return "\"" + strings.ReplaceAll(value, "\"", "\\\"") + "\"" }
