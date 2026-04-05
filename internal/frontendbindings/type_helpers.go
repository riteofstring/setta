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

	"setta/internal/httpapi"
	"setta/internal/transcriptionsessions"
)

var timeType = reflect.TypeOf(time.Time{})
var rawJSONType = reflect.TypeOf(json.RawMessage{})
var discoveredTypeOverrides = mergedTypeOverrides()

func mergedTypeOverrides() map[reflect.Type]reflect.Type {
	overrides := DiscoveredTypeOverrides()
	overrides[reflect.TypeOf((*transcriptionsessions.Delta)(nil)).Elem()] = reflect.TypeOf((*httpapi.TranscriptionSessionDeltaResponse)(nil)).Elem()
	return overrides
}

type tsLiteralField struct {
	Name  string
	Value string
}

type tsRawExpr struct {
	Expr string
}

type tsNamedLiteralObject struct {
	Name   string
	Fields []tsLiteralField
}

func writeTSObjectFields(builder *strings.Builder, indent string, fields []tsLiteralField) {
	for _, field := range fields {
		builder.WriteString(indent)
		builder.WriteString(field.Name)
		builder.WriteString(": ")
		builder.WriteString(field.Value)
		builder.WriteString(",\n")
	}
}

func writeTSNamedObjectEntries(builder *strings.Builder, entryIndent string, fieldIndent string, entries []tsNamedLiteralObject) {
	for _, entry := range entries {
		builder.WriteString(entryIndent)
		builder.WriteString(entry.Name)
		builder.WriteString(": {\n")
		writeTSObjectFields(builder, fieldIndent, entry.Fields)
		builder.WriteString(entryIndent)
		builder.WriteString("},\n")
	}
}

func writeTSNamedMergeEntries(builder *strings.Builder, entryIndent string, fieldIndent string, generic string, optionsExprPrefix string, entries []tsNamedLiteralObject) {
	for _, entry := range entries {
		builder.WriteString(entryIndent)
		builder.WriteString(entry.Name)
		builder.WriteString(": mergeGeneratedOptions")
		if generic != "" {
			builder.WriteString("<")
			builder.WriteString(generic)
			builder.WriteString(">")
		}
		builder.WriteString("(\n")
		builder.WriteString(fieldIndent)
		builder.WriteString("{\n")
		writeTSObjectFields(builder, fieldIndent+"  ", entry.Fields)
		builder.WriteString(fieldIndent)
		builder.WriteString("},\n")
		builder.WriteString(fieldIndent)
		builder.WriteString(optionsExprPrefix)
		builder.WriteString(".")
		builder.WriteString(entry.Name)
		builder.WriteString(" ?? {},\n")
		builder.WriteString(entryIndent)
		builder.WriteString("),\n")
	}
}

func buildTSMergeGeneratedOptionsExprFromTSObject(
	defaults map[string]any,
	orderedKeys []string,
	overridesExpr string,
	resultType string,
) string {
	if strings.TrimSpace(overridesExpr) == "" {
		overridesExpr = "options"
	}
	var builder strings.Builder
	builder.WriteString("mergeGeneratedOptions")
	if resultType = strings.TrimSpace(resultType); resultType != "" {
		builder.WriteString("<")
		builder.WriteString(resultType)
		builder.WriteString(">")
	}
	builder.WriteString("(\n")
	writeTSObjectLiteral(&builder, "    ", defaults, orderedKeys)
	builder.WriteString(",\n")
	builder.WriteString("    ")
	builder.WriteString(overridesExpr)
	builder.WriteString(",\n")
	builder.WriteString("  )")
	return builder.String()
}

func buildTSMergeGeneratedOptionsExprFromGoValueTS(
	context string,
	value any,
	orderedKeys []string,
	overridesExpr string,
	resultType string,
) string {
	if strings.TrimSpace(overridesExpr) == "" {
		overridesExpr = "options"
	}
	if len(orderedKeys) == 0 {
		orderedKeys = goJSONFieldOrder(value)
	}
	defaults := mustTSLiteralObjectFromGoValue(context, value)
	if len(orderedKeys) > 0 {
		validateTSLiteralObjectKeys(context, defaults, orderedKeys)
	}
	return buildTSMergeGeneratedOptionsExprFromTSObject(defaults, orderedKeys, overridesExpr, resultType)
}

func buildTSMergeGeneratedOptionsExprFromGoValueWithExprOverridesTS(
	context string,
	value any,
	orderedKeys []string,
	overridesExpr string,
	exprOverrides map[string]string,
	resultType string,
) string {
	defaults := mustTSLiteralObjectFromGoValue(context, value)
	if len(orderedKeys) == 0 {
		orderedKeys = goJSONFieldOrder(value)
	}
	fillMissingTSLiteralObjectKeysWithNil(defaults, orderedKeys)
	if len(orderedKeys) > 0 {
		validateTSLiteralObjectKeys(context, defaults, orderedKeys)
	}
	for key, expr := range exprOverrides {
		if _, ok := defaults[key]; !ok {
			panic(fmt.Sprintf("%s is missing override property %q", context, key))
		}
		defaults[key] = tsRawExpr{Expr: expr}
	}
	return buildTSMergeGeneratedOptionsExprFromTSObject(defaults, orderedKeys, overridesExpr, resultType)
}

func fillMissingTSLiteralObjectKeysWithNil(object map[string]any, orderedKeys []string) {
	for _, key := range orderedKeys {
		if _, ok := object[key]; ok {
			continue
		}
		object[key] = nil
	}
}

func buildTSMergeGeneratedOptionsCreateBodyFromGoValueTS(
	context string,
	value any,
	orderedKeys []string,
	overridesExpr string,
	resultType string,
) string {
	var builder strings.Builder
	builder.WriteString("  return ")
	builder.WriteString(
		buildTSMergeGeneratedOptionsExprFromGoValueTS(
			context,
			value,
			orderedKeys,
			overridesExpr,
			resultType,
		),
	)
	builder.WriteString(";")
	return builder.String()
}

func renderTSObjectLiteralFromGoValue(context string, value any, orderedKeys []string) string {
	object := mustTSLiteralObjectFromGoValue(context, value)
	validateTSLiteralObjectKeys(context, object, orderedKeys)
	var builder strings.Builder
	writeTSObjectLiteral(&builder, "  ", object, orderedKeys)
	return builder.String()
}

func validateTSLiteralObjectKeys(context string, object map[string]any, orderedKeys []string) {
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
}

func EnumValuesForType(t reflect.Type) ([]EnumValue, bool, error) {
	values, ok, err := frontendBindingEnumValues(t)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
	}
	return append([]EnumValue(nil), values...), true, nil
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

func mustTSLiteralObjectFromGoValue(context string, value any) map[string]any {
	normalized := mustTSLiteralValueFromGoValue(context, value)
	normalized = mergeTSLiteralValueFromGoValue(context, value, normalized)
	object, ok := normalized.(map[string]any)
	if !ok {
		panic(context + ": Go default did not decode to an object")
	}
	return object
}

func mergeTSLiteralValueFromGoValue(context string, value any, normalized any) any {
	reflected := reflect.ValueOf(value)
	if !reflected.IsValid() {
		return normalized
	}
	return mergeTSLiteralValueFromReflectValue(context, reflected, normalized)
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
	return mergeTSLiteralObjectFromStructValue(context, value, object)
}

func mergeTSLiteralObjectFromStructValue(
	context string,
	value reflect.Value,
	object map[string]any,
) map[string]any {
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

func sortedTSLiteralObjectKeys(object map[string]any) []string {
	keys := make([]string, 0, len(object))
	for key := range object {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
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

func specialTypeDeclaration(
	converter *typeConverter,
	t reflect.Type,
) (TypeDeclaration, bool, error) {
	if declaration, ok, err := ownerProvidedTypeDeclaration(converter, t); ok || err != nil {
		return declaration, ok, err
	}
	if declaration, ok := specialMetadataTypeDeclaration(converter, t); ok {
		return declaration, true, nil
	}
	return TypeDeclaration{}, false, nil
}

func generatedSectionImplTypeForSectionName(sectionName string) (reflect.Type, bool) {
	for _, t := range DiscoveredConvertibleTypes() {
		name, ok := generatedSectionImplName(t)
		if ok && name == sectionName {
			return t, true
		}
	}
	return nil, false
}
