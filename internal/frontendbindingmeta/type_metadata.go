package frontendbindingmeta

import "reflect"

const FrontendSDKScopeAppSubsystem = "app-subsystem"

type UnionTypesProvider interface{ FrontendBindingUnionTypes() []reflect.Type }

type DiscriminatedObjectFamilyProvider interface {
	FrontendBindingDiscriminatedObjectFamily() DiscriminatedObjectFamily
}

type FrontendSDKExportedValueScope struct {
	Scope            string     `json:"scope"`
	IncludeFullValue bool       `json:"includeFullValue,omitempty"`
	ValuePaths       [][]string `json:"valuePaths,omitempty"`
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
