package buildinfo

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

var pythonPackageVersionPattern = regexp.MustCompile(`(?m)^__version__ = "([^"]+)"$`)

// HostPackageVersion returns the packaged Python version when it can be
// resolved deterministically, falling back to the Go build version.
func HostPackageVersion() string {
	if version := strings.TrimSpace(Version()); version != "" && version != "dev" {
		return version
	}
	for _, candidate := range pythonPackageVersionCandidates() {
		version, ok := readPythonPackageVersion(candidate)
		if ok {
			return version
		}
	}
	return Version()
}

func pythonPackageVersionCandidates() []string {
	candidates := []string{}
	if executablePath, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(executablePath), "..", "__init__.py"))
	}
	if _, sourceFile, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Join(filepath.Dir(sourceFile), "..", "..", "backend", "setta", "__init__.py"))
	}
	return candidates
}

func readPythonPackageVersion(path string) (string, bool) {
	content, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		return "", false
	}
	match := pythonPackageVersionPattern.FindStringSubmatch(string(content))
	if len(match) != 2 {
		return "", false
	}
	version := strings.TrimSpace(match[1])
	if version == "" {
		return "", false
	}
	return version, true
}
