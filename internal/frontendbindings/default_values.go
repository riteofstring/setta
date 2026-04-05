package frontendbindings

import "reflect"

func CanonicalBindingType(t reflect.Type) reflect.Type {
	return canonicalFrontendBindingType(t)
}

func DefaultValueProviderForType(t reflect.Type) (func() any, bool) {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return nil, false
	}
	provider, ok := discoveredFrontendDefaultValueProviderRegistry[t]
	return provider, ok
}
