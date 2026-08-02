package evalharness

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
)

const phase0MaxDiagnosticBytes = 2048

type phase0CommandResult struct {
	stdout string
	stderr string
}

func runPhase0Command(
	ctx context.Context,
	dir string,
	env []string,
	name string,
	args ...string,
) (phase0CommandResult, error) {
	command := exec.CommandContext(ctx, name, args...)
	command.Dir = dir
	if env != nil {
		command.Env = env
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	err := command.Run()
	result := phase0CommandResult{
		stdout: strings.TrimSpace(stdout.String()),
		stderr: strings.TrimSpace(stderr.String()),
	}
	if err != nil {
		diagnostic := result.stderr
		if diagnostic == "" {
			diagnostic = result.stdout
		}
		return result, fmt.Errorf(
			"%s failed: %w: %s",
			name,
			err,
			boundedPhase0Diagnostic(diagnostic),
		)
	}
	return result, nil
}

func boundedPhase0Diagnostic(value string) string {
	value = strings.TrimSpace(value)
	if len(value) <= phase0MaxDiagnosticBytes {
		return value
	}
	return value[:phase0MaxDiagnosticBytes] + "…"
}
