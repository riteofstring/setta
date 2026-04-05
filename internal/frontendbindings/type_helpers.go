package frontendbindings

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"

	"setta/internal/frontendbindingmeta"
)

var timeType = reflect.TypeOf(time.Time{})
var rawJSONType = reflect.TypeOf(json.RawMessage{})

type tsRawExpr struct {
	Expr string
}

func mustTSLiteralValueFromGoValue(context string, value any) any {
	payload, err := json.Marshal(value)
	if err != nil {
		panic(context + ": marshal Go default: " + err.Error())
	}
	var normalized any
	if err := json.Unmarshal(payload, &normalized); err != nil {
		panic(context + ": decode Go default: " + err.Error())
	}
	return normalized
}

func mustOrderedTSLiteralObjectFromGoValue(context string, value any) (map[string]any, []string) {
	normalized := mustTSLiteralValueFromGoValue(context, value)
	if reflected := reflect.ValueOf(value); reflected.IsValid() {
		normalized = mergeTSLiteralValueFromReflectValue(context, reflected, normalized)
	}
	object, ok := normalized.(map[string]any)
	if !ok {
		panic(context + ": Go default did not decode to an object")
	}
	orderedKeys := goJSONFieldOrder(value)
	if len(orderedKeys) == 0 {
		return object, orderedKeys
	}
	expected := make(map[string]struct{}, len(orderedKeys))
	for _, key := range orderedKeys {
		expected[key] = struct{}{}
		if _, ok := object[key]; !ok {
			panic(fmt.Sprintf("%s is missing property %q", context, key))
		}
	}
	for key := range object {
		if _, ok := expected[key]; ok {
			continue
		}
		panic(fmt.Sprintf("%s has unexpected property %q", context, key))
	}
	return object, orderedKeys
}

func mergeTSLiteralValueFromReflectValue(
	context string,
	value reflect.Value,
	normalized any,
) any {
	if !value.IsValid() {
		return normalized
	}
	for value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return nil
		}
		value = value.Elem()
	}
	if value.Kind() != reflect.Struct {
		return normalized
	}
	object, ok := normalized.(map[string]any)
	if !ok {
		return normalized
	}
	valueType := value.Type()
	for fieldIndex := 0; fieldIndex < valueType.NumField(); fieldIndex++ {
		field := valueType.Field(fieldIndex)
		if !field.IsExported() {
			continue
		}
		fieldValue := value.Field(fieldIndex)
		if field.Anonymous {
			merged := mergeTSLiteralValueFromReflectValue(context, fieldValue, object)
			mergedObject, ok := merged.(map[string]any)
			if ok {
				object = mergedObject
			}
			continue
		}
		name, _, skip := jsonFieldName(field)
		if skip {
			continue
		}
		fieldContext := context + "." + name
		normalizedField, ok := object[name]
		if !ok {
			object[name] = mustTSLiteralValueFromGoValue(fieldContext, fieldValue.Interface())
			continue
		}
		object[name] = mergeTSLiteralValueFromReflectValue(fieldContext, fieldValue, normalizedField)
	}
	return object
}

func goJSONFieldOrder(value any) []string {
	valueType := reflect.TypeOf(value)
	if valueType == nil {
		return nil
	}
	for valueType.Kind() == reflect.Pointer {
		valueType = valueType.Elem()
	}
	if valueType.Kind() != reflect.Struct {
		return nil
	}
	order := make([]string, 0, valueType.NumField())
	appendGoJSONFieldOrder(valueType, &order)
	return order
}

func appendGoJSONFieldOrder(valueType reflect.Type, order *[]string) {
	for fieldIndex := 0; fieldIndex < valueType.NumField(); fieldIndex++ {
		field := valueType.Field(fieldIndex)
		if !field.IsExported() {
			continue
		}
		if field.Anonymous {
			appendGoJSONFieldOrder(field.Type, order)
			continue
		}
		tag := strings.TrimSpace(field.Tag.Get("json"))
		if tag == "" || tag == "-" {
			continue
		}
		name := strings.TrimSpace(strings.Split(tag, ",")[0])
		if name == "" {
			continue
		}
		*order = append(*order, name)
	}
}

func writeTSObjectLiteral(
	builder *strings.Builder,
	indent string,
	object map[string]any,
	orderedKeys []string,
) {
	builder.WriteString("{\n")
	childIndent := indent + "  "
	seen := map[string]struct{}{}
	for _, key := range orderedKeys {
		value, ok := object[key]
		if !ok {
			continue
		}
		seen[key] = struct{}{}
		builder.WriteString(childIndent)
		builder.WriteString(renderTSObjectKey(key))
		builder.WriteString(": ")
		writeTSLiteralValue(builder, childIndent, value)
		builder.WriteString(",\n")
	}

	remaining := make([]string, 0, len(object)-len(seen))
	for key := range object {
		if _, ok := seen[key]; ok {
			continue
		}
		remaining = append(remaining, key)
	}
	sort.Strings(remaining)
	for _, key := range remaining {
		builder.WriteString(childIndent)
		builder.WriteString(renderTSObjectKey(key))
		builder.WriteString(": ")
		writeTSLiteralValue(builder, childIndent, object[key])
		builder.WriteString(",\n")
	}

	builder.WriteString(indent)
	builder.WriteString("}")
}

func writeTSLiteralValue(builder *strings.Builder, indent string, value any) {
	switch typed := value.(type) {
	case nil:
		builder.WriteString("null")
	case bool:
		if typed {
			builder.WriteString("true")
		} else {
			builder.WriteString("false")
		}
	case string:
		builder.WriteString(strconv.Quote(typed))
	case float64:
		builder.WriteString(formatTSNumberLiteral(typed))
	case tsRawExpr:
		builder.WriteString(typed.Expr)
	case []any:
		writeTSArrayLiteral(builder, indent, typed)
	case map[string]any:
		writeTSObjectLiteral(builder, indent, typed, nil)
	default:
		payload, err := json.Marshal(typed)
		if err != nil {
			panic("marshal TypeScript literal value: " + err.Error())
		}
		builder.Write(payload)
	}
}

func renderTSLiteralExpr(value any) string {
	var builder strings.Builder
	writeTSLiteralValue(&builder, "", value)
	return builder.String()
}

func renderTSObjectLiteralExpr(object map[string]any, orderedKeys []string, indent string) string {
	var builder strings.Builder
	writeTSObjectLiteral(&builder, indent, object, orderedKeys)
	return builder.String()
}

func writeTSArrayLiteral(builder *strings.Builder, indent string, values []any) {
	if len(values) == 0 {
		builder.WriteString("[]")
		return
	}
	if tsArrayLiteralCanInline(values) {
		builder.WriteString("[")
		for index, value := range values {
			if index > 0 {
				builder.WriteString(", ")
			}
			writeTSLiteralValue(builder, indent, value)
		}
		builder.WriteString("]")
		return
	}

	builder.WriteString("[\n")
	childIndent := indent + "  "
	for _, value := range values {
		builder.WriteString(childIndent)
		writeTSLiteralValue(builder, childIndent, value)
		builder.WriteString(",\n")
	}
	builder.WriteString(indent)
	builder.WriteString("]")
}

func tsArrayLiteralCanInline(values []any) bool {
	for _, value := range values {
		switch value.(type) {
		case nil, bool, string, float64:
			continue
		default:
			return false
		}
	}
	return true
}

func renderTSObjectKey(key string) string {
	if key != "__proto__" && tsIdentifierPattern.MatchString(key) {
		return key
	}
	return strconv.Quote(key)
}

func formatTSNumberLiteral(value float64) string {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		panic("settings defaults contained a non-finite numeric literal")
	}
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func ownerProvidedTypeDeclaration(
	converter *typeConverter,
	t reflect.Type,
) (TypeDeclaration, bool, error) {
	if provider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.TypeScriptExprProvider](t); ok {
		expr := provider.FrontendBindingTypeScriptExpr()
		if strings.TrimSpace(expr) == "" {
			return TypeDeclaration{}, false, fmt.Errorf("%s returned an empty frontend TS alias expression", t.String())
		}
		return aliasDeclaration(frontendBindingTypeName(t), expr), true, nil
	}

	provider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.UnionTypesProvider](t)
	if !ok {
		return TypeDeclaration{}, false, nil
	}
	memberTypes := append([]reflect.Type(nil), provider.FrontendBindingUnionTypes()...)
	if len(memberTypes) == 0 {
		return TypeDeclaration{}, false, fmt.Errorf("%s returned no frontend union members", t.String())
	}

	members := make([]string, 0, len(memberTypes))
	seen := map[string]struct{}{}
	for _, memberType := range memberTypes {
		memberExpr, err := converter.renderTypeExpr(memberType)
		if err != nil {
			return TypeDeclaration{}, false, fmt.Errorf("%s union member %v: %w", t.String(), memberType, err)
		}
		if _, duplicate := seen[memberExpr]; duplicate {
			continue
		}
		seen[memberExpr] = struct{}{}
		members = append(members, memberExpr)
	}
	if len(members) == 0 {
		return TypeDeclaration{}, false, fmt.Errorf("%s returned no renderable frontend union members", t.String())
	}

	return aliasUnionDeclaration(frontendBindingTypeName(t), members...), true, nil
}

func specialTypeDeclaration(
	converter *typeConverter,
	t reflect.Type,
) (TypeDeclaration, bool, error) {
	if declaration, ok, err := ownerProvidedTypeDeclaration(converter, t); ok || err != nil {
		return declaration, ok, err
	}
	if declaration, ok, err := discriminatedObjectFamilyTypeDeclaration(converter, t); ok || err != nil {
		return declaration, ok, err
	}
	return TypeDeclaration{}, false, nil
}
