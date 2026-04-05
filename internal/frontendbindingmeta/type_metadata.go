package frontendbindingmeta

import (
	"reflect"
)

type TypeScriptExprProvider interface{ FrontendBindingTypeScriptExpr() string }

type UnionTypesProvider interface{ FrontendBindingUnionTypes() []reflect.Type }

type DiscriminatedObjectFamilyProvider interface {
	FrontendBindingDiscriminatedObjectFamily() DiscriminatedObjectFamily
}

func LookupProvider[P any](t reflect.Type) (P, bool) {
	var zero P
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.PkgPath() == "" {
		return zero, false
	}
	if provider, ok := reflect.Zero(t).Interface().(P); ok {
		return provider, true
	}
	if t.Kind() == reflect.Interface {
		return zero, false
	}
	provider, ok := reflect.New(t).Interface().(P)
	return provider, ok
}
