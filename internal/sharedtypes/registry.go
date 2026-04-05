package sharedtypes

import (
	"reflect"
	"sort"
	"strings"

	"setta/internal/frontendbindings"
)

func DiscoveredTypes() []reflect.Type {
	seen := map[reflect.Type]struct{}{}
	types := []reflect.Type{}

	add := func(t reflect.Type) {
		t = canonicalType(t)
		if t == nil {
			return
		}
		if _, ok := seen[t]; ok {
			return
		}
		seen[t] = struct{}{}
		types = append(types, t)
	}

	for _, t := range frontendbindings.DiscoveredConvertibleTypes() {
		add(t)
	}
	for _, export := range frontendbindings.DiscoveredFrontendValueExports() {
		add(export.Type)
	}
	for _, t := range discoveredAdditionalTypes() {
		add(t)
	}

	sort.Slice(types, func(i int, j int) bool {
		nameI := strings.TrimSpace(ContractNameForType(types[i]))
		nameJ := strings.TrimSpace(ContractNameForType(types[j]))
		if nameI == nameJ {
			if types[i].PkgPath() == types[j].PkgPath() {
				return types[i].String() < types[j].String()
			}
			return types[i].PkgPath() < types[j].PkgPath()
		}
		return nameI < nameJ
	})
	return types
}

func ContractNameForType(t reflect.Type) string {
	t = canonicalType(t)
	if t == nil {
		return ""
	}
	return strings.TrimSpace(frontendbindings.BindingTypeName(t))
}

func TypeByContractName(name string) (reflect.Type, bool) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, false
	}
	for _, t := range DiscoveredTypes() {
		if ContractNameForType(t) == trimmedName {
			return t, true
		}
	}
	return nil, false
}

func canonicalType(t reflect.Type) reflect.Type {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	return frontendbindings.CanonicalBindingType(t)
}
