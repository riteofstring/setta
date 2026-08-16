package contracts

import (
	"strings"
	"testing"
)

func TestTypeScriptV1IsDeterministicAndContainsCurrentContract(t *testing.T) {
	first := string(TypeScriptV1())
	second := string(TypeScriptV1())
	if first != second {
		t.Fatal("TypeScriptV1() is not deterministic")
	}

	for _, expected := range []string{
		"PROJECT_SNAPSHOT_VERSION_V1 = \"v1\"",
		"project: ProjectV1;",
		"authoredExpression: string;",
		"parameterIds: string[];",
		"sourceRanges: GeneratedSourceRangeV1[];",
		"targetId: string;",
		"state: ProviderLifecycleStateV1;",
		"error: APIErrorV1;",
	} {
		if !strings.Contains(first, expected) {
			t.Fatalf("TypeScriptV1() does not contain %q", expected)
		}
	}
}
