package frontendbindingmeta

import (
	"reflect"
	"strings"
)

type TypeScriptExprProvider interface {
	FrontendBindingTypeScriptExpr() string
}

type UnionTypesProvider interface {
	FrontendBindingUnionTypes() []reflect.Type
}

type DiscriminatedObjectFamilyProvider interface {
	FrontendBindingDiscriminatedObjectFamily() DiscriminatedObjectFamily
}

func LookupProvider[P any](t reflect.Type) (P, bool) {
	var zero P
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || strings.TrimSpace(t.PkgPath()) == "" {
		return zero, false
	}

	value := reflect.Zero(t)
	if value.IsValid() && value.CanInterface() {
		if provider, ok := value.Interface().(P); ok {
			return provider, true
		}
	}
	if t.Kind() == reflect.Interface {
		return zero, false
	}
	ptr := reflect.New(t)
	if !ptr.IsValid() || !ptr.CanInterface() {
		return zero, false
	}
	provider, ok := ptr.Interface().(P)
	return provider, ok
}
