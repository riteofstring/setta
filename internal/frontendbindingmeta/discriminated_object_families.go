package frontendbindingmeta

import (
	"reflect"
	"strings"
)

type DiscriminatedObjectTraitSpec struct {
	UnionName         string
	LocalUnion        bool
	IncludeBase       bool
	EmbeddedFieldType reflect.Type
}

func (spec DiscriminatedObjectTraitSpec) Matches(t reflect.Type) bool {
	if spec.EmbeddedFieldType == nil {
		return true
	}
	return contractTypeEmbedsAnonymousField(t, spec.EmbeddedFieldType)
}

type DiscriminatedObjectFamily struct {
	BaseType                     reflect.Type
	EnumType                     reflect.Type
	DiscriminatorField           string
	ConcreteTypeSuffix           string
	DefaultValueForDiscriminator func(string) (any, bool, error)
	BaseExtraLines               []string
	Traits                       []DiscriminatedObjectTraitSpec
}

func (family DiscriminatedObjectFamily) DiscriminatorValue(t reflect.Type) (string, bool) {
	return namedConcreteTypeValue(t, family.ConcreteTypeSuffix)
}

func namedConcreteTypeValue(t reflect.Type, suffix string) (string, bool) {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.Kind() != reflect.Struct || strings.TrimSpace(suffix) == "" {
		return "", false
	}
	name := t.Name()
	if !strings.HasPrefix(name, "Frontend") ||
		strings.HasPrefix(name, "FrontendBase") ||
		!strings.HasSuffix(name, suffix) {
		return "", false
	}
	value := strings.TrimSuffix(strings.TrimPrefix(name, "Frontend"), suffix)
	if value == "" || strings.HasPrefix(value, "UserDefault") {
		return "", false
	}
	return value, true
}

func contractTypeEmbedsAnonymousField(t reflect.Type, target reflect.Type) bool {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || target == nil || t.Kind() != reflect.Struct {
		return false
	}
	for index := 0; index < t.NumField(); index++ {
		field := t.Field(index)
		if !field.Anonymous {
			continue
		}
		fieldType := field.Type
		if fieldType == target {
			return true
		}
		if contractTypeEmbedsAnonymousField(fieldType, target) {
			return true
		}
	}
	return false
}
