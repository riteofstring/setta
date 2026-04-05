package frontendbindingmeta

import "reflect"

type DiscriminatedObjectTraitSpec struct {
	UnionName   string
	LocalUnion  bool
	IncludeBase bool
	Predicate   func(reflect.Type) bool
	SetName     string
	GuardName   string
	GuardInput  string
}

type DiscriminatedObjectFamily struct {
	BaseType                     reflect.Type
	EnumType                     reflect.Type
	MemberTypes                  []reflect.Type
	DiscriminatorField           string
	DiscriminatorValue           func(reflect.Type) (string, bool)
	DefaultValueForDiscriminator func(string) (any, bool, error)
	BaseExtraLines               []string
	Traits                       []DiscriminatedObjectTraitSpec
}
