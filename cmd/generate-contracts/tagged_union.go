package main

import (
	"bytes"
	"fmt"
	"reflect"
)

// taggedUnionSpec describes a struct contract whose discriminator field selects
// exactly one populated nullable branch payload. The generated decoder asserts
// that invariant so a malformed block fails loudly at the decode boundary.
type taggedUnionSpec struct {
	Discriminator string
	Branches      []taggedUnionBranch
}

type taggedUnionBranch struct {
	Field     string
	KindValue string
}

func contractTaggedUnionForType(goType reflect.Type) (taggedUnionSpec, bool) {
	spec, ok := contractTaggedUnions()[goType]
	return spec, ok
}

func hasTaggedUnion(specs []interfaceSpec) bool {
	for _, spec := range specs {
		if _, ok := contractTaggedUnionForType(spec.Type); ok {
			return true
		}
	}
	return false
}

func renderTaggedUnionAssertion(buffer *bytes.Buffer, name string, spec taggedUnionSpec) {
	fmt.Fprintf(buffer, "  assertTaggedUnionBranch(%q, result.%s, {\n", name, spec.Discriminator)
	for _, branch := range spec.Branches {
		fmt.Fprintf(buffer, "    %q: result.%s,\n", branch.KindValue, branch.Field)
	}
	buffer.WriteString("  });\n")
}
