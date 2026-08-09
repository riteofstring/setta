package projectstate

import (
	"encoding/json"
	"testing"
)

func TestCodeObjectImplPayloadNormalizesEmptyChildrenForParentTypes(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name string
		impl CodeObjectImpl
	}{
		{
			name: "callable without payload",
			impl: CodeObjectImpl{
				ID:   "callable-root-impl",
				Type: "CodeCallable",
			},
		},
		{
			name: "nested param with nil children payload",
			impl: CodeObjectImpl{
				ID:   "dict-root-impl",
				Type: "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "dict-root-impl",
					"type":     "NestedParam",
					"children": nil,
				}),
			},
		},
		{
			name: "dropdown param with nil choices payload",
			impl: CodeObjectImpl{
				ID:   "dropdown-param-impl",
				Type: "DropdownParam",
				Payload: mustMarshalProjectObject(map[string]any{
					"id":      "dropdown-param-impl",
					"type":    "DropdownParam",
					"choices": nil,
				}),
			},
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			raw, err := CodeObjectImplPayload(testCase.impl)
			if err != nil {
				t.Fatalf("CodeObjectImplPayload returned error: %v", err)
			}

			var payload map[string]any
			if err := json.Unmarshal(raw, &payload); err != nil {
				t.Fatalf("decode code object payload: %v", err)
			}

			switch testCase.impl.Type {
			case "DropdownParam":
				choices, ok := payload["choices"].([]any)
				if !ok || choices == nil {
					t.Fatalf("expected normalized choices array, got %#v", payload["choices"])
				}
				if len(choices) != 0 {
					t.Fatalf("expected normalized choices to be empty, got %#v", choices)
				}
			default:
				children, ok := payload["children"].([]any)
				if !ok || children == nil {
					t.Fatalf("expected normalized children array, got %#v", payload["children"])
				}
				if len(children) != 0 {
					t.Fatalf("expected normalized children to be empty, got %#v", children)
				}
			}
		})
	}
}

func TestEffectiveCodeObjectPayloadNormalizesParentChildrenAfterModifierMerge(t *testing.T) {
	t.Parallel()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodeObjs: map[string]CodeObject{
			"dict-root": {
				ID:               "dict-root",
				Name:             "dict_root",
				VariantIDs:       []string{"dict-root-variant"},
				DefaultVariantID: "dict-root-variant",
				SharedModifier: mustMarshalProjectObject(map[string]any{
					"children": nil,
				}),
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"dict-root-variant": {
				ID:     "dict-root-variant",
				ImplID: "dict-root-impl",
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"dict-root-impl": {
				ID:   "dict-root-impl",
				Type: "NestedParam",
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	payload, _, _, _, err := project.EffectiveCodeObjectPayload(
		map[string]string{"dict-root": "dict-root-variant"},
		"dict-root",
	)
	if err != nil {
		t.Fatalf("EffectiveCodeObjectPayload returned error: %v", err)
	}

	children, ok := payload["children"].([]any)
	if !ok || children == nil {
		t.Fatalf("expected normalized effective children array, got %#v", payload["children"])
	}
	if len(children) != 0 {
		t.Fatalf("expected effective children to be empty, got %#v", children)
	}
}

func TestEffectiveCodeObjectPayloadNormalizesDropdownChoicesAfterModifierMerge(t *testing.T) {
	t.Parallel()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodeObjs: map[string]CodeObject{
			"dropdown-param": {
				ID:               "dropdown-param",
				Name:             "dropdown_param",
				VariantIDs:       []string{"dropdown-param-variant"},
				DefaultVariantID: "dropdown-param-variant",
				SharedModifier: mustMarshalProjectObject(map[string]any{
					"choices": nil,
				}),
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"dropdown-param-variant": {
				ID:     "dropdown-param-variant",
				ImplID: "dropdown-param-impl",
				Modifier: mustMarshalProjectObject(map[string]any{
					"choices": nil,
				}),
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"dropdown-param-impl": {
				ID:   "dropdown-param-impl",
				Type: "DropdownParam",
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	payload, _, _, _, err := project.EffectiveCodeObjectPayload(
		map[string]string{"dropdown-param": "dropdown-param-variant"},
		"dropdown-param",
	)
	if err != nil {
		t.Fatalf("EffectiveCodeObjectPayload returned error: %v", err)
	}

	choices, ok := payload["choices"].([]any)
	if !ok || choices == nil {
		t.Fatalf("expected normalized effective choices array, got %#v", payload["choices"])
	}
	if len(choices) != 0 {
		t.Fatalf("expected effective choices to be empty, got %#v", choices)
	}
}
