package frontendbindings

import (
	"strings"
	"testing"
)

func TestBuildRetainsDiscoveredValueTypeDeclarations(t *testing.T) {
	t.Parallel()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build(): %v", err)
	}

	for _, snippet := range []string{
		"export type Policy = gt.Policy;",
		"export function createPolicy(",
		"return options as Policy;",
		"export const DefaultAppPolicy = {",
	} {
		if !strings.Contains(bindings.TypesTS, snippet) {
			t.Fatalf("generated bindings missing %q", snippet)
		}
	}
}
