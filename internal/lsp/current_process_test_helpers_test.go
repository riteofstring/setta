package lsp

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"

	"setta/internal/pythonenv"
	"setta/internal/statefs"
)

const (
	lspCommandEnv = "SETTA_LSP_COMMAND"
	lspArgsEnv    = "SETTA_LSP_ARGS"
)

const basedpyrightEntrypoint = "from basedpyright.langserver import main; main()"

func resolveCurrentProcessCommand(lookupEnv func(string) (string, bool)) (string, []string, error) {
	if explicitCommand, ok := lookupEnv(lspCommandEnv); ok && strings.TrimSpace(explicitCommand) != "" {
		command, err := resolveCurrentProcessBinary(strings.TrimSpace(explicitCommand))
		if err != nil {
			return "", nil, err
		}
		args := []string{}
		if rawArgs, ok := lookupEnv(lspArgsEnv); ok && strings.TrimSpace(rawArgs) != "" {
			args = strings.Fields(strings.TrimSpace(rawArgs))
		}
		return command, args, nil
	}

	pythonBinary, err := pythonenv.ResolveCurrentProcessInterpreter(lookupEnv)
	if err != nil {
		return "", nil, err
	}
	return pythonBinary, []string{"-c", basedpyrightEntrypoint, "--stdio"}, nil
}

func resolveCurrentProcessBinary(candidate string) (string, error) {
	if strings.Contains(candidate, string(filepath.Separator)) {
		return statefs.NormalizePath(candidate, "")
	}
	resolved, err := exec.LookPath(candidate)
	if err != nil {
		return "", fmt.Errorf("lsp: resolve command %q: %w", candidate, err)
	}
	return resolved, nil
}
