package firstpartyplugin

import (
	"fmt"
	"os"
	"sync"
	"testing"

	"setta/internal/pythonenv"
)

var tyRuntime struct {
	once   sync.Once
	python string
	err    error
}

func TyPython(t testing.TB) string {
	t.Helper()

	ensureTyRuntime()
	if tyRuntime.err != nil {
		t.Fatalf("prepare first-party ty test runtime: %v", tyRuntime.err)
	}
	return tyRuntime.python
}

func ensureTyRuntime() {
	tyRuntime.once.Do(func() {
		tyRuntime.python, tyRuntime.err = prepareTyRuntime()
	})
}

func prepareTyRuntime() (string, error) {
	bootstrapPython, err := pythonenv.ResolveCurrentProcessInterpreter(os.LookupEnv)
	if err != nil {
		return "", fmt.Errorf("resolve bootstrap python interpreter: %w", err)
	}

	dependency, err := firstPartyPluginDependency("setta-ty")
	if err != nil {
		return "", err
	}

	venvRoot, err := os.MkdirTemp("", "setta-ty-test-env-")
	if err != nil {
		return "", fmt.Errorf("create ty test env root: %w", err)
	}

	if err := runCommand(bootstrapPython, "-m", "venv", venvRoot); err != nil {
		return "", fmt.Errorf("create ty test env: %w", err)
	}

	pythonPath := pythonBinaryForVenv(venvRoot)
	if err := runCommand(pythonPath, "-m", "pip", "install", "--disable-pip-version-check", dependency); err != nil {
		return "", fmt.Errorf("install %s into ty test env: %w", dependency, err)
	}
	return pythonPath, nil
}
