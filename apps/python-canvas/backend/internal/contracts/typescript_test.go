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
		"PROJECT_CALLABLE_COMPLETIONS_PATH_V1 = \"/api/v1/project/callable/completions\"",
		"PROJECT_PYTHON_TARGET_COMPLETIONS_PATH_V1 = \"/api/v1/project/python-target/completions\"",
		"PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V1 = \"positional_only\"",
		"DIAGNOSTIC_SEVERITY_ERROR_V1 = \"error\"",
		"PROVIDER_BASEDPYRIGHT_V1 = \"basedpyright\"",
		"PROVIDER_AVAILABILITY_UNAVAILABLE_V1 = \"unavailable\"",
		"PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1 = \"not_started\"",
		"project: ProjectV1;",
		"callables: [CallableV1];",
		"authoredExpression: string;",
		"cursorOffsetUtf16: number;",
		"insertText: string;",
		"PYTHON_TARGET_COMPLETION_REGION_PREFIX_V1 = \"prefix\"",
		"items: CompletionItemV1[];",
		"parameterIds: string[];",
		"sourceRanges: GeneratedSourceRangeV1[];",
		"targetId: string;",
		"targetId: string | null;",
		"start: number;",
		"end: number;",
		"state: ProviderLifecycleStateV1;",
		"error: APIErrorV1;",
	} {
		if !strings.Contains(first, expected) {
			t.Fatalf("TypeScriptV1() does not contain %q", expected)
		}
	}
}
