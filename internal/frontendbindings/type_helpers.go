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
	sectionName, ok := generatedUserDefaultSectionNameForType(t)
	if !ok {
		return TypeDeclaration{}, false, nil
	}
	properties, err := generatedUserDefaultSectionProperties(sectionName)
	if err != nil {
		return TypeDeclaration{}, false, err
	}
	return objectDeclarationWithGoBackedSectionDefaults(
		t.Name(),
		sectionName,
		properties...,
	), true, nil
}

func generatedUserDefaultSectionNameForType(t reflect.Type) (string, bool) {
	if t == nil || t.Kind() != reflect.Struct {
		return "", false
	}
	name := strings.TrimSpace(t.Name())
	if !strings.HasPrefix(name, "UserDefault") || !strings.HasSuffix(name, "SectionImpl") {
		return "", false
	}
	sectionName := strings.TrimSuffix(strings.TrimPrefix(name, "UserDefault"), "SectionImpl")
	if _, err := projectstate.FrontendUserDefaultSectionDefaults(sectionName); err != nil {
		return "", false
	}
	if _, ok := generatedSectionAliasSpecForSectionName(sectionName); !ok {
		return "", false
	}
	return sectionName, true
}

func generatedUserDefaultSectionProperties(sectionName string) ([]TypeProperty, error) {
	defaults, err := projectstate.FrontendUserDefaultSectionDefaults(sectionName)
	if err != nil {
		return nil, err
	}
	registry, propertyOrder, ignored, err := generatedUserDefaultSectionPropertyRegistry(sectionName)
	if err != nil {
		return nil, err
	}
	remaining := make(map[string]struct{}, len(defaults))
	for name := range defaults {
		if _, ignored := generatedUserDefaultSectionIgnoredDefaultProperties[name]; ignored {
			continue
		}
		if _, ignored := ignored[name]; ignored {
			continue
		}
		remaining[name] = struct{}{}
	}
	properties := make([]TypeProperty, 0, len(propertyOrder))
	for _, name := range propertyOrder {
		if _, skip := generatedUserDefaultSectionIgnoredDefaultProperties[name]; skip {
			continue
		}
		if _, skip := ignored[name]; skip {
			continue
		}
		value, ok := defaults[name]
		if !ok {
			continue
		}
		property, err := generatedUserDefaultSectionProperty(name, value, registry)
		if err != nil {
			return nil, fmt.Errorf("%s defaults %q: %w", sectionName, name, err)
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
			sectionName,
			strings.Join(unhandled, ", "),
		)
	}
	return properties, nil
}

func generatedUserDefaultSectionPropertyRegistry(sectionName string) (
	map[string]TypeProperty,
	[]string,
	map[string]struct{},
	error,
) {
	spec, ok := generatedSectionAliasSpecForSectionName(sectionName)
	if !ok {
		return nil, nil, nil, fmt.Errorf("unsupported generated user default section: %s", sectionName)
	}
	baseSectionDeclaration := generatedBaseSectionImplDeclaration()
	registry := make(map[string]TypeProperty, len(baseSectionDeclaration.Properties))
	for _, property := range baseSectionDeclaration.Properties {
		property.Optional = false
		registry[property.Name] = property
	}
	propertyOrder := append([]string(nil), generatedUserDefaultSectionBasePropertyOrder...)
	sectionProperties := generatedSectionAliasProperties(spec)
	if len(spec.UserDefaultPropertyOrder) > 0 {
		sectionProperties = generatedUserDefaultSectionOrderedProperties(sectionProperties, spec.UserDefaultPropertyOrder)
	}
	appendUniqueGeneratedUserDefaultSectionProperties(&propertyOrder, registry, sectionProperties)
	for _, source := range spec.UserDefaultReflectedSources {
		properties, err := generatedUserDefaultReflectedProperties(source)
		if err != nil {
			return nil, nil, nil, err
		}
		appendUniqueGeneratedUserDefaultSectionProperties(&propertyOrder, registry, properties)
	}
	return registry, propertyOrder, spec.UserDefaultIgnoredProperties, nil
}

func generatedUserDefaultSectionOrderedProperties(
	properties []TypeProperty,
	order []string,
) []TypeProperty {
	if len(order) == 0 {
		return properties
	}
	byName := make(map[string]TypeProperty, len(properties))
	for _, property := range properties {
		byName[property.Name] = property
	}
	ordered := make([]TypeProperty, 0, len(properties))
	seen := make(map[string]struct{}, len(properties))
	for _, name := range order {
		property, ok := byName[name]
		if !ok {
			continue
		}
		ordered = append(ordered, property)
		seen[name] = struct{}{}
	}
	for _, property := range properties {
		if _, ok := seen[property.Name]; ok {
			continue
		}
		ordered = append(ordered, property)
	}
	return ordered
}

func appendUniqueGeneratedUserDefaultSectionProperties(
	order *[]string,
	registry map[string]TypeProperty,
	properties []TypeProperty,
) {
	seen := make(map[string]struct{}, len(*order))
	for _, name := range *order {
		seen[name] = struct{}{}
	}
	for _, property := range properties {
		if property.Name == "type" {
			continue
		}
		property.Optional = false
		registry[property.Name] = property
		if _, ok := seen[property.Name]; ok {
			continue
		}
		*order = append(*order, property.Name)
		seen[property.Name] = struct{}{}
	}
}

func generatedUserDefaultReflectedProperties(t reflect.Type) ([]TypeProperty, error) {
	spec, ok := ownerBackedReflectedObjectDeclarationSpec(t)
	if !ok {
		return nil, fmt.Errorf("missing reflected object declaration spec for %s", t)
	}
	converter := newTypeConverter()
	declaration, err := converter.reflectedObjectDeclaration(t, spec)
	if err != nil {
		return nil, err
	}
	return declaration.Properties, nil
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
	defaultValue any,
	registry map[string]TypeProperty,
) (TypeProperty, error) {
	property, ok := registry[name]
	if !ok {
		property = TypeProperty{Name: name}
	}
	if property.TypeExpr == "" {
		return TypeProperty{}, fmt.Errorf("missing TypeScript type metadata")
	}
	property.Name = name
	property.Optional = false
	property.TypeExpr = generatedUserDefaultSectionPropertyTypeExpr(property.TypeExpr, defaultValue)
	return property, nil
}

func generatedUserDefaultSectionPropertyTypeExpr(typeExpr string, defaultValue any) string {
	if defaultValue != nil || strings.Contains(typeExpr, "null") {
		return typeExpr
	}
	return typeExpr + " | null"
}
