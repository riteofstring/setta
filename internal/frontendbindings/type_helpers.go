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
	"setta/internal/projectstate"
	"setta/internal/realtime"
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
	if declaration, ok, err := artifactTypeDeclaration(converter, t); ok || err != nil {
		return declaration, ok, err
	}
	if declaration, ok := specialMetadataTypeDeclaration(t); ok {
		if err := ensureSpecialDeclarationDependencies(converter, t); err != nil {
			return TypeDeclaration{}, false, err
		}
		return declaration, true, nil
	}
	return TypeDeclaration{}, false, nil
}

func ensureSpecialDeclarationDependencies(converter *typeConverter, t reflect.Type) error {
	var dependencies []reflect.Type
	switch t {
	case reflect.TypeOf(realtime.BaseDependencyKeyUnion{}):
		dependencies = []reflect.Type{
			reflect.TypeOf(realtime.DependencyKeyType("")),
			reflect.TypeOf(realtime.SectionDependencyKey{}),
			reflect.TypeOf(realtime.SectionParamDependencyKey{}),
		}
	case reflect.TypeOf(realtime.BaseDependencyValueUnion{}):
		dependencies = []reflect.Type{
			reflect.TypeOf(realtime.DependencyValueType("")),
			reflect.TypeOf(realtime.LiteralDependencyValue{}),
			reflect.TypeOf(realtime.FileReadDependencyValue{}),
			reflect.TypeOf(realtime.BinaryDependencyValue{}),
		}
	default:
		return nil
	}
	for _, dependency := range dependencies {
		if err := converter.ensureDeclaration(dependency); err != nil {
			return err
		}
	}
	return nil
}

func mustGeneratedUserDefaultDeclarations() []TypeDeclaration {
	sectionNames := generatedUserDefaultSectionNames()
	declarations := make([]TypeDeclaration, 0, len(sectionNames)+1)
	for _, sectionName := range sectionNames {
		declaration, err := generatedUserDefaultSectionDeclaration(sectionName)
		if err != nil {
			panic("load generated user default section declaration: " + err.Error())
		}
		declarations = append(declarations, declaration)
	}
	declaration, err := generatedUserDefaultCodeParamCodeObjDeclaration()
	if err != nil {
		panic("load generated code param user default declaration: " + err.Error())
	}
	declarations = append(declarations, declaration)
	return declarations
}

func generatedUserDefaultCodeParamCodeObjDeclaration() (TypeDeclaration, error) {
	properties, err := generatedUserDefaultCodeParamCodeObjProperties()
	if err != nil {
		return TypeDeclaration{}, err
	}
	return objectDeclarationWithGoBackedCreateExpr(
		"UserDefaultCodeParamCodeObjImpl",
		projectstate.FrontendDefaultCodeParamCodeObjImpl(),
		properties...,
	), nil
}

func generatedUserDefaultSectionDeclaration(sectionName string) (TypeDeclaration, error) {
	properties, err := generatedUserDefaultSectionProperties(sectionName)
	if err != nil {
		return TypeDeclaration{}, err
	}
	return objectDeclarationWithGoBackedSectionDefaults(
		generatedSectionImplDefaultTypeName(sectionName),
		sectionName,
		properties...,
	), nil
}

func generatedUserDefaultSectionNames() []string {
	names := []string{}
	for _, sectionName := range mustGeneratedEnumValues(
		reflect.TypeOf(projectstate.FrontendSectionType("")),
	) {
		if _, ok := generatedSectionImplTypeForSectionName(sectionName); !ok {
			continue
		}
		if _, err := projectstate.FrontendUserDefaultSectionDefaults(sectionName); err != nil {
			continue
		}
		names = append(names, sectionName)
	}
	return names
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
	remaining := generatedUserDefaultSectionRemainingDefaults(defaults, ignored)
	properties := make([]TypeProperty, 0, len(propertyOrder))
	for _, name := range propertyOrder {
		if generatedUserDefaultSectionPropertySkipped(name, ignored) {
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

func generatedUserDefaultSectionRemainingDefaults(
	defaults map[string]any,
	ignored map[string]struct{},
) map[string]struct{} {
	remaining := make(map[string]struct{}, len(defaults))
	for name := range defaults {
		if generatedUserDefaultSectionPropertySkipped(name, ignored) {
			continue
		}
		remaining[name] = struct{}{}
	}
	return remaining
}

func generatedUserDefaultSectionPropertySkipped(
	name string,
	ignored map[string]struct{},
) bool {
	if _, skip := generatedUserDefaultSectionIgnoredDefaultProperties[name]; skip {
		return true
	}
	_, skip := ignored[name]
	return skip
}

func generatedUserDefaultSectionPropertyRegistry(sectionName string) (
	map[string]TypeProperty,
	[]string,
	map[string]struct{},
	error,
) {
	implType, ok := generatedSectionImplTypeForSectionName(sectionName)
	if !ok {
		return nil, nil, nil, fmt.Errorf("unsupported generated user default section: %s", sectionName)
	}
	baseProperties, err := generatedUserDefaultReflectedProperties(
		reflect.TypeOf(projectstate.FrontendBaseSectionImpl{}),
	)
	if err != nil {
		return nil, nil, nil, err
	}
	properties, err := generatedUserDefaultReflectedProperties(implType)
	if err != nil {
		return nil, nil, nil, err
	}
	registry := make(map[string]TypeProperty, len(properties))
	propertyOrder := []string{}
	options := generatedUserDefaultSectionMetadata(sectionName)
	appendUniqueGeneratedUserDefaultSectionProperties(&propertyOrder, registry, baseProperties)
	appendUniqueGeneratedUserDefaultSectionProperties(&propertyOrder, registry, properties)
	return registry, propertyOrder, options.IgnoredProperties, nil
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
	converter := newTypeConverter()
	if spec, ok := ownerBackedReflectedObjectDeclarationSpec(t); ok {
		spec.DefaultValue = nil
		spec.HasCreateExpr = false
		spec.UseGenericCreateBody = false
		spec.CreateExprOverrides = nil
		declaration, err := converter.reflectedObjectDeclaration(t, spec)
		if err != nil {
			return nil, err
		}
		return declaration.Properties, nil
	}
	return converter.structProperties(t, nil, nil, nil)
}

func generatedUserDefaultCodeParamCodeObjProperties() ([]TypeProperty, error) {
	defaults := projectstate.FrontendDefaultCodeParamCodeObjImpl()
	registry, order, err := generatedUserDefaultCodeParamCodeObjPropertyRegistry()
	if err != nil {
		return nil, err
	}
	properties := make([]TypeProperty, 0, len(order))
	for _, name := range order {
		value, ok := defaults[name]
		if !ok {
			continue
		}
		property, err := generatedUserDefaultSectionProperty(name, value, registry)
		if err != nil {
			return nil, err
		}
		properties = append(properties, property)
	}
	return properties, nil
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

type generatedUserDefaultSectionMetadataOptions struct {
	IgnoredProperties map[string]struct{}
}

func generatedUserDefaultSectionMetadata(sectionName string) generatedUserDefaultSectionMetadataOptions {
	switch sectionName {
	case "Callable":
		return generatedUserDefaultSectionMetadataOptions{
			IgnoredProperties: reflectedIgnoredProperties(
				"callable",
				"codeObjVariantMap",
				"pinnedParams",
				"selectedParams",
				"ignoreTypeErrors",
			),
		}
	case "Dict":
		return generatedUserDefaultSectionMetadataOptions{
			IgnoredProperties: reflectedIgnoredProperties(
				"codeObjVariantMap",
				"pinnedParams",
				"selectedParams",
				"ignoreTypeErrors",
				"topLevelParamId",
				"jsonSourceMissing",
			),
		}
	case "Code":
		return generatedUserDefaultSectionMetadataOptions{
			IgnoredProperties: map[string]struct{}{},
		}
	case "Chat":
		return generatedUserDefaultSectionMetadataOptions{
			IgnoredProperties: map[string]struct{}{},
		}
	default:
		return generatedUserDefaultSectionMetadataOptions{
			IgnoredProperties: map[string]struct{}{},
		}
	}
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

func generatedUserDefaultCodeParamCodeObjPropertyRegistry() (map[string]TypeProperty, []string, error) {
	properties, err := generatedUserDefaultReflectedProperties(
		reflect.TypeOf(projectstate.FrontendCodeParamCodeObjImpl{}),
	)
	if err != nil {
		return nil, nil, err
	}
	registry := make(map[string]TypeProperty, len(properties))
	order := []string{}
	for _, property := range properties {
		switch property.Name {
		case "type", "id", "name", "description", "isPreset", "passingStyle":
			continue
		}
		property.Optional = false
		registry[property.Name] = property
		order = append(order, property.Name)
	}
	return registry, order, nil
}
