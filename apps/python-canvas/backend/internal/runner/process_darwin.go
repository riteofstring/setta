//go:build darwin

package runner

import (
	"fmt"
	"os/exec"

	"github.com/riteofstring/setta/packages/local-backend/proctree"
)

func prepareProcessLaunch(interpreter string, artifact string, directory string, environment []string) (processLaunch, error) {
	if err := validateDarwinContainmentLauncher(); err != nil {
		return processLaunch{}, err
	}
	return preparePrivateGuardianLaunch(
		darwinPrivateGuardianInvocation,
		interpreter,
		artifact,
		directory,
		environment,
	)
}

func validateDarwinContainmentLauncher() error {
	if err := proctree.ValidateDarwinContainment(); err != nil {
		return fmt.Errorf("runner: macOS process containment is unavailable: %w", err)
	}
	return nil
}

func configureProcess(command *exec.Cmd) {
	_ = proctree.ConfigureGroup(command)
}
