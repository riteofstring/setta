package lsp

import (
	"fmt"
	"os"
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

type CurrentProcessPythonSessionOptions struct {
	WorkspaceRoot string
	LookupEnv     func(string) (string, bool)
	Environ       func() []string
	WorkingDir    string
	Settings      map[string]any
}

func NewCurrentProcessPythonSession(options CurrentProcessPythonSessionOptions) (*Session, error) {
	lookupEnv := options.LookupEnv
	if lookupEnv == nil {
		lookupEnv = os.LookupEnv
	}
	environ := options.Environ
	if environ == nil {
		environ = os.Environ
	}

	command, args, err := resolveCurrentProcessCommand(lookupEnv)
	if err != nil {
		return nil, err
	}

	return NewSession(SessionOptions{
		WorkspaceRoot: options.WorkspaceRoot,
		Command:       command,
		Args:          args,
		Environment:   append([]string(nil), environ()...),
		WorkingDir:    options.WorkingDir,
		Settings:      cloneSettings(options.Settings),
	})
}

func resolveCurrentProcessCommand(lookupEnv func(string) (string, bool)) (string, []string, error) {
	if explicitCommand, ok := lookupEnv(lspCommandEnv); ok && strings.TrimSpace(explicitCommand) != "" {
		command, err := resolveBinary(strings.TrimSpace(explicitCommand))
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

func resolveBinary(candidate string) (string, error) {
	if strings.Contains(candidate, string(filepath.Separator)) {
		return statefs.NormalizePath(candidate, "")
	}
	resolved, err := exec.LookPath(candidate)
	if err != nil {
		return "", fmt.Errorf("lsp: resolve command %q: %w", candidate, err)
	}
	return resolved, nil
}

func cloneSettings(settings map[string]any) map[string]any {
	if len(settings) == 0 {
		return nil
	}
	cloned := make(map[string]any, len(settings))
	for key, value := range settings {
		cloned[key] = value
	}
	return cloned
}
