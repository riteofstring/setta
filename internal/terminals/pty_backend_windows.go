//go:build windows

package terminals

import (
	"context"
	"fmt"

	goPty "github.com/aymanbagabas/go-pty"
)

type windowsPTYSession struct {
	pty goPty.Pty
	cmd *goPty.Cmd
}

func openPTYSession(ctx context.Context, options OpenOptions) (ptySession, error) {
	ptyInstance, err := goPty.New()
	if err != nil {
		return nil, fmt.Errorf("open pty: %w", err)
	}

	cmd := ptyInstance.CommandContext(ctx, options.Command[0], options.Command[1:]...)
	cmd.Dir = options.Dir
	if len(options.Env) > 0 {
		cmd.Env = append([]string(nil), options.Env...)
	}

	if err := cmd.Start(); err != nil {
		_ = ptyInstance.Close()
		return nil, fmt.Errorf("start terminal command: %w", err)
	}
	if err := ptyInstance.Resize(options.Columns, options.Rows); err != nil {
		_ = ptyInstance.Close()
		return nil, fmt.Errorf("resize terminal: %w", err)
	}

	return &windowsPTYSession{
		pty: ptyInstance,
		cmd: cmd,
	}, nil
}

func (s *windowsPTYSession) Read(buffer []byte) (int, error) {
	return s.pty.Read(buffer)
}

func (s *windowsPTYSession) Write(data []byte) (int, error) {
	return s.pty.Write(data)
}

func (s *windowsPTYSession) Resize(columns int, rows int) error {
	return s.pty.Resize(columns, rows)
}

func (s *windowsPTYSession) Close() error {
	return s.pty.Close()
}

func (s *windowsPTYSession) Wait() error {
	return s.cmd.Wait()
}

func (s *windowsPTYSession) ProcessPID() int {
	if s == nil || s.cmd == nil || s.cmd.Process == nil {
		return 0
	}
	return s.cmd.Process.Pid
}

func (s *windowsPTYSession) Control(fn func(fd uintptr)) error {
	return ErrInterruptUnsupported
}
