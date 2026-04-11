package pythonsdkcontracts

import (
	"reflect"
	"strings"
	"testing"
)

func TestBuildEmitsTypingAndPydanticImportsForCurrentContracts(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	output := generated.PythonModule
	for _, snippet := range []string{
		"from typing import Any, Literal",
		"from pydantic import BaseModel, Field",
		`refreshKind: Literal["bootstrap", "force_refresh"] | None = None`,
		`details: dict[str, Any] = Field(default_factory=dict)`,
		`callbacks: dict[str, ListenerRegisterAckStatus] = Field(default_factory=dict)`,
	} {
		if !strings.Contains(output, snippet) {
			t.Fatalf("generated output missing snippet %q", snippet)
		}
	}
}

func TestBuildDeduplicatesCustomImportsAndExportsGeneratedModels(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	output := generated.PythonModule
	for _, importLine := range []string{
		"from setta.types.generated.go_shared_types import BaseArtifactUnion",
		"from setta.types.generated.go_shared_types import BaseDependencyKeyUnion",
		"from setta.types.generated.go_shared_types import BaseDependencyValueUnion",
	} {
		if count := strings.Count(output, importLine); count != 1 {
			t.Fatalf("generated output import %q appears %d times, want 1", importLine, count)
		}
	}

	for _, snippet := range []string{
		"SETTA_SDK_CONTRACT_VERSION = 2",
		"class ListenerRegisterAckStatus(SettaSDKContractBaseModel):",
		"class LocalCoreRenderRealtimeDependencyValuesResult(SettaSDKContractBaseModel):",
		`"ListenerRegisterAckStatus",`,
		`"LocalCoreRenderRealtimeDependencyValuesResult",`,
	} {
		if !strings.Contains(output, snippet) {
			t.Fatalf("generated output missing snippet %q", snippet)
		}
	}
}

func TestPythonTypeExpr(t *testing.T) {
	t.Helper()

	type namedStruct struct{}

	testCases := []struct {
		name      string
		fieldType reflect.Type
		override  string
		want      string
		wantErr   string
	}{
		{
			name:      "trimmed override wins",
			fieldType: reflect.TypeOf(""),
			override:  "  CustomType  ",
			want:      "CustomType",
		},
		{
			name:      "uint8 maps to bytes",
			fieldType: reflect.TypeOf(uint8(0)),
			want:      "bytes",
		},
		{
			name:      "pointer maps to optional",
			fieldType: reflect.TypeOf((*string)(nil)),
			want:      "str | None",
		},
		{
			name:      "slice maps to list",
			fieldType: reflect.TypeOf([]int{}),
			want:      "list[int]",
		},
		{
			name:      "byte slice maps to bytes",
			fieldType: reflect.TypeOf([]byte{}),
			want:      "bytes",
		},
		{
			name:      "map recurses through key and value",
			fieldType: reflect.TypeOf(map[string]bool{}),
			want:      "dict[str, bool]",
		},
		{
			name:      "struct uses type name",
			fieldType: reflect.TypeOf(namedStruct{}),
			want:      "namedStruct",
		},
		{
			name:      "unsupported type errors",
			fieldType: reflect.TypeOf([1]string{}),
			wantErr:   "unsupported type [1]string",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Helper()

			got, err := pythonTypeExpr(tc.fieldType, tc.override)
			if tc.wantErr != "" {
				if err == nil || err.Error() != tc.wantErr {
					t.Fatalf("pythonTypeExpr(%v, %q) error = %v, want %q", tc.fieldType, tc.override, err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("pythonTypeExpr(%v, %q) error = %v", tc.fieldType, tc.override, err)
			}
			if got != tc.want {
				t.Fatalf("pythonTypeExpr(%v, %q) = %q, want %q", tc.fieldType, tc.override, got, tc.want)
			}
		})
	}
}
