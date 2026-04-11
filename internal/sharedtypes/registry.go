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
	discovery := newSharedTypeDiscovery()
	discovery.visitTypes(frontendbindings.DiscoveredConvertibleTypes())
	discovery.visitValueExports(sharedvalueexports.DiscoveredValueExports())
	discovery.visitTypes(discoveredAdditionalTypes())
	discovery.record(sharedSchemaRawJSONType)
	return discovery.sortedTypes()
}

type sharedTypeDiscovery struct {
	visited    map[reflect.Type]struct{}
	discovered map[reflect.Type]struct{}
	types      []reflect.Type
}

func newSharedTypeDiscovery() *sharedTypeDiscovery {
	return &sharedTypeDiscovery{
		visited:    map[reflect.Type]struct{}{},
		discovered: map[reflect.Type]struct{}{},
	}
}

func (d *sharedTypeDiscovery) visitTypes(types []reflect.Type) {
	for _, t := range types {
		d.visit(t)
	}
}

func (d *sharedTypeDiscovery) visitValueExports(exports []sharedvalueexports.ValueExport) {
	for _, export := range exports {
		d.visit(export.Type)
	}
}

func (d *sharedTypeDiscovery) visit(t reflect.Type) {
	t = canonicalType(t)
	if t == nil || d.markVisited(t) {
		return
	}
	if d.shouldRecord(t) {
		d.record(t)
	}
	d.visitChildren(t)
}

func (d *sharedTypeDiscovery) markVisited(t reflect.Type) bool {
	if _, ok := d.visited[t]; ok {
		return true
	}
	d.visited[t] = struct{}{}
	return false
}

func (d *sharedTypeDiscovery) shouldRecord(t reflect.Type) bool {
	return t != sharedSchemaTimeType &&
		sharedSchemaTypeNameIsExported(t) &&
		strings.TrimSpace(t.PkgPath()) != ""
}

func (d *sharedTypeDiscovery) record(t reflect.Type) {
	if _, ok := d.discovered[t]; ok {
		return
	}
	d.discovered[t] = struct{}{}
	d.types = append(d.types, t)
}

func (d *sharedTypeDiscovery) visitChildren(t reflect.Type) {
	switch t.Kind() {
	case reflect.Pointer, reflect.Slice, reflect.Array, reflect.Chan:
		d.visit(t.Elem())
	case reflect.Map:
		d.visitMap(t)
	case reflect.Struct:
		d.visitStructFields(t)
	case reflect.Func:
		d.visitFuncSignature(t)
	case reflect.Interface:
		d.visitInterfaceMethods(t)
	}
}

func (d *sharedTypeDiscovery) visitMap(t reflect.Type) {
	d.visit(t.Key())
	d.visit(t.Elem())
}

func (d *sharedTypeDiscovery) visitStructFields(t reflect.Type) {
	for index := 0; index < t.NumField(); index++ {
		d.visit(t.Field(index).Type)
	}
}

func (d *sharedTypeDiscovery) visitFuncSignature(t reflect.Type) {
	for index := 0; index < t.NumIn(); index++ {
		d.visit(t.In(index))
	}
	for index := 0; index < t.NumOut(); index++ {
		d.visit(t.Out(index))
	}
}

func (d *sharedTypeDiscovery) visitInterfaceMethods(t reflect.Type) {
	for index := 0; index < t.NumMethod(); index++ {
		d.visit(t.Method(index).Type)
	}
}

func (d *sharedTypeDiscovery) sortedTypes() []reflect.Type {
	types := preferredSharedSchemaTypes(d.types)
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
