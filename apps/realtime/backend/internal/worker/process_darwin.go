//go:build darwin

package worker

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

const (
	darwinSandbox = "/usr/bin/sandbox-exec"
	darwinProfile = "(version 1) (deny syscall-unix (syscall-number SYS_setsid) (syscall-number SYS_setpgid)) (allow default)"
)

type darwinProcess struct {
	group int
	once  sync.Once
	err   error
}

func startContainedWorker(interpreter string, bootstrap string, directory string, environment []string, input *os.File, output *os.File, stdout io.Writer, stderr io.Writer) (*exec.Cmd, ownedProcess, error) {
	info, err := os.Stat(darwinSandbox)
	if err != nil || !info.Mode().IsRegular() {
		return nil, nil, errors.New("worker: macOS containment launcher is unavailable")
	}
	start := processStart{interpreter: interpreter, bootstrap: bootstrap, directory: directory, environment: environment, input: input, output: output, stdout: stdout, stderr: stderr}
	command := workerCommand(start, darwinSandbox, "-p", darwinProfile, interpreter, "-I", bootstrap)
	command.Env = append(command.Env, InputFDEnvironment+"=3", OutputFDEnvironment+"=4")
	command.ExtraFiles = []*os.File{input, output}
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := command.Start(); err != nil {
		return nil, nil, fmt.Errorf("worker: start contained Python: %w", err)
	}
	process := &darwinProcess{group: command.Process.Pid}
	group, err := syscall.Getpgid(process.group)
	if err != nil || group != process.group {
		_ = process.terminate()
		_ = command.Wait()
		return nil, nil, errors.New("worker: macOS process group ownership failed")
	}
	return command, process, nil
}

func (process *darwinProcess) terminate() error {
	if process == nil || process.group < 1 {
		return errors.New("worker: macOS process group is unavailable")
	}
	process.once.Do(func() {
		termErr := syscall.Kill(-process.group, syscall.SIGTERM)
		if errors.Is(termErr, syscall.ESRCH) {
			termErr = nil
		}
		time.Sleep(100 * time.Millisecond)
		killErr := syscall.Kill(-process.group, syscall.SIGKILL)
		if errors.Is(killErr, syscall.ESRCH) {
			killErr = nil
		}
		process.err = errors.Join(termErr, killErr)
	})
	return process.err
}

func (process *darwinProcess) finalize() error {
	return process.terminate()
}
