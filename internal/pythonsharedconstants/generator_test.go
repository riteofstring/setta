package pythonsharedconstants

import (
	"fmt"
	"strings"
	"testing"

	"setta/internal/localsessions"
	"setta/internal/projectstate"
)

func TestBuildIncludesGoOwnedMemorableNameWordLists(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("build generated constants: %v", err)
	}

	expected := []string{
		fmt.Sprintf(
			"MEMORABLE_NAME_ADJECTIVES = %s",
			pythonStringTupleExpr(projectstate.MemorableNameAdjectives()),
		),
		fmt.Sprintf(
			"MEMORABLE_NAME_NOUNS = %s",
			pythonStringTupleExpr(projectstate.MemorableNameNouns()),
		),
		fmt.Sprintf(
			"MEMORABLE_NAME_VERBS = %s",
			pythonStringTupleExpr(projectstate.MemorableNameVerbs()),
		),
	}
	for _, snippet := range expected {
		if !strings.Contains(generated.PythonModule, snippet) {
			t.Fatalf("generated constants missing %q", snippet)
		}
	}
}

func TestBuildIncludesGoOwnedSessionProcessRecognitionConstants(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("build generated constants: %v", err)
	}

	expected := []string{
		fmt.Sprintf(
			"SESSION_PROCESS_BASENAMES = %s",
			pythonFrozenStringSetExpr(localsessions.RecognizedSessionProcessBasenames()),
		),
		fmt.Sprintf(
			"SESSION_PROCESS_INVOCATION_ARGUMENTS = %s",
			pythonFrozenStringSetExpr(localsessions.RecognizedSessionInvocationArguments()),
		),
		fmt.Sprintf(
			"SESSION_PROCESS_INVOCATION_PREFIXES = %s",
			pythonStringTupleExpr(localsessions.RecognizedSessionInvocationPrefixes()),
		),
	}
	for _, snippet := range expected {
		if !strings.Contains(generated.PythonModule, snippet) {
			t.Fatalf("generated constants missing %q", snippet)
		}
	}
}

func TestPythonFrozenStringSetExprSingleValue(t *testing.T) {
	got := pythonFrozenStringSetExpr([]string{"setta"})
	if got != `frozenset(("setta",))` {
		t.Fatalf("expected single-value frozenset expression, got %q", got)
	}
}
