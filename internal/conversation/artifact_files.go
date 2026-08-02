package conversation

import (
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// workspaceRelativeArtifactPath converts an absolute host path into the
// workspace-relative form artifact documents address files by. It reports
// false when the workspace is unknown, the saved file is not a regular file,
// or the canonical path resolves outside the canonical workspace root.
func workspaceRelativeArtifactPath(workspaceRoot string, absolutePath string) (string, bool) {
	if !validArtifactHostPaths(workspaceRoot, absolutePath) {
		return "", false
	}
	canonicalRoot, err := filepath.EvalSymlinks(workspaceRoot)
	if err != nil {
		return "", false
	}
	canonicalPath, regular := canonicalRegularFile(absolutePath)
	if !regular {
		return "", false
	}
	return artifactPathRelativeToRoot(canonicalRoot, canonicalPath)
}

func validArtifactHostPaths(workspaceRoot string, absolutePath string) bool {
	return workspaceRoot != "" &&
		filepath.IsAbs(workspaceRoot) &&
		filepath.IsAbs(absolutePath) &&
		utf8.ValidString(workspaceRoot) &&
		utf8.ValidString(absolutePath)
}

func canonicalRegularFile(path string) (string, bool) {
	canonicalPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", false
	}
	info, err := os.Stat(canonicalPath)
	return canonicalPath, err == nil && info.Mode().IsRegular()
}

func artifactPathRelativeToRoot(canonicalRoot string, canonicalPath string) (string, bool) {
	relative, err := filepath.Rel(canonicalRoot, canonicalPath)
	if err != nil {
		return "", false
	}
	relative = filepath.ToSlash(relative)
	if relative == "." || relative == ".." || strings.HasPrefix(relative, "../") {
		return "", false
	}
	return relative, true
}
