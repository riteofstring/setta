package worker

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

var (
	ErrProjectRoot     = errors.New("worker: project root is invalid")
	ErrLauncherPython  = errors.New("worker: launcher Python is invalid")
	ErrProjectVenv     = errors.New("worker: nearest project .venv is invalid")
	ErrUnsupportedKind = errors.New("worker: runtime kind is unsupported")
)

func resolveProjectRoot(value string) (string, error) {
	if value == "" || value != strings.TrimSpace(value) || !filepath.IsAbs(value) || strings.ContainsRune(value, '\x00') {
		return "", ErrProjectRoot
	}
	resolved := filepath.Clean(value)
	info, err := os.Stat(resolved)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("%w: %s", ErrProjectRoot, resolved)
	}
	return resolved, nil
}

func selectPython(projectRoot string, launcher string) (string, string, error) {
	for directory := projectRoot; ; directory = filepath.Dir(directory) {
		candidate := filepath.Join(directory, ".venv")
		if _, err := os.Lstat(candidate); err == nil {
			interpreter, validationErr := validateProjectVenv(candidate)
			if validationErr != nil {
				return "", "", validationErr
			}
			return interpreter, candidate, nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return "", "", fmt.Errorf("%w: inspect %s: %v", ErrProjectVenv, candidate, err)
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			break
		}
	}
	interpreter, err := validatePython(launcher)
	return interpreter, "", err
}

func validateProjectVenv(root string) (string, error) {
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("%w: %s", ErrProjectVenv, root)
	}
	configuration, err := os.Stat(filepath.Join(root, "pyvenv.cfg"))
	if err != nil || !configuration.Mode().IsRegular() {
		return "", fmt.Errorf("%w: missing regular pyvenv.cfg", ErrProjectVenv)
	}
	interpreter, err := validatePython(filepath.Join(root, venvPythonPath()))
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrProjectVenv, err)
	}
	return interpreter, nil
}

func validatePython(value string) (string, error) {
	if value == "" || value != strings.TrimSpace(value) || !filepath.IsAbs(value) || strings.ContainsRune(value, '\x00') {
		return "", ErrLauncherPython
	}
	resolved := filepath.Clean(value)
	info, err := os.Stat(resolved)
	if err != nil || !info.Mode().IsRegular() {
		return "", fmt.Errorf("%w: %s", ErrLauncherPython, resolved)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		return "", fmt.Errorf("%w: %s is not executable", ErrLauncherPython, resolved)
	}
	return resolved, nil
}

func venvPythonPath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join("Scripts", "python.exe")
	}
	return filepath.Join("bin", "python")
}

func pythonEnvironment(inherited []string, interpreter string, virtualEnvRoot string) []string {
	if inherited == nil {
		inherited = os.Environ()
	}
	pathValue := ""
	prepared := make([]string, 0, len(inherited)+2)
	for _, value := range inherited {
		key, contents, found := strings.Cut(value, "=")
		if !found || key == "" {
			continue
		}
		if environmentKeyEqual(key, "PATH") {
			pathValue = contents
			continue
		}
		if pythonSelectionVariable(key) || environmentKeyEqual(key, InputFDEnvironment) || environmentKeyEqual(key, OutputFDEnvironment) || environmentKeyEqual(key, artifactRootEnvironment) {
			continue
		}
		prepared = append(prepared, value)
	}
	interpreterDirectory := filepath.Dir(interpreter)
	if pathValue == "" {
		prepared = append(prepared, "PATH="+interpreterDirectory)
	} else {
		prepared = append(prepared, "PATH="+interpreterDirectory+string(os.PathListSeparator)+pathValue)
	}
	if virtualEnvRoot != "" {
		prepared = append(prepared, "VIRTUAL_ENV="+virtualEnvRoot)
	}
	return prepared
}

func environmentKeyEqual(left string, right string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(left, right)
	}
	return left == right
}

func pythonSelectionVariable(key string) bool {
	for _, name := range []string{"PYTHONHOME", "PYTHONPATH", "PYTHONEXECUTABLE", "__PYVENV_LAUNCHER__", "VIRTUAL_ENV", "SETTA_PYTHON", "SETTA_LAUNCHER_PYTHON", "PYENV_VERSION", "CONDA_PREFIX", "CONDA_DEFAULT_ENV", "CONDA_PYTHON_EXE"} {
		if environmentKeyEqual(key, name) {
			return true
		}
	}
	return false
}
