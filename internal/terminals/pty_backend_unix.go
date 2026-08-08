//go:build !windows

package terminals

import (
	"context"
	"fmt"
	"os"
	"os/exec"

	"github.com/creack/pty"
)

type unixPTYSession struct {
	file *os.File
	cmd  *exec.Cmd
}

func openPTYSession(ctx context.Context, options OpenOptions) (ptySession, error) {
	cmd := exec.CommandContext(ctx, options.Command[0], options.Command[1:]...)
	cmd.Dir = options.Dir
	if len(options.Env) > 0 {
		cmd.Env = append([]string(nil), options.Env...)
	}

	file, err := pty.StartWithSize(cmd, &pty.Winsize{
		Cols: uint16(options.Columns),
		Rows: uint16(options.Rows),
	})
	if err != nil {
		return nil, fmt.Errorf("start terminal command: %w", err)
	}

	return &unixPTYSession{
		file: file,
		cmd:  cmd,
	}, nil
}

func (s *unixPTYSession) Read(buffer []byte) (int, error) {
	return s.file.Read(buffer)
}

func (s *unixPTYSession) Write(data []byte) (int, error) {
	return s.file.Write(data)
}

func (s *unixPTYSession) Resize(columns int, rows int) error {
	return pty.Setsize(s.file, &pty.Winsize{
		Cols: uint16(columns),
		Rows: uint16(rows),
	})
}

func (s *unixPTYSession) Close() error {
	return s.file.Close()
}

func (s *unixPTYSession) Wait() error {
	return s.cmd.Wait()
}

func (s *unixPTYSession) ProcessPID() int {
	if s == nil || s.cmd == nil || s.cmd.Process == nil {
		return 0
	}
	return s.cmd.Process.Pid
}

func (s *unixPTYSession) Control(fn func(fd uintptr)) error {
	if s == nil || s.file == nil {
		return ErrInterruptUnsupported
	}
	fn(s.file.Fd())
	return nil
}
