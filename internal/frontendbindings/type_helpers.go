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

	"setta/internal/projectstate"
	"setta/internal/stringenumvalues"
)

var timeType = reflect.TypeOf(time.Time{})
var rawJSONType = reflect.TypeOf(json.RawMessage{})
var discoveredWrapperTypeOverrides = DiscoveredWrapperTypeOverrides()

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
) string {
	if strings.TrimSpace(overridesExpr) == "" {
		overridesExpr = "options"
	}
	var builder strings.Builder
	builder.WriteString("mergeGeneratedOptions(\n")
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
	return buildTSMergeGeneratedOptionsExprFromTSObject(defaults, orderedKeys, overridesExpr)
}

func buildTSMergeGeneratedOptionsExprFromGoValueWithExprOverridesTS(
	context string,
	value any,
	orderedKeys []string,
	overridesExpr string,
	exprOverrides map[string]string,
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
	return buildTSMergeGeneratedOptionsExprFromTSObject(defaults, orderedKeys, overridesExpr)
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
) string {
	var builder strings.Builder
	builder.WriteString("  return ")
	builder.WriteString(
		buildTSMergeGeneratedOptionsExprFromGoValueTS(
			context,
			value,
			orderedKeys,
			overridesExpr,
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
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return nil, false, nil
	}

	converter := newTypeConverter()
	if values, ok := converter.stringEnums[t]; ok {
		return append([]EnumValue(nil), values...), true, nil
	}

	values, ok, err := stringenumvalues.Default().Values(t)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
	}

	enumValues := make([]EnumValue, 0, len(values))
	for _, value := range values {
		enumValues = append(enumValues, EnumValue{
			Name:  value.Name,
			Value: value.Value,
		})
	}
	return enumValues, true, nil
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
	object, ok := normalized.(map[string]any)
	if !ok {
		panic(context + ": Go default did not decode to an object")
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

func goJSONFieldOrderMap[T any](values map[string]T) map[string][]string {
	orders := make(map[string][]string, len(values))
	for key, value := range values {
		orders[key] = goJSONFieldOrder(value)
	}
	return orders
}

func goJSONFieldOrderMapAny(values map[string]any) map[string][]string {
	orders := make(map[string][]string, len(values))
	for key, value := range values {
		orders[key] = goJSONFieldOrder(value)
	}
	return orders
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
	if declaration, ok, err := generatedUserDefaultCodeParamCodeObjDeclaration(t); ok || err != nil {
		return declaration, ok, err
	}
	if declaration, ok, err := generatedUserDefaultSectionDeclaration(t); ok || err != nil {
		return declaration, ok, err
	}
	if declaration, ok, err := artifactTypeDeclaration(converter, t); ok || err != nil {
		return declaration, ok, err
	}
	if declaration, ok := specialMetadataTypeDeclaration(t); ok {
		return declaration, true, nil
	}
	return TypeDeclaration{}, false, nil
}

func generatedUserDefaultCodeParamCodeObjDeclaration(
	t reflect.Type,
) (TypeDeclaration, bool, error) {
	if t != reflect.TypeOf(UserDefaultCodeParamCodeObjImpl{}) {
		return TypeDeclaration{}, false, nil
	}
	properties, err := generatedUserDefaultCodeParamCodeObjProperties()
	if err != nil {
		return TypeDeclaration{}, false, err
	}
	return objectDeclarationWithGoBackedCreateExpr(
		"UserDefaultCodeParamCodeObjImpl",
		projectstate.FrontendDefaultCodeParamCodeObjImpl(),
		properties...,
	), true, nil
}

func generatedUserDefaultSectionDeclaration(
	t reflect.Type,
) (TypeDeclaration, bool, error) {
	spec, ok := generatedUserDefaultSectionSpecForType(t)
	if !ok {
		return TypeDeclaration{}, false, nil
	}
	properties, err := generatedUserDefaultSectionProperties(spec)
	if err != nil {
		return TypeDeclaration{}, false, err
	}
	return objectDeclarationWithGoBackedSectionDefaults(
		t.Name(),
		spec.SectionName,
		properties...,
	), true, nil
}

func generatedUserDefaultSectionProperties(
	spec generatedUserDefaultSectionSpec,
) ([]TypeProperty, error) {
	defaults, err := projectstate.FrontendUserDefaultSectionDefaults(spec.SectionName)
	if err != nil {
		return nil, err
	}
	registry, err := generatedUserDefaultSectionPropertyRegistry()
	if err != nil {
		return nil, err
	}
	propertyOrder := append(
		append([]string(nil), generatedUserDefaultSectionBasePropertyOrder...),
		spec.AdditionalPropertyOrder...,
	)
	remaining := make(map[string]struct{}, len(defaults))
	for name := range defaults {
		if _, ignored := generatedUserDefaultSectionIgnoredDefaultProperties[name]; ignored {
			continue
		}
		if _, ignored := spec.IgnoredDefaultProperties[name]; ignored {
			continue
		}
		remaining[name] = struct{}{}
	}
	properties := make([]TypeProperty, 0, len(propertyOrder))
	for _, name := range propertyOrder {
		if _, ok := defaults[name]; !ok {
			continue
		}
		property, err := generatedUserDefaultSectionProperty(name, registry, spec.PropertyTypeExprOverrides)
		if err != nil {
			return nil, fmt.Errorf("%s defaults %q: %w", spec.SectionName, name, err)
		}
		properties = append(properties, property)
		delete(remaining, name)
	}
	if len(remaining) > 0 {
		unhandled := make([]string, 0, len(remaining))
		for name := range remaining {
			unhandled = append(unhandled, name)
		}
		sort.Strings(unhandled)
		return nil, fmt.Errorf(
			"frontend user default section %s has unhandled properties: %s",
			spec.SectionName,
			strings.Join(unhandled, ", "),
		)
	}
	return properties, nil
}

func generatedUserDefaultSectionPropertyRegistry() (map[string]TypeProperty, error) {
	baseSectionDeclaration := generatedBaseSectionImplDeclaration()
	registry := make(map[string]TypeProperty, len(baseSectionDeclaration.Properties))
	for _, property := range baseSectionDeclaration.Properties {
		property.Optional = false
		registry[property.Name] = property
	}
	return registry, nil
}

func generatedUserDefaultCodeParamCodeObjProperties() ([]TypeProperty, error) {
	return []TypeProperty{
		{Name: "coreNameType", TypeExpr: "ParamNameType"},
		{Name: "coreNameEditable", TypeExpr: "boolean"},
		{Name: "typeAnnotation", TypeExpr: "string"},
		{Name: "defaultVal", TypeExpr: "string"},
		{Name: "value", TypeExpr: "string"},
	}, nil
}

func generatedUserDefaultSectionProperty(
	name string,
	registry map[string]TypeProperty,
	typeExprOverrides map[string]string,
) (TypeProperty, error) {
	property, ok := registry[name]
	if !ok {
		property = TypeProperty{Name: name}
	}
	if override, ok := typeExprOverrides[name]; ok {
		property.TypeExpr = override
	}
	if property.TypeExpr == "" {
		return TypeProperty{}, fmt.Errorf("missing TypeScript type metadata")
	}
	property.Name = name
	property.Optional = false
	return property, nil
}
