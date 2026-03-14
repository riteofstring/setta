package codeformat

import (
	"context"
	"strings"
	"testing"
)

func TestFormatPythonPreservesUTF8(t *testing.T) {
	t.Parallel()

	formatted, err := FormatPython(context.Background(), "def greet():\n    return '🍕'\n", false)
	if err != nil {
		t.Fatalf("format python utf8: %v", err)
	}
	if !strings.Contains(formatted, "🍕") {
		t.Fatalf("expected utf8 rune to be preserved, got %q", formatted)
	}
}

func TestFormatPythonReturnsSanitizedError(t *testing.T) {
	t.Parallel()

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
