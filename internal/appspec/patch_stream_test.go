package appspec

import (
	"reflect"
	"testing"
)

func TestParsePatchLinesIgnoresCommentsAndBlanks(t *testing.T) {
	t.Parallel()

	ops, err := ParsePatchLines("\n// comment\n{\"op\":\"set\",\"path\":\"/root\",\"value\":\"app-root\"}\n{\"op\":\"set\",\"path\":\"/elements/app-root\",\"value\":{\"key\":\"app-root\",\"type\":\"Card\"}}\n")
	if err != nil {
		t.Fatalf("parse patch lines: %v", err)
	}
	if len(ops) != 2 {
		t.Fatalf("expected two patch ops, got %d", len(ops))
	}
	if ops[0].Path != "/root" {
		t.Fatalf("expected first patch path /root, got %q", ops[0].Path)
	}
	if ops[1].Path != "/elements/app-root" {
		t.Fatalf("expected second patch path /elements/app-root, got %q", ops[1].Path)
	}
}

func TestParsePatchLineReturnsNilForInvalidPayloads(t *testing.T) {
	t.Parallel()

	cases := []string{
		"",
		"   ",
		"// keepalive",
		"not json",
		"```json",
		"{\"op\":\"set\"}",
		"{\"op\":\"nope\",\"path\":\"/root\",\"value\":\"x\"}",
		"{\"op\":\"set\",\"path\":\"/nope\",\"value\":\"x\"}",
		"{\"op\":\"set\",\"path\":\"/root\"}",
	}
	for _, raw := range cases {
		if patch := ParsePatchLine(raw); patch != nil {
			t.Fatalf("expected nil patch for %q, got %#v", raw, patch)
		}
	}
}

func TestApplyPatchOpsAppliesRootAndElementSet(t *testing.T) {
	t.Parallel()

	ops, err := ParsePatchLines("{\"op\":\"set\",\"path\":\"/root\",\"value\":\"app-root\"}\n{\"op\":\"set\",\"path\":\"/elements/app-root\",\"value\":{\"key\":\"app-root\",\"type\":\"Card\",\"props\":{\"title\":\"Hello\"},\"children\":[]}}")
	if err != nil {
		t.Fatalf("parse patch lines: %v", err)
	}

	spec, err := ApplyPatchOps(ops, nil)
	if err != nil {
		t.Fatalf("apply patch ops: %v", err)
	}

	if spec["root"] != "app-root" {
		t.Fatalf("expected root app-root, got %#v", spec["root"])
	}
	elements := spec["elements"].(map[string]any)
	appRoot := elements["app-root"].(map[string]any)
	if appRoot["type"] != "Card" {
		t.Fatalf("expected Card element type, got %#v", appRoot["type"])
	}
}

func TestApplyPatchOpsDoesNotMutateInitialSpec(t *testing.T) {
	t.Parallel()

	initial := map[string]any{
		"root": "app-root",
		"elements": map[string]any{
			"app-root": map[string]any{
				"key":  "app-root",
				"type": "Card",
				"props": map[string]any{
					"title": "Hello",
				},
			},
		},
	}
	ops, err := ParsePatchLines("{\"op\":\"set\",\"path\":\"/elements/app-root/props/title\",\"value\":\"Updated\"}")
	if err != nil {
		t.Fatalf("parse patch lines: %v", err)
	}

	updated, err := ApplyPatchOps(ops, initial)
	if err != nil {
		t.Fatalf("apply patch ops: %v", err)
	}

	updatedProps := updated["elements"].(map[string]any)["app-root"].(map[string]any)["props"].(map[string]any)
	if updatedProps["title"] != "Updated" {
		t.Fatalf("expected updated title, got %#v", updatedProps["title"])
	}
	initialProps := initial["elements"].(map[string]any)["app-root"].(map[string]any)["props"].(map[string]any)
	if initialProps["title"] != "Hello" {
		t.Fatalf("expected original title to remain Hello, got %#v", initialProps["title"])
	}
}

func TestApplyPatchOpsRequiresExistingNestedElement(t *testing.T) {
	t.Parallel()

	ops, err := ParsePatchLines("{\"op\":\"set\",\"path\":\"/elements/missing/props/title\",\"value\":\"Hello\"}")
	if err != nil {
		t.Fatalf("parse patch lines: %v", err)
	}

	_, err = ApplyPatchOps(ops, nil)
	if err == nil {
		t.Fatal("expected nested element patch to fail")
	}
	if err.Error() != "Element \"missing\" must exist before patching nested fields." {
		t.Fatalf("unexpected nested patch error %q", err.Error())
	}
}

func TestApplyPatchOpsListMutationSemantics(t *testing.T) {
	t.Parallel()

	baseSpec := map[string]any{
		"root": "root",
		"elements": map[string]any{
			"root": map[string]any{
				"key":      "root",
				"type":     "Stack",
				"children": []any{"a"},
			},
		},
	}

	t.Run("replace rejects index equal length", func(t *testing.T) {
		t.Parallel()

		ops, err := ParsePatchLines("{\"op\":\"replace\",\"path\":\"/elements/root/children/1\",\"value\":\"b\"}")
		if err != nil {
			t.Fatalf("parse patch lines: %v", err)
		}
		_, err = ApplyPatchOps(ops, baseSpec)
		if err == nil {
			t.Fatal("expected replace to reject missing array index")
		}
		if err.Error() != "Cannot replace missing array index." {
			t.Fatalf("unexpected replace error %q", err.Error())
		}
	})

	t.Run("set appends at index equal length", func(t *testing.T) {
		t.Parallel()

		ops, err := ParsePatchLines("{\"op\":\"set\",\"path\":\"/elements/root/children/1\",\"value\":\"b\"}")
		if err != nil {
			t.Fatalf("parse patch lines: %v", err)
		}
		spec, err := ApplyPatchOps(ops, baseSpec)
		if err != nil {
			t.Fatalf("apply set append patch: %v", err)
		}
		children := spec["elements"].(map[string]any)["root"].(map[string]any)["children"].([]any)
		if !reflect.DeepEqual(children, []any{"a", "b"}) {
			t.Fatalf("expected appended children, got %#v", children)
		}
	})

	t.Run("add appends at index equal length", func(t *testing.T) {
		t.Parallel()

		ops, err := ParsePatchLines("{\"op\":\"add\",\"path\":\"/elements/root/children/1\",\"value\":\"b\"}")
		if err != nil {
			t.Fatalf("parse patch lines: %v", err)
		}
		spec, err := ApplyPatchOps(ops, baseSpec)
		if err != nil {
			t.Fatalf("apply add append patch: %v", err)
		}
		children := spec["elements"].(map[string]any)["root"].(map[string]any)["children"].([]any)
		if !reflect.DeepEqual(children, []any{"a", "b"}) {
			t.Fatalf("expected appended children, got %#v", children)
		}
	})
}
