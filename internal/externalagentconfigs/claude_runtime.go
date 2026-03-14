package externalagentconfigs

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"setta/internal/pythonenv"
)

const claudeSDKImportCheck = "import claude_agent_sdk"

func ResolveClaudePythonCommand() (string, error) {
	for _, envVar := range []string{pythonenv.InterpreterEnv, pythonenv.LegacyLSPPythonEnv} {
		if explicit, ok := os.LookupEnv(envVar); ok && strings.TrimSpace(explicit) != "" {
			return resolveClaudePythonCandidate(strings.TrimSpace(explicit))
		}
	}
	for _, candidate := range claudeRepoPythonCandidates() {
		resolved, err := resolveClaudePythonCandidate(candidate)
		if err == nil {
			return resolved, nil
		}
	}
	return pythonenv.ResolveCurrentProcessInterpreter(os.LookupEnv)
}

func CheckClaudeSDKImport(pythonCommand string) error {
	commandPath := strings.TrimSpace(pythonCommand)
	if commandPath == "" {
		return fmt.Errorf("claude python command is required")
	}
	command := exec.Command(commandPath, "-c", claudeSDKImportCheck)
	command.Env = os.Environ()
	if output, err := command.CombinedOutput(); err != nil {
		stderrOutput := strings.TrimSpace(string(output))
		if stderrOutput != "" {
			return fmt.Errorf("import claude_agent_sdk with %s: %w: %s", commandPath, err, stderrOutput)
		}
		return fmt.Errorf("import claude_agent_sdk with %s: %w", commandPath, err)
	}
	return nil
}

func claudeRepoPythonCandidates() []string {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return nil
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))
	if runtime.GOOS == "windows" {
		return []string{
			filepath.Join(repoRoot, ".venv", "Scripts", "python.exe"),
		}
	}
	return []string{
		filepath.Join(repoRoot, ".venv", "bin", "python3"),
		filepath.Join(repoRoot, ".venv", "bin", "python"),
	}
}

func resolveClaudePythonCandidate(candidate string) (string, error) {
	if strings.TrimSpace(candidate) == "" {
		return "", fmt.Errorf("claude python candidate is required")
	}
	if strings.Contains(candidate, string(filepath.Separator)) {
		resolved, err := filepath.Abs(candidate)
		if err != nil {
			return "", fmt.Errorf("resolve claude python path: %w", err)
		}
		if _, err := os.Stat(resolved); err != nil {
			return "", fmt.Errorf("stat claude python path: %w", err)
		}
		return resolved, nil
	}
	resolved, err := exec.LookPath(candidate)
	if err != nil {
		return "", fmt.Errorf("resolve claude python command %q: %w", candidate, err)
	}
	return resolved, nil
}
