package codeformat

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestFormatPythonPreservesUTF8(t *testing.T) {
	addRepoVenvRuffToPath(t)

	formatted, err := FormatPython(context.Background(), "def greet():\n    return '🍕'\n", false)
	if err != nil {
		t.Fatalf("format python utf8: %v", err)
	}
	if !strings.Contains(formatted, "🍕") {
		t.Fatalf("expected utf8 rune to be preserved, got %q", formatted)
	}
}

func TestFormatPythonReturnsSanitizedError(t *testing.T) {
	addRepoVenvRuffToPath(t)

	_, err := FormatPython(context.Background(), "def broken(", false)
	if err == nil {
		t.Fatal("expected invalid python formatting to fail")
	}
	if err.Error() == "" {
		t.Fatal("expected invalid python formatting error text")
	}
	if strings.Contains(err.Error(), "\x1b") {
		t.Fatalf("expected stripped ansi escapes, got %q", err.Error())
	}
}

func addRepoVenvRuffToPath(t *testing.T) {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve python_test.go path")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
	venvBin := filepath.Join(repoRoot, ".venv", "bin")
	if _, err := os.Stat(filepath.Join(venvBin, "ruff")); err != nil {
		t.Fatalf("stat repo ruff binary: %v", err)
	}
	t.Setenv("PATH", venvBin+string(os.PathListSeparator)+os.Getenv("PATH"))
}
