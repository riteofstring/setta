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

	"setta/internal/agentruns"
	"setta/internal/artifacts"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
	"setta/internal/stringenumvalues"
)

var timeType = reflect.TypeOf(time.Time{})
var rawJSONType = reflect.TypeOf(json.RawMessage{})
var discoveredWrapperTypeOverrides = DiscoveredWrapperTypeOverrides()

// setta-go-type-discovery: skip
type TypeDeclaration struct {
	Name            string
	Kind            string
	Alias           string
	TypeParams      string
	Properties      []TypeProperty
	EnumValues      []EnumValue
	CreateExpr      string
	CreateBody      string
	Exported        bool
	SetElementType  string
	SetMembers      []string
	GuardInputType  string
	GuardReturnType string
	GuardSetName    string
	FunctionParams  []TypeProperty
	FunctionBody    string
	FunctionReturn  string
	ConstExpr       string
}

// setta-go-type-discovery: skip
type EnumValue struct {
	Name  string
	Value string
}

// setta-go-type-discovery: skip
type TypeProperty struct {
	Name         string
	TypeExpr     string
	Optional     bool
	DefaultValue string
}

func objectDeclaration(name string, properties ...TypeProperty) TypeDeclaration {
	return TypeDeclaration{
		Name:       name,
		Kind:       "object",
		Properties: properties,
	}
}

func objectDeclarationWithCreateExpr(name string, createExpr string, properties ...TypeProperty) TypeDeclaration {
	declaration := objectDeclaration(name, properties...)
	declaration.CreateExpr = createExpr
	return declaration
}

func objectDeclarationWithCreateBody(name string, createBody string, properties ...TypeProperty) TypeDeclaration {
	declaration := objectDeclaration(name, properties...)
	declaration.CreateBody = createBody
	return declaration
}

func aliasDeclaration(name string, alias string) TypeDeclaration {
	return TypeDeclaration{
		Name:  name,
		Kind:  "alias",
		Alias: alias,
	}
}

func aliasDeclarationWithCreateExpr(name string, alias string, createExpr string) TypeDeclaration {
	declaration := aliasDeclaration(name, alias)
	declaration.CreateExpr = createExpr
	return declaration
}

func localAliasDeclaration(name string, typeParams string, alias string) TypeDeclaration {
	return TypeDeclaration{
		Name:       name,
		Kind:       "local_alias",
		TypeParams: typeParams,
		Alias:      alias,
	}
}

func setDeclaration(name string, elementType string, exported bool, members ...string) TypeDeclaration {
	return TypeDeclaration{
		Name:           name,
		Kind:           "set",
		Exported:       exported,
		SetElementType: elementType,
		SetMembers:     append([]string(nil), members...),
	}
}

func typeGuardDeclaration(name string, inputType string, returnType string, setName string) TypeDeclaration {
	return TypeDeclaration{
		Name:            name,
		Kind:            "type_guard",
		GuardInputType:  inputType,
		GuardReturnType: returnType,
		GuardSetName:    setName,
	}
}

func functionDeclaration(
	name string,
	exported bool,
	returnType string,
	body string,
	params ...TypeProperty,
) TypeDeclaration {
	return TypeDeclaration{
		Name:           name,
		Kind:           "function",
		Exported:       exported,
		FunctionParams: append([]TypeProperty(nil), params...),
		FunctionReturn: returnType,
		FunctionBody:   strings.TrimRight(body, "\n"),
	}
}

func exportedFunctionDeclaration(
	name string,
	returnType string,
	body string,
	params ...TypeProperty,
) TypeDeclaration {
	return functionDeclaration(name, true, returnType, body, params...)
}

func constDeclaration(name string, exported bool, expr string) TypeDeclaration {
	return TypeDeclaration{
		Name:      name,
		Kind:      "const",
		Exported:  exported,
		ConstExpr: expr,
	}
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

type metaControlSizingPolicyTypeEntryDefault struct {
	MinHeight      float64 `json:"minHeight"`
	MinWidth       float64 `json:"minWidth"`
	SizeModeHeight string  `json:"sizeModeHeight"`
	SizeModeWidth  string  `json:"sizeModeWidth"`
}

type sectionSizingPolicyTypeEntryDefault struct {
	MinHeight float64 `json:"minHeight"`
	MaxHeight float64 `json:"maxHeight"`
	MinWidth  float64 `json:"minWidth"`
	MaxWidth  float64 `json:"maxWidth"`
}

type sectionSizingPolicyCallableTypeEntryDefault struct {
	sectionSizingPolicyTypeEntryDefault
	HideSearchMinHeight float64 `json:"hideSearchMinHeight"`
	HideParamsMinHeight float64 `json:"hideParamsMinHeight"`
}

var defaultMetaControlSizingPolicyByType = map[string]metaControlSizingPolicyTypeEntryDefault{
	"ButtonParam":      {MinHeight: 32, MinWidth: 200, SizeModeHeight: "any", SizeModeWidth: "any"},
	"CodeCallable":     {MinHeight: 32, MinWidth: 200, SizeModeHeight: "any", SizeModeWidth: "any"},
	"CodeParam":        {MinHeight: 32, MinWidth: 200, SizeModeHeight: "any", SizeModeWidth: "any"},
	"ColorPickerParam": {MinHeight: 32, MinWidth: 200, SizeModeHeight: "any", SizeModeWidth: "any"},
	"DateParam":        {MinHeight: 32, MinWidth: 200, SizeModeHeight: "any", SizeModeWidth: "any"},
	"DropdownParam":    {MinHeight: 32, MinWidth: 200, SizeModeHeight: "auto_only", SizeModeWidth: "any"},
	"DropzoneParam":    {MinHeight: 120, MinWidth: 240, SizeModeHeight: "any", SizeModeWidth: "any"},
	"NestedParam":      {MinHeight: 32, MinWidth: 200, SizeModeHeight: "any", SizeModeWidth: "any"},
	"PasswordParam":    {MinHeight: 32, MinWidth: 200, SizeModeHeight: "auto_only", SizeModeWidth: "any"},
	"RotaryParam":      {MinHeight: 32, MinWidth: 200, SizeModeHeight: "any", SizeModeWidth: "any"},
	"SliderParam":      {MinHeight: 32, MinWidth: 200, SizeModeHeight: "auto_only", SizeModeWidth: "any"},
	"SwitchParam":      {MinHeight: 32, MinWidth: 200, SizeModeHeight: "any", SizeModeWidth: "any"},
	"TextAreaParam":    {MinHeight: 80, MinWidth: 200, SizeModeHeight: "any", SizeModeWidth: "any"},
	"TextParam":        {MinHeight: 32, MinWidth: 200, SizeModeHeight: "any", SizeModeWidth: "any"},
	"TimeParam":        {MinHeight: 32, MinWidth: 200, SizeModeHeight: "any", SizeModeWidth: "any"},
}

var defaultSectionSizingPolicyByType = map[string]any{
	"Browser":           sectionSizingPolicyTypeEntryDefault{MinHeight: 250, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"Callable":          sectionSizingPolicyCallableTypeEntryDefault{sectionSizingPolicyTypeEntryDefault: sectionSizingPolicyTypeEntryDefault{MinHeight: 104, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000}, HideSearchMinHeight: 42, HideParamsMinHeight: 90},
	"Chart":             sectionSizingPolicyTypeEntryDefault{MinHeight: 300, MaxHeight: 100000, MinWidth: 300, MaxWidth: 100000},
	"Chat":              sectionSizingPolicyTypeEntryDefault{MinHeight: 200, MaxHeight: 100000, MinWidth: 400, MaxWidth: 100000},
	"Code":              sectionSizingPolicyTypeEntryDefault{MinHeight: 58.2, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"Dict":              sectionSizingPolicyTypeEntryDefault{MinHeight: 78, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"Draw":              sectionSizingPolicyTypeEntryDefault{MinHeight: 100, MaxHeight: 100000, MinWidth: 402, MaxWidth: 100000},
	"GenPythonCode":     sectionSizingPolicyTypeEntryDefault{MinHeight: 0, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"GenPythonMetadata": sectionSizingPolicyTypeEntryDefault{MinHeight: 0, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"GlobalVariables":   sectionSizingPolicyTypeEntryDefault{MinHeight: 78, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"Group":             sectionSizingPolicyTypeEntryDefault{MinHeight: 0, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"IFrame":            sectionSizingPolicyTypeEntryDefault{MinHeight: 0, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"Image":             sectionSizingPolicyTypeEntryDefault{MinHeight: 100, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"ListRoot":          sectionSizingPolicyTypeEntryDefault{MinHeight: 50, MaxHeight: 50, MinWidth: 200, MaxWidth: 100000},
	"MetaControl":       sectionSizingPolicyTypeEntryDefault{MinHeight: 10, MaxHeight: 100000, MinWidth: 100, MaxWidth: 100000},
	"Plugin":            sectionSizingPolicyTypeEntryDefault{MinHeight: 80, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"Prompt":            sectionSizingPolicyTypeEntryDefault{MinHeight: 150, MaxHeight: 100000, MinWidth: 300, MaxWidth: 100000},
	"Social":            sectionSizingPolicyTypeEntryDefault{MinHeight: 50, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"Spreadsheet":       sectionSizingPolicyTypeEntryDefault{MinHeight: 260, MaxHeight: 100000, MinWidth: 420, MaxWidth: 100000},
	"StateMachineEnd":   sectionSizingPolicyTypeEntryDefault{MinHeight: 96, MaxHeight: 100000, MinWidth: 240, MaxWidth: 100000},
	"StateMachineGate":  sectionSizingPolicyTypeEntryDefault{MinHeight: 120, MaxHeight: 100000, MinWidth: 240, MaxWidth: 100000},
	"StateMachineStart": sectionSizingPolicyTypeEntryDefault{MinHeight: 96, MaxHeight: 100000, MinWidth: 240, MaxWidth: 100000},
	"TaskBoard":         sectionSizingPolicyTypeEntryDefault{MinHeight: 240, MaxHeight: 100000, MinWidth: 360, MaxWidth: 100000},
	"Terminal":          sectionSizingPolicyTypeEntryDefault{MinHeight: 100, MaxHeight: 100000, MinWidth: 200, MaxWidth: 100000},
	"TextBlock":         sectionSizingPolicyTypeEntryDefault{MinHeight: 49, MaxHeight: 100000, MinWidth: 100, MaxWidth: 100000},
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

func metaControlSizingPolicyByTypeProperties() []TypeProperty {
	return []TypeProperty{
		{Name: "CodeCallable", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "CodeParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "TextParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "DateParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "TimeParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "ButtonParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "SliderParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "RotaryParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "SwitchParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "ColorPickerParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "DropdownParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "PasswordParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "TextAreaParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "DropzoneParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
		{Name: "NestedParam", TypeExpr: "MetaControlSizingPolicyTypeEntry"},
	}
}

func sectionSizingPolicyByTypeProperties() []TypeProperty {
	return []TypeProperty{
		{Name: "Callable", TypeExpr: "SectionSizingPolicyCallableTypeEntry"},
		{Name: "Dict", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "ListRoot", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Group", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "StateMachineStart", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "StateMachineGate", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "StateMachineEnd", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Image", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Chart", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Draw", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Prompt", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "TextBlock", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "MetaControl", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Social", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "GlobalVariables", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Code", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "GenPythonCode", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "GenPythonMetadata", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Terminal", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "IFrame", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Chat", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Browser", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Plugin", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "TaskBoard", TypeExpr: "SectionSizingPolicyTypeEntry"},
		{Name: "Spreadsheet", TypeExpr: "SectionSizingPolicyTypeEntry"},
	}
}

func buildTSNestedObjectMergeCreateBodyTS(
	rootGeneric string,
	nestedGeneric string,
	defaults map[string]any,
	orderedKeys []string,
	nestedFieldOrders map[string][]string,
) string {
	if len(orderedKeys) == 0 {
		orderedKeys = sortedTSLiteralObjectKeys(defaults)
	}
	var builder strings.Builder
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions")
	if rootGeneric != "" {
		builder.WriteString("<")
		builder.WriteString(rootGeneric)
		builder.WriteString(">")
	}
	builder.WriteString("(\n")
	builder.WriteString("      ")
	writeTSObjectLiteral(&builder, "      ", defaults, orderedKeys)
	builder.WriteString(",\n")
	builder.WriteString("      options,\n")
	builder.WriteString("    ),\n")
	for _, key := range orderedKeys {
		rawEntry, ok := defaults[key]
		if !ok {
			panic("missing nested TypeScript default entry: " + key)
		}
		entryObject, ok := rawEntry.(map[string]any)
		if !ok {
			panic("nested TypeScript default entry is not an object: " + key)
		}
		builder.WriteString("    ")
		builder.WriteString(key)
		builder.WriteString(": mergeGeneratedOptions")
		if nestedGeneric != "" {
			builder.WriteString("<")
			builder.WriteString(nestedGeneric)
			builder.WriteString(">")
		}
		builder.WriteString("(\n")
		builder.WriteString("      ")
		writeTSObjectLiteral(&builder, "      ", entryObject, nestedFieldOrders[key])
		builder.WriteString(",\n")
		builder.WriteString("      options.")
		builder.WriteString(key)
		builder.WriteString(" ?? {},\n")
		builder.WriteString("    ),\n")
	}
	builder.WriteString("  };")
	return builder.String()
}

func buildMetaControlSizingPolicyByTypeCreateBodyTS() string {
	return buildTSNestedObjectMergeCreateBodyTS(
		"MetaControlSizingPolicyByType",
		"MetaControlSizingPolicyTypeEntry",
		mustTSLiteralObjectFromGoValue(
			"meta control sizing policy defaults",
			defaultMetaControlSizingPolicyByType,
		),
		orderedTypePropertyNames(metaControlSizingPolicyByTypeProperties()),
		goJSONFieldOrderMap(defaultMetaControlSizingPolicyByType),
	)
}

func buildSectionSizingPolicyByTypeCreateBodyTS() string {
	return buildTSNestedObjectMergeCreateBodyTS(
		"",
		"",
		mustTSLiteralObjectFromGoValue(
			"section sizing policy defaults",
			defaultSectionSizingPolicyByType,
		),
		orderedTypePropertyNames(sectionSizingPolicyByTypeProperties()),
		goJSONFieldOrderMapAny(defaultSectionSizingPolicyByType),
	)
}

func buildSectionSizingPolicyCreateBodyTS() string {
	var builder strings.Builder
	builder.WriteString("  const byType = createSectionSizingPolicyByType(options.byType ?? {});\n")
	builder.WriteString("  const metaControlByType = createMetaControlSizingPolicyByType(\n")
	builder.WriteString("    options.metaControlByType ?? {},\n")
	builder.WriteString("  );\n")
	builder.WriteString("  const globals = createSectionSizingPolicyGlobals(options.globals ?? {});\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions(\n")
	builder.WriteString("      {\n")
	builder.WriteString("        byType,\n")
	builder.WriteString("        metaControlByType,\n")
	builder.WriteString("        globals,\n")
	builder.WriteString("      },\n")
	builder.WriteString("      options,\n")
	builder.WriteString("    ),\n")
	builder.WriteString("    byType,\n")
	builder.WriteString("    metaControlByType,\n")
	builder.WriteString("    globals,\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildSettingsStateCreateBodyTS() string {
	defaults, err := settingsstate.DefaultDocument()
	if err != nil {
		panic("load settings defaults: " + err.Error())
	}
	rawLanguageServer, ok := defaults["languageServer"]
	if !ok {
		panic("settings defaults missing languageServer")
	}
	languageServerDefaults, ok := rawLanguageServer.(map[string]any)
	if !ok {
		panic("settings defaults languageServer is not an object")
	}

	var builder strings.Builder
	builder.WriteString("  const shortcuts = createSettingsShortcuts(options.shortcuts ?? {});\n")
	builder.WriteString("  const gui = createSettingsGUI(options.gui ?? {});\n")
	builder.WriteString("  const backend = createSettingsBackend(options.backend ?? {});\n")
	builder.WriteString("  const sectionSizingPolicy = createSectionSizingPolicy(\n")
	builder.WriteString("    options.sectionSizingPolicy ?? {},\n")
	builder.WriteString("  );\n")
	builder.WriteString("  const defaults: SettingsState = {\n")
	builder.WriteString("    shortcuts,\n")
	builder.WriteString("    gui,\n")
	builder.WriteString("    backend,\n")
	builder.WriteString("    sectionSizingPolicy,\n")
	builder.WriteString("    languageServer: ")
	writeTSObjectLiteral(&builder, "    ", languageServerDefaults, nil)
	builder.WriteString(",\n")
	builder.WriteString("  };\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions(defaults, options),\n")
	builder.WriteString("    shortcuts,\n")
	builder.WriteString("    gui,\n")
	builder.WriteString("    backend,\n")
	builder.WriteString("    sectionSizingPolicy,\n")
	builder.WriteString("    languageServer: cloneGeneratedValue(\n")
	builder.WriteString("      options.languageServer ?? defaults.languageServer,\n")
	builder.WriteString("    ),\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildProjectCodegenPythonTargetCreateBodyTS() string {
	defaultTarget := projectview.FrontendDefaultProjectCodegenPythonTarget()
	var builder strings.Builder
	builder.WriteString("  const sectionPolicy = createSectionCodegenPolicy(options.sectionPolicy ?? {});\n")
	builder.WriteString("  const codeObjValuePolicy = createCodeObjValuePolicy(\n")
	builder.WriteString("    options.codeObjValuePolicy ?? {},\n")
	builder.WriteString("  );\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...")
	builder.WriteString(buildTSMergeGeneratedOptionsExprFromGoValueWithExprOverridesTS(
		"default project codegen python target",
		defaultTarget,
		goJSONFieldOrder(defaultTarget),
		"options",
		map[string]string{
			"sectionPolicy":      "sectionPolicy",
			"codeObjValuePolicy": "codeObjValuePolicy",
		},
	))
	builder.WriteString(",\n")
	builder.WriteString("    language: ")
	writeTSLiteralValue(&builder, "    ", string(defaultTarget.Language))
	builder.WriteString(",\n")
	builder.WriteString("    sectionPolicy,\n")
	builder.WriteString("    codeObjValuePolicy,\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildSectionCodegenPolicyCreateBodyTS() string {
	defaultsLiteral := renderTSObjectLiteralFromGoValue(
		"frontend default python section codegen policy",
		projectview.FrontendDefaultPythonSectionCodegenPolicy(),
		[]string{
			"allowlist",
			"metaControlAllowlist",
			"exclude",
			"typePolicies",
			"sectionOverrides",
		},
	)
	var builder strings.Builder
	builder.WriteString("  const defaults: SectionCodegenPolicy = ")
	builder.WriteString(defaultsLiteral)
	builder.WriteString(";\n")
	builder.WriteString("  const typePolicies = Object.fromEntries(\n")
	builder.WriteString("    Object.entries({\n")
	builder.WriteString("      ...defaults.typePolicies,\n")
	builder.WriteString("      ...(options.typePolicies ?? {}),\n")
	builder.WriteString("    }).map(([sectionType, policy]) => [\n")
	builder.WriteString("      sectionType,\n")
	builder.WriteString("      createSectionTypeCodegenPolicy(policy),\n")
	builder.WriteString("    ]),\n")
	builder.WriteString("  ) as Record<SectionType, SectionTypeCodegenPolicy>;\n")
	builder.WriteString("  const sectionOverrides = Object.fromEntries(\n")
	builder.WriteString("    Object.entries({\n")
	builder.WriteString("      ...defaults.sectionOverrides,\n")
	builder.WriteString("      ...(options.sectionOverrides ?? {}),\n")
	builder.WriteString("    }).map(([sectionId, override]) => [\n")
	builder.WriteString("      sectionId,\n")
	builder.WriteString("      createSectionCodegenOverride(override),\n")
	builder.WriteString("    ]),\n")
	builder.WriteString("  ) as Record<string, SectionCodegenOverride>;\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions(defaults, options),\n")
	builder.WriteString("    allowlist:\n")
	builder.WriteString("      options.allowlist === null\n")
	builder.WriteString("        ? null\n")
	builder.WriteString("        : [...(options.allowlist ?? defaults.allowlist ?? [])],\n")
	builder.WriteString("    metaControlAllowlist:\n")
	builder.WriteString("      options.metaControlAllowlist === null\n")
	builder.WriteString("        ? null\n")
	builder.WriteString("        : [\n")
	builder.WriteString("            ...(options.metaControlAllowlist ??\n")
	builder.WriteString("              defaults.metaControlAllowlist ??\n")
	builder.WriteString("              []),\n")
	builder.WriteString("          ],\n")
	builder.WriteString("    exclude: [...(options.exclude ?? defaults.exclude)],\n")
	builder.WriteString("    typePolicies,\n")
	builder.WriteString("    sectionOverrides,\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildCodeObjValuePolicyCreateBodyTS() string {
	defaultsLiteral := renderTSObjectLiteralFromGoValue(
		"frontend default python code object value policy",
		projectview.FrontendDefaultPythonCodeObjValuePolicy(),
		[]string{"typePolicies", "codeObjOverrides"},
	)
	var builder strings.Builder
	builder.WriteString("  const defaults: CodeObjValuePolicy = ")
	builder.WriteString(defaultsLiteral)
	builder.WriteString(";\n")
	builder.WriteString("  const typePolicies = Object.fromEntries(\n")
	builder.WriteString("    Object.entries({\n")
	builder.WriteString("      ...defaults.typePolicies,\n")
	builder.WriteString("      ...(options.typePolicies ?? {}),\n")
	builder.WriteString("    }).map(([codeObjType, policy]) => [\n")
	builder.WriteString("      codeObjType,\n")
	builder.WriteString("      createCodeObjTypeValuePolicy(policy),\n")
	builder.WriteString("    ]),\n")
	builder.WriteString("  ) as Record<CodeObjType, CodeObjTypeValuePolicy>;\n")
	builder.WriteString("  const codeObjOverrides = Object.fromEntries(\n")
	builder.WriteString("    Object.entries({\n")
	builder.WriteString("      ...defaults.codeObjOverrides,\n")
	builder.WriteString("      ...(options.codeObjOverrides ?? {}),\n")
	builder.WriteString("    }).map(([codeObjId, override]) => [\n")
	builder.WriteString("      codeObjId,\n")
	builder.WriteString("      createCodeObjValueOverride(override),\n")
	builder.WriteString("    ]),\n")
	builder.WriteString("  ) as Record<string, CodeObjValueOverride>;\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions(defaults, options),\n")
	builder.WriteString("    typePolicies,\n")
	builder.WriteString("    codeObjOverrides,\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildEngineConfigCreateBodyTS() string {
	defaultConfig := agentruns.EngineConfig{
		EngineType: agentruns.EngineTypeSettaLLM,
	}
	var builder strings.Builder
	builder.WriteString("  const defaults = createEngineConfigDefaults();\n")
	builder.WriteString("  const runtimeSupport = createEngineRuntimeSupport();\n")
	builder.WriteString("  const mergedDefaults = mergeGeneratedOptions(defaults, options.defaults ?? {});\n")
	builder.WriteString("  const mergedRuntimeSupport =\n")
	builder.WriteString("    options.runtimeSupport === undefined || options.runtimeSupport === null\n")
	builder.WriteString("      ? null\n")
	builder.WriteString("      : mergeGeneratedOptions(runtimeSupport, options.runtimeSupport);\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...")
	builder.WriteString(buildTSMergeGeneratedOptionsExprFromGoValueWithExprOverridesTS(
		"frontend default engine config",
		defaultConfig,
		goJSONFieldOrder(defaultConfig),
		"options",
		map[string]string{
			"defaults": "defaults",
		},
	))
	builder.WriteString(",\n")
	builder.WriteString("    defaults: mergedDefaults,\n")
	builder.WriteString("    runtimeSupport: mergedRuntimeSupport,\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildGeneratedFactoryReturnBodyTS(
	objectEntries []string,
	overridesExpr string,
	prelude string,
) string {
	var builder strings.Builder
	trimmedPrelude := strings.TrimRight(prelude, "\n")
	if trimmedPrelude != "" {
		builder.WriteString(trimmedPrelude)
		builder.WriteString("\n")
	}
	builder.WriteString("  return mergeGeneratedOptions(\n")
	builder.WriteString("    {\n")
	for _, entry := range objectEntries {
		builder.WriteString("      ")
		builder.WriteString(entry)
		builder.WriteString(",\n")
	}
	builder.WriteString("    },\n")
	builder.WriteString("    ")
	builder.WriteString(overridesExpr)
	builder.WriteString(",\n")
	builder.WriteString("  );")
	return builder.String()
}

func buildResolvedGeneratedFactoryBodyTS(
	defaultType string,
	implType string,
	objectEntries []string,
	prelude string,
	overridesExpr string,
) string {
	if overridesExpr == "" {
		overridesExpr = "resolved.overrides"
	}
	var builder strings.Builder
	builder.WriteString("  const resolved = resolveGeneratedFactoryInputs<\n")
	builder.WriteString("    ")
	builder.WriteString(defaultType)
	builder.WriteString(",\n")
	builder.WriteString("    ")
	builder.WriteString(implType)
	builder.WriteString("\n")
	builder.WriteString("  >(create")
	builder.WriteString(defaultType)
	builder.WriteString("(), defaultsOrOverrides, overrides);\n")
	builder.WriteString(buildGeneratedFactoryReturnBodyTS(objectEntries, overridesExpr, prelude))
	return builder.String()
}

func buildDirectGeneratedFactoryBodyTS(
	objectEntries []string,
	overridesExpr string,
	prelude string,
) string {
	return buildGeneratedFactoryReturnBodyTS(objectEntries, overridesExpr, prelude)
}

func objectDeclarationWithGoBackedSectionDefaults(
	name string,
	implType string,
	properties ...TypeProperty,
) TypeDeclaration {
	return objectDeclarationWithCreateExpr(
		name,
		buildGoBackedSectionDefaultsCreateExprTS(implType, properties),
		properties...,
	)
}

func objectDeclarationWithGoBackedCreateExpr(
	name string,
	defaultValue any,
	properties ...TypeProperty,
) TypeDeclaration {
	return objectDeclarationWithCreateExpr(
		name,
		buildGoBackedCreateExprTS("frontend create defaults "+name, defaultValue, properties),
		properties...,
	)
}

func buildGoBackedSectionDefaultsCreateExprTS(implType string, properties []TypeProperty) string {
	defaults, err := projectstate.FrontendUserDefaultSectionDefaults(implType)
	if err != nil {
		panic("load frontend user default section defaults: " + err.Error())
	}
	return buildGoBackedCreateExprTS(
		"frontend user default section defaults "+implType,
		defaults,
		properties,
	)
}

func buildGoBackedCreateExprTS(context string, value any, properties []TypeProperty) string {
	filteredDefaults := filterObjectByTypeProperties(
		context,
		mustTSLiteralObjectFromGoValue(context, value),
		properties,
	)
	var builder strings.Builder
	builder.WriteString("mergeGeneratedOptions(\n")
	writeTSObjectLiteral(&builder, "    ", filteredDefaults, orderedTypePropertyNames(properties))
	builder.WriteString(",\n")
	builder.WriteString("    options,\n")
	builder.WriteString("  )")
	return builder.String()
}

func buildGoBackedCreateExprWithExprOverridesTS(
	context string,
	value any,
	properties []TypeProperty,
	exprOverrides map[string]string,
) string {
	filteredDefaults := filterObjectByTypeProperties(
		context,
		mustTSLiteralObjectFromGoValue(context, value),
		properties,
	)
	return buildTSMergeGeneratedOptionsExprFromGoValueWithExprOverridesTS(
		context,
		filteredDefaults,
		orderedTypePropertyNames(properties),
		"options",
		exprOverrides,
	)
}

func filterObjectByTypeProperties(
	context string,
	object map[string]any,
	properties []TypeProperty,
) map[string]any {
	filtered := make(map[string]any, len(properties))
	for _, property := range properties {
		value, ok := object[property.Name]
		if !ok {
			if property.Optional {
				continue
			}
			panic(fmt.Sprintf("%s is missing property %q", context, property.Name))
		}
		filtered[property.Name] = value
	}
	return filtered
}

func defaultsOrOverridesTypeProperty(defaultType string, implType string) TypeProperty {
	return TypeProperty{
		Name:         "defaultsOrOverrides",
		TypeExpr:     "Partial<" + defaultType + "> | Partial<" + implType + ">",
		DefaultValue: "{}",
	}
}

func optionalOverrideTypeProperty(implType string) TypeProperty {
	return TypeProperty{Name: "overrides", TypeExpr: "Partial<" + implType + ">", Optional: true}
}

func defaultsTypeProperty(defaultType string) TypeProperty {
	return TypeProperty{Name: "defaults", TypeExpr: defaultType}
}

func overrideTypeProperty(implType string) TypeProperty {
	return TypeProperty{Name: "overrides", TypeExpr: "Partial<" + implType + ">", DefaultValue: "{}"}
}

func buildSettingsSectionCreateExprTS(sectionName string, properties []TypeProperty) string {
	defaults, err := settingsstate.DefaultDocument()
	if err != nil {
		panic("load settings defaults: " + err.Error())
	}
	rawSection, ok := defaults[sectionName]
	if !ok {
		panic("missing settings defaults section: " + sectionName)
	}
	sectionObject, ok := rawSection.(map[string]any)
	if !ok {
		panic("settings defaults section is not an object: " + sectionName)
	}
	if err := validateRenderedSettingsSection(sectionName, sectionObject, properties); err != nil {
		panic(err.Error())
	}

	var builder strings.Builder
	builder.WriteString("mergeGeneratedOptions(\n")
	writeTSObjectLiteral(&builder, "    ", sectionObject, orderedTypePropertyNames(properties))
	builder.WriteString(",\n")
	builder.WriteString("    options,\n")
	builder.WriteString("  )")
	return builder.String()
}

func validateRenderedSettingsSection(sectionName string, object map[string]any, properties []TypeProperty) error {
	expected := map[string]struct{}{}
	for _, property := range properties {
		expected[property.Name] = struct{}{}
		if _, ok := object[property.Name]; !ok {
			return fmt.Errorf(
				"settings defaults section %q is missing property %q",
				sectionName,
				property.Name,
			)
		}
	}
	for key := range object {
		if _, ok := expected[key]; ok {
			continue
		}
		return fmt.Errorf(
			"settings defaults section %q has unexpected property %q",
			sectionName,
			key,
		)
	}
	return nil
}

func orderedTypePropertyNames(properties []TypeProperty) []string {
	names := make([]string, 0, len(properties))
	for _, property := range properties {
		names = append(names, property.Name)
	}
	return names
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

func settingsShortcutsTypeProperties() []TypeProperty {
	return []TypeProperty{
		{Name: "newCardShortcut", TypeExpr: "string"},
		{Name: "newGroupShortcut", TypeExpr: "string"},
		{Name: "typeCheckShortcut", TypeExpr: "string"},
		{Name: "newProjectConfigShortcut", TypeExpr: "string"},
		{Name: "undoShortcut", TypeExpr: "string"},
		{Name: "redoShortcut", TypeExpr: "string"},
		{Name: "groupShortcut", TypeExpr: "string"},
		{Name: "ungroupShortcut", TypeExpr: "string"},
		{Name: "saveShortcut", TypeExpr: "string"},
		{Name: "saveAsShortcut", TypeExpr: "string"},
		{Name: "loadShortcut", TypeExpr: "string"},
		{Name: "searchShortcut", TypeExpr: "string"},
		{Name: "advancedSearchShortcut", TypeExpr: "string"},
		{Name: "commandPaletteShortcut", TypeExpr: "string"},
		{Name: "resetZoomShortcut", TypeExpr: "string"},
		{Name: "copyShortcut", TypeExpr: "string"},
		{Name: "pasteShortcut", TypeExpr: "string"},
		{Name: "pasteAsRefShortcut", TypeExpr: "string"},
		{Name: "sortingShortcut", TypeExpr: "string"},
		{Name: "movingFreeShortcut", TypeExpr: "string"},
		{Name: "showTooltipShortcut", TypeExpr: "string"},
		{Name: "tooltipToPlaintextShortcut", TypeExpr: "string"},
		{Name: "tooltipToMarkdownShortcut", TypeExpr: "string"},
		{Name: "freezeTooltipShortcut", TypeExpr: "string"},
		{Name: "frozenTooltipToPlaintextShortcut", TypeExpr: "string"},
		{Name: "frozenTooltipToMarkdownShortcut", TypeExpr: "string"},
		{Name: "incrementTooltipPageShortcut", TypeExpr: "string"},
		{Name: "decrementTooltipPageShortcut", TypeExpr: "string"},
		{Name: "copyTooltipTextShortcut", TypeExpr: "string"},
		{Name: "frozenTooltipIncrementShortcut", TypeExpr: "string"},
		{Name: "frozenTooltipDecrementShortcut", TypeExpr: "string"},
		{Name: "frozenTooltipCopyShortcut", TypeExpr: "string"},
		{Name: "newTerminalShortcut", TypeExpr: "string"},
		{Name: "fitViewShortcut", TypeExpr: "string"},
		{Name: "zoomToMouseShortcut", TypeExpr: "string"},
		{Name: "deleteSectionShortcut", TypeExpr: "string"},
		{Name: "selectAll", TypeExpr: "string"},
		{Name: "selectTopLevelNonGroupSections", TypeExpr: "string"},
		{Name: "showVersionsTabShortcut", TypeExpr: "string"},
		{Name: "showParamUITypeTabShortcut", TypeExpr: "string"},
		{Name: "showProjectOverviewTabShortcut", TypeExpr: "string"},
		{Name: "focusHeaderShortcut", TypeExpr: "string"},
		{Name: "focusOverviewShortcut", TypeExpr: "string"},
		{Name: "focusCanvasShortcut", TypeExpr: "string"},
		{Name: "focusUiEditorShortcut", TypeExpr: "string"},
		{Name: "nextTopLevelSectionShortcut", TypeExpr: "string"},
		{Name: "prevTopLevelSectionShortcut", TypeExpr: "string"},
		{Name: "runCodeShortcut", TypeExpr: "string"},
		{Name: "runEntryCodeBlockShortcut", TypeExpr: "string"},
		{Name: "paramSelect", TypeExpr: "string"},
		{Name: "paramIndentShortcut", TypeExpr: "string"},
		{Name: "paramUnindentShortcut", TypeExpr: "string"},
		{Name: "paramMoveUpShortcut", TypeExpr: "string"},
		{Name: "paramMoveDownShortcut", TypeExpr: "string"},
		{Name: "formatCode", TypeExpr: "string"},
		{Name: "selectionKeyCode", TypeExpr: "string"},
		{Name: "multiSelectionKeyCode", TypeExpr: "string"},
		{Name: "panActivationKeyCode", TypeExpr: "string"},
		{Name: "zoomActivationKeyCode", TypeExpr: "string"},
		{Name: "zoomInShortcut", TypeExpr: "string"},
		{Name: "zoomOutShortcut", TypeExpr: "string"},
		{Name: "restartLanguageServerShortcut", TypeExpr: "string"},
	}
}

func settingsGUITypeProperties() []TypeProperty {
	return []TypeProperty{
		{Name: "snapGrid", TypeExpr: "[number, number]"},
		{Name: "showGridLines", TypeExpr: "boolean"},
		{Name: "gridPattern", TypeExpr: "BackgroundVariant"},
		{Name: "gridPatternSize", TypeExpr: "number"},
		{Name: "gridColor", TypeExpr: "string"},
		{Name: "gridColorDarkMode", TypeExpr: "string"},
		{Name: "wireColor", TypeExpr: "string"},
		{Name: "wireColorDarkMode", TypeExpr: "string"},
		{Name: "defaultZoomLevel", TypeExpr: "number"},
		{Name: "minZoom", TypeExpr: "number"},
		{Name: "maxZoom", TypeExpr: "number"},
		{Name: "panOnDrag", TypeExpr: "boolean"},
		{Name: "panOnScroll", TypeExpr: "boolean"},
		{Name: "panOnScrollSpeed", TypeExpr: "number"},
		{Name: "panOnScrollMode", TypeExpr: "PanOnScrollMode"},
		{Name: "zoomOnScroll", TypeExpr: "boolean"},
		{Name: "zoomOnPinch", TypeExpr: "boolean"},
		{Name: "zoomOnDoubleClick", TypeExpr: "boolean"},
		{Name: "selectionMode", TypeExpr: "SelectionMode"},
		{Name: "leftSidePaneShiftsMap", TypeExpr: "boolean"},
		{Name: "transitionDuration", TypeExpr: "number"},
		{Name: "sectionTagColorChoices", TypeExpr: "Array<{ color: string; description: string; }>"},
	}
}

func settingsBackendTypeProperties() []TypeProperty {
	return []TypeProperty{
		{Name: "showDefaultConfigOnLoad", TypeExpr: "boolean"},
		{Name: "autosave", TypeExpr: "boolean"},
		{Name: "autobackup", TypeExpr: "boolean"},
		{Name: "autobackupFreq", TypeExpr: "number"},
		{Name: "autobackupKeepLastN", TypeExpr: "number"},
		{Name: "clearTerminalBeforeMarkingAsReady", TypeExpr: "boolean"},
		{Name: "defaultTerminalShell", TypeExpr: "string | null", Optional: true},
		{Name: "exportDbReadableOnSave", TypeExpr: "boolean"},
		{Name: "exportDbReadableWithVariantsOnSave", TypeExpr: "boolean"},
		{Name: "autoRefetchCallableParamsOnLspMismatch", TypeExpr: "boolean"},
		{Name: "renameRefactorMode", TypeExpr: "RenameRefactorMode"},
		{Name: "saveRenderedValues", TypeExpr: "boolean"},
		{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode"},
		{Name: "completionGuardEnabled", TypeExpr: "boolean"},
	}
}

func buildTaskBoardOverridesPreludeTS() string {
	var builder strings.Builder
	builder.WriteString("  const normalizedOverrides: Partial<TaskBoardSectionImpl> = {\n")
	builder.WriteString("    ...resolved.overrides,\n")
	builder.WriteString("  };\n")
	builder.WriteString("  if (normalizedOverrides.columns === undefined) {\n")
	builder.WriteString("    delete normalizedOverrides.columns;\n")
	builder.WriteString("  }\n")
	builder.WriteString("  if (normalizedOverrides.tasks === undefined) {\n")
	builder.WriteString("    delete normalizedOverrides.tasks;\n")
	builder.WriteString("  }")
	return builder.String()
}

func generatedSectionTypeSetContains(setName string, sectionName string) bool {
	member := "SectionTypeEnum." + sectionName
	for _, spec := range projectStateTypeGuardTypeSets {
		if spec.Name != setName {
			continue
		}
		for _, candidate := range spec.Members {
			if candidate == member {
				return true
			}
		}
		return false
	}
	return false
}

func generatedSectionImplName(t reflect.Type) (string, bool) {
	if t == nil || t.Kind() != reflect.Struct {
		return "", false
	}
	name := t.Name()
	if name == "" || strings.HasPrefix(name, "Base") || strings.HasPrefix(name, "UserDefault") {
		return "", false
	}
	if !strings.HasSuffix(name, "SectionImpl") {
		return "", false
	}
	sectionName := strings.TrimSuffix(name, "SectionImpl")
	if _, err := projectstate.FrontendUserDefaultSectionDefaults(sectionName); err != nil {
		return "", false
	}
	return sectionName, true
}

func generatedSectionImplTypeExpr(sectionName string) string {
	return "SectionTypeEnum." + sectionName
}

func generatedSectionImplDefaultTypeName(sectionName string) string {
	return "UserDefault" + sectionName + "SectionImpl"
}

func generatedSectionImplFactoryUsesDirectDefaults(sectionName string) bool {
	return sectionName == "Dict"
}

func generatedSectionImplFactoryOverridesExpr(sectionName string) string {
	if sectionName == "TaskBoard" {
		return "normalizedOverrides"
	}
	return "resolved.overrides"
}

func generatedSectionImplFactoryPreludeTS(sectionName string) string {
	if sectionName == "TaskBoard" {
		return buildTaskBoardOverridesPreludeTS()
	}
	return ""
}

func generatedSectionImplFactoryEntries(sectionName string, defaultsExpr string) []string {
	entries := []string{
		"..." + defaultsExpr,
		"type: " + generatedSectionImplTypeExpr(sectionName),
		`id: ""`,
		`name: ""`,
		"isInOtherProjectConfigs: false",
		"aspectRatioExtraHeight: 0",
		"aspectRatioExtraWidth: 0",
		"isPreset: false",
	}
	if generatedSectionTypeSetContains("BaseSectionWithParamsImplTypeSet", sectionName) {
		entries = append(
			entries,
			"codeObjVariantMap: {}",
			"pinnedParams: []",
			"selectedParams: []",
			`ignoreTypeErrors: {
        callable: false,
        params: {},
      }`,
		)
	}
	if generatedSectionTypeSetContains("BaseParentSectionImplTypeSet", sectionName) {
		entries = append(entries, "children: []")
	}
	switch sectionName {
	case "Callable":
		entries = append(entries, "callable: null")
	case "Dict":
		entries = append(entries, "topLevelParamId: null", "jsonSourceMissing: false")
	case "Prompt":
		entries = append(entries, "promptTemplateId: null")
	case "TaskBoard":
		entries = append(
			entries,
			`columns: `+defaultsExpr+`.columns === null || `+defaultsExpr+`.columns === undefined
        ? []
        : cloneGeneratedValue(`+defaultsExpr+`.columns)`,
		)
	}
	return entries
}

func generatedSectionImplFactoryDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	sectionName, ok := generatedSectionImplName(t)
	if !ok {
		return TypeDeclaration{}, false
	}
	implType := t.Name()
	defaultType := generatedSectionImplDefaultTypeName(sectionName)
	name := "create" + implType

	if generatedSectionImplFactoryUsesDirectDefaults(sectionName) {
		return exportedFunctionDeclaration(
			name,
			implType,
			buildDirectGeneratedFactoryBodyTS(
				generatedSectionImplFactoryEntries(sectionName, "defaults"),
				"overrides",
				"",
			),
			defaultsTypeProperty(defaultType),
			overrideTypeProperty(implType),
		), true
	}

	return exportedFunctionDeclaration(
		name,
		implType,
		buildResolvedGeneratedFactoryBodyTS(
			defaultType,
			implType,
			generatedSectionImplFactoryEntries(sectionName, "resolved.defaults"),
			generatedSectionImplFactoryPreludeTS(sectionName),
			generatedSectionImplFactoryOverridesExpr(sectionName),
		),
		defaultsOrOverridesTypeProperty(defaultType, implType),
		optionalOverrideTypeProperty(implType),
	), true
}

func generatedCodeParamCodeObjFactoryDeclaration() TypeDeclaration {
	return exportedFunctionDeclaration(
		"createCodeParamCodeObjImpl",
		"CodeParamCodeObjImpl",
		buildResolvedGeneratedFactoryBodyTS(
			"UserDefaultCodeParamCodeObjImpl",
			"CodeParamCodeObjImpl",
			[]string{
				"...resolved.defaults",
				"type: CodeObjTypeEnum.CodeParam",
				`id: ""`,
				`name: ""`,
				`description: ""`,
				"isPreset: false",
				"passingStyle: ParameterPassingStyleEnum.DEFAULT",
			},
			"",
			"",
		),
		defaultsOrOverridesTypeProperty("UserDefaultCodeParamCodeObjImpl", "CodeParamCodeObjImpl"),
		optionalOverrideTypeProperty("CodeParamCodeObjImpl"),
	)
}

func additionalDeclarationsForType(t reflect.Type) ([]TypeDeclaration, bool) {
	switch t {
	case reflect.TypeOf(ProjectConfig{}):
		return []TypeDeclaration{
			objectDeclarationWithGoBackedCreateExpr(
				"ProjectRunCapabilities",
				projectview.ProjectRunCapabilities{},
				TypeProperty{Name: "canRunFromMain", TypeExpr: "boolean"},
				TypeProperty{Name: "mainRunDisabledReason", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "effectiveEntrySectionId", TypeExpr: "string | null", Optional: true},
			),
		}, true
	case reflect.TypeOf(ProjectStateSingleConfig{}):
		return []TypeDeclaration{
			objectDeclarationWithGoBackedCreateExpr(
				"SectionCapabilities",
				projectview.SectionCapabilities{},
				TypeProperty{Name: "canRun", TypeExpr: "boolean"},
				TypeProperty{Name: "runDisabledReason", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "runRequestSectionId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "canSelectAsEntryCodeBlock", TypeExpr: "boolean"},
				TypeProperty{Name: "entryCodeBlockValue", TypeExpr: "string | null", Optional: true},
			),
		}, true
	case reflect.TypeOf(CodeParamCodeObjImpl{}):
		return []TypeDeclaration{generatedCodeParamCodeObjFactoryDeclaration()}, true
	case reflect.TypeOf(BaseChartSettingsUnion{}):
		return []TypeDeclaration{
			exportedFunctionDeclaration(
				"createBaseChartSettingsUnionWithDiscriminator",
				"BaseChartSettingsUnion",
				`  switch (options.type) {
    case ChartTypeEnum.line:
      return createLineChartSettings(options);
    case ChartTypeEnum.scatter:
      return createScatterChartSettings(options);
    default:
      throw new Error("Unsupported chart type.");
  }`,
				TypeProperty{
					Name: "options",
					TypeExpr: `({ type: typeof ChartTypeEnum.line } & Partial<LineChartSettings>)
    | ({ type: typeof ChartTypeEnum.scatter } & Partial<ScatterChartSettings>)`,
				},
			),
		}, true
	}
	if declaration, ok := generatedSectionImplFactoryDeclaration(t); ok {
		return []TypeDeclaration{declaration}, true
	}
	return nil, false
}

type reflectedObjectDeclarationSpec struct {
	DefaultValue              any
	HasCreateExpr             bool
	CreateExprOverrides       map[string]string
	PropertyTypeExprOverrides map[string]string
}

func specialTypeDeclaration(
	converter *typeConverter,
	t reflect.Type,
) (TypeDeclaration, bool, error) {
	if declaration, ok, err := artifactTypeDeclaration(converter, t); ok || err != nil {
		return declaration, ok, err
	}
	return TypeDeclaration{}, false, nil
}

func artifactTypeDeclaration(
	converter *typeConverter,
	t reflect.Type,
) (TypeDeclaration, bool, error) {
	switch t {
	case reflect.TypeOf(CanvasPoint{}):
		return aliasDeclaration("CanvasPoint", "[number, number]"), true, nil
	case reflect.TypeOf(DrawAreaTransform{}):
		return aliasDeclaration(
			"DrawAreaTransform",
			"[number, number, number, number, number, number]",
		), true, nil
	case reflect.TypeOf(ChartDataValue{}):
		return aliasDeclaration(
			"ChartDataValue",
			"Record<string, Array<string | number>>",
		), true, nil
	case reflect.TypeOf(ChartData{}):
		return aliasDeclaration("ChartData", "ChartDataValue"), true, nil
	case reflect.TypeOf(ChartDataType{}):
		return aliasDeclaration("ChartDataType", "ChartDataValue"), true, nil
	case reflect.TypeOf(ArtifactUnion{}):
		return aliasDeclaration(
			"ArtifactUnion",
			"ImageArtifact | BrushStrokeArtifact | DrawAreaLayerItemTransformArtifact | ChartDataArtifact | FileArtifact",
		), true, nil
	}

	var spec reflectedObjectDeclarationSpec
	switch t {
	case reflect.TypeOf(BrushStroke{}):
		spec = reflectedObjectDeclarationSpec{
			DefaultValue:  artifacts.FrontendDefaultBrushStroke(),
			HasCreateExpr: true,
			PropertyTypeExprOverrides: map[string]string{
				"points": `Array<CanvasPoint | "BREAK">`,
			},
		}
	case reflect.TypeOf(BrushStrokeWithTransform{}):
		spec = reflectedObjectDeclarationSpec{
			PropertyTypeExprOverrides: map[string]string{
				"points":    `Array<CanvasPoint | "BREAK">`,
				"transform": "DrawAreaTransform",
			},
		}
	case reflect.TypeOf(DrawAreaLayerItemTransform{}):
		spec = reflectedObjectDeclarationSpec{
			DefaultValue:  artifacts.FrontendDefaultDrawAreaLayerItemTransform(),
			HasCreateExpr: true,
			PropertyTypeExprOverrides: map[string]string{
				"transform": "DrawAreaTransform",
			},
		}
	case reflect.TypeOf(DrawAreaLayerItem{}):
		spec = reflectedObjectDeclarationSpec{
			DefaultValue:  projectstate.FrontendDefaultDrawAreaLayerItem(),
			HasCreateExpr: true,
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof ArtifactTypeEnum.Image | typeof ArtifactTypeEnum.BrushStroke",
			},
		}
	case reflect.TypeOf(DrawAreaLayer{}):
		spec = reflectedObjectDeclarationSpec{
			DefaultValue:  artifacts.FrontendDefaultDrawAreaLayer(),
			HasCreateExpr: true,
			CreateExprOverrides: map[string]string{
				"name": "createRandomName()",
			},
		}
	case reflect.TypeOf(ImageArtifact{}):
		spec = reflectedObjectDeclarationSpec{
			DefaultValue:  artifacts.FrontendDefaultImageArtifact(),
			HasCreateExpr: true,
			CreateExprOverrides: map[string]string{
				"id":    "createPngArtifactId()",
				"value": "createBinaryContentRef()",
			},
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof ArtifactTypeEnum.Image",
			},
		}
	case reflect.TypeOf(BrushStrokeArtifact{}):
		spec = reflectedObjectDeclarationSpec{
			DefaultValue:  artifacts.FrontendDefaultBrushStrokeArtifact(),
			HasCreateExpr: true,
			CreateExprOverrides: map[string]string{
				"id":    "createJsonArtifactId()",
				"value": "createBrushStroke()",
			},
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof ArtifactTypeEnum.BrushStroke",
			},
		}
	case reflect.TypeOf(DrawAreaLayerItemTransformArtifact{}):
		spec = reflectedObjectDeclarationSpec{
			DefaultValue:  artifacts.FrontendDefaultDrawAreaLayerItemTransformArtifact(),
			HasCreateExpr: true,
			CreateExprOverrides: map[string]string{
				"id":    "createJsonArtifactId()",
				"value": "createDrawAreaLayerItemTransform()",
			},
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof ArtifactTypeEnum.DrawAreaLayerItemTransform",
			},
		}
	case reflect.TypeOf(ChartDataArtifact{}):
		spec = reflectedObjectDeclarationSpec{
			DefaultValue:  artifacts.FrontendDefaultChartDataArtifact(),
			HasCreateExpr: true,
			CreateExprOverrides: map[string]string{
				"id": "createCsvArtifactId()",
			},
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof ArtifactTypeEnum.ChartData",
			},
		}
	case reflect.TypeOf(FileArtifact{}):
		spec = reflectedObjectDeclarationSpec{
			DefaultValue:  artifacts.FrontendDefaultFileArtifact(),
			HasCreateExpr: true,
			CreateExprOverrides: map[string]string{
				"id":    "createFileArtifactId()",
				"value": "createBinaryContentRef()",
			},
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof ArtifactTypeEnum.File",
			},
		}
	default:
		return TypeDeclaration{}, false, nil
	}

	declaration, err := converter.reflectedObjectDeclaration(t, spec)
	return declaration, true, err
}

func ownerBackedReflectedObjectDeclarationSpec(t reflect.Type) (reflectedObjectDeclarationSpec, bool) {
	switch t {
	case reflect.TypeOf(SectionDependencyKey{}):
		return reflectedObjectDeclarationSpec{
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof DependencyKeyTypeEnum.Section",
			},
		}, true
	case reflect.TypeOf(SectionParamDependencyKey{}):
		return reflectedObjectDeclarationSpec{
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof DependencyKeyTypeEnum.SectionParam",
			},
		}, true
	case reflect.TypeOf(LiteralDependencyValue{}):
		return reflectedObjectDeclarationSpec{
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof DependencyValueTypeEnum.Literal",
			},
		}, true
	case reflect.TypeOf(FileReadDependencyValue{}):
		return reflectedObjectDeclarationSpec{
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof DependencyValueTypeEnum.FileRead",
			},
		}, true
	case reflect.TypeOf(BinaryDependencyValue{}):
		return reflectedObjectDeclarationSpec{
			PropertyTypeExprOverrides: map[string]string{
				"payload": "BinaryContentRef",
				"type":    "typeof DependencyValueTypeEnum.Binary",
			},
		}, true
	case reflect.TypeOf(EngineConfigDefaults{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  agentruns.FrontendDefaultEngineConfigDefaults(),
			HasCreateExpr: true,
		}, true
	case reflect.TypeOf(EngineRuntimeSupport{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  agentruns.EngineRuntimeSupport{},
			HasCreateExpr: true,
		}, true
	case reflect.TypeOf(RunEvent{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  agentruns.FrontendDefaultRunEvent(),
			HasCreateExpr: true,
		}, true
	case reflect.TypeOf(AgentRun{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  agentruns.FrontendDefaultRun(),
			HasCreateExpr: true,
			PropertyTypeExprOverrides: map[string]string{
				"inputs":  "Record<string, unknown> | null",
				"outputs": "Record<string, unknown> | null",
			},
		}, true
	case reflect.TypeOf(SectionTypeCodegenPolicy{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  projectview.FrontendDefaultSectionTypeCodegenPolicy(),
			HasCreateExpr: true,
		}, true
	case reflect.TypeOf(SectionCodegenOverride{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  projectview.FrontendDefaultSectionCodegenOverride(),
			HasCreateExpr: true,
		}, true
	case reflect.TypeOf(CodeObjTypeValuePolicy{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  projectview.FrontendDefaultCodeObjTypeValuePolicy(),
			HasCreateExpr: true,
		}, true
	case reflect.TypeOf(CodeObjValueOverride{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  projectview.FrontendDefaultCodeObjValueOverride(),
			HasCreateExpr: true,
		}, true
	case reflect.TypeOf(ProjectCodegenPluginTarget{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  projectview.FrontendDefaultProjectCodegenPluginTarget(),
			HasCreateExpr: true,
		}, true
	case reflect.TypeOf(BrowserSavedSearchTypeFilters{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  projectstate.FrontendDefaultBrowserSavedSearchTypeFilters(),
			HasCreateExpr: true,
		}, true
	case reflect.TypeOf(TaskBoardColumn{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  projectstate.FrontendDefaultTaskBoardColumn(),
			HasCreateExpr: true,
		}, true
	case reflect.TypeOf(LineChartSettings{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  projectstate.FrontendDefaultLineChartSettings(),
			HasCreateExpr: true,
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof ChartTypeEnum.line",
			},
		}, true
	case reflect.TypeOf(ScatterChartSettings{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  projectstate.FrontendDefaultScatterChartSettings(),
			HasCreateExpr: true,
			PropertyTypeExprOverrides: map[string]string{
				"type": "typeof ChartTypeEnum.scatter",
			},
		}, true
	case reflect.TypeOf(WebsocketConnectionInfo{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  frontendDefaultWebsocketConnectionInfo(),
			HasCreateExpr: true,
		}, true
	case reflect.TypeOf(WebsocketMsgCurrentAddressUpdate{}):
		return reflectedObjectDeclarationSpec{
			DefaultValue:  frontendDefaultWebsocketMsgCurrentAddressUpdate(),
			HasCreateExpr: true,
			PropertyTypeExprOverrides: map[string]string{
				"messageType": "typeof WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate",
			},
		}, true
	default:
		return reflectedObjectDeclarationSpec{}, false
	}
}
