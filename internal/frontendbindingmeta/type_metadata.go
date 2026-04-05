package frontendbindingmeta

import "reflect"

type UnionTypesProvider interface{ FrontendBindingUnionTypes() []reflect.Type }

type SemanticValueProvider interface {
	FrontendBindingSemanticValue() (any, bool, error)
}

type DiscriminatedObjectFamilyProvider interface {
	FrontendBindingDiscriminatedObjectFamily() DiscriminatedObjectFamily
}

func LookupProvider[P any](t reflect.Type) (P, bool) {
	var zero P
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.PkgPath() == "" || t.Kind() == reflect.Interface {
		return zero, false
	}
	provider, ok := reflect.Zero(t).Interface().(P)
	return provider, ok
}
