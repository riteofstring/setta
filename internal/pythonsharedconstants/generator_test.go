package pythonsharedconstants

import (
	"fmt"
	"strings"
	"testing"

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
