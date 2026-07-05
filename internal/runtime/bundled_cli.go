package runtime

import (
	"fmt"
	"os"
	"path/filepath"
	goruntime "runtime"
)

func validateBundledSettaCLIDir(dir string) error {
	if dir == "" {
		return nil
	}
	if !filepath.IsAbs(dir) {
		return fmt.Errorf("bundled setta CLI directory must be absolute: %s", dir)
	}
	path := bundledSettaCLIExecutablePath(dir)
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("bundled setta CLI executable is missing: %s", path)
		}
		return fmt.Errorf("stat bundled setta CLI executable %s: %w", path, err)
	}
	if info.IsDir() {
		return fmt.Errorf("bundled setta CLI executable path is a directory: %s", path)
	}
	if goruntime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		return fmt.Errorf("bundled setta CLI executable is not executable: %s", path)
	}
	return nil
}

func bundledSettaCLIExecutablePath(dir string) string {
	return filepath.Join(dir, bundledSettaCLIExecutableName())
}

func bundledSettaCLIExecutableName() string {
	if goruntime.GOOS == "windows" {
		return "setta.exe"
	}
	return "setta"
}

func codexProcessEnvForBundledSettaCLI(dir string) []string {
	if dir == "" {
		return nil
	}
	return []string{pathEnvAssignment(dir)}
}

func pathEnvAssignment(prepend string) string {
	current := os.Getenv("PATH")
	if current == "" {
		return "PATH=" + prepend
	}
	return "PATH=" + prepend + string(os.PathListSeparator) + current
}
