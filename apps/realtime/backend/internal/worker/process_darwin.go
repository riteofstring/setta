//go:build darwin

package worker

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"

	"github.com/setta/local-backend/proctree"
)

type darwinProcess struct {
	group *proctree.Group
}

func startContainedWorker(interpreter string, bootstrap string, directory string, environment []string, input *os.File, output *os.File, stdout io.Writer, stderr io.Writer) (*exec.Cmd, ownedProcess, error) {
	start := processStart{interpreter: interpreter, bootstrap: bootstrap, directory: directory, environment: environment, input: input, output: output, stdout: stdout, stderr: stderr}
	command := workerCommand(start, interpreter, "-I", bootstrap)
	if err := proctree.ConfigureDarwinCommand(command); err != nil {
		return nil, nil, fmt.Errorf("worker: configure macOS containment: %w", err)
	}
	command.Env = append(command.Env, InputFDEnvironment+"=3", OutputFDEnvironment+"=4")
	command.ExtraFiles = []*os.File{input, output}
	if err := command.Start(); err != nil {
		return nil, nil, fmt.Errorf("worker: start contained Python: %w", err)
	}
	group, err := proctree.NewGroup(command.Process.Pid)
	if err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		return nil, nil, fmt.Errorf("worker: own macOS process group: %w", err)
	}
	process := &darwinProcess{group: group}
	if err := group.VerifyLeader(); err != nil {
		_ = process.terminate()
		_ = command.Wait()
		return nil, nil, fmt.Errorf("worker: macOS process group ownership failed: %w", err)
	}
	return command, process, nil
}

func (process *darwinProcess) terminate() error {
	if process == nil || process.group == nil {
		return errors.New("worker: macOS process group is unavailable")
	}
	return process.group.Close()
}

func (process *darwinProcess) finalize() error {
	return process.terminate()
}
