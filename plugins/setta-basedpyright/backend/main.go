package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	backendProbeArg      = "--setta-plugin-backend-probe"
	lspCommandEnv        = "SETTA_LSP_COMMAND"
	lspArgsEnv           = "SETTA_LSP_ARGS"
	pythonEnv            = "SETTA_PYTHON"
	basedpyrightSettings = "basedpyright"
)

const basedpyrightEntrypoint = "from basedpyright.langserver import main; main()"

func main() {
	if len(os.Args) != 2 || os.Args[1] != backendProbeArg {
		return
	}

	command, args, err := resolveLanguageServerCommand(os.LookupEnv)
	if err != nil {
		fail(err)
	}

	settingsKey := basedpyrightSettings
	writeJSON(map[string]any{
		"schemaVersion": 1,
		"languageServers": []map[string]any{
			{
				"name":        "basedpyright",
				"language":    "python",
				"command":     command,
				"args":        args,
				"settingsKey": settingsKey,
			},
		},
	})
}

func resolveLanguageServerCommand(lookupEnv func(string) (string, bool)) (string, []string, error) {
	if explicitCommand, ok := lookupEnv(lspCommandEnv); ok && strings.TrimSpace(explicitCommand) != "" {
		command, err := resolveCommand(strings.TrimSpace(explicitCommand))
		if err != nil {
			return "", nil, err
		}
		args := []string{}
		if rawArgs, ok := lookupEnv(lspArgsEnv); ok && strings.TrimSpace(rawArgs) != "" {
			args = strings.Fields(strings.TrimSpace(rawArgs))
		}
		return command, args, nil
	}

	pythonBinary, err := resolveInterpreter(lookupEnv)
	if err != nil {
		return "", nil, err
	}
	return pythonBinary, []string{"-c", basedpyrightEntrypoint, "--stdio"}, nil
}

func resolveInterpreter(lookupEnv func(string) (string, bool)) (string, error) {
	configured, ok := lookupEnv(pythonEnv)
	if !ok || strings.TrimSpace(configured) == "" {
		return "", fmt.Errorf("python interpreter unavailable for setta-basedpyright plugin; set %s", pythonEnv)
	}
	return resolveCommand(strings.TrimSpace(configured))
}

func resolveCommand(candidate string) (string, error) {
	if strings.ContainsRune(candidate, os.PathSeparator) {
		resolved, err := normalizeCommandPath(candidate)
		if err != nil {
			return "", fmt.Errorf("resolve command %q: %w", candidate, err)
		}
		return resolved, nil
	}
	resolved, err := exec.LookPath(candidate)
	if err != nil {
		return "", fmt.Errorf("resolve command %q: %w", candidate, err)
	}
	return resolved, nil
}

func normalizeCommandPath(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", fmt.Errorf("missing path")
	}
	value = os.ExpandEnv(value)
	if value == "~" || strings.HasPrefix(value, "~/") || strings.HasPrefix(value, "~\\") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		suffix := strings.TrimPrefix(strings.TrimPrefix(value, "~"), string(os.PathSeparator))
		suffix = strings.TrimPrefix(strings.TrimPrefix(suffix, "/"), "\\")
		value = filepath.Join(home, suffix)
	}
	resolved, err := filepath.Abs(value)
	if err != nil {
		return "", fmt.Errorf("resolve path %q: %w", raw, err)
	}
	return filepath.Clean(resolved), nil
}

func fail(err error) {
	if err == nil {
		return
	}
	_, _ = os.Stderr.WriteString(strings.TrimSpace(err.Error()) + "\n")
	os.Exit(1)
}

func writeJSON(value any) {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		fail(err)
	}
}
