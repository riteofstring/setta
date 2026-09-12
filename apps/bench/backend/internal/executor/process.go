package executor

import "os/exec"

type ownedProcess interface {
	Terminate() error
	Finalize() error
}

func copyCommand(target *exec.Cmd, source *exec.Cmd) {
	target.Dir = source.Dir
	target.Env = append([]string(nil), source.Env...)
	target.Stdin = source.Stdin
	target.Stdout = source.Stdout
	target.Stderr = source.Stderr
}
