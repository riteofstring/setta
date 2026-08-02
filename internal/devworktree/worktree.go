package devworktree

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

var (
	activeNameOnce sync.Once
	activeName     string
)

// ActiveName reports the current Setta dev worktree name when the source tree is
// inside a git worktree. It returns an empty string when no repo root can be found.
func ActiveName() string {
	activeNameOnce.Do(func() {
		activeName = resolveActiveName(candidateDirectories(), resolveRepoRoot)
	})
	return activeName
}

func resolveActiveName(candidates []string, resolve func(string) (string, bool)) string {
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		cleaned := filepath.Clean(strings.TrimSpace(candidate))
		if cleaned == "" {
			continue
		}
		if _, ok := seen[cleaned]; ok {
			continue
		}
		seen[cleaned] = struct{}{}
		repoRoot, ok := resolve(cleaned)
		if !ok {
			continue
		}
		return DeriveName(repoRoot)
	}
	return ""
}

func candidateDirectories() []string {
	candidates := make([]string, 0, 2)
	if _, file, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Join(filepath.Dir(file), "..", ".."))
	}
	if workingDir, err := os.Getwd(); err == nil {
		candidates = append(candidates, workingDir)
	}
	return candidates
}

func resolveRepoRoot(dir string) (string, bool) {
	command := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel")
	output, err := command.Output()
	if err != nil {
		return "", false
	}
	repoRoot := strings.TrimSpace(string(output))
	if repoRoot == "" {
		return "", false
	}
	return filepath.Clean(repoRoot), true
}

// DeriveName mirrors the frontend worktree badge naming contract from the Python app.
func DeriveName(repoRoot string) string {
	trimmedRoot := strings.TrimSpace(repoRoot)
	if trimmedRoot == "" {
		return ""
	}
	dirName := filepath.Base(filepath.Clean(trimmedRoot))
	switch {
	case dirName == "setta":
		return "main"
	case strings.HasPrefix(dirName, "setta.") && len(dirName) > len("setta."):
		return dirName[len("setta."):]
	default:
		return dirName
	}
}
