package sharedtypes

import (
	"encoding/json"
	"reflect"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"setta/internal/frontendbindings"
	"setta/internal/sharedvalueexports"
)

var sharedSchemaTimeType = reflect.TypeOf(time.Time{})
var sharedSchemaRawJSONType = reflect.TypeOf(json.RawMessage{})

func DiscoveredTypes() []reflect.Type {
	visited := map[reflect.Type]struct{}{}
	discovered := map[reflect.Type]struct{}{}
	types := []reflect.Type{}

	var visit func(reflect.Type)
	visit = func(t reflect.Type) {
		t = canonicalType(t)
		if t == nil {
			return
		}
		if _, ok := visited[t]; ok {
			return
		}
		visited[t] = struct{}{}

		if t != sharedSchemaTimeType &&
			sharedSchemaTypeNameIsExported(t) &&
			strings.TrimSpace(t.PkgPath()) != "" {
			if _, ok := discovered[t]; !ok {
				discovered[t] = struct{}{}
				types = append(types, t)
			}
		}

		switch t.Kind() {
		case reflect.Pointer, reflect.Slice, reflect.Array, reflect.Chan:
			visit(t.Elem())
		case reflect.Map:
			visit(t.Key())
			visit(t.Elem())
		case reflect.Struct:
			for index := 0; index < t.NumField(); index++ {
				visit(t.Field(index).Type)
			}
		case reflect.Func:
			for index := 0; index < t.NumIn(); index++ {
				visit(t.In(index))
			}
			for index := 0; index < t.NumOut(); index++ {
				visit(t.Out(index))
			}
		case reflect.Interface:
			for index := 0; index < t.NumMethod(); index++ {
				visit(t.Method(index).Type)
			}
		}
	}

	for _, t := range frontendbindings.DiscoveredConvertibleTypes() {
		visit(t)
	}
	for _, export := range sharedvalueexports.DiscoveredValueExports() {
		visit(export.Type)
	}
	for _, t := range discoveredAdditionalTypes() {
		visit(t)
	}
	if _, ok := discovered[sharedSchemaRawJSONType]; !ok {
		discovered[sharedSchemaRawJSONType] = struct{}{}
		types = append(types, sharedSchemaRawJSONType)
	}
	types = preferredSharedSchemaTypes(types)

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

func preferredSharedSchemaTypes(types []reflect.Type) []reflect.Type {
	if len(types) == 0 {
		return nil
	}

	frontendByGroup := map[string]struct{}{}
	for _, t := range types {
		name := strings.TrimSpace(t.Name())
		if !strings.HasPrefix(name, "Frontend") || len(name) <= len("Frontend") {
			continue
		}
		frontendByGroup[sharedSchemaTypeGroupKey(t)] = struct{}{}
	}

	filtered := make([]reflect.Type, 0, len(types))
	for _, t := range types {
		if _, ok := frontendByGroup[sharedSchemaTypeGroupKey(t)]; ok &&
			!strings.HasPrefix(strings.TrimSpace(t.Name()), "Frontend") {
			continue
		}
		filtered = append(filtered, t)
	}
	return filtered
}

func sharedSchemaTypeGroupKey(t reflect.Type) string {
	return t.PkgPath() + ":" + strings.TrimSpace(ContractNameForType(t))
}

func sharedSchemaTypeNameIsExported(t reflect.Type) bool {
	name := strings.TrimSpace(t.Name())
	if name == "" {
		return false
	}
	firstRune, _ := utf8.DecodeRuneInString(name)
	return unicode.IsUpper(firstRune)
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
