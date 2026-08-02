package codeformat

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
)

var ansiEscapeRE = regexp.MustCompile(`\x1b\[[0-?]*[ -/]*[@-~]`)

func FormatPython(ctx context.Context, code string, includeLint bool) (string, error) {
	formatted, err := runRuff(ctx, []string{"check", "--quiet", "--select", "I", "--fix", "-"}, code)
	if err != nil {
		return "", err
	}

	if includeLint {
		formatted, err = runRuff(ctx, []string{"check", "--quiet", "--fix", "-"}, formatted)
		if err != nil {
			return "", err
		}
	}

	formatted, err = runRuff(ctx, []string{"format", "--quiet", "-"}, formatted)
	if err != nil {
		return "", err
	}
	return formatted, nil
}

func runRuff(ctx context.Context, args []string, code string) (string, error) {
	ruffPath, err := exec.LookPath("ruff")
	if err != nil {
		return "", errors.New("Ruff executable was not found on PATH.")
	}

	cmd := exec.CommandContext(ctx, ruffPath, args...)
	cmd.Stdin = strings.NewReader(code)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		message := strings.TrimSpace(stripANSI(stderr.String()))
		if message == "" {
			message = strings.TrimSpace(stripANSI(stdout.String()))
		}
		if message == "" {
			var exitErr *exec.ExitError
			if errors.As(err, &exitErr) {
				message = fmt.Sprintf("Ruff failed with exit code %d.", exitErr.ExitCode())
			} else {
				message = err.Error()
			}
		}
		return "", errors.New(message)
	}

	if stdout.Len() == 0 {
		return code, nil
	}
	return stdout.String(), nil
}

func stripANSI(text string) string {
	return ansiEscapeRE.ReplaceAllString(text, "")
}
