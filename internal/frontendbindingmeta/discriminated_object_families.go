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
	suffix := strings.TrimSpace(family.ConcreteTypeSuffix)
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.Kind() != reflect.Struct || suffix == "" {
		return "", false
	}
	name, ok := strings.CutPrefix(t.Name(), "Frontend")
	if !ok || strings.HasPrefix(name, "Base") {
		return "", false
	}
	value, ok := strings.CutSuffix(name, suffix)
	if !ok || value == "" || strings.HasPrefix(value, "UserDefault") {
		return "", false
	}
	return value, true
}

func ContractTypeEmbedsAnonymousField(t reflect.Type, target reflect.Type) bool {
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
		if ContractTypeEmbedsAnonymousField(fieldType, target) {
			return true
		}
	}
	return false
}
