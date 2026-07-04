//go:build !windows

package terminal

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"unsafe"

	"github.com/creack/pty"
)

type systemPTYStarter struct{}

type systemPTYHandle struct {
	command *exec.Cmd
	file    *os.File
	once    sync.Once
	profile Profile
	waitErr error
	waited  chan struct{}
}

func NewSystemPTYStarter() PTYStarter {
	return systemPTYStarter{}
}

func (starter systemPTYStarter) Start(ctx context.Context, profile Profile) (PTYHandle, error) {
	shellPath, err := shellPath(profile.ShellPath)
	if err != nil {
		return nil, err
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	command := exec.Command(shellPath, profile.Args...)
	command.Dir = profile.CWD
	command.Env = terminalEnv(profile)
	file, err := pty.StartWithSize(command, &pty.Winsize{
		Rows: uint16(profile.Rows),
		Cols: uint16(profile.Cols),
	})
	if err != nil {
		return nil, err
	}
	return &systemPTYHandle{
		command: command,
		file:    file,
		profile: profile,
		waited:  make(chan struct{}),
	}, nil
}

func (handle *systemPTYHandle) Read(buffer []byte) (int, error) {
	return handle.file.Read(buffer)
}

func (handle *systemPTYHandle) Write(buffer []byte) (int, error) {
	return handle.file.Write(buffer)
}

func (handle *systemPTYHandle) Resize(cols int, rows int) error {
	return pty.Setsize(handle.file, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
}

func (handle *systemPTYHandle) Terminate() error {
	if handle.command.Process == nil {
		return os.ErrProcessDone
	}
	return signalProcessGroup(handle.command.Process.Pid, syscall.SIGTERM)
}

func (handle *systemPTYHandle) Kill() error {
	if handle.command.Process == nil {
		return os.ErrProcessDone
	}
	return signalProcessGroup(handle.command.Process.Pid, syscall.SIGKILL)
}

func (handle *systemPTYHandle) Close() error {
	return handle.file.Close()
}

func (handle *systemPTYHandle) Wait() error {
	handle.once.Do(func() {
		handle.waitErr = handle.command.Wait()
		close(handle.waited)
	})
	<-handle.waited
	return handle.waitErr
}

func (handle *systemPTYHandle) CloseSafetyAssessment() TerminalCloseAssessment {
	if handle.command.Process == nil {
		return terminalCloseAssessment(TerminalCloseSafetySafe, TerminalCloseAssessmentNoSession)
	}
	select {
	case <-handle.waited:
		return terminalCloseAssessment(TerminalCloseSafetySafe, TerminalCloseAssessmentAlreadyClosed)
	default:
	}
	if handle.profile.LaunchMode != ProfileLaunchModeShell {
		return terminalCloseAssessment(
			TerminalCloseSafetyDestructive,
			TerminalCloseAssessmentForegroundProcess,
		)
	}
	processes, err := unixProcessTable()
	if err != nil {
		return terminalCloseAssessment(
			TerminalCloseSafetyUnknown,
			TerminalCloseAssessmentInspectionFailed,
		)
	}
	foregroundProcessGroup, ok := foregroundProcessGroup(handle.file)
	return unixShellCloseSafetyAssessment(
		handle.command.Process.Pid,
		processes,
		foregroundProcessGroup,
		ok,
	)
}

func shellPath(configured string) (string, error) {
	candidates := []string{}
	if configured != "" {
		candidates = append(candidates, configured)
	} else if envShell := os.Getenv("SHELL"); envShell != "" {
		candidates = append(candidates, envShell)
	}
	if runtime.GOOS == "darwin" {
		candidates = append(candidates, "/bin/zsh", "/bin/bash", "/bin/sh")
	} else {
		candidates = append(candidates, "/bin/bash", "/bin/sh")
	}
	for _, candidate := range candidates {
		resolved, err := validateShell(candidate)
		if err == nil {
			return resolved, nil
		}
	}
	return "", errors.New("no supported shell executable found")
}

func validateShell(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("shell path is required")
	}
	if !strings.HasPrefix(path, "/") {
		return "", fmt.Errorf("shell path must be absolute: %s", path)
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("read shell %s: %w", path, err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("shell path is a directory: %s", path)
	}
	if info.Mode().Perm()&0o111 == 0 {
		return "", fmt.Errorf("shell path is not executable: %s", path)
	}
	return path, nil
}

func terminalEnv(profile Profile) []string {
	env := os.Environ()
	for key, value := range profile.Env {
		if key == "" {
			continue
		}
		env = upsertEnv(env, key, value)
	}
	env = upsertEnv(env, "TERM", envValue(profile.Term, DefaultTerm))
	env = upsertEnv(env, "COLORTERM", DefaultColorTerm)
	env = upsertEnv(env, "TERM_PROGRAM", DefaultTermProgram)
	return env
}

func envValue(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func upsertEnv(env []string, key string, value string) []string {
	prefix := key + "="
	for index, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			env[index] = prefix + value
			return env
		}
	}
	return append(env, prefix+value)
}

func signalProcessGroup(pid int, signal syscall.Signal) error {
	if pid <= 0 {
		return os.ErrProcessDone
	}
	if err := syscall.Kill(-pid, signal); err != nil {
		if errors.Is(err, syscall.ESRCH) {
			return os.ErrProcessDone
		}
		return err
	}
	return nil
}

type unixProcessInfo struct {
	pgid int
	pid  int
	ppid int
}

func unixShellCloseSafetyAssessment(
	shellPID int,
	processes map[int]*unixProcessInfo,
	foregroundProcessGroup int,
	foregroundProcessGroupKnown bool,
) TerminalCloseAssessment {
	shell := processes[shellPID]
	if shell == nil {
		return terminalCloseAssessment(TerminalCloseSafetySafe, TerminalCloseAssessmentAlreadyClosed)
	}
	descendants := unixProcessDescendants(shell.pid, processes)
	if len(descendants) == 0 {
		return terminalCloseAssessment(TerminalCloseSafetySafe, TerminalCloseAssessmentIdleShell)
	}
	if !foregroundProcessGroupKnown {
		return terminalCloseAssessment(
			TerminalCloseSafetyDestructive,
			TerminalCloseAssessmentForegroundProcess,
		)
	}
	for _, process := range descendants {
		if process.pgid == foregroundProcessGroup {
			return terminalCloseAssessment(
				TerminalCloseSafetyDestructive,
				TerminalCloseAssessmentForegroundProcess,
			)
		}
	}
	return terminalCloseAssessment(
		TerminalCloseSafetyDestructive,
		TerminalCloseAssessmentBackgroundJobs,
	)
}

func unixProcessTable() (map[int]*unixProcessInfo, error) {
	output, err := exec.Command("ps", "-axo", "pid=,ppid=,pgid=").Output()
	if err != nil {
		return nil, fmt.Errorf("inspect process table: %w", err)
	}
	processes := map[int]*unixProcessInfo{}
	for _, line := range strings.Split(string(output), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 3 {
			continue
		}
		pid, err := strconv.Atoi(fields[0])
		if err != nil {
			continue
		}
		ppid, err := strconv.Atoi(fields[1])
		if err != nil {
			continue
		}
		pgid, err := strconv.Atoi(fields[2])
		if err != nil {
			continue
		}
		processes[pid] = &unixProcessInfo{pgid: pgid, pid: pid, ppid: ppid}
	}
	return processes, nil
}

func unixProcessDescendants(rootPID int, processes map[int]*unixProcessInfo) []*unixProcessInfo {
	childrenByParent := map[int][]*unixProcessInfo{}
	for _, process := range processes {
		childrenByParent[process.ppid] = append(childrenByParent[process.ppid], process)
	}
	descendants := []*unixProcessInfo{}
	stack := append([]*unixProcessInfo{}, childrenByParent[rootPID]...)
	for len(stack) > 0 {
		lastIndex := len(stack) - 1
		process := stack[lastIndex]
		stack = stack[:lastIndex]
		descendants = append(descendants, process)
		stack = append(stack, childrenByParent[process.pid]...)
	}
	return descendants
}

func foregroundProcessGroup(file *os.File) (int, bool) {
	var pgrp int32
	_, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		file.Fd(),
		uintptr(syscall.TIOCGPGRP),
		uintptr(unsafe.Pointer(&pgrp)),
	)
	if errno != 0 || pgrp <= 0 {
		return 0, false
	}
	return int(pgrp), true
}
