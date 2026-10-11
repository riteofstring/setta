//go:build windows

package worker

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"syscall"

	"github.com/riteofstring/setta/packages/local-backend/proctree"
)

const (
	windowsReleaseEnvironment = "SETTA_WORKER_RELEASE_HANDLE"
	windowsPrelude            = "import os,sys,msvcrt,runpy;h=int(os.environ.pop('SETTA_WORKER_RELEASE_HANDLE'));f=os.fdopen(msvcrt.open_osfhandle(h,os.O_RDONLY),'rb',buffering=0);token=f.read(1);f.close();token==b'\\x01' or sys.exit(125);runpy.run_path(sys.argv[1],run_name='__main__')"
)

type windowsProcess struct {
	job *proctree.Job
}

func startContainedWorker(interpreter string, bootstrap string, directory string, environment []string, input *os.File, output *os.File, stdout io.Writer, stderr io.Writer) (*exec.Cmd, ownedProcess, error) {
	job, err := proctree.NewJob()
	if err != nil {
		return nil, nil, fmt.Errorf("worker: create Windows process owner: %w", err)
	}
	releaseReader, releaseWriter, err := os.Pipe()
	if err != nil {
		return nil, nil, errors.Join(fmt.Errorf("worker: create Windows release pipe: %w", err), job.Close())
	}
	cleanupPipes := func() error { return errors.Join(releaseReader.Close(), releaseWriter.Close()) }
	handles := []syscall.Handle{syscall.Handle(input.Fd()), syscall.Handle(output.Fd()), syscall.Handle(releaseReader.Fd())}
	for _, handle := range handles {
		if err := syscall.SetHandleInformation(handle, syscall.HANDLE_FLAG_INHERIT, syscall.HANDLE_FLAG_INHERIT); err != nil {
			return nil, nil, errors.Join(fmt.Errorf("worker: prepare inherited handle: %w", err), cleanupPipes(), job.Close())
		}
	}
	start := processStart{interpreter: interpreter, bootstrap: bootstrap, directory: directory, environment: environment, input: input, output: output, stdout: stdout, stderr: stderr}
	command := workerCommand(start, interpreter, "-I", "-c", windowsPrelude, bootstrap)
	command.Env = append(command.Env,
		InputFDEnvironment+"="+strconv.FormatUint(uint64(input.Fd()), 10),
		OutputFDEnvironment+"="+strconv.FormatUint(uint64(output.Fd()), 10),
		windowsReleaseEnvironment+"="+strconv.FormatUint(uint64(releaseReader.Fd()), 10),
	)
	command.SysProcAttr = &syscall.SysProcAttr{AdditionalInheritedHandles: handles}
	if err := command.Start(); err != nil {
		return nil, nil, errors.Join(fmt.Errorf("worker: start contained Python: %w", err), cleanupPipes(), job.Close())
	}
	if err := releaseReader.Close(); err != nil {
		return nil, nil, cleanupWindowsWorker(command, releaseWriter, job, fmt.Errorf("worker: close child release handle: %w", err))
	}
	if err := job.Assign(command.Process.Pid); err != nil {
		return nil, nil, cleanupWindowsWorker(command, releaseWriter, job, fmt.Errorf("worker: assign Python process job: %w", err))
	}
	count, releaseErr := releaseWriter.Write([]byte{1})
	closeErr := releaseWriter.Close()
	if releaseErr != nil || closeErr != nil || count != 1 {
		return nil, nil, cleanupWindowsWorker(command, nil, job, fmt.Errorf("worker: release contained Python: %w", errors.Join(releaseErr, closeErr, io.ErrShortWrite)))
	}
	return command, &windowsProcess{job: job}, nil
}

func cleanupWindowsWorker(command *exec.Cmd, release io.Closer, job *proctree.Job, cause error) error {
	var failures []error
	if release != nil {
		failures = append(failures, release.Close())
	}
	failures = append(failures, job.Close())
	if command != nil && command.Process != nil {
		if err := command.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
			failures = append(failures, fmt.Errorf("worker: stop unowned Windows process: %w", err))
		}
		if err := command.Wait(); err != nil {
			var exitError *exec.ExitError
			if !errors.As(err, &exitError) && !errors.Is(err, os.ErrProcessDone) {
				failures = append(failures, fmt.Errorf("worker: reap failed Windows process: %w", err))
			}
		}
	}
	return errors.Join(append([]error{cause}, failures...)...)
}

func (process *windowsProcess) terminate() error {
	if process == nil || process.job == nil {
		return errors.New("worker: Windows process job is unavailable")
	}
	return process.job.Close()
}

func (process *windowsProcess) finalize() error {
	return process.terminate()
}
