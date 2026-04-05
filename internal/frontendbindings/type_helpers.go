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
	var appendOrder func(reflect.Type)
	appendOrder = func(valueType reflect.Type) {
		for fieldIndex := 0; fieldIndex < valueType.NumField(); fieldIndex++ {
			field := valueType.Field(fieldIndex)
			if !field.IsExported() {
				continue
			}
			if field.Anonymous {
				appendOrder(field.Type)
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
			order = append(order, name)
		}
	}
	appendOrder(valueType)
	return order
}

func writeTSLiteralValue(builder *strings.Builder, indent string, value any, orderedKeys []string) {
	switch typed := value.(type) {
	case nil:
		builder.WriteString("null")
	case bool:
		builder.WriteString(strconv.FormatBool(typed))
	case string:
		builder.WriteString(strconv.Quote(typed))
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			panic("settings defaults contained a non-finite numeric literal")
		}
		builder.WriteString(strconv.FormatFloat(typed, 'f', -1, 64))
	case tsRawExpr:
		builder.WriteString(typed.Expr)
	case []any:
		if len(typed) == 0 {
			builder.WriteString("[]")
			return
		}
		inline := true
		for _, value := range typed {
			switch value.(type) {
			case nil, bool, string, float64:
			default:
				inline = false
			}
			if !inline {
				break
			}
		}
		if inline {
			builder.WriteString("[")
			for index, value := range typed {
				if index > 0 {
					builder.WriteString(", ")
				}
				writeTSLiteralValue(builder, indent, value, nil)
			}
			builder.WriteString("]")
			return
		}
		builder.WriteString("[\n")
		childIndent := indent + "  "
		for _, value := range typed {
			builder.WriteString(childIndent)
			writeTSLiteralValue(builder, childIndent, value, nil)
			builder.WriteString(",\n")
		}
		builder.WriteString(indent)
		builder.WriteString("]")
	case map[string]any:
		builder.WriteString("{\n")
		childIndent := indent + "  "
		seen := map[string]struct{}{}
		writeProperty := func(key string, value any) {
			builder.WriteString(childIndent)
			builder.WriteString(renderTSObjectKey(key))
			builder.WriteString(": ")
			writeTSLiteralValue(builder, childIndent, value, nil)
			builder.WriteString(",\n")
		}
		for _, key := range orderedKeys {
			value, ok := typed[key]
			if !ok {
				continue
			}
			seen[key] = struct{}{}
			writeProperty(key, value)
		}
		remaining := make([]string, 0, len(typed)-len(seen))
		for key := range typed {
			if _, ok := seen[key]; ok {
				continue
			}
			remaining = append(remaining, key)
		}
		sort.Strings(remaining)
		for _, key := range remaining {
			writeProperty(key, typed[key])
		}
		builder.WriteString(indent)
		builder.WriteString("}")
	default:
		payload, err := json.Marshal(typed)
		if err != nil {
			panic("marshal TypeScript literal value: " + err.Error())
		}
		builder.Write(payload)
	}
}

func renderTSObjectKey(key string) string {
	if key != "__proto__" && tsIdentifierPattern.MatchString(key) {
		return key
	}
	return strconv.Quote(key)
}

func specialTypeDeclaration(
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
	if ok {
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
	return TypeDeclaration{}, false, nil
}
