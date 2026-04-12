package listenerendpoints

import (
	"reflect"
	"strings"
	"testing"
)

func TestBuildPythonClientRendersGoOwnedPayloadContracts(t *testing.T) {
	t.Helper()

	generated, err := BuildPythonClient()
	if err != nil {
		t.Fatalf("BuildPythonClient() error = %v", err)
	}

	output := generated.PythonModule
	for _, snippet := range []string{
		"from setta.types.generated.go_shared_types import BaseChatMessageUnion",
		"from setta.types.generated.go_shared_types import Chat",
		"from setta.types.generated.go_shared_types import ChatSectionState",
		"from setta.types.generated.go_shared_types import LLMStreamingResponseChunk",
		"class ListenerCreateChatRequestPayload(TypedDict):",
		"projectConfigId: NotRequired[ID]",
		"engineConfigId: NotRequired[ID | None]",
		"firstMessage: BaseChatMessageUnion",
		`ROUTER_ENDPOINT_SET_CHAT_SECTION_STATE = "route_set_chat_section_state"`,
		"return await self._caller(ROUTER_ENDPOINT_SET_CHAT_SECTION_STATE, payload)",
	} {
		if !strings.Contains(output, snippet) {
			t.Fatalf("generated output missing snippet %q", snippet)
		}
	}
	if strings.Contains(output, "from setta.types.chat import") {
		t.Fatalf("generated output should not import legacy setta.types.chat shim")
	}
}

func TestPythonClientEndpointSpecsStayUnique(t *testing.T) {
	t.Helper()

	endpointNames := map[string]struct{}{}
	methodNames := map[string]struct{}{}
	requestNames := map[string]struct{}{}
	for _, spec := range pythonClientEndpointSpecs {
		if _, ok := endpointNames[spec.EndpointName]; ok {
			t.Fatalf("duplicate endpoint name %q", spec.EndpointName)
		}
		endpointNames[spec.EndpointName] = struct{}{}
		if _, ok := methodNames[spec.MethodName]; ok {
			t.Fatalf("duplicate method name %q", spec.MethodName)
		}
		methodNames[spec.MethodName] = struct{}{}
		if spec.RequestType.Name() == "" {
			t.Fatalf("endpoint %q missing request type name", spec.EndpointName)
		}
		requestNames[spec.RequestType.Name()] = struct{}{}
	}

	if len(requestNames) == 0 {
		t.Fatal("expected at least one listener endpoint request payload spec")
	}
}

func TestInferPythonFieldTypeExpr(t *testing.T) {
	t.Helper()

	testCases := []struct {
		name      string
		fieldType reflect.Type
		want      string
	}{
		{name: "pointer string", fieldType: reflect.TypeOf((*string)(nil)), want: "str"},
		{name: "uint8", fieldType: reflect.TypeOf(uint8(0)), want: "bytes"},
		{name: "nested list map", fieldType: reflect.TypeOf([]map[string]bool{}), want: "list[dict[str, bool]]"},
		{name: "interface map", fieldType: reflect.TypeOf(map[string]any{}), want: "dict[str, object]"},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Helper()

			got, err := inferPythonFieldTypeExpr(tc.fieldType)
			if err != nil {
				t.Fatalf("inferPythonFieldTypeExpr(%v) error = %v", tc.fieldType, err)
			}
			if got != tc.want {
				t.Fatalf("inferPythonFieldTypeExpr(%v) = %q, want %q", tc.fieldType, got, tc.want)
			}
		})
	}
}

func TestInferPythonFieldTypeExprRejectsUnsupportedTypes(t *testing.T) {
	t.Helper()

	if _, err := inferPythonFieldTypeExpr(reflect.TypeOf(struct{}{})); err == nil {
		t.Fatal("expected unsupported struct type error")
	}
}
