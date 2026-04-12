package sharedtypes

import (
	"reflect"
	"strings"
	"testing"
)

type discriminatedUnionTestKind string

type discriminatedUnionTestUnion struct{}

type discriminatedUnionTestMemberAlpha struct {
	Kind discriminatedUnionTestKind `json:"kind,omitempty" shared_discriminator:"alpha"`
}

type discriminatedUnionTestMemberBeta struct {
	Kind discriminatedUnionTestKind `json:"kind,omitempty" shared_discriminator:"beta"`
}

type discriminatedUnionTestBadMember struct {
	Kind  discriminatedUnionTestKind `json:"kind,omitempty" shared_discriminator:"alpha"`
	Other discriminatedUnionTestKind `json:"other,omitempty" shared_discriminator:"beta"`
}

func TestSharedDiscriminatorFieldForTypeReturnsTaggedField(t *testing.T) {
	t.Parallel()

	field, ok, err := sharedDiscriminatorFieldForType(reflect.TypeOf(discriminatedUnionTestMemberAlpha{}))
	if err != nil {
		t.Fatalf("sharedDiscriminatorFieldForType() error = %v", err)
	}
	if !ok {
		t.Fatal("expected discriminator field")
	}
	if got := field.JSONName; got != "kind" {
		t.Fatalf("JSONName = %q, want %q", got, "kind")
	}
	if got := field.Value; got != "alpha" {
		t.Fatalf("Value = %q, want %q", got, "alpha")
	}
	if got := field.EnumType; got != reflect.TypeOf(discriminatedUnionTestKind("")) {
		t.Fatalf("EnumType = %v, want %v", got, reflect.TypeOf(discriminatedUnionTestKind("")))
	}
}

func TestSharedDiscriminatorFieldForTypeRejectsMultipleTags(t *testing.T) {
	t.Parallel()

	_, _, err := sharedDiscriminatorFieldForType(reflect.TypeOf(discriminatedUnionTestBadMember{}))
	if err == nil {
		t.Fatal("expected multiple shared_discriminator tags error")
	}
	if !strings.Contains(err.Error(), "multiple "+sharedDiscriminatorTag+" tags") {
		t.Fatalf("unexpected error %q", err)
	}
}

func TestDiscriminatedUnionEntryForTypeDeduplicatesMemberNames(t *testing.T) {
	t.Parallel()

	entry, ok, err := discriminatedUnionEntryForType(
		reflect.TypeOf(discriminatedUnionTestUnion{}),
		[]reflect.Type{
			reflect.TypeOf(discriminatedUnionTestMemberAlpha{}),
			reflect.TypeOf(&discriminatedUnionTestMemberAlpha{}),
			reflect.TypeOf(discriminatedUnionTestMemberBeta{}),
		},
	)
	if err != nil {
		t.Fatalf("discriminatedUnionEntryForType() error = %v", err)
	}
	if !ok {
		t.Fatal("expected discriminated union entry")
	}
	if got := entry.DiscriminatorField; got != "kind" {
		t.Fatalf("DiscriminatorField = %q, want %q", got, "kind")
	}
	if got := entry.EnumType; got != "discriminatedUnionTestKind" {
		t.Fatalf("EnumType = %q, want %q", got, "discriminatedUnionTestKind")
	}
	if got := len(entry.Members); got != 2 {
		t.Fatalf("member count = %d, want %d", got, 2)
	}
	if got := entry.Members[0].Name; got != "discriminatedUnionTestMemberAlpha" {
		t.Fatalf("first member name = %q, want %q", got, "discriminatedUnionTestMemberAlpha")
	}
	if got := entry.Members[1].DiscriminatorValue; got != "beta" {
		t.Fatalf("second member discriminator = %q, want %q", got, "beta")
	}
}
