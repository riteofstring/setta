package frontendbindings

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"

	"setta/internal/projectstate"
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

//go:embed templates/converter_create_section_codegen_policy.ts.tmpl
var createSectionCodegenPolicyTemplate string

//go:embed templates/converter_create_code_obj_value_policy.ts.tmpl
var createCodeObjValuePolicyTemplate string

// setta-go-type-discovery: skip
type sectionCodegenPolicyCreateTemplateData struct {
	DefaultSectionCodegenAllowlistMembers     []string
	DefaultMetaControlCodegenAllowlistMembers []string
	FileReadSectionRepresentationMembers      []string
}

// setta-go-type-discovery: skip
type codeObjValuePolicyCreateTemplateData struct {
	StringCodeObjValueRepresentationMembers []string
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

type tsObjectEntry struct {
	Name       string
	Value      string
	SpreadExpr string
}

type tsNamedLiteralObject struct {
	Name   string
	Fields []tsLiteralField
}

func tsObjectField(name string, value string) tsObjectEntry {
	return tsObjectEntry{Name: name, Value: value}
}

func tsObjectSpread(expr string) tsObjectEntry {
	return tsObjectEntry{SpreadExpr: expr}
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

func writeTSObjectEntries(builder *strings.Builder, indent string, entries []tsObjectEntry) {
	for _, entry := range entries {
		builder.WriteString(indent)
		if entry.SpreadExpr != "" {
			builder.WriteString("...")
			builder.WriteString(entry.SpreadExpr)
		} else {
			builder.WriteString(entry.Name)
			builder.WriteString(": ")
			builder.WriteString(entry.Value)
		}
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

func buildTSMergeGeneratedOptionsExprTS(entries []tsObjectEntry, overridesExpr string) string {
	if strings.TrimSpace(overridesExpr) == "" {
		overridesExpr = "options"
	}
	var builder strings.Builder
	builder.WriteString("mergeGeneratedOptions(\n")
	builder.WriteString("    {\n")
	writeTSObjectEntries(&builder, "      ", entries)
	builder.WriteString("    },\n")
	builder.WriteString("    ")
	builder.WriteString(overridesExpr)
	builder.WriteString(",\n")
	builder.WriteString("  )")
	return builder.String()
}

func buildTSMergeGeneratedOptionsCreateBodyTS(entries []tsObjectEntry, overridesExpr string) string {
	var builder strings.Builder
	builder.WriteString("  return ")
	builder.WriteString(buildTSMergeGeneratedOptionsExprTS(entries, overridesExpr))
	builder.WriteString(";")
	return builder.String()
}

func buildTSObjectCreateBodyTS(entries []tsObjectEntry) string {
	var builder strings.Builder
	builder.WriteString("  return {\n")
	writeTSObjectEntries(&builder, "    ", entries)
	builder.WriteString("  };")
	return builder.String()
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
	defaultConfig, err := projectstate.DecodePythonCodegenTarget(projectstate.ProjectCodegenTarget{
		Language: string(projectstate.CodeLanguagePython),
	})
	if err != nil {
		panic("decode default project codegen python target: " + err.Error())
	}
	defaultLiteral := mustTSLiteralObjectFromGoValue(
		"default project codegen python target",
		map[string]any{
			"language":         string(projectstate.CodeLanguagePython),
			"genCodePrefix":    defaultConfig.GenCodePrefix,
			"genCodeSuffix":    defaultConfig.GenCodeSuffix,
			"generateMetadata": defaultConfig.GenerateMetadata,
		},
	)
	var builder strings.Builder
	builder.WriteString("  const sectionPolicy = createSectionCodegenPolicy(options.sectionPolicy ?? {});\n")
	builder.WriteString("  const codeObjValuePolicy = createCodeObjValuePolicy(\n")
	builder.WriteString("    options.codeObjValuePolicy ?? {},\n")
	builder.WriteString("  );\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...")
	builder.WriteString(buildTSMergeGeneratedOptionsExprTS([]tsObjectEntry{
		tsObjectField("language", renderTSLiteralExpr(defaultLiteral["language"])),
		tsObjectField("genCodePrefix", renderTSLiteralExpr(defaultLiteral["genCodePrefix"])),
		tsObjectField("genCodeSuffix", renderTSLiteralExpr(defaultLiteral["genCodeSuffix"])),
		tsObjectField("generateMetadata", renderTSLiteralExpr(defaultLiteral["generateMetadata"])),
		tsObjectField("sectionPolicy", "sectionPolicy"),
		tsObjectField("codeObjValuePolicy", "codeObjValuePolicy"),
	}, "options"))
	builder.WriteString(",\n")
	builder.WriteString("    language: ")
	writeTSLiteralValue(&builder, "    ", defaultLiteral["language"])
	builder.WriteString(",\n")
	builder.WriteString("    sectionPolicy,\n")
	builder.WriteString("    codeObjValuePolicy,\n")
	builder.WriteString("  };")
	return builder.String()
}

var defaultSectionCodegenAllowlistMembers = []string{
	"SectionTypeEnum.Callable",
	"SectionTypeEnum.Dict",
	"SectionTypeEnum.ListRoot",
	"SectionTypeEnum.Group",
	"SectionTypeEnum.GlobalVariables",
	"SectionTypeEnum.TextBlock",
	"SectionTypeEnum.Draw",
	"SectionTypeEnum.MetaControl",
	"SectionTypeEnum.TaskBoard",
	"SectionTypeEnum.Spreadsheet",
}

var defaultMetaControlCodegenAllowlistMembers = []string{
	"CodeObjTypeEnum.CodeParam",
	"CodeObjTypeEnum.TextParam",
	"CodeObjTypeEnum.DateParam",
	"CodeObjTypeEnum.TimeParam",
	"CodeObjTypeEnum.TextAreaParam",
	"CodeObjTypeEnum.SliderParam",
	"CodeObjTypeEnum.RotaryParam",
	"CodeObjTypeEnum.SwitchParam",
	"CodeObjTypeEnum.ColorPickerParam",
	"CodeObjTypeEnum.DropdownParam",
	"CodeObjTypeEnum.PasswordParam",
	"CodeObjTypeEnum.ButtonParam",
	"CodeObjTypeEnum.DropzoneParam",
}

var fileReadSectionRepresentationMembers = []string{
	"SectionTypeEnum.Chat",
	"SectionTypeEnum.Draw",
	"SectionTypeEnum.Image",
}

var stringCodeObjValueRepresentationMembers = []string{
	"CodeObjTypeEnum.TextParam",
	"CodeObjTypeEnum.DateParam",
	"CodeObjTypeEnum.TimeParam",
	"CodeObjTypeEnum.TextAreaParam",
	"CodeObjTypeEnum.PasswordParam",
	"CodeObjTypeEnum.ColorPickerParam",
}

func buildSectionCodegenPolicyCreateBodyTS() string {
	return mustRenderFrontendBindingTemplate(
		"createSectionCodegenPolicy",
		createSectionCodegenPolicyTemplate,
		sectionCodegenPolicyCreateTemplateData{
			DefaultSectionCodegenAllowlistMembers:     defaultSectionCodegenAllowlistMembers,
			DefaultMetaControlCodegenAllowlistMembers: defaultMetaControlCodegenAllowlistMembers,
			FileReadSectionRepresentationMembers:      fileReadSectionRepresentationMembers,
		},
	)
}

func buildCodeObjValuePolicyCreateBodyTS() string {
	return mustRenderFrontendBindingTemplate(
		"createCodeObjValuePolicy",
		createCodeObjValuePolicyTemplate,
		codeObjValuePolicyCreateTemplateData{
			StringCodeObjValueRepresentationMembers: stringCodeObjValueRepresentationMembers,
		},
	)
}

func buildEngineConfigDefaultsCreateBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyTS([]tsObjectEntry{
		tsObjectField("thinking", "null"),
	}, "options")
}

func buildEngineRuntimeSupportCreateBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyTS([]tsObjectEntry{
		tsObjectField("thinking", "false"),
	}, "options")
}

func buildEngineConfigCreateBodyTS() string {
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
	builder.WriteString(buildTSMergeGeneratedOptionsExprTS([]tsObjectEntry{
		tsObjectField("id", tsStringLiteralExpr("")),
		tsObjectField("name", tsStringLiteralExpr("")),
		tsObjectField("engineType", "EngineTypeEnum.setta_llm"),
		tsObjectField("settaLlmConfigId", "null"),
		tsObjectField("externalAgentConfigId", "null"),
		tsObjectField("defaults", "defaults"),
		tsObjectField("runtimeSupport", "null"),
	}, "options"))
	builder.WriteString(",\n")
	builder.WriteString("    defaults: mergedDefaults,\n")
	builder.WriteString("    runtimeSupport: mergedRuntimeSupport,\n")
	builder.WriteString("  };")
	return builder.String()
}

func buildRunEventCreateBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyTS([]tsObjectEntry{
		tsObjectField("id", tsStringLiteralExpr("")),
		tsObjectField("timestamp", tsStringLiteralExpr("")),
		tsObjectField("type", tsStringLiteralExpr("")),
		tsObjectField("payload", "{}"),
	}, "options")
}

func buildAgentRunCreateBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyTS([]tsObjectEntry{
		tsObjectField("id", tsStringLiteralExpr("")),
		tsObjectField("profileId", "null"),
		tsObjectField("status", "AgentRunStatusEnum.queued"),
		tsObjectField("startedAt", "null"),
		tsObjectField("finishedAt", "null"),
		tsObjectField("inputs", "null"),
		tsObjectField("outputs", "null"),
		tsObjectField("toolCalls", "[]"),
		tsObjectField("cost", "null"),
		tsObjectField("events", "[]"),
	}, "options")
}

type generatedFactoryDeclarationData struct {
	Name          string
	ImplType      string
	DefaultType   string
	Fields        []tsLiteralField
	Prelude       string
	OverridesExpr string
}

func combineTSLiteralFields(groups ...[]tsLiteralField) []tsLiteralField {
	total := 0
	for _, group := range groups {
		total += len(group)
	}
	fields := make([]tsLiteralField, 0, total)
	for _, group := range groups {
		fields = append(fields, group...)
	}
	return fields
}

func sectionImplIdentityFields(typeExpr string) []tsLiteralField {
	return []tsLiteralField{
		{Name: "type", Value: typeExpr},
		{Name: "id", Value: `""`},
		{Name: "name", Value: `""`},
	}
}

func generatedBaseSectionImplFields(defaultsExpr string) []tsLiteralField {
	return []tsLiteralField{
		{Name: "isFrozen", Value: defaultsExpr + ".isFrozen"},
		{Name: "isInOtherProjectConfigs", Value: "false"},
		{Name: "tagColor", Value: defaultsExpr + ".tagColor"},
		{Name: "styleColor", Value: defaultsExpr + ".styleColor"},
		{Name: "size", Value: defaultsExpr + ".size"},
		{Name: "aspectRatio", Value: defaultsExpr + ".aspectRatio"},
		{Name: "aspectRatioExtraHeight", Value: "0"},
		{Name: "aspectRatioExtraWidth", Value: "0"},
		{Name: "isMinimized", Value: defaultsExpr + ".isMinimized"},
		{Name: "positionAndSizeLocked", Value: defaultsExpr + ".positionAndSizeLocked"},
		{Name: "isPreset", Value: "false"},
	}
}

func generatedSectionWithParamsImplFields(defaultsExpr string) []tsLiteralField {
	return combineTSLiteralFields(
		generatedBaseSectionImplFields(defaultsExpr),
		[]tsLiteralField{
			{Name: "codeObjVariantMap", Value: "{}"},
			{Name: "hideUnpinnedParams", Value: defaultsExpr + ".hideUnpinnedParams"},
			{Name: "paramFilter", Value: defaultsExpr + ".paramFilter"},
			{Name: "columnWidth", Value: defaultsExpr + ".columnWidth"},
			{Name: "configLanguage", Value: defaultsExpr + ".configLanguage"},
			{Name: "pinnedParams", Value: "[]"},
			{Name: "selectedParams", Value: "[]"},
			{Name: "ignoreTypeErrors", Value: `{
        callable: false,
        params: {},
      }`},
			{Name: "edgeInputParams", Value: defaultsExpr + ".edgeInputParams"},
			{Name: "edgeOutputPorts", Value: defaultsExpr + ".edgeOutputPorts"},
		},
	)
}

func sectionImplCreateFields(typeExpr string, defaultsExpr string, extras ...[]tsLiteralField) []tsLiteralField {
	return combineTSLiteralFields(
		sectionImplIdentityFields(typeExpr),
		generatedBaseSectionImplFields(defaultsExpr),
		combineTSLiteralFields(extras...),
	)
}

func sectionWithParamsImplCreateFields(typeExpr string, defaultsExpr string, extras ...[]tsLiteralField) []tsLiteralField {
	return combineTSLiteralFields(
		sectionImplIdentityFields(typeExpr),
		generatedSectionWithParamsImplFields(defaultsExpr),
		combineTSLiteralFields(extras...),
	)
}

func buildGeneratedFactoryReturnBodyTS(fields []tsLiteralField, overridesExpr string, prelude string) string {
	var builder strings.Builder
	trimmedPrelude := strings.TrimRight(prelude, "\n")
	if trimmedPrelude != "" {
		builder.WriteString(trimmedPrelude)
		builder.WriteString("\n")
	}
	builder.WriteString("  return mergeGeneratedOptions(\n")
	builder.WriteString("    {\n")
	writeTSObjectFields(&builder, "      ", fields)
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
	fields []tsLiteralField,
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
	builder.WriteString(buildGeneratedFactoryReturnBodyTS(fields, overridesExpr, prelude))
	return builder.String()
}

func buildDirectGeneratedFactoryBodyTS(fields []tsLiteralField, overridesExpr string) string {
	return buildGeneratedFactoryReturnBodyTS(fields, overridesExpr, "")
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

func buildGoBackedSectionDefaultsCreateExprTS(implType string, properties []TypeProperty) string {
	defaults, err := projectstate.FrontendUserDefaultSectionDefaults(implType)
	if err != nil {
		panic("load frontend user default section defaults: " + err.Error())
	}
	filteredDefaults := filterObjectByTypeProperties(
		"frontend user default section defaults "+implType,
		defaults,
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

func filterObjectByTypeProperties(
	context string,
	object map[string]any,
	properties []TypeProperty,
) map[string]any {
	filtered := make(map[string]any, len(properties))
	for _, property := range properties {
		value, ok := object[property.Name]
		if !ok {
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

func exportedResolvedFactoryDeclaration(data generatedFactoryDeclarationData) TypeDeclaration {
	return exportedFunctionDeclaration(
		data.Name,
		data.ImplType,
		buildResolvedGeneratedFactoryBodyTS(
			data.DefaultType,
			data.ImplType,
			data.Fields,
			data.Prelude,
			data.OverridesExpr,
		),
		defaultsOrOverridesTypeProperty(data.DefaultType, data.ImplType),
		optionalOverrideTypeProperty(data.ImplType),
	)
}

func exportedDefaultsFactoryDeclaration(
	name string,
	implType string,
	defaultType string,
	fields []tsLiteralField,
) TypeDeclaration {
	return exportedFunctionDeclaration(
		name,
		implType,
		buildDirectGeneratedFactoryBodyTS(fields, "overrides"),
		defaultsTypeProperty(defaultType),
		overrideTypeProperty(implType),
	)
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

func buildProjectRunCapabilitiesCreateBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyTS([]tsObjectEntry{
		tsObjectField("canRunFromMain", "false"),
		tsObjectField("mainRunDisabledReason", "null"),
		tsObjectField("effectiveEntrySectionId", "null"),
	}, "options")
}

func buildSectionCapabilitiesCreateBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyTS([]tsObjectEntry{
		tsObjectField("canRun", "false"),
		tsObjectField("runDisabledReason", "null"),
		tsObjectField("runRequestSectionId", "null"),
		tsObjectField("canSelectAsEntryCodeBlock", "false"),
		tsObjectField("entryCodeBlockValue", "null"),
	}, "options")
}

func buildProjectConfigCreateBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyTS([]tsObjectEntry{
		tsObjectField("id", tsStringLiteralExpr("")),
		tsObjectField("name", tsStringLiteralExpr("")),
		tsObjectField("showParamDisplayNames", "false"),
		tsObjectField("allowJsonSourceKeyEdits", "false"),
		tsObjectField("previewImgColor", tsStringLiteralExpr("")),
		tsObjectField("viewport", "null"),
		tsObjectField("viewportInitialized", "false"),
		tsObjectField("viewModes", "{}"),
		tsObjectField("activeViewModeId", "null"),
		tsObjectField("isEditingViewMode", "false"),
		tsObjectField("hasPythonCodegenTarget", "false"),
		tsObjectField("runCapabilities", "createProjectRunCapabilities()"),
		tsObjectField("codegenTargets", "[]"),
		tsObjectField("watchCodeEnabled", "false"),
		tsObjectField("watchCodeFolders", "[]"),
		tsObjectField("watchCodeFiles", "[]"),
		tsObjectField("watchCodeRegistry", "{}"),
		tsObjectField("watchCodeBaselineByPath", "{}"),
		tsObjectField("entryCodeBlockId", "null"),
		tsObjectField("sectionPathSlugsById", "{}"),
		tsObjectField("sectionIdsByPathSlug", "{}"),
		tsObjectField("topLevelSections", "{}"),
		tsObjectField("windowSpaceSlugsById", "{}"),
		tsObjectField("windowSpaceIdsBySlug", "{}"),
		tsObjectField("windowSpaces", "{}"),
		tsObjectField("sectionVariantMap", "{}"),
		tsObjectField("activeIds", "[]"),
		tsObjectField("edges", "[]"),
		tsObjectField("agenticEdges", "[]"),
		tsObjectField("stateMachineEdges", "[]"),
	}, "options")
}

func buildProjectStateSingleConfigCreateBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyTS([]tsObjectEntry{
		tsObjectField("projectConfig", "createProjectConfig()"),
		tsObjectField("sections", "{}"),
		tsObjectField("sectionImpls", "{}"),
		tsObjectField("sectionCapabilities", "{}"),
		tsObjectField("sectionVariants", "{}"),
		tsObjectField("codeObjs", "{}"),
		tsObjectField("codeObjImpls", "{}"),
		tsObjectField("codeObjVariants", "{}"),
		tsObjectField("artifactGroups", "{}"),
		tsObjectField("singletonSections", "createSingletonSections()"),
		tsObjectField("parentSectionMap", "{}"),
		tsObjectField("shownParamIds", "{}"),
		tsObjectField("requiredDecodedImages", "[]"),
		tsObjectField("genCodeBinding", "null"),
		tsObjectField("projectChatWindowing", "createProjectChatWindowingState()"),
	}, "options")
}

func projectStateAliasFactoryDeclarations() map[reflect.Type][]TypeDeclaration {
	return map[reflect.Type][]TypeDeclaration{
		reflect.TypeOf(ProjectConfig{}): {
			objectDeclarationWithCreateBody(
				"ProjectRunCapabilities",
				buildProjectRunCapabilitiesCreateBodyTS(),
				TypeProperty{Name: "canRunFromMain", TypeExpr: "boolean"},
				TypeProperty{Name: "mainRunDisabledReason", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "effectiveEntrySectionId", TypeExpr: "string | null", Optional: true},
			),
		},
		reflect.TypeOf(ProjectStateSingleConfig{}): {
			objectDeclarationWithCreateBody(
				"SectionCapabilities",
				buildSectionCapabilitiesCreateBodyTS(),
				TypeProperty{Name: "canRun", TypeExpr: "boolean"},
				TypeProperty{Name: "runDisabledReason", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "runRequestSectionId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "canSelectAsEntryCodeBlock", TypeExpr: "boolean"},
				TypeProperty{Name: "entryCodeBlockValue", TypeExpr: "string | null", Optional: true},
			),
		},
		reflect.TypeOf(CallableSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createCallableSectionImpl",
				ImplType:    "CallableSectionImpl",
				DefaultType: "UserDefaultCallableSectionImpl",
				Fields: sectionWithParamsImplCreateFields(
					"SectionTypeEnum.Callable",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "callable", Value: "null"},
						{Name: "hideParams", Value: "resolved.defaults.hideParams"},
					},
				),
			}),
		},
		reflect.TypeOf(DictSectionImpl{}): {
			exportedDefaultsFactoryDeclaration(
				"createDictSectionImpl",
				"DictSectionImpl",
				"UserDefaultDictSectionImpl",
				sectionWithParamsImplCreateFields(
					"SectionTypeEnum.Dict",
					"defaults",
					[]tsLiteralField{
						{Name: "topLevelParamId", Value: "null"},
						{Name: "isJsonSource", Value: "defaults.isJsonSource"},
						{Name: "jsonSourceKeys", Value: "defaults.jsonSourceKeys"},
						{Name: "jsonSourceMissing", Value: "false"},
					},
				),
			),
		},
		reflect.TypeOf(CodeParamCodeObjImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createCodeParamCodeObjImpl",
				ImplType:    "CodeParamCodeObjImpl",
				DefaultType: "UserDefaultCodeParamCodeObjImpl",
				Fields: []tsLiteralField{
					{Name: "type", Value: "CodeObjTypeEnum.CodeParam"},
					{Name: "id", Value: `""`},
					{Name: "name", Value: `""`},
					{Name: "description", Value: `""`},
					{Name: "isPreset", Value: "false"},
					{Name: "coreNameType", Value: "resolved.defaults.coreNameType"},
					{Name: "coreNameEditable", Value: "resolved.defaults.coreNameEditable"},
					{Name: "passingStyle", Value: "ParameterPassingStyleEnum.DEFAULT"},
					{Name: "typeAnnotation", Value: "resolved.defaults.typeAnnotation"},
					{Name: "defaultVal", Value: "resolved.defaults.defaultVal"},
					{Name: "value", Value: "resolved.defaults.value"},
				},
			}),
		},
		reflect.TypeOf(ListRootSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createListRootSectionImpl",
				ImplType:    "ListRootSectionImpl",
				DefaultType: "UserDefaultListRootSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.ListRoot",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "children", Value: "[]"},
						{Name: "defaultChildSectionType", Value: "resolved.defaults.defaultChildSectionType"},
						{Name: "viewMode", Value: "resolved.defaults.viewMode"},
					},
				),
			}),
		},
		reflect.TypeOf(GroupSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createGroupSectionImpl",
				ImplType:    "GroupSectionImpl",
				DefaultType: "UserDefaultGroupSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.Group",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "children", Value: "[]"},
						{Name: "isHorizontalOrientation", Value: "resolved.defaults.isHorizontalOrientation"},
						{Name: "overflowMode", Value: "resolved.defaults.overflowMode"},
						{Name: "defaultChildSectionType", Value: "resolved.defaults.defaultChildSectionType"},
					},
				),
			}),
		},
		reflect.TypeOf(StateMachineStartSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createStateMachineStartSectionImpl",
				ImplType:    "StateMachineStartSectionImpl",
				DefaultType: "UserDefaultStateMachineStartSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.StateMachineStart",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "machineGroupId", Value: "resolved.defaults.machineGroupId"},
						{Name: "label", Value: "resolved.defaults.label"},
						{Name: "maxIterations", Value: "resolved.defaults.maxIterations"},
					},
				),
			}),
		},
		reflect.TypeOf(StateMachineGateSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createStateMachineGateSectionImpl",
				ImplType:    "StateMachineGateSectionImpl",
				DefaultType: "UserDefaultStateMachineGateSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.StateMachineGate",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "machineGroupId", Value: "resolved.defaults.machineGroupId"},
						{Name: "gateType", Value: "resolved.defaults.gateType"},
						{Name: "label", Value: "resolved.defaults.label"},
						{Name: "ui", Value: "resolved.defaults.ui"},
					},
				),
			}),
		},
		reflect.TypeOf(StateMachineEndSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createStateMachineEndSectionImpl",
				ImplType:    "StateMachineEndSectionImpl",
				DefaultType: "UserDefaultStateMachineEndSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.StateMachineEnd",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "machineGroupId", Value: "resolved.defaults.machineGroupId"},
						{Name: "label", Value: "resolved.defaults.label"},
					},
				),
			}),
		},
		reflect.TypeOf(TextBlockSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createTextBlockSectionImpl",
				ImplType:    "TextBlockSectionImpl",
				DefaultType: "UserDefaultTextBlockSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.TextBlock",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "format", Value: "resolved.defaults.format"},
						{Name: "masterFontSizePx", Value: "resolved.defaults.masterFontSizePx"},
						{Name: "headingAsSectionName", Value: "resolved.defaults.headingAsSectionName"},
						{Name: "metaControlStyle", Value: "resolved.defaults.metaControlStyle"},
						{Name: "textDisplayMode", Value: "resolved.defaults.textDisplayMode"},
						{Name: "text", Value: "resolved.defaults.text"},
					},
				),
			}),
		},
		reflect.TypeOf(PromptSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createPromptSectionImpl",
				ImplType:    "PromptSectionImpl",
				DefaultType: "UserDefaultPromptSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.Prompt",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "promptTemplateId", Value: "null"},
						{Name: "template", Value: "resolved.defaults.template"},
						{Name: "format", Value: "resolved.defaults.format"},
						{Name: "inputs", Value: "resolved.defaults.inputs"},
						{Name: "renderedText", Value: "resolved.defaults.renderedText"},
						{Name: "missingVariables", Value: "resolved.defaults.missingVariables"},
						{Name: "renderError", Value: "resolved.defaults.renderError"},
					},
				),
			}),
		},
		reflect.TypeOf(CodeSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createCodeSectionImpl",
				ImplType:    "CodeSectionImpl",
				DefaultType: "UserDefaultCodeSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.Code",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "children", Value: "[]"},
						{Name: "code", Value: "resolved.defaults.code"},
						{Name: "codeLanguage", Value: "resolved.defaults.codeLanguage"},
						{Name: "codeFileBinding", Value: "resolved.defaults.codeFileBinding"},
						{Name: "attachedTerminalSectionId", Value: "resolved.defaults.attachedTerminalSectionId"},
						{Name: "diagnosticsIgnoreState", Value: `cloneGeneratedValue(
        resolved.defaults.diagnosticsIgnoreState,
      )`},
					},
				),
			}),
		},
		reflect.TypeOf(TerminalSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createTerminalSectionImpl",
				ImplType:    "TerminalSectionImpl",
				DefaultType: "UserDefaultTerminalSectionImpl",
				Fields:      sectionImplCreateFields("SectionTypeEnum.Terminal", "resolved.defaults"),
			}),
		},
		reflect.TypeOf(ChatSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createChatSectionImpl",
				ImplType:    "ChatSectionImpl",
				DefaultType: "UserDefaultChatSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.Chat",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "managed", Value: "resolved.defaults.managed"},
						{Name: "engineConfigId", Value: "resolved.defaults.engineConfigId"},
						{Name: "transcriptionProfileId", Value: "resolved.defaults.transcriptionProfileId"},
						{Name: "agentProfileId", Value: "resolved.defaults.agentProfileId"},
						{Name: "chatId", Value: "resolved.defaults.chatId"},
						{Name: "thinking", Value: "resolved.defaults.thinking"},
						{Name: "permissionMode", Value: "resolved.defaults.permissionMode"},
						{Name: "searchEnabled", Value: "resolved.defaults.searchEnabled"},
						{Name: "dictationMode", Value: "resolved.defaults.dictationMode"},
						{Name: "messages", Value: "resolved.defaults.messages"},
						{Name: "inputText", Value: "resolved.defaults.inputText"},
						{Name: "waitingForResponse", Value: "resolved.defaults.waitingForResponse"},
						{Name: "toolCallArguments", Value: "resolved.defaults.toolCallArguments"},
						{Name: "activeBranchId", Value: "resolved.defaults.activeBranchId"},
						{Name: "branches", Value: "resolved.defaults.branches"},
					},
				),
			}),
		},
		reflect.TypeOf(BrowserSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createBrowserSectionImpl",
				ImplType:    "BrowserSectionImpl",
				DefaultType: "UserDefaultBrowserSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.Browser",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "folder", Value: "resolved.defaults.folder"},
						{Name: "hideColumn", Value: "resolved.defaults.hideColumn"},
						{Name: "columnWidth", Value: "resolved.defaults.columnWidth"},
						{Name: "typesColumnWidth", Value: "resolved.defaults.typesColumnWidth"},
						{Name: "viewMode", Value: "resolved.defaults.viewMode"},
						{Name: "savedSearches", Value: "resolved.defaults.savedSearches"},
					},
				),
			}),
		},
		reflect.TypeOf(TaskBoardSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:          "createTaskBoardSectionImpl",
				ImplType:      "TaskBoardSectionImpl",
				DefaultType:   "UserDefaultTaskBoardSectionImpl",
				Prelude:       buildTaskBoardOverridesPreludeTS(),
				OverridesExpr: "normalizedOverrides",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.TaskBoard",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "viewMode", Value: "resolved.defaults.viewMode"},
						{Name: "columns", Value: `resolved.defaults.columns === null ||
        resolved.defaults.columns === undefined
          ? []
          : cloneGeneratedValue(resolved.defaults.columns)`},
						{Name: "tasks", Value: "resolved.defaults.tasks"},
					},
				),
			}),
		},
		reflect.TypeOf(BaseChartSettingsUnion{}): {
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
		},
		reflect.TypeOf(ChartSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createChartSectionImpl",
				ImplType:    "ChartSectionImpl",
				DefaultType: "UserDefaultChartSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.Chart",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "dataPath", Value: "resolved.defaults.dataPath"},
						{Name: "chartSettings", Value: "cloneGeneratedValue(resolved.defaults.chartSettings)"},
					},
				),
			}),
		},
		reflect.TypeOf(SpreadsheetSectionImpl{}): {
			exportedResolvedFactoryDeclaration(generatedFactoryDeclarationData{
				Name:        "createSpreadsheetSectionImpl",
				ImplType:    "SpreadsheetSectionImpl",
				DefaultType: "UserDefaultSpreadsheetSectionImpl",
				Fields: sectionImplCreateFields(
					"SectionTypeEnum.Spreadsheet",
					"resolved.defaults",
					[]tsLiteralField{
						{Name: "filePath", Value: "resolved.defaults.filePath"},
						{Name: "activeSheet", Value: "resolved.defaults.activeSheet"},
						{Name: "readOnly", Value: "resolved.defaults.readOnly"},
						{Name: "showRowNumbers", Value: "resolved.defaults.showRowNumbers"},
						{Name: "density", Value: "resolved.defaults.density"},
						{Name: "autoReloadOnExternalChange", Value: "resolved.defaults.autoReloadOnExternalChange"},
					},
				),
			}),
		},
	}
}

type typeConverter struct {
	declarations            []TypeDeclaration
	seen                    map[reflect.Type]struct{}
	stringEnums             map[reflect.Type][]EnumValue
	manualTypes             map[reflect.Type]TypeDeclaration
	manualExtraDeclarations map[reflect.Type][]TypeDeclaration
}

func newTypeConverter() *typeConverter {
	converter := &typeConverter{
		seen: make(map[reflect.Type]struct{}),
		stringEnums: map[reflect.Type][]EnumValue{
			reflect.TypeOf(DependencyKeyType("")): {
				{Name: "Section", Value: "Section"},
				{Name: "SectionParam", Value: "SectionParam"},
			},
			reflect.TypeOf(DependencyValueType("")): {
				{Name: "Literal", Value: "Literal"},
				{Name: "Binary", Value: "Binary"},
				{Name: "FileRead", Value: "FileRead"},
			},
			reflect.TypeOf(ServerMode("")): {
				{Name: "IDE", Value: "ide"},
				{Name: "Share", Value: "share"},
				{Name: "App", Value: "app"},
				{Name: "Launcher", Value: "launcher"},
			},
			reflect.TypeOf(LaunchSettaFilesLocation("")): {
				{Name: "Auto", Value: "auto"},
				{Name: "Local", Value: "local"},
				{Name: "Global", Value: "global"},
			},
			reflect.TypeOf(LaunchResolvedSettaFilesLocation("")): {
				{Name: "Local", Value: "local"},
				{Name: "Global", Value: "global"},
			},
			reflect.TypeOf(LauncherOpenMode("")): {
				{Name: "Browser", Value: "browser"},
				{Name: "ChromeApp", Value: "chrome-app"},
			},
			reflect.TypeOf(LauncherWorkspaceBehavior("")): {
				{Name: "LastUsedOrPrompt", Value: "last_used_or_prompt"},
				{Name: "AlwaysPrompt", Value: "always_prompt"},
			},
			reflect.TypeOf(SetupLauncherWorkspaceBehavior("")): {
				{Name: "LastUsedOrPrompt", Value: "last-used-or-prompt"},
				{Name: "AlwaysPrompt", Value: "always-prompt"},
			},
			reflect.TypeOf(LauncherInstallSource("")): {
				{Name: "UVTool", Value: "uv-tool"},
				{Name: "InstallerManaged", Value: "installer-managed"},
				{Name: "Unsupported", Value: "unsupported"},
			},
			reflect.TypeOf(LauncherUpdateCapability("")): {
				{Name: "InApp", Value: "in_app"},
				{Name: "InstallerManaged", Value: "installer_managed"},
				{Name: "Unsupported", Value: "unsupported"},
			},
			reflect.TypeOf(PluginScope("")): {
				{Name: "Workspace", Value: "workspace"},
				{Name: "SettaFiles", Value: "setta_files"},
				{Name: "Global", Value: "global"},
			},
			reflect.TypeOf(PluginRuntimeState("")): {
				{Name: "active", Value: "active"},
				{Name: "disabled", Value: "disabled"},
				{Name: "invalid", Value: "invalid"},
				{Name: "shadowed", Value: "shadowed"},
				{Name: "pending_restart", Value: "pending_restart"},
			},
			reflect.TypeOf(PluginEnablementSource("")): {
				{Name: "WorkspaceDisabled", Value: "workspace_disabled"},
				{Name: "WorkspaceEnabled", Value: "workspace_enabled"},
				{Name: "GlobalAutoEnabled", Value: "global_auto_enabled"},
				{Name: "ManifestDefault", Value: "manifest_default"},
			},
			reflect.TypeOf(PluginSourceManager("")): {
				{Name: "Setta", Value: "setta"},
				{Name: "PackageManager", Value: "package_manager"},
			},
			reflect.TypeOf(PluginInstallerBackend("")): {
				{Name: "Auto", Value: "auto"},
				{Name: "Pip", Value: "pip"},
				{Name: "UV", Value: "uv"},
			},
			reflect.TypeOf(PluginSourceTrustStatus("")): {
				{Name: "Unverified", Value: "unverified"},
			},
			reflect.TypeOf(PluginBlockedCapabilityReason("")): {
				{Name: "ModePolicy", Value: "mode_policy"},
				{Name: "HostPolicy", Value: "host_policy"},
				{Name: "ManifestInvalid", Value: "manifest_invalid"},
			},
			reflect.TypeOf(PluginRestartCapabilityMode("")): {
				{Name: "Manual", Value: "manual"},
				{Name: "Programmatic", Value: "programmatic"},
			},
			reflect.TypeOf(SettaNotificationType("")): {
				{Name: "error", Value: "error"},
				{Name: "warning", Value: "warning"},
				{Name: "info", Value: "info"},
				{Name: "save", Value: "save"},
			},
			reflect.TypeOf(ChatRole("")): {
				{Name: "system", Value: "system"},
				{Name: "user", Value: "user"},
				{Name: "assistant", Value: "assistant"},
				{Name: "tool", Value: "tool"},
			},
			reflect.TypeOf(ChatPermissionMode("")): {
				{Name: "minimal", Value: "minimal"},
				{Name: "yolo", Value: "yolo"},
				{Name: "config_toml_custom", Value: "config_toml_custom"},
			},
			reflect.TypeOf(ChatDictationMode("")): {
				{Name: "auto", Value: "auto"},
				{Name: "browser", Value: "browser"},
				{Name: "provider", Value: "provider"},
			},
			reflect.TypeOf(SectionType("")): {
				{Name: "Callable", Value: "Callable"},
				{Name: "Dict", Value: "Dict"},
				{Name: "ListRoot", Value: "ListRoot"},
				{Name: "Group", Value: "Group"},
				{Name: "StateMachineStart", Value: "StateMachineStart"},
				{Name: "StateMachineGate", Value: "StateMachineGate"},
				{Name: "StateMachineEnd", Value: "StateMachineEnd"},
				{Name: "Image", Value: "Image"},
				{Name: "Chart", Value: "Chart"},
				{Name: "Draw", Value: "Draw"},
				{Name: "TextBlock", Value: "TextBlock"},
				{Name: "Prompt", Value: "Prompt"},
				{Name: "MetaControl", Value: "MetaControl"},
				{Name: "Social", Value: "Social"},
				{Name: "GlobalVariables", Value: "GlobalVariables"},
				{Name: "Code", Value: "Code"},
				{Name: "GenPythonCode", Value: "GenPythonCode"},
				{Name: "GenPythonMetadata", Value: "GenPythonMetadata"},
				{Name: "Terminal", Value: "Terminal"},
				{Name: "IFrame", Value: "IFrame"},
				{Name: "Chat", Value: "Chat"},
				{Name: "Browser", Value: "Browser"},
				{Name: "Plugin", Value: "Plugin"},
				{Name: "TaskBoard", Value: "TaskBoard"},
				{Name: "Spreadsheet", Value: "Spreadsheet"},
			},
			reflect.TypeOf(CodeObjType("")): {
				{Name: "CodeCallable", Value: "CodeCallable"},
				{Name: "CodeParam", Value: "CodeParam"},
				{Name: "TextParam", Value: "TextParam"},
				{Name: "DateParam", Value: "DateParam"},
				{Name: "TimeParam", Value: "TimeParam"},
				{Name: "ButtonParam", Value: "ButtonParam"},
				{Name: "SliderParam", Value: "SliderParam"},
				{Name: "RotaryParam", Value: "RotaryParam"},
				{Name: "SwitchParam", Value: "SwitchParam"},
				{Name: "ColorPickerParam", Value: "ColorPickerParam"},
				{Name: "DropdownParam", Value: "DropdownParam"},
				{Name: "PasswordParam", Value: "PasswordParam"},
				{Name: "TextAreaParam", Value: "TextAreaParam"},
				{Name: "DropzoneParam", Value: "DropzoneParam"},
				{Name: "NestedParam", Value: "NestedParam"},
			},
			reflect.TypeOf(CodeLanguage("")): {
				{Name: "python", Value: "python"},
				{Name: "bash", Value: "bash"},
				{Name: "javascript", Value: "javascript"},
				{Name: "typescript", Value: "typescript"},
				{Name: "json", Value: "json"},
				{Name: "yaml", Value: "yaml"},
				{Name: "toml", Value: "toml"},
				{Name: "markdown", Value: "markdown"},
				{Name: "plaintext", Value: "plaintext"},
			},
			reflect.TypeOf(ConfigLanguage("")): {
				{Name: "python", Value: "python"},
				{Name: "json", Value: "json"},
			},
			reflect.TypeOf(ParameterPassingStyle("")): {
				{Name: "DEFAULT", Value: "DEFAULT"},
				{Name: "ARGS", Value: "ARGS"},
				{Name: "KWARGS", Value: "KWARGS"},
				{Name: "POSITIONAL_ONLY", Value: "POSITIONAL_ONLY"},
				{Name: "KEYWORD_ONLY", Value: "KEYWORD_ONLY"},
			},
			reflect.TypeOf(ParamNameType("")): {
				{Name: "CODE", Value: "CODE"},
				{Name: "TEXT", Value: "TEXT"},
			},
			reflect.TypeOf(ButtonActionMode("")): {
				{Name: "WEBSOCKET_LISTENER", Value: "WEBSOCKET_LISTENER"},
				{Name: "HTTP_REQUEST", Value: "HTTP_REQUEST"},
				{Name: "SETTA_API", Value: "SETTA_API"},
			},
			reflect.TypeOf(HttpRequestMethod("")): {
				{Name: "GET", Value: "GET"},
				{Name: "POST", Value: "POST"},
				{Name: "PUT", Value: "PUT"},
				{Name: "PATCH", Value: "PATCH"},
				{Name: "DELETE", Value: "DELETE"},
				{Name: "HEAD", Value: "HEAD"},
				{Name: "OPTIONS", Value: "OPTIONS"},
			},
			reflect.TypeOf(DropzoneMode("")): {
				{Name: "STATEFUL", Value: "STATEFUL"},
				{Name: "STATELESS", Value: "STATELESS"},
			},
			reflect.TypeOf(TextParamInputUIType("")): {
				{Name: "plain", Value: "plain"},
				{Name: "time", Value: "time"},
				{Name: "date", Value: "date"},
			},
			reflect.TypeOf(TimeDisplayFormat("")): {
				{Name: "twenty_four_hour", Value: "twenty_four_hour"},
				{Name: "twelve_hour", Value: "twelve_hour"},
			},
			reflect.TypeOf(TimeControlMode("")): {
				{Name: "input", Value: "input"},
				{Name: "display", Value: "display"},
			},
			reflect.TypeOf(TimeDisplayFont("")): {
				{Name: "clock", Value: "clock"},
				{Name: "monospace", Value: "monospace"},
				{Name: "system", Value: "system"},
			},
			reflect.TypeOf(DateDisplayFormat("")): {
				{Name: "iso", Value: "iso"},
				{Name: "us", Value: "us"},
				{Name: "eu", Value: "eu"},
				{Name: "long", Value: "long"},
			},
			reflect.TypeOf(DateControlMode("")): {
				{Name: "input", Value: "input"},
				{Name: "calendar", Value: "calendar"},
			},
			reflect.TypeOf(DateSelectionMode("")): {
				{Name: "single", Value: "single"},
				{Name: "multiple", Value: "multiple"},
			},
			reflect.TypeOf(DateCalendarWeekStart("")): {
				{Name: "sunday", Value: "sunday"},
				{Name: "monday", Value: "monday"},
			},
			reflect.TypeOf(BrowserAreaViewMode("")): {
				{Name: "list", Value: "list"},
				{Name: "thumbnail", Value: "thumbnail"},
				{Name: "carousel", Value: "carousel"},
			},
			reflect.TypeOf(BrowserSearchScope("")): {
				{Name: "recursive", Value: "recursive"},
				{Name: "local", Value: "local"},
			},
			reflect.TypeOf(RunSnapshotMode("")): {
				{Name: "ephemeral", Value: "ephemeral"},
				{Name: "always", Value: "always"},
				{Name: "never", Value: "never"},
			},
			reflect.TypeOf(RenameRefactorMode("")): {
				{Name: "ALWAYS_ASK", Value: "ALWAYS_ASK"},
				{Name: "ALWAYS_RENAME", Value: "ALWAYS_RENAME"},
				{Name: "NEVER_RENAME", Value: "NEVER_RENAME"},
			},
			reflect.TypeOf(BackgroundVariant("")): {
				{Name: "lines", Value: "lines"},
				{Name: "dots", Value: "dots"},
				{Name: "cross", Value: "cross"},
			},
			reflect.TypeOf(SelectionMode("")): {
				{Name: "partial", Value: "partial"},
				{Name: "full", Value: "full"},
			},
			reflect.TypeOf(PanOnScrollMode("")): {
				{Name: "free", Value: "free"},
				{Name: "vertical", Value: "vertical"},
				{Name: "horizontal", Value: "horizontal"},
			},
			reflect.TypeOf(ProjectCodegenLanguage("")): {
				{Name: "python", Value: "python"},
			},
			reflect.TypeOf(SectionCodegenMode("")): {
				{Name: "inherit", Value: "inherit"},
				{Name: "include", Value: "include"},
				{Name: "exclude", Value: "exclude"},
			},
			reflect.TypeOf(SectionRepresentationMode("")): {
				{Name: "expression", Value: "expression"},
				{Name: "file_path", Value: "file_path"},
				{Name: "file_read", Value: "file_read"},
			},
			reflect.TypeOf(CodeObjValueRepresentationMode("")): {
				{Name: "expression", Value: "expression"},
				{Name: "json_parsed", Value: "json_parsed"},
				{Name: "string", Value: "string"},
				{Name: "file_path", Value: "file_path"},
				{Name: "file_read", Value: "file_read"},
			},
			reflect.TypeOf(MetaControlSizeMode("")): {
				{Name: "any", Value: "any"},
				{Name: "auto_only", Value: "auto_only"},
				{Name: "manual_only", Value: "manual_only"},
			},
			reflect.TypeOf(SectionSizeMode("")): {
				{Name: "auto", Value: "auto"},
			},
			reflect.TypeOf(ListRootViewMode("")): {
				{Name: "default", Value: "default"},
				{Name: "task_list", Value: "task_list"},
				{Name: "kanban", Value: "kanban"},
			},
			reflect.TypeOf(TextBlockDisplayMode("")): {
				{Name: "Render", Value: "Render"},
				{Name: "Edit", Value: "Edit"},
			},
			reflect.TypeOf(TextBlockFormat("")): {
				{Name: "Plaintext", Value: "Plaintext"},
				{Name: "Markdown", Value: "Markdown"},
			},
			reflect.TypeOf(TaskBoardViewMode("")): {
				{Name: "task_list", Value: "task_list"},
				{Name: "kanban", Value: "kanban"},
			},
			reflect.TypeOf(TaskBoardTaskRecurrence("")): {
				{Name: "none", Value: "none"},
				{Name: "hourly", Value: "hourly"},
				{Name: "daily", Value: "daily"},
				{Name: "specified_days", Value: "specified_days"},
				{Name: "specified_months", Value: "specified_months"},
				{Name: "specified_years", Value: "specified_years"},
			},
			reflect.TypeOf(TaskBoardRecurringWeekday("")): {
				{Name: "monday", Value: "monday"},
				{Name: "tuesday", Value: "tuesday"},
				{Name: "wednesday", Value: "wednesday"},
				{Name: "thursday", Value: "thursday"},
				{Name: "friday", Value: "friday"},
				{Name: "saturday", Value: "saturday"},
				{Name: "sunday", Value: "sunday"},
			},
			reflect.TypeOf(TaskBoardRecurringMonth("")): {
				{Name: "january", Value: "january"},
				{Name: "february", Value: "february"},
				{Name: "march", Value: "march"},
				{Name: "april", Value: "april"},
				{Name: "may", Value: "may"},
				{Name: "june", Value: "june"},
				{Name: "july", Value: "july"},
				{Name: "august", Value: "august"},
				{Name: "september", Value: "september"},
				{Name: "october", Value: "october"},
				{Name: "november", Value: "november"},
				{Name: "december", Value: "december"},
			},
			reflect.TypeOf(StateMachineGateType("")): {
				{Name: "AND", Value: "AND"},
				{Name: "OR", Value: "OR"},
				{Name: "XOR", Value: "XOR"},
			},
			reflect.TypeOf(StateMachineTargetActionType("")): {
				{Name: "send_prompt", Value: "send_prompt"},
				{Name: "reset_thread", Value: "reset_thread"},
			},
			reflect.TypeOf(StateMachineThreadStrategy("")): {
				{Name: "continue_current_thread", Value: "continue_current_thread"},
				{Name: "new_thread_before_send", Value: "new_thread_before_send"},
			},
			reflect.TypeOf(StateMachineSourceFilterType("")): {
				{Name: "run_completed", Value: "run_completed"},
				{Name: "run_failed", Value: "run_failed"},
				{Name: "signal", Value: "signal"},
			},
			reflect.TypeOf(StateMachineCountOperator("")): {
				{Name: "lt", Value: "lt"},
				{Name: "lte", Value: "lte"},
				{Name: "eq", Value: "eq"},
				{Name: "gte", Value: "gte"},
				{Name: "gt", Value: "gt"},
			},
			reflect.TypeOf(AgenticEdgeKind("")): {
				{Name: "chat_chat", Value: "chat_chat"},
				{Name: "section_chat", Value: "section_chat"},
				{Name: "chat_section", Value: "chat_section"},
			},
			reflect.TypeOf(AgenticEdgeContextMode("")): {
				{Name: "reference_only", Value: "reference_only"},
				{Name: "inline_text", Value: "inline_text"},
				{Name: "summary", Value: "summary"},
			},
			reflect.TypeOf(CodeFileAccessMode("")): {
				{Name: "read_write", Value: "read_write"},
				{Name: "read_only", Value: "read_only"},
				{Name: "write_only", Value: "write_only"},
			},
			reflect.TypeOf(ChatWindowPlacement("")): {
				{Name: "bottom_docked", Value: "bottom_docked"},
				{Name: "floating", Value: "floating"},
				{Name: "maximized", Value: "maximized"},
				{Name: "canvas_section", Value: "canvas_section"},
			},
			reflect.TypeOf(ChatWindowMode("")): {
				{Name: "project_ai_mode", Value: "project_ai_mode"},
				{Name: "section_mode", Value: "section_mode"},
				{Name: "git_graph_mode", Value: "git_graph_mode"},
			},
			reflect.TypeOf(WindowSpaceSurfaceKind("")): {
				{Name: "project_chat", Value: "project_chat"},
				{Name: "section", Value: "section"},
			},
			reflect.TypeOf(ClipboardDataType("")): {
				{Name: "Sections", Value: "Sections"},
			},
			reflect.TypeOf(ChartType("")): {
				{Name: "line", Value: "line"},
				{Name: "scatter", Value: "scatter"},
			},
			reflect.TypeOf(SpreadsheetGridDensity("")): {
				{Name: "compact", Value: "compact"},
				{Name: "comfortable", Value: "comfortable"},
			},
			reflect.TypeOf(StreamingEventType("")): {
				{Name: "MESSAGE_START", Value: "message_start"},
				{Name: "DELTA", Value: "delta"},
				{Name: "TOOL_CALL_DELTA", Value: "tool_call_delta"},
				{Name: "TOOL_ARGUMENT_PREVIEW_DELTA", Value: "tool_argument_preview_delta"},
				{Name: "TOOL_RESULT", Value: "tool_result"},
				{Name: "MESSAGE_STOP", Value: "message_stop"},
				{Name: "MESSAGE_FINALIZED", Value: "message_finalized"},
			},
			reflect.TypeOf(WebsocketConnectionType("")): {
				{Name: "CLI", Value: "CLI"},
				{Name: "SERVER", Value: "SERVER"},
				{Name: "PYTHON_LOGGER", Value: "PYTHON_LOGGER"},
				{Name: "PYTHON_SCRIPT", Value: "PYTHON_SCRIPT"},
				{Name: "FRONTEND", Value: "FRONTEND"},
			},
			reflect.TypeOf(WebsocketMsgTypeForFrontend("")): {
				{Name: "AllConnections", Value: "AllConnections"},
				{Name: "FrontendIdentity", Value: "FrontendIdentity"},
				{Name: "Notification", Value: "Notification"},
				{Name: "LLMStreamingResponse", Value: "LLMStreamingResponse"},
				{Name: "LSPDiagnostics", Value: "LSPDiagnostics"},
				{Name: "NameValidationErrors", Value: "NameValidationErrors"},
				{Name: "ReturnRenameRefactorResults", Value: "ReturnRenameRefactorResults"},
				{Name: "TerminalMetadata", Value: "TerminalMetadata"},
				{Name: "UpdateFrontendProjectState", Value: "UpdateFrontendProjectState"},
				{Name: "UpdateSettings", Value: "UpdateSettings"},
				{Name: "AllProjectMetadata", Value: "AllProjectMetadata"},
				{Name: "UpdateArtifacts", Value: "UpdateArtifacts"},
				{Name: "ListenerCoverageSnapshot", Value: "ListenerCoverageSnapshot"},
				{Name: "LLMConfigUpdated", Value: "LLMConfigUpdated"},
				{Name: "LLMApiKeysUpdated", Value: "LLMApiKeysUpdated"},
				{Name: "AgentRunUpdated", Value: "AgentRunUpdated"},
				{Name: "BackendLogEvent", Value: "BackendLogEvent"},
				{Name: "AIFollowToolArgumentsUpdate", Value: "AIFollowToolArgumentsUpdate"},
				{Name: "AIFollowToolResultUpdate", Value: "AIFollowToolResultUpdate"},
				{Name: "UISettingReveal", Value: "UISettingReveal"},
				{Name: "AgentProfilesUpdated", Value: "AgentProfilesUpdated"},
				{Name: "PromptTemplatesUpdated", Value: "PromptTemplatesUpdated"},
				{Name: "ExternalAgentConfigsUpdated", Value: "ExternalAgentConfigsUpdated"},
				{Name: "EngineConfigsUpdated", Value: "EngineConfigsUpdated"},
				{Name: "TranscriptionProfilesUpdated", Value: "TranscriptionProfilesUpdated"},
			},
			reflect.TypeOf(WebsocketMsgTypeForBackend("")): {
				{Name: "CurrentAddressUpdate", Value: "CurrentAddressUpdate"},
				{Name: "UISettingRevealResult", Value: "UISettingRevealResult"},
				{Name: "RealtimeUIChange", Value: "RealtimeUIChange"},
				{Name: "RealtimeDependencyEvent", Value: "RealtimeDependencyEvent"},
			},
			reflect.TypeOf(ArtifactType("")): {
				{Name: "Image", Value: "Image"},
				{Name: "BrushStroke", Value: "BrushStroke"},
				{Name: "DrawAreaLayerItemTransform", Value: "DrawAreaLayerItemTransform"},
				{Name: "ChartData", Value: "ChartData"},
				{Name: "File", Value: "File"},
			},
			reflect.TypeOf(DrawAreaBrushShape("")): {
				{Name: "butt", Value: "butt"},
				{Name: "round", Value: "round"},
				{Name: "square", Value: "square"},
			},
			reflect.TypeOf(DrawAreaMode("")): {
				{Name: "draw", Value: "draw"},
				{Name: "erase", Value: "erase"},
				{Name: "edit", Value: "edit"},
			},
			reflect.TypeOf(ArtifactSaveConflictStrategy("")): {
				{Name: "skip", Value: "skip"},
				{Name: "backup", Value: "backup"},
				{Name: "overwrite", Value: "overwrite"},
			},
			reflect.TypeOf(ArtifactSaveStatus("")): {
				{Name: "saved", Value: "saved"},
				{Name: "unchanged", Value: "unchanged"},
				{Name: "skipped", Value: "skipped"},
				{Name: "conflict", Value: "conflict"},
			},
			reflect.TypeOf(MissingFolderBehavior("")): {
				{Name: "error", Value: "error"},
				{Name: "empty", Value: "empty"},
			},
			reflect.TypeOf(FolderContentItemType("")): {
				{Name: "folder", Value: "folder"},
				{Name: "file", Value: "file"},
			},
			reflect.TypeOf(TransferOperation("")): {
				{Name: "copy", Value: "copy"},
				{Name: "move", Value: "move"},
			},
			reflect.TypeOf(GitDiffMode("")): {
				{Name: "unstaged", Value: "unstaged"},
				{Name: "staged", Value: "staged"},
			},
		},
		manualTypes: map[reflect.Type]TypeDeclaration{
			reflect.TypeOf(SectionDependencyKey{}): {
				Name: "SectionDependencyKey",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "sectionId", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyKeyTypeEnum.Section"},
				},
			},
			reflect.TypeOf(SectionParamDependencyKey{}): {
				Name: "SectionParamDependencyKey",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "sectionId", TypeExpr: "string"},
					{Name: "codeObjId", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyKeyTypeEnum.SectionParam"},
				},
			},
			reflect.TypeOf(BaseDependencyKeyUnion{}): {
				Name:  "BaseDependencyKeyUnion",
				Kind:  "alias",
				Alias: "SectionDependencyKey | SectionParamDependencyKey",
			},
			reflect.TypeOf(LiteralDependencyValue{}): {
				Name: "LiteralDependencyValue",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "payload", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyValueTypeEnum.Literal"},
				},
			},
			reflect.TypeOf(FileReadDependencyValue{}): {
				Name: "FileReadDependencyValue",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "payload", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyValueTypeEnum.FileRead"},
				},
			},
			reflect.TypeOf(BinaryDependencyValue{}): {
				Name: "BinaryDependencyValue",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "payload", TypeExpr: "BinaryContentRef"},
					{Name: "type", TypeExpr: "typeof DependencyValueTypeEnum.Binary"},
				},
			},
			reflect.TypeOf(BaseDependencyValueUnion{}): {
				Name:  "BaseDependencyValueUnion",
				Kind:  "alias",
				Alias: "LiteralDependencyValue | FileReadDependencyValue | BinaryDependencyValue",
			},
			reflect.TypeOf(BuiltinCodeLanguage{}): aliasDeclaration(
				"BuiltinCodeLanguage",
				"CodeLanguage",
			),
			reflect.TypeOf(RunCodeRequestInput{}): {
				Name: "RunCodeRequestInput",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "projectConfigId", TypeExpr: "string"},
					{Name: "sectionId", TypeExpr: "string | null"},
					{Name: "terminalSectionId", TypeExpr: "string | null", Optional: true},
					{Name: "cliId", TypeExpr: "string | null", Optional: true},
					{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode | null", Optional: true},
					{Name: "drawSnapshotsBySectionId", TypeExpr: "Record<string, BinaryContentRef> | null", Optional: true},
					{Name: "sectionVariantOverrides", TypeExpr: "Record<string, string> | null", Optional: true},
					{Name: "paramOverrides", TypeExpr: "Record<string, string> | null", Optional: true},
				},
			},
			reflect.TypeOf(EngineConfigDefaults{}): objectDeclarationWithCreateBody(
				"EngineConfigDefaults",
				buildEngineConfigDefaultsCreateBodyTS(),
				TypeProperty{Name: "thinking", TypeExpr: "boolean | null", Optional: true},
			),
			reflect.TypeOf(EngineRuntimeSupport{}): objectDeclarationWithCreateBody(
				"EngineRuntimeSupport",
				buildEngineRuntimeSupportCreateBodyTS(),
				TypeProperty{Name: "thinking", TypeExpr: "boolean"},
			),
			reflect.TypeOf(EngineConfig{}): objectDeclarationWithCreateBody(
				"EngineConfig",
				buildEngineConfigCreateBodyTS(),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "engineType", TypeExpr: "EngineType"},
				TypeProperty{Name: "settaLlmConfigId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "externalAgentConfigId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "defaults", TypeExpr: "EngineConfigDefaults"},
				TypeProperty{Name: "runtimeSupport", TypeExpr: "EngineRuntimeSupport | null", Optional: true},
			),
			reflect.TypeOf(AgentProfile{}): objectDeclaration(
				"AgentProfile",
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "description", TypeExpr: "string"},
				TypeProperty{Name: "systemPrompt", TypeExpr: "string"},
				TypeProperty{Name: "enableBackgroundSummaryFill", TypeExpr: "boolean"},
				TypeProperty{Name: "enableLlmChatTitles", TypeExpr: "boolean"},
				TypeProperty{Name: "engineConfigId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "toolAllowlist", TypeExpr: "Array<string>"},
				TypeProperty{Name: "memoryScope", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(TranscriptionProfile{}): objectDeclaration(
				"TranscriptionProfile",
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "transcriptionLlmConfigId", TypeExpr: "string"},
				TypeProperty{Name: "transportMode", TypeExpr: "TranscriptionTransportMode"},
				TypeProperty{Name: "chunkMs", TypeExpr: "number"},
				TypeProperty{Name: "supportsRealtimeTranscription", TypeExpr: "boolean"},
				TypeProperty{Name: "language", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(RunEvent{}): objectDeclarationWithCreateBody(
				"RunEvent",
				buildRunEventCreateBodyTS(),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "timestamp", TypeExpr: "string"},
				TypeProperty{Name: "type", TypeExpr: "string"},
				TypeProperty{Name: "payload", TypeExpr: "Record<string, unknown>", Optional: true},
			),
			reflect.TypeOf(AgentRun{}): objectDeclarationWithCreateBody(
				"AgentRun",
				buildAgentRunCreateBodyTS(),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "profileId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "status", TypeExpr: "AgentRunStatus"},
				TypeProperty{Name: "startedAt", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "finishedAt", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "inputs", TypeExpr: "Record<string, unknown> | null", Optional: true},
				TypeProperty{Name: "outputs", TypeExpr: "Record<string, unknown> | null", Optional: true},
				TypeProperty{Name: "toolCalls", TypeExpr: "Array<Record<string, unknown>>"},
				TypeProperty{Name: "cost", TypeExpr: "number | null", Optional: true},
				TypeProperty{Name: "events", TypeExpr: "Array<RunEvent>"},
			),
			reflect.TypeOf(AgentRunList{}): aliasDeclaration(
				"AgentRunList",
				"Array<AgentRun>",
			),
			reflect.TypeOf(MessageTextDelta{}): objectDeclaration(
				"MessageTextDelta",
				TypeProperty{Name: "type", TypeExpr: `"text_delta"`},
				TypeProperty{Name: "index", TypeExpr: "number"},
				TypeProperty{Name: "text", TypeExpr: "string"},
			),
			reflect.TypeOf(MessageThinkingDelta{}): objectDeclaration(
				"MessageThinkingDelta",
				TypeProperty{Name: "type", TypeExpr: `"thinking_delta"`},
				TypeProperty{Name: "index", TypeExpr: "number"},
				TypeProperty{Name: "thinking", TypeExpr: "string"},
				TypeProperty{Name: "summary", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "signature", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf((*MessageContentDelta)(nil)).Elem(): aliasDeclaration(
				"MessageContentDelta",
				"MessageTextDelta | MessageThinkingDelta",
			),
			reflect.TypeOf(MessageStartEvent{}): objectDeclaration(
				"MessageStartEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_START"},
				TypeProperty{Name: "message", TypeExpr: "BaseChatMessageUnion"},
			),
			reflect.TypeOf(MessageDeltaEvent{}): objectDeclaration(
				"MessageDeltaEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.DELTA"},
				TypeProperty{Name: "message_id", TypeExpr: "string"},
				TypeProperty{Name: "content", TypeExpr: "Array<MessageContentDelta> | null", Optional: true},
			),
			reflect.TypeOf(ToolCallDeltaEvent{}): objectDeclaration(
				"ToolCallDeltaEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_CALL_DELTA"},
				TypeProperty{Name: "message_id", TypeExpr: "string"},
				TypeProperty{Name: "tool_call_id", TypeExpr: "string"},
				TypeProperty{Name: "arguments_delta", TypeExpr: "string"},
				TypeProperty{Name: "tool_name", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(ToolResultEvent{}): objectDeclaration(
				"ToolResultEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_RESULT"},
				TypeProperty{Name: "result", TypeExpr: "ToolChatMessage"},
			),
			reflect.TypeOf(ToolArgumentPreviewDeltaEvent{}): objectDeclaration(
				"ToolArgumentPreviewDeltaEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA"},
				TypeProperty{Name: "message_id", TypeExpr: "string"},
				TypeProperty{Name: "tool_call_id", TypeExpr: "string"},
				TypeProperty{Name: "tool_name", TypeExpr: "string"},
				TypeProperty{Name: "arguments_delta", TypeExpr: "string"},
				TypeProperty{Name: "preview_kind", TypeExpr: "string"},
				TypeProperty{Name: "target_ids_by_type", TypeExpr: "Record<string, Array<string>>"},
				TypeProperty{Name: "preview_value_delta", TypeExpr: "string"},
			),
			reflect.TypeOf(MessageStopEvent{}): objectDeclaration(
				"MessageStopEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_STOP"},
				TypeProperty{Name: "message_id", TypeExpr: "string"},
			),
			reflect.TypeOf(MessageFinalizedEvent{}): objectDeclaration(
				"MessageFinalizedEvent",
				TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_FINALIZED"},
				TypeProperty{Name: "message", TypeExpr: "BaseChatMessageUnion"},
			),
			reflect.TypeOf((*LLMStreamingResponseChunk)(nil)).Elem(): aliasDeclaration(
				"LLMStreamingResponseChunk",
				"MessageStartEvent | MessageDeltaEvent | ToolCallDeltaEvent | ToolResultEvent | ToolArgumentPreviewDeltaEvent | MessageStopEvent | MessageFinalizedEvent",
			),
			reflect.TypeOf(LLMStreamingResponse{}): objectDeclaration(
				"LLMStreamingResponse",
				TypeProperty{Name: "chatId", TypeExpr: "string"},
				TypeProperty{Name: "chunk", TypeExpr: "LLMStreamingResponseChunk"},
				TypeProperty{Name: "sectionId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(UpdateAgentProfileRequestInput{}): objectDeclaration(
				"UpdateAgentProfileRequestInput",
				TypeProperty{Name: "profile", TypeExpr: "AgentProfile"},
			),
			reflect.TypeOf(UpdateEngineConfigRequestInput{}): objectDeclaration(
				"UpdateEngineConfigRequestInput",
				TypeProperty{Name: "config", TypeExpr: "EngineConfig"},
			),
			reflect.TypeOf(CreateTranscriptionProfileRequestInput{}): objectDeclaration(
				"CreateTranscriptionProfileRequestInput",
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "transcriptionLlmConfigId", TypeExpr: "string"},
				TypeProperty{Name: "transportMode", TypeExpr: "TranscriptionTransportMode"},
				TypeProperty{Name: "chunkMs", TypeExpr: "number"},
				TypeProperty{Name: "language", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(UpdateTranscriptionProfileRequestInput{}): objectDeclaration(
				"UpdateTranscriptionProfileRequestInput",
				TypeProperty{Name: "profile", TypeExpr: "TranscriptionProfile"},
			),
			reflect.TypeOf(SetChatSectionStateRequestInput{}): objectDeclaration(
				"SetChatSectionStateRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "state", TypeExpr: "ChatSectionState"},
			),
			reflect.TypeOf(SetStateMachineSectionSettingsRequestInput{}): objectDeclaration(
				"SetStateMachineSectionSettingsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "machineGroupId", TypeExpr: "string"},
				TypeProperty{Name: "label", TypeExpr: "string"},
				TypeProperty{Name: "gateType", TypeExpr: "StateMachineGateType | null", Optional: true},
			),
			reflect.TypeOf(SectionSizeValue{}): aliasDeclaration(
				"SectionSizeValue",
				"number | SectionSizeMode",
			),
			reflect.TypeOf(SectionSize{}): objectDeclarationWithCreateExpr(
				"SectionSize",
				`mergeGeneratedOptions(
    {
      width: SectionSizeModeEnum.auto,
      height: SectionSizeModeEnum.auto,
    },
    options,
  )`,
				TypeProperty{Name: "width", TypeExpr: "SectionSizeValue"},
				TypeProperty{Name: "height", TypeExpr: "SectionSizeValue"},
			),
			reflect.TypeOf(SectionSizingPolicyTypeEntry{}): objectDeclaration(
				"SectionSizingPolicyTypeEntry",
				TypeProperty{Name: "minHeight", TypeExpr: "number"},
				TypeProperty{Name: "maxHeight", TypeExpr: "number"},
				TypeProperty{Name: "minWidth", TypeExpr: "number"},
				TypeProperty{Name: "maxWidth", TypeExpr: "number"},
			),
			reflect.TypeOf(SectionSizingPolicyCallableTypeEntry{}): aliasDeclaration(
				"SectionSizingPolicyCallableTypeEntry",
				`SectionSizingPolicyTypeEntry & {
  hideSearchMinHeight: number;
  hideParamsMinHeight: number;
}`,
			),
			reflect.TypeOf(MetaControlSizingPolicyTypeEntry{}): objectDeclaration(
				"MetaControlSizingPolicyTypeEntry",
				TypeProperty{Name: "minHeight", TypeExpr: "number"},
				TypeProperty{Name: "minWidth", TypeExpr: "number"},
				TypeProperty{Name: "sizeModeHeight", TypeExpr: "MetaControlSizeMode"},
				TypeProperty{Name: "sizeModeWidth", TypeExpr: "MetaControlSizeMode"},
			),
			reflect.TypeOf(MetaControlSizingPolicyByType{}): objectDeclarationWithCreateBody(
				"MetaControlSizingPolicyByType",
				buildMetaControlSizingPolicyByTypeCreateBodyTS(),
				metaControlSizingPolicyByTypeProperties()...,
			),
			reflect.TypeOf(SectionSizingPolicyGlobals{}): objectDeclarationWithCreateExpr(
				"SectionSizingPolicyGlobals",
				`mergeGeneratedOptions(
    {
      pinnedParamsAreaMinHeight: 64,
      unpinnedParamsAreaMinHeight: 36,
      minimizedHeight: 32,
      infiniteMaxHeight: 100000,
      infiniteMaxWidth: 100000,
      autoMaxHeight: 350,
    },
    options,
  )`,
				TypeProperty{Name: "pinnedParamsAreaMinHeight", TypeExpr: "number"},
				TypeProperty{Name: "unpinnedParamsAreaMinHeight", TypeExpr: "number"},
				TypeProperty{Name: "minimizedHeight", TypeExpr: "number"},
				TypeProperty{Name: "infiniteMaxHeight", TypeExpr: "number"},
				TypeProperty{Name: "infiniteMaxWidth", TypeExpr: "number"},
				TypeProperty{Name: "autoMaxHeight", TypeExpr: "number"},
			),
			reflect.TypeOf(SectionSizingPolicyByType{}): objectDeclarationWithCreateBody(
				"SectionSizingPolicyByType",
				buildSectionSizingPolicyByTypeCreateBodyTS(),
				sectionSizingPolicyByTypeProperties()...,
			),
			reflect.TypeOf(SectionSizingPolicy{}): objectDeclarationWithCreateBody(
				"SectionSizingPolicy",
				buildSectionSizingPolicyCreateBodyTS(),
				TypeProperty{Name: "byType", TypeExpr: "SectionSizingPolicyByType"},
				TypeProperty{Name: "metaControlByType", TypeExpr: "MetaControlSizingPolicyByType"},
				TypeProperty{Name: "globals", TypeExpr: "SectionSizingPolicyGlobals"},
			),
			reflect.TypeOf(SharePolicy{}): objectDeclarationWithCreateExpr(
				"SharePolicy",
				buildDefaultSharePolicyCreateExprTS(),
				TypeProperty{Name: "allowParamChanges", TypeExpr: "boolean"},
				TypeProperty{Name: "allowVariantChanges", TypeExpr: "boolean"},
				TypeProperty{Name: "allowLayoutChanges", TypeExpr: "boolean"},
				TypeProperty{Name: "allowRun", TypeExpr: "boolean"},
				TypeProperty{Name: "allowLLM", TypeExpr: "boolean"},
				TypeProperty{Name: "allowExternalLinks", TypeExpr: "boolean"},
				TypeProperty{Name: "allowFileDownloads", TypeExpr: "boolean"},
				TypeProperty{Name: "allowMultipleRuns", TypeExpr: "boolean"},
				TypeProperty{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode"},
			),
			reflect.TypeOf(SettingsShortcuts{}): objectDeclarationWithCreateExpr(
				"SettingsShortcuts",
				buildSettingsSectionCreateExprTS("shortcuts", settingsShortcutsTypeProperties()),
				settingsShortcutsTypeProperties()...,
			),
			reflect.TypeOf(SettingsGUI{}): objectDeclarationWithCreateExpr(
				"SettingsGUI",
				buildSettingsSectionCreateExprTS("gui", settingsGUITypeProperties()),
				settingsGUITypeProperties()...,
			),
			reflect.TypeOf(SettingsBackend{}): objectDeclarationWithCreateExpr(
				"SettingsBackend",
				buildSettingsSectionCreateExprTS("backend", settingsBackendTypeProperties()),
				settingsBackendTypeProperties()...,
			),
			reflect.TypeOf(SettingsState{}): objectDeclarationWithCreateBody(
				"SettingsState",
				buildSettingsStateCreateBodyTS(),
				TypeProperty{Name: "shortcuts", TypeExpr: "SettingsShortcuts"},
				TypeProperty{Name: "gui", TypeExpr: "SettingsGUI"},
				TypeProperty{Name: "backend", TypeExpr: "SettingsBackend"},
				TypeProperty{Name: "sectionSizingPolicy", TypeExpr: "SectionSizingPolicy"},
				TypeProperty{Name: "languageServer", TypeExpr: "Record<string, unknown>"},
			),
			reflect.TypeOf(SectionTypeCodegenPolicy{}): objectDeclarationWithCreateExpr(
				"SectionTypeCodegenPolicy",
				`mergeGeneratedOptions(
    {
      mode: SectionCodegenModeEnum.inherit,
      representation: SectionRepresentationModeEnum.expression,
    },
    options,
  )`,
				TypeProperty{Name: "mode", TypeExpr: "SectionCodegenMode"},
				TypeProperty{Name: "representation", TypeExpr: "SectionRepresentationMode"},
			),
			reflect.TypeOf(SectionCodegenOverride{}): objectDeclarationWithCreateExpr(
				"SectionCodegenOverride",
				`mergeGeneratedOptions(
    {
      mode: SectionCodegenModeEnum.inherit,
      representation: SectionRepresentationModeEnum.expression,
    },
    options,
  )`,
				TypeProperty{Name: "mode", TypeExpr: "SectionCodegenMode"},
				TypeProperty{Name: "representation", TypeExpr: "SectionRepresentationMode"},
			),
			reflect.TypeOf(SectionCodegenPolicy{}): objectDeclarationWithCreateBody(
				"SectionCodegenPolicy",
				buildSectionCodegenPolicyCreateBodyTS(),
				TypeProperty{Name: "allowlist", TypeExpr: "Array<SectionType> | null", Optional: true},
				TypeProperty{Name: "metaControlAllowlist", TypeExpr: "Array<CodeObjType> | null", Optional: true},
				TypeProperty{Name: "exclude", TypeExpr: "Array<string>"},
				TypeProperty{Name: "typePolicies", TypeExpr: "Record<SectionType, SectionTypeCodegenPolicy>"},
				TypeProperty{Name: "sectionOverrides", TypeExpr: "Record<string, SectionCodegenOverride>"},
			),
			reflect.TypeOf(CodeObjTypeValuePolicy{}): objectDeclarationWithCreateExpr(
				"CodeObjTypeValuePolicy",
				`mergeGeneratedOptions(
    {
      representation: CodeObjValueRepresentationModeEnum.expression,
    },
    options,
  )`,
				TypeProperty{Name: "representation", TypeExpr: "CodeObjValueRepresentationMode"},
			),
			reflect.TypeOf(CodeObjValueOverride{}): objectDeclarationWithCreateExpr(
				"CodeObjValueOverride",
				`mergeGeneratedOptions(
    {
      representation: CodeObjValueRepresentationModeEnum.expression,
    },
    options,
  )`,
				TypeProperty{Name: "representation", TypeExpr: "CodeObjValueRepresentationMode"},
			),
			reflect.TypeOf(CodeObjValuePolicy{}): objectDeclarationWithCreateBody(
				"CodeObjValuePolicy",
				buildCodeObjValuePolicyCreateBodyTS(),
				TypeProperty{Name: "typePolicies", TypeExpr: "Record<CodeObjType, CodeObjTypeValuePolicy>"},
				TypeProperty{Name: "codeObjOverrides", TypeExpr: "Record<string, CodeObjValueOverride>"},
			),
			reflect.TypeOf(ProjectCodegenPythonTarget{}): objectDeclarationWithCreateBody(
				"ProjectCodegenPythonTarget",
				buildProjectCodegenPythonTargetCreateBodyTS(),
				TypeProperty{Name: "language", TypeExpr: "typeof ProjectCodegenLanguageEnum.python"},
				TypeProperty{Name: "genCodePrefix", TypeExpr: "string"},
				TypeProperty{Name: "genCodeSuffix", TypeExpr: "string"},
				TypeProperty{Name: "generateMetadata", TypeExpr: "boolean"},
				TypeProperty{Name: "sectionPolicy", TypeExpr: "SectionCodegenPolicy"},
				TypeProperty{Name: "codeObjValuePolicy", TypeExpr: "CodeObjValuePolicy"},
			),
			reflect.TypeOf(ProjectCodegenPluginTarget{}): objectDeclarationWithCreateExpr(
				"ProjectCodegenPluginTarget",
				`mergeGeneratedOptions(
    {
      language: "",
      options: {},
    },
    options,
  )`,
				TypeProperty{Name: "language", TypeExpr: "string"},
				TypeProperty{Name: "options", TypeExpr: "Record<string, unknown>"},
			),
			reflect.TypeOf(ProjectCodegenTarget{}): aliasDeclaration(
				"ProjectCodegenTarget",
				"ProjectCodegenPythonTarget | ProjectCodegenPluginTarget",
			),
			reflect.TypeOf(Viewport{}): objectDeclaration(
				"Viewport",
				TypeProperty{Name: "x", TypeExpr: "number"},
				TypeProperty{Name: "y", TypeExpr: "number"},
				TypeProperty{Name: "zoom", TypeExpr: "number"},
			),
			reflect.TypeOf(TopLevelSectionLayout{}): objectDeclarationWithCreateExpr(
				"TopLevelSectionLayout",
				`mergeGeneratedOptions(
    {
      x: 0,
      y: 0,
      zIndex: 0,
      w: null,
      h: null,
    },
    options,
  )`,
				TypeProperty{Name: "x", TypeExpr: "number"},
				TypeProperty{Name: "y", TypeExpr: "number"},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "w", TypeExpr: "number | null", Optional: true},
				TypeProperty{Name: "h", TypeExpr: "number | null", Optional: true},
			),
			reflect.TypeOf(ViewMode{}): objectDeclarationWithCreateExpr(
				"ViewMode",
				`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      sortIndex: 0,
      isUserFacing: false,
      isTab: false,
      visibilityBySectionId: {},
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {},
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "sortIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "isUserFacing", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "isTab", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "visibilityBySectionId", TypeExpr: "Record<string, boolean>", Optional: true},
				TypeProperty{Name: "viewport", TypeExpr: "Viewport | null", Optional: true},
				TypeProperty{Name: "viewportInitialized", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "topLevelSections", TypeExpr: "Record<string, TopLevelSectionLayout>", Optional: true},
			),
			reflect.TypeOf(ViewModeConfig{}): aliasDeclarationWithCreateExpr(
				"ViewModeConfig",
				"ViewMode",
				"createViewMode(options)",
			),
			reflect.TypeOf(Edge{}): objectDeclaration(
				"Edge",
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "sourceVariantId", TypeExpr: "string"},
				TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetVariantId", TypeExpr: "string"},
				TypeProperty{Name: "targetPortId", TypeExpr: "string"},
				TypeProperty{Name: "type", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "label", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "style", TypeExpr: "Record<string, unknown>", Optional: true},
				TypeProperty{Name: "animated", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "data", TypeExpr: "Record<string, unknown>", Optional: true},
				TypeProperty{Name: "selected", TypeExpr: "boolean", Optional: true},
			),
			reflect.TypeOf(StateMachineGateUIState{}): objectDeclarationWithCreateExpr(
				"StateMachineGateUIState",
				`mergeGeneratedOptions(
    {
      showDetails: false,
    },
    options,
  )`,
				TypeProperty{Name: "showDetails", TypeExpr: "boolean", Optional: true},
			),
			reflect.TypeOf(StateMachineSourceFilter{}): objectDeclarationWithCreateExpr(
				"StateMachineSourceFilter",
				`mergeGeneratedOptions(
    {
      type: StateMachineSourceFilterTypeEnum.run_completed,
      signalName: null,
      payloadField: null,
      equals: null,
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "StateMachineSourceFilterType", Optional: true},
				TypeProperty{Name: "signalName", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "payloadField", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "equals", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(StateMachineSourceActivationCountCondition{}): objectDeclarationWithCreateExpr(
				"StateMachineSourceActivationCountCondition",
				`mergeGeneratedOptions(
    {
      operator: StateMachineCountOperatorEnum.eq,
      value: 0,
    },
    options,
  )`,
				TypeProperty{Name: "operator", TypeExpr: "StateMachineCountOperator", Optional: true},
				TypeProperty{Name: "value", TypeExpr: "number"},
			),
			reflect.TypeOf(StateMachineTargetAction{}): objectDeclarationWithCreateExpr(
				"StateMachineTargetAction",
				`mergeGeneratedOptions(
    {
      type: StateMachineTargetActionTypeEnum.send_prompt,
      promptTemplateId: null,
      promptSectionId: null,
      inlinePrompt: null,
      promptInputs: {},
      threadStrategy: StateMachineThreadStrategyEnum.continue_current_thread,
      stopIfRunning: false,
      engineConfigId: null,
      agentProfileId: null,
      permissionMode: null,
      searchEnabled: null,
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "StateMachineTargetActionType", Optional: true},
				TypeProperty{Name: "promptTemplateId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "promptSectionId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "inlinePrompt", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "promptInputs", TypeExpr: "Record<string, string>", Optional: true},
				TypeProperty{Name: "threadStrategy", TypeExpr: "StateMachineThreadStrategy", Optional: true},
				TypeProperty{Name: "stopIfRunning", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "engineConfigId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "agentProfileId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "permissionMode", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "searchEnabled", TypeExpr: "boolean | null", Optional: true},
			),
			reflect.TypeOf(StateMachineEdge{}): objectDeclarationWithCreateExpr(
				"StateMachineEdge",
				`mergeGeneratedOptions(
    {
      id: "",
      machineGroupId: "",
      sourceSectionId: "",
      sourcePortId: "workflow-source",
      targetSectionId: "",
      targetPortId: "workflow-target",
      sourceFilter: null,
      sourceActivationCountCondition: null,
      targetAction: null,
      style: null,
      hidden: false,
      zIndex: 0,
      selected: false,
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "machineGroupId", TypeExpr: "string"},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetPortId", TypeExpr: "string"},
				TypeProperty{Name: "sourceFilter", TypeExpr: "StateMachineSourceFilter | null", Optional: true},
				TypeProperty{Name: "sourceActivationCountCondition", TypeExpr: "StateMachineSourceActivationCountCondition | null", Optional: true},
				TypeProperty{Name: "targetAction", TypeExpr: "StateMachineTargetAction | null", Optional: true},
				TypeProperty{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
				TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "selected", TypeExpr: "boolean", Optional: true},
			),
			reflect.TypeOf(AgenticEdge{}): objectDeclarationWithCreateExpr(
				"AgenticEdge",
				`mergeGeneratedOptions(
    {
      id: "",
      sourceSectionId: "",
      targetSectionId: "",
      kind: AgenticEdgeKindEnum.section_chat,
      contextMode: null,
      style: {},
      hidden: false,
      zIndex: 0,
      selected: false,
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "kind", TypeExpr: "AgenticEdgeKind"},
				TypeProperty{Name: "contextMode", TypeExpr: "AgenticEdgeContextMode | null", Optional: true},
				TypeProperty{Name: "style", TypeExpr: "Record<string, unknown>", Optional: true},
				TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "selected", TypeExpr: "boolean", Optional: true},
			),
			reflect.TypeOf(WatchCodeFolder{}): objectDeclaration(
				"WatchCodeFolder",
				TypeProperty{Name: "path", TypeExpr: "string"},
				TypeProperty{Name: "recursive", TypeExpr: "boolean"},
			),
			reflect.TypeOf(WatchCodeRegistryEntry{}): objectDeclaration(
				"WatchCodeRegistryEntry",
				TypeProperty{Name: "callableName", TypeExpr: "string"},
				TypeProperty{Name: "kind", TypeExpr: "string"},
				TypeProperty{Name: "signatureHash", TypeExpr: "string"},
				TypeProperty{Name: "bodyHash", TypeExpr: "string"},
				TypeProperty{Name: "sourcePath", TypeExpr: "string"},
				TypeProperty{Name: "sectionIds", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "sectionsCount", TypeExpr: "number", Optional: true},
			),
			reflect.TypeOf(CodeFileBinding{}): objectDeclaration(
				"CodeFileBinding",
				TypeProperty{Name: "canonical_path", TypeExpr: "string"},
				TypeProperty{Name: "access_mode", TypeExpr: "CodeFileAccessMode"},
				TypeProperty{Name: "autoBinding", TypeExpr: "boolean"},
			),
			reflect.TypeOf(ClipboardProjectStateCore{}): objectDeclarationWithCreateExpr(
				"ClipboardProjectStateCore",
				`mergeGeneratedOptions(
    {
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
    },
    options,
  )`,
				TypeProperty{Name: "sections", TypeExpr: "Record<string, Core>"},
				TypeProperty{Name: "sectionImpls", TypeExpr: "Record<string, BaseSectionImplUnion>"},
				TypeProperty{Name: "sectionVariants", TypeExpr: "Record<string, Variant>"},
				TypeProperty{Name: "codeObjs", TypeExpr: "Record<string, Core>"},
				TypeProperty{Name: "codeObjImpls", TypeExpr: "Record<string, BaseCodeObjImplUnion>"},
				TypeProperty{Name: "codeObjVariants", TypeExpr: "Record<string, Variant>"},
			),
			reflect.TypeOf(ClipboardProjectStateCoreWithSectionVariantMap{}): objectDeclarationWithCreateExpr(
				"ClipboardProjectStateCoreWithSectionVariantMap",
				`mergeGeneratedOptions(
    {
      core: createClipboardProjectStateCore(),
      sectionVariantMap: {},
    },
    options,
  )`,
				TypeProperty{Name: "core", TypeExpr: "ClipboardProjectStateCore"},
				TypeProperty{Name: "sectionVariantMap", TypeExpr: "Record<string, string>"},
			),
			reflect.TypeOf(SectionsClipboardData{}): objectDeclarationWithCreateExpr(
				"SectionsClipboardData",
				`mergeGeneratedOptions(
    {
      type: ClipboardDataTypeEnum.Sections,
      data: createClipboardProjectStateCoreWithSectionVariantMap(),
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ClipboardDataTypeEnum.Sections"},
				TypeProperty{Name: "data", TypeExpr: "ClipboardProjectStateCoreWithSectionVariantMap"},
			),
			reflect.TypeOf(BaseClipboardDataUnionWithDiscriminator{}): aliasDeclaration(
				"BaseClipboardDataUnionWithDiscriminator",
				"SectionsClipboardData",
			),
			reflect.TypeOf(Core{}): objectDeclarationWithCreateExpr(
				"Core",
				`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      displayName: "",
      variants: [],
      defaultVariant: null,
      sharedModifier: {},
      unsharedKeys: [],
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "displayName", TypeExpr: "string"},
				TypeProperty{Name: "variants", TypeExpr: "Array<string>"},
				TypeProperty{Name: "defaultVariant", TypeExpr: "string | null"},
				TypeProperty{Name: "sharedModifier", TypeExpr: "Record<string, unknown>"},
				TypeProperty{Name: "unsharedKeys", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(Variant{}): objectDeclarationWithCreateExpr(
				"Variant",
				`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      impl: "",
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
    options,
  )`,
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "impl", TypeExpr: "string"},
				TypeProperty{Name: "nonPresetImpls", TypeExpr: "Array<string>"},
				TypeProperty{Name: "modifier", TypeExpr: "Record<string, unknown>"},
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			),
			reflect.TypeOf(SingletonSections{}): objectDeclarationWithCreateExpr(
				"SingletonSections",
				`mergeGeneratedOptions(
    {
      GlobalVariables: null,
      GenPythonCode: null,
      GenPythonMetadata: null,
    },
    options,
  )`,
				TypeProperty{Name: "GlobalVariables", TypeExpr: "string | null"},
				TypeProperty{Name: "GenPythonCode", TypeExpr: "string | null"},
				TypeProperty{Name: "GenPythonMetadata", TypeExpr: "string | null"},
			),
			reflect.TypeOf(ShownParamIdDetails{}): objectDeclarationWithCreateExpr(
				"ShownParamIdDetails",
				`mergeGeneratedOptions(
    {
      requiredParamIdsToPaths: {},
      topLevelParamIds: [],
    },
    options,
  )`,
				TypeProperty{Name: "requiredParamIdsToPaths", TypeExpr: "Record<string, Array<string>>"},
				TypeProperty{Name: "topLevelParamIds", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(ShownParamIds{}): objectDeclarationWithCreateExpr(
				"ShownParamIds",
				`mergeGeneratedOptions(
    {
      pinned: createShownParamIdDetails(),
      unpinned: createShownParamIdDetails(),
    },
    options,
  )`,
				TypeProperty{Name: "pinned", TypeExpr: "ShownParamIdDetails"},
				TypeProperty{Name: "unpinned", TypeExpr: "ShownParamIdDetails"},
			),
			reflect.TypeOf(ChatWindowBounds{}): objectDeclarationWithCreateExpr(
				"ChatWindowBounds",
				`mergeGeneratedOptions(
    {
      x: 120,
      y: 120,
      width: 820,
      height: 520,
    },
    options,
  )`,
				TypeProperty{Name: "x", TypeExpr: "number"},
				TypeProperty{Name: "y", TypeExpr: "number"},
				TypeProperty{Name: "width", TypeExpr: "number"},
				TypeProperty{Name: "height", TypeExpr: "number"},
			),
			reflect.TypeOf(ChatWindowDockMetrics{}): objectDeclarationWithCreateExpr(
				"ChatWindowDockMetrics",
				`mergeGeneratedOptions(
    {
      widthFraction: null,
      preferredWidthPx: null,
    },
    options,
  )`,
				TypeProperty{Name: "widthFraction", TypeExpr: "number | null", Optional: true},
				TypeProperty{Name: "preferredWidthPx", TypeExpr: "number | null", Optional: true},
			),
			reflect.TypeOf(ProjectChatWindowInstance{}): objectDeclarationWithCreateExpr(
				"ProjectChatWindowInstance",
				`mergeGeneratedOptions(
    {
      instanceId: "",
      placement: ChatWindowPlacementEnum.bottom_docked,
      isMinimized: false,
      isClosed: false,
      isMaximized: false,
      bounds: createChatWindowBounds(),
      dockMetrics: createChatWindowDockMetrics(),
      zIndex: 0,
      lastPlacementBeforeMaximize: null,
      mode: ChatWindowModeEnum.project_ai_mode,
      sectionIdOrNull: null,
      title: null,
      lastFocusedAt: 0,
      chatId: null,
    },
    options,
  )`,
				TypeProperty{Name: "instanceId", TypeExpr: "string"},
				TypeProperty{Name: "placement", TypeExpr: "ChatWindowPlacement", Optional: true},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "isClosed", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "isMaximized", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "bounds", TypeExpr: "ChatWindowBounds", Optional: true},
				TypeProperty{Name: "dockMetrics", TypeExpr: "ChatWindowDockMetrics", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "lastPlacementBeforeMaximize", TypeExpr: "ChatWindowPlacement | null", Optional: true},
				TypeProperty{Name: "mode", TypeExpr: "ChatWindowMode", Optional: true},
				TypeProperty{Name: "sectionIdOrNull", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "title", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "lastFocusedAt", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "chatId", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(ProjectChatWindowingState{}): objectDeclarationWithCreateExpr(
				"ProjectChatWindowingState",
				`mergeGeneratedOptions(
    {
      instancesById: {},
      order: [],
      nextInstanceNumber: 1,
    },
    options,
  )`,
				TypeProperty{Name: "instancesById", TypeExpr: "Record<string, ProjectChatWindowInstance>"},
				TypeProperty{Name: "order", TypeExpr: "Array<string>"},
				TypeProperty{Name: "nextInstanceNumber", TypeExpr: "number"},
			),
			reflect.TypeOf(NormalizedFloatingWindowBounds{}): objectDeclarationWithCreateExpr(
				"NormalizedFloatingWindowBounds",
				`mergeGeneratedOptions(
    {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
    options,
  )`,
				TypeProperty{Name: "x", TypeExpr: "number"},
				TypeProperty{Name: "y", TypeExpr: "number"},
				TypeProperty{Name: "width", TypeExpr: "number"},
				TypeProperty{Name: "height", TypeExpr: "number"},
			),
			reflect.TypeOf(WindowSpaceWindow{}): objectDeclarationWithCreateExpr(
				"WindowSpaceWindow",
				`mergeGeneratedOptions(
    {
      surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
      sectionIdOrNull: null,
      mode: ChatWindowModeEnum.project_ai_mode,
      title: null,
      chatId: null,
      embeddedGitPaneVisible: false,
      zIndex: 0,
      normalizedBounds: createNormalizedFloatingWindowBounds(),
    },
    options,
  )`,
				TypeProperty{Name: "surfaceKind", TypeExpr: "WindowSpaceSurfaceKind", Optional: true},
				TypeProperty{Name: "sectionIdOrNull", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "mode", TypeExpr: "ChatWindowMode", Optional: true},
				TypeProperty{Name: "title", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "chatId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "embeddedGitPaneVisible", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "normalizedBounds", TypeExpr: "NormalizedFloatingWindowBounds", Optional: true},
			),
			reflect.TypeOf(WindowSpaceState{}): objectDeclarationWithCreateExpr(
				"WindowSpaceState",
				`mergeGeneratedOptions(
    {
      windowsById: {},
      order: [],
    },
    options,
  )`,
				TypeProperty{Name: "windowsById", TypeExpr: "Record<string, WindowSpaceWindow>"},
				TypeProperty{Name: "order", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(WindowSpaceConfig{}): objectDeclarationWithCreateExpr(
				"WindowSpaceConfig",
				`mergeGeneratedOptions(
    {
      windowsById: {},
      order: [],
      id: "",
      name: "",
      sortIndex: 0,
    },
    options,
  )`,
				TypeProperty{Name: "windowsById", TypeExpr: "Record<string, WindowSpaceWindow>"},
				TypeProperty{Name: "order", TypeExpr: "Array<string>"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "sortIndex", TypeExpr: "number", Optional: true},
			),
			reflect.TypeOf(ProjectStateSingleConfigWithCompletedOpIds{}): objectDeclarationWithCreateExpr(
				"ProjectStateSingleConfigWithCompletedOpIds",
				`mergeGeneratedOptions(
    {
      projectState: createProjectStateSingleConfig(),
      completedOpIds: [],
      pendingOpIds: [],
    },
    options,
  )`,
				TypeProperty{Name: "projectState", TypeExpr: "ProjectStateSingleConfig"},
				TypeProperty{Name: "completedOpIds", TypeExpr: "Array<string>"},
				TypeProperty{Name: "pendingOpIds", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(SectionsClipboardDataResponse{}): aliasDeclaration(
				"SectionsClipboardDataResponse",
				"SectionsClipboardData",
			),
			reflect.TypeOf(ProjectConfig{}): objectDeclarationWithCreateBody(
				"ProjectConfig",
				buildProjectConfigCreateBodyTS(),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "showParamDisplayNames", TypeExpr: "boolean"},
				TypeProperty{Name: "allowJsonSourceKeyEdits", TypeExpr: "boolean"},
				TypeProperty{Name: "previewImgColor", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "viewport", TypeExpr: "Viewport | null", Optional: true},
				TypeProperty{Name: "viewportInitialized", TypeExpr: "boolean"},
				TypeProperty{Name: "viewModes", TypeExpr: "Record<string, ViewMode>"},
				TypeProperty{Name: "activeViewModeId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "isEditingViewMode", TypeExpr: "boolean"},
				TypeProperty{Name: "hasPythonCodegenTarget", TypeExpr: "boolean"},
				TypeProperty{Name: "runCapabilities", TypeExpr: "ProjectRunCapabilities"},
				TypeProperty{Name: "codegenTargets", TypeExpr: "Array<ProjectCodegenTarget>"},
				TypeProperty{Name: "watchCodeEnabled", TypeExpr: "boolean"},
				TypeProperty{Name: "watchCodeFolders", TypeExpr: "Array<WatchCodeFolder>"},
				TypeProperty{Name: "watchCodeFiles", TypeExpr: "Array<string>"},
				TypeProperty{Name: "watchCodeRegistry", TypeExpr: "Record<string, WatchCodeRegistryEntry>"},
				TypeProperty{Name: "watchCodeBaselineByPath", TypeExpr: "Record<string, Array<string>>"},
				TypeProperty{Name: "entryCodeBlockId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "sectionPathSlugsById", TypeExpr: "Record<string, string>"},
				TypeProperty{Name: "sectionIdsByPathSlug", TypeExpr: "Record<string, Array<string>>"},
				TypeProperty{Name: "topLevelSections", TypeExpr: "Record<string, TopLevelSectionLayout>"},
				TypeProperty{Name: "windowSpaceSlugsById", TypeExpr: "Record<string, string>"},
				TypeProperty{Name: "windowSpaceIdsBySlug", TypeExpr: "Record<string, Array<string>>"},
				TypeProperty{Name: "windowSpaces", TypeExpr: "Record<string, WindowSpaceConfig>"},
				TypeProperty{Name: "sectionVariantMap", TypeExpr: "Record<string, string>"},
				TypeProperty{Name: "activeIds", TypeExpr: "Array<string>"},
				TypeProperty{Name: "edges", TypeExpr: "Array<Edge>"},
				TypeProperty{Name: "agenticEdges", TypeExpr: "Array<AgenticEdge>"},
				TypeProperty{Name: "stateMachineEdges", TypeExpr: "Array<StateMachineEdge>"},
			),
			reflect.TypeOf(ProjectStateSingleConfig{}): objectDeclarationWithCreateBody(
				"ProjectStateSingleConfig",
				buildProjectStateSingleConfigCreateBodyTS(),
				TypeProperty{Name: "projectConfig", TypeExpr: "ProjectConfig"},
				TypeProperty{Name: "sections", TypeExpr: "Record<string, Core>"},
				TypeProperty{Name: "sectionImpls", TypeExpr: "Record<string, BaseSectionImplUnion>"},
				TypeProperty{Name: "sectionCapabilities", TypeExpr: "Record<string, SectionCapabilities>"},
				TypeProperty{Name: "sectionVariants", TypeExpr: "Record<string, Variant>"},
				TypeProperty{Name: "codeObjs", TypeExpr: "Record<string, Core>"},
				TypeProperty{Name: "codeObjImpls", TypeExpr: "Record<string, BaseCodeObjImplUnion>"},
				TypeProperty{Name: "codeObjVariants", TypeExpr: "Record<string, Variant>"},
				TypeProperty{Name: "artifactGroups", TypeExpr: "Record<string, unknown>", Optional: true},
				TypeProperty{Name: "singletonSections", TypeExpr: "SingletonSections"},
				TypeProperty{Name: "parentSectionMap", TypeExpr: "Record<string, string | null>"},
				TypeProperty{Name: "shownParamIds", TypeExpr: "Record<string, ShownParamIds>"},
				TypeProperty{Name: "requiredDecodedImages", TypeExpr: "Array<string>"},
				TypeProperty{Name: "genCodeBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
				TypeProperty{Name: "projectChatWindowing", TypeExpr: "ProjectChatWindowingState"},
			),
			reflect.TypeOf(BaseSectionImpl{}): objectDeclaration(
				"BaseSectionImpl",
				TypeProperty{Name: "type", TypeExpr: "SectionType"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "isInOtherProjectConfigs", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "aspectRatioExtraHeight", TypeExpr: "number"},
				TypeProperty{Name: "aspectRatioExtraWidth", TypeExpr: "number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "isPreset", TypeExpr: "boolean"},
				TypeProperty{Name: "children", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "codeObjVariantMap", TypeExpr: "Record<string, string>", Optional: true},
				TypeProperty{Name: "hideUnpinnedParams", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "paramFilter", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "columnWidth", TypeExpr: "number | null", Optional: true},
				TypeProperty{Name: "configLanguage", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "pinnedParams", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "selectedParams", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "ignoreTypeErrors", TypeExpr: "TypeErrorIgnoreState", Optional: true},
				TypeProperty{Name: "edgeInputParams", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>", Optional: true},
				TypeProperty{Name: "topLevelParamId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "isJsonSource", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "jsonSourceKeys", TypeExpr: "Array<string>", Optional: true},
				TypeProperty{Name: "jsonSourceMissing", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "metaControlParamId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "showSectionTitle", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "attachedTerminalSectionId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "code", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "codeLanguage", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: true},
				TypeProperty{Name: "inputText", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>", Optional: true},
				TypeProperty{Name: "pluginId", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "kind", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "data", TypeExpr: "Record<string, unknown>", Optional: true},
				TypeProperty{Name: "schemaVersion", TypeExpr: "number | null", Optional: true},
				TypeProperty{Name: "viewMode", TypeExpr: "ListRootViewMode", Optional: true},
				TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType", Optional: true},
				TypeProperty{Name: "isHorizontalOrientation", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "overflowMode", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "hideColumn", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "folder", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "filePath", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "activeSheet", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "readOnly", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "showRowNumbers", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "density", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "autoReloadOnExternalChange", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "text", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "metaControlStyle", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "imagePath", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "dataPath", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion", Optional: true},
			),
			reflect.TypeOf(CallableSectionImpl{}): aliasDeclaration(
				"CallableSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Callable;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: ConfigLanguage;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  callable?: string | null;
  hideParams: boolean;
}`,
			),
			reflect.TypeOf(BaseParentSectionImplUnion{}): aliasDeclaration(
				"BaseParentSectionImplUnion",
				`BaseSectionImpl & {
  children: Array<string>;
}`,
			),
			reflect.TypeOf(BaseSectionWithParamsImplUnion{}): aliasDeclaration(
				"BaseSectionWithParamsImplUnion",
				`BaseSectionImpl & {
  codeObjVariantMap: Record<string, string>;
}`,
			),
			reflect.TypeOf(DictSectionImpl{}): aliasDeclaration(
				"DictSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Dict;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  topLevelParamId: string | null;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
  jsonSourceMissing: boolean;
}`,
			),
			reflect.TypeOf(UserDefaultCallableSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultCallableSectionImpl",
				"Callable",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "hideUnpinnedParams", TypeExpr: "boolean"},
				TypeProperty{Name: "paramFilter", TypeExpr: "string"},
				TypeProperty{Name: "columnWidth", TypeExpr: "number | null"},
				TypeProperty{Name: "configLanguage", TypeExpr: "ConfigLanguage"},
				TypeProperty{Name: "edgeInputParams", TypeExpr: "Array<string>"},
				TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
				TypeProperty{Name: "hideParams", TypeExpr: "boolean"},
			),
			reflect.TypeOf(UserDefaultDictSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultDictSectionImpl",
				"Dict",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "hideUnpinnedParams", TypeExpr: "boolean"},
				TypeProperty{Name: "paramFilter", TypeExpr: "string"},
				TypeProperty{Name: "columnWidth", TypeExpr: "number | null"},
				TypeProperty{Name: "configLanguage", TypeExpr: "string"},
				TypeProperty{Name: "edgeInputParams", TypeExpr: "Array<string>"},
				TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
				TypeProperty{Name: "isJsonSource", TypeExpr: "boolean"},
				TypeProperty{Name: "jsonSourceKeys", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(BaseDictSectionImplUnion{}): aliasDeclaration(
				"BaseDictSectionImplUnion",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Dict | typeof SectionTypeEnum.GlobalVariables;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  topLevelParamId: string | null;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
  jsonSourceMissing: boolean;
}`,
			),
			reflect.TypeOf(BaseCodeObjImpl{}): aliasDeclaration(
				"BaseCodeObjImpl",
				`{
  type: CodeObjType;
  id: string;
  name: string;
  description: string;
  isPreset: boolean;
  children?: Array<string>;
  coreNameType?: ParamNameType;
  coreNameEditable?: boolean;
  passingStyle?: ParameterPassingStyle;
  typeAnnotation?: string;
  defaultVal?: string;
  value?: string;
  [key: string]: unknown;
}`,
			),
			reflect.TypeOf(CodeParamCodeObjImpl{}): aliasDeclaration(
				"CodeParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.CodeParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
			),
			reflect.TypeOf(CodeCallableCodeObjImpl{}): aliasDeclaration(
				"CodeCallableCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.CodeCallable;
  children: Array<string>;
}`,
			),
			reflect.TypeOf(NestedParamCodeObjImpl{}): aliasDeclaration(
				"NestedParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.NestedParam;
  children: Array<string>;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
}`,
			),
			reflect.TypeOf(BaseCodeObjImplUnion{}): aliasDeclaration(
				"BaseCodeObjImplUnion",
				`BaseCodeObjImpl
  | CodeCallableCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | ButtonParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl
  | NestedParamCodeObjImpl`,
			),
			reflect.TypeOf(BaseChildlessCodeObjImplUnion{}): aliasDeclaration(
				"BaseChildlessCodeObjImplUnion",
				`BaseCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl`,
			),
			reflect.TypeOf(BaseParamCodeObjImplUnion{}): aliasDeclaration(
				"BaseParamCodeObjImplUnion",
				`BaseCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | ButtonParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl
  | NestedParamCodeObjImpl`,
			),
			reflect.TypeOf(BaseParentCodeObjImplUnion{}): aliasDeclaration(
				"BaseParentCodeObjImplUnion",
				`CodeCallableCodeObjImpl
  | NestedParamCodeObjImpl`,
			),
			reflect.TypeOf(UserDefaultCodeParamCodeObjImpl{}): objectDeclarationWithCreateExpr(
				"UserDefaultCodeParamCodeObjImpl",
				`mergeGeneratedOptions(
    {
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: false,
      typeAnnotation: "",
      defaultVal: "",
      value: "",
    },
    options,
  )`,
				TypeProperty{Name: "coreNameType", TypeExpr: "ParamNameType"},
				TypeProperty{Name: "coreNameEditable", TypeExpr: "boolean"},
				TypeProperty{Name: "typeAnnotation", TypeExpr: "string"},
				TypeProperty{Name: "defaultVal", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "string"},
			),
			reflect.TypeOf(ColorPickerChoice{}): objectDeclaration(
				"ColorPickerChoice",
				TypeProperty{Name: "color", TypeExpr: "string"},
				TypeProperty{Name: "description", TypeExpr: "string"},
			),
			reflect.TypeOf(TextParamCodeObjImpl{}): aliasDeclaration(
				"TextParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TextParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  uiType: TextParamInputUIType;
}`,
			),
			reflect.TypeOf(DateParamCodeObjImpl{}): aliasDeclaration(
				"DateParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DateParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  dateDisplayFormat: DateDisplayFormat;
  dateControlMode: DateControlMode;
  dateSelectionMode: DateSelectionMode;
  dateCalendarWeekStart: DateCalendarWeekStart;
  dateIncludesTime: boolean;
}`,
			),
			reflect.TypeOf(TimeParamCodeObjImpl{}): aliasDeclaration(
				"TimeParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TimeParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  timeControlMode: TimeControlMode;
  timeDisplayFormat: TimeDisplayFormat;
  timeDisplayTransparent: boolean;
  timeDisplayScale: number;
  timeDisplayFont: TimeDisplayFont;
}`,
			),
			reflect.TypeOf(ButtonParamCodeObjImpl{}): aliasDeclaration(
				"ButtonParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.ButtonParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  label: string;
  actionMode: ButtonActionMode;
  requestMethod: HttpRequestMethod;
  requestUrl: string;
  requestHeaderKey: string;
  requestHeaderValue: string;
  requestBody: string;
}`,
			),
			reflect.TypeOf(SliderParamCodeObjImpl{}): aliasDeclaration(
				"SliderParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.SliderParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  min: number;
  max: number;
  step: number;
}`,
			),
			reflect.TypeOf(RotaryParamCodeObjImpl{}): aliasDeclaration(
				"RotaryParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.RotaryParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  min: number;
  max: number;
  step: number;
}`,
			),
			reflect.TypeOf(SwitchParamCodeObjImpl{}): aliasDeclaration(
				"SwitchParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.SwitchParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
			),
			reflect.TypeOf(ColorPickerParamCodeObjImpl{}): aliasDeclaration(
				"ColorPickerParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.ColorPickerParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  colorChoices: Array<ColorPickerChoice>;
}`,
			),
			reflect.TypeOf(DropdownParamCodeObjImpl{}): aliasDeclaration(
				"DropdownParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DropdownParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  choices: Array<string>;
}`,
			),
			reflect.TypeOf(PasswordParamCodeObjImpl{}): aliasDeclaration(
				"PasswordParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.PasswordParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  hasSecret: boolean;
}`,
			),
			reflect.TypeOf(TextAreaParamCodeObjImpl{}): aliasDeclaration(
				"TextAreaParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TextAreaParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
			),
			reflect.TypeOf(DropzoneParamCodeObjImpl{}): aliasDeclaration(
				"DropzoneParamCodeObjImpl",
				`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DropzoneParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  mode: DropzoneMode;
  maxAttachments?: number | null;
  placeholder: string;
}`,
			),
			reflect.TypeOf(UserDefaultListRootSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultListRootSectionImpl",
				"ListRoot",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
				TypeProperty{Name: "viewMode", TypeExpr: "ListRootViewMode"},
			),
			reflect.TypeOf(ListRootSectionImpl{}): aliasDeclaration(
				"ListRootSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.ListRoot;
  children: Array<string>;
  defaultChildSectionType: SectionType;
  viewMode: ListRootViewMode;
}`,
			),
			reflect.TypeOf(UserDefaultGroupSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultGroupSectionImpl",
				"Group",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "isHorizontalOrientation", TypeExpr: "boolean"},
				TypeProperty{Name: "overflowMode", TypeExpr: "boolean"},
				TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
			),
			reflect.TypeOf(GroupSectionImpl{}): aliasDeclaration(
				"GroupSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Group;
  children: Array<string>;
  isHorizontalOrientation: boolean;
  overflowMode: boolean;
  defaultChildSectionType: SectionType;
}`,
			),
			reflect.TypeOf(UserDefaultStateMachineStartSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultStateMachineStartSectionImpl",
				"StateMachineStart",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "machineGroupId", TypeExpr: "string"},
				TypeProperty{Name: "label", TypeExpr: "string"},
				TypeProperty{Name: "maxIterations", TypeExpr: "number | null"},
			),
			reflect.TypeOf(StateMachineStartSectionImpl{}): aliasDeclaration(
				"StateMachineStartSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.StateMachineStart;
  machineGroupId: string;
  label: string;
  maxIterations?: number | null;
}`,
			),
			reflect.TypeOf(UserDefaultStateMachineGateSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultStateMachineGateSectionImpl",
				"StateMachineGate",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "machineGroupId", TypeExpr: "string"},
				TypeProperty{Name: "gateType", TypeExpr: "StateMachineGateType"},
				TypeProperty{Name: "label", TypeExpr: "string"},
				TypeProperty{Name: "ui", TypeExpr: "StateMachineGateUIState"},
			),
			reflect.TypeOf(StateMachineGateSectionImpl{}): aliasDeclaration(
				"StateMachineGateSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.StateMachineGate;
  machineGroupId: string;
  gateType: StateMachineGateType;
  label: string;
  ui: StateMachineGateUIState;
}`,
			),
			reflect.TypeOf(UserDefaultStateMachineEndSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultStateMachineEndSectionImpl",
				"StateMachineEnd",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "machineGroupId", TypeExpr: "string"},
				TypeProperty{Name: "label", TypeExpr: "string"},
			),
			reflect.TypeOf(StateMachineEndSectionImpl{}): aliasDeclaration(
				"StateMachineEndSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.StateMachineEnd;
  machineGroupId: string;
  label: string;
}`,
			),
			reflect.TypeOf(UserDefaultTextBlockSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultTextBlockSectionImpl",
				"TextBlock",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "format", TypeExpr: "TextBlockFormat"},
				TypeProperty{Name: "masterFontSizePx", TypeExpr: "number"},
				TypeProperty{Name: "headingAsSectionName", TypeExpr: "boolean"},
				TypeProperty{Name: "metaControlStyle", TypeExpr: "boolean"},
				TypeProperty{Name: "textDisplayMode", TypeExpr: "TextBlockDisplayMode"},
				TypeProperty{Name: "text", TypeExpr: "string"},
			),
			reflect.TypeOf(TextBlockSectionImpl{}): aliasDeclaration(
				"TextBlockSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.TextBlock;
  format: TextBlockFormat;
  masterFontSizePx: number;
  headingAsSectionName: boolean;
  metaControlStyle: boolean;
  textDisplayMode: TextBlockDisplayMode;
  text: string;
}`,
			),
			reflect.TypeOf(UserDefaultPromptSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultPromptSectionImpl",
				"Prompt",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "template", TypeExpr: "string"},
				TypeProperty{Name: "format", TypeExpr: "PromptFormat"},
				TypeProperty{Name: "inputs", TypeExpr: "Record<string, string>"},
				TypeProperty{Name: "renderedText", TypeExpr: "string"},
				TypeProperty{Name: "missingVariables", TypeExpr: "Array<string>"},
				TypeProperty{Name: "renderError", TypeExpr: "string | null"},
			),
			reflect.TypeOf(PromptSectionImpl{}): aliasDeclaration(
				"PromptSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Prompt;
  promptTemplateId?: string | null;
  template: string;
  format: PromptFormat;
  inputs: Record<string, string>;
  renderedText: string;
  missingVariables: Array<string>;
  renderError?: string | null;
}`,
			),
			reflect.TypeOf(CodeSectionDiagnosticsIgnoreState{}): objectDeclaration(
				"CodeSectionDiagnosticsIgnoreState",
				TypeProperty{Name: "muted", TypeExpr: "boolean"},
				TypeProperty{Name: "suppressedCodes", TypeExpr: "Array<string | number>"},
			),
			reflect.TypeOf(UserDefaultCodeSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultCodeSectionImpl",
				"Code",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "code", TypeExpr: "string"},
				TypeProperty{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null"},
				TypeProperty{Name: "attachedTerminalSectionId", TypeExpr: "string | null"},
				TypeProperty{Name: "codeLanguage", TypeExpr: "string"},
				TypeProperty{Name: "diagnosticsIgnoreState", TypeExpr: "CodeSectionDiagnosticsIgnoreState"},
			),
			reflect.TypeOf(CodeSectionImpl{}): aliasDeclaration(
				"CodeSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Code;
  children: Array<string>;
  code: string;
  codeLanguage: string;
  codeFileBinding?: CodeFileBinding | null;
  attachedTerminalSectionId?: string | null;
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreState;
}`,
			),
			reflect.TypeOf(UserDefaultTerminalSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultTerminalSectionImpl",
				"Terminal",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			),
			reflect.TypeOf(TerminalSectionImpl{}): aliasDeclaration(
				"TerminalSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Terminal;
}`,
			),
			reflect.TypeOf(BaseSectionImplUnion{}): aliasDeclaration(
				"BaseSectionImplUnion",
				`CallableSectionImpl
  | DictSectionImpl
  | ListRootSectionImpl
  | GroupSectionImpl
  | StateMachineStartSectionImpl
  | StateMachineGateSectionImpl
  | StateMachineEndSectionImpl
  | TextBlockSectionImpl
  | PromptSectionImpl
  | CodeSectionImpl
  | TerminalSectionImpl
  | ChatSectionImpl
  | BrowserSectionImpl
  | ChartSectionImpl
  | TaskBoardSectionImpl
  | SpreadsheetSectionImpl
  | BaseSectionImpl`,
			),
			reflect.TypeOf(JSONValue{}): aliasDeclaration(
				"JSONValue",
				"null | boolean | number | string | Array<JSONValue> | { [key: string]: JSONValue | undefined }",
			),
			reflect.TypeOf(ChatFileAttachment{}): objectDeclaration(
				"ChatFileAttachment",
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "mimeType", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "size", TypeExpr: "number | null", Optional: true},
			),
			reflect.TypeOf(MessageTextContent{}): objectDeclarationWithCreateBody(
				"MessageTextContent",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("type", tsStringLiteralExpr("text")),
						tsObjectField("text", tsStringLiteralExpr("")),
					},
					"options",
				),
				TypeProperty{Name: "type", TypeExpr: `"text"`},
				TypeProperty{Name: "text", TypeExpr: "string"},
			),
			reflect.TypeOf(MessageImageURL{}): objectDeclaration(
				"MessageImageUrl",
				TypeProperty{Name: "url", TypeExpr: "string"},
				TypeProperty{Name: "detail", TypeExpr: `"auto" | "low" | "high" | null`, Optional: true},
			),
			reflect.TypeOf(MessageImageURLContent{}): objectDeclaration(
				"MessageImageUrlContent",
				TypeProperty{Name: "type", TypeExpr: `"image_url"`},
				TypeProperty{Name: "image_url", TypeExpr: "MessageImageUrl"},
			),
			reflect.TypeOf(MessageThinkingContent{}): objectDeclarationWithCreateBody(
				"MessageThinkingContent",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("type", tsStringLiteralExpr("thinking")),
						tsObjectField("thinking", tsStringLiteralExpr("")),
						tsObjectField("summary", tsStringLiteralExpr("")),
						tsObjectField("signature", tsStringLiteralExpr("")),
					},
					"options",
				),
				TypeProperty{Name: "type", TypeExpr: `"thinking"`},
				TypeProperty{Name: "thinking", TypeExpr: "string"},
				TypeProperty{Name: "summary", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "signature", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(MessageContent{}): aliasDeclaration(
				"MessageContent",
				"MessageTextContent | MessageImageUrlContent | MessageThinkingContent",
			),
			reflect.TypeOf(ToolReferenceContent{}): objectDeclaration(
				"ToolReferenceContent",
				TypeProperty{Name: "type", TypeExpr: `"tool_reference"`},
				TypeProperty{Name: "tool_name", TypeExpr: "string"},
			),
			reflect.TypeOf(ToolCallFunction{}): objectDeclarationWithCreateBody(
				"ToolCallFunction",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("name", tsStringLiteralExpr("")),
						tsObjectField("arguments", "{}"),
					},
					"options",
				),
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "arguments", TypeExpr: "{ [key: string]: JSONValue | undefined }"},
			),
			reflect.TypeOf(ToolCall{}): objectDeclarationWithCreateBody(
				"ToolCall",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("id", tsStringLiteralExpr("")),
						tsObjectField("type", tsStringLiteralExpr("function")),
						tsObjectField("function", "createToolCallFunction()"),
					},
					"options",
				),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "type", TypeExpr: `"function"`},
				TypeProperty{Name: "function", TypeExpr: "ToolCallFunction"},
			),
			reflect.TypeOf(SystemChatMessage{}): objectDeclarationWithCreateBody(
				"SystemChatMessage",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("id", tsStringLiteralExpr("")),
						tsObjectField("role", "ChatRoleEnum.system"),
						tsObjectField("content", "[]"),
						tsObjectField("attachments", "[]"),
					},
					"options",
				),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "content", TypeExpr: "Array<MessageContent>"},
				TypeProperty{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>"},
				TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.system"},
			),
			reflect.TypeOf(AssistantChatMessage{}): objectDeclarationWithCreateBody(
				"AssistantChatMessage",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("id", tsStringLiteralExpr("")),
						tsObjectField("role", "ChatRoleEnum.assistant"),
						tsObjectField("content", "[]"),
						tsObjectField("attachments", "[]"),
						tsObjectField("tool_calls", "null"),
					},
					"options",
				),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "content", TypeExpr: "Array<MessageContent>"},
				TypeProperty{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>"},
				TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.assistant"},
				TypeProperty{Name: "tool_calls", TypeExpr: "Array<ToolCall> | null", Optional: true},
			),
			reflect.TypeOf(UserChatMessage{}): objectDeclarationWithCreateBody(
				"UserChatMessage",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("id", tsStringLiteralExpr("")),
						tsObjectField("role", "ChatRoleEnum.user"),
						tsObjectField("content", "[]"),
						tsObjectField("attachments", "[]"),
					},
					"options",
				),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "content", TypeExpr: "Array<MessageContent>"},
				TypeProperty{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>"},
				TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.user"},
			),
			reflect.TypeOf(ToolChatMessage{}): objectDeclarationWithCreateBody(
				"ToolChatMessage",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("id", tsStringLiteralExpr("")),
						tsObjectField("role", "ChatRoleEnum.tool"),
						tsObjectField("tool_call_id", tsStringLiteralExpr("")),
						tsObjectField("tool_name", "null"),
						tsObjectField("arguments", "{}"),
						tsObjectField("result", "null"),
						tsObjectField("content", "[]"),
						tsObjectField("is_error", "false"),
						tsObjectField("started_at", tsStringLiteralExpr("")),
						tsObjectField("completed_at", "null"),
					},
					"options",
				),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.tool"},
				TypeProperty{Name: "tool_call_id", TypeExpr: "string"},
				TypeProperty{Name: "tool_name", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "arguments", TypeExpr: "JSONValue"},
				TypeProperty{Name: "result", TypeExpr: "JSONValue"},
				TypeProperty{Name: "content", TypeExpr: "Array<ToolReferenceContent | Record<string, unknown>>"},
				TypeProperty{Name: "is_error", TypeExpr: "boolean"},
				TypeProperty{Name: "started_at", TypeExpr: "string"},
				TypeProperty{Name: "completed_at", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(BaseChatMessageUnion{}): aliasDeclaration(
				"BaseChatMessageUnion",
				"SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage",
			),
			reflect.TypeOf(ChatSectionBranch{}): objectDeclaration(
				"ChatSectionBranch",
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
				TypeProperty{Name: "createdAt", TypeExpr: "number"},
				TypeProperty{Name: "parentBranchId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "branchFromMessageId", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(ChatSectionState{}): objectDeclaration(
				"ChatSectionState",
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
				TypeProperty{Name: "inputText", TypeExpr: "string"},
				TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
				TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>"},
				TypeProperty{Name: "activeBranchId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "branches", TypeExpr: "Record<string, ChatSectionBranch>"},
			),
			reflect.TypeOf(UserDefaultChatSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultChatSectionImpl",
				"Chat",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "managed", TypeExpr: "boolean"},
				TypeProperty{Name: "engineConfigId", TypeExpr: "string | null"},
				TypeProperty{Name: "transcriptionProfileId", TypeExpr: "string | null"},
				TypeProperty{Name: "agentProfileId", TypeExpr: "string | null"},
				TypeProperty{Name: "chatId", TypeExpr: "string | null"},
				TypeProperty{Name: "thinking", TypeExpr: "boolean"},
				TypeProperty{Name: "permissionMode", TypeExpr: "ChatPermissionMode"},
				TypeProperty{Name: "searchEnabled", TypeExpr: "boolean"},
				TypeProperty{Name: "dictationMode", TypeExpr: "ChatDictationMode"},
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
				TypeProperty{Name: "inputText", TypeExpr: "string"},
				TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
				TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>"},
				TypeProperty{Name: "activeBranchId", TypeExpr: "string | null"},
				TypeProperty{Name: "branches", TypeExpr: "Record<string, ChatSectionBranch>"},
			),
			reflect.TypeOf(ChatSectionImpl{}): aliasDeclaration(
				"ChatSectionImpl",
				`BaseSectionImpl & ChatSectionState & {
  type: typeof SectionTypeEnum.Chat;
  managed: boolean;
  engineConfigId?: string | null;
  transcriptionProfileId?: string | null;
  agentProfileId?: string | null;
  chatId?: string | null;
  thinking: boolean;
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
  dictationMode: ChatDictationMode;
}`,
			),
			reflect.TypeOf(BrowserSavedSearchTypeFilters{}): objectDeclarationWithCreateBody(
				"BrowserSavedSearchTypeFilters",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("image", "true"),
						tsObjectField("video", "true"),
						tsObjectField("audio", "true"),
						tsObjectField("text", "true"),
						tsObjectField("data", "true"),
					},
					"options",
				),
				TypeProperty{Name: "image", TypeExpr: "boolean"},
				TypeProperty{Name: "video", TypeExpr: "boolean"},
				TypeProperty{Name: "audio", TypeExpr: "boolean"},
				TypeProperty{Name: "text", TypeExpr: "boolean"},
				TypeProperty{Name: "data", TypeExpr: "boolean"},
			),
			reflect.TypeOf(BrowserSavedSearch{}): objectDeclarationWithCreateBody(
				"BrowserSavedSearch",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("id", tsStringLiteralExpr("")),
						tsObjectField("name", tsStringLiteralExpr("")),
						tsObjectField("query", tsStringLiteralExpr("")),
						tsObjectField("searchScope", "BrowserSearchScopeEnum.recursive"),
						tsObjectField("typeFilters", "createBrowserSavedSearchTypeFilters()"),
						tsObjectField("color", tsStringLiteralExpr("#3b82f6")),
						tsObjectField("quickInfo", tsStringLiteralExpr("")),
					},
					"options",
				),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "query", TypeExpr: "string"},
				TypeProperty{Name: "searchScope", TypeExpr: "BrowserSearchScope"},
				TypeProperty{Name: "typeFilters", TypeExpr: "BrowserSavedSearchTypeFilters"},
				TypeProperty{Name: "color", TypeExpr: "string"},
				TypeProperty{Name: "quickInfo", TypeExpr: "string"},
			),
			reflect.TypeOf(UserDefaultBrowserSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultBrowserSectionImpl",
				"Browser",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "folder", TypeExpr: "string"},
				TypeProperty{Name: "hideColumn", TypeExpr: "boolean"},
				TypeProperty{Name: "columnWidth", TypeExpr: "number | null"},
				TypeProperty{Name: "typesColumnWidth", TypeExpr: "number | null"},
				TypeProperty{Name: "viewMode", TypeExpr: "BrowserAreaViewMode"},
				TypeProperty{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>"},
			),
			reflect.TypeOf(BrowserSectionImpl{}): aliasDeclaration(
				"BrowserSectionImpl",
				`Omit<BaseSectionImpl, "viewMode"> & {
  type: typeof SectionTypeEnum.Browser;
  folder: string;
  hideColumn: boolean;
  columnWidth?: number | null;
  typesColumnWidth?: number | null;
  viewMode: BrowserAreaViewMode;
  savedSearches: Array<BrowserSavedSearch>;
}`,
			),
			reflect.TypeOf(TaskBoardColumn{}): objectDeclarationWithCreateBody(
				"TaskBoardColumn",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("id", tsStringLiteralExpr("")),
						tsObjectField("name", tsStringLiteralExpr("")),
						tsObjectField("color", tsStringLiteralExpr("#3b82f6")),
						tsObjectField("sortIndex", "0"),
					},
					"options",
				),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "color", TypeExpr: "string"},
				TypeProperty{Name: "sortIndex", TypeExpr: "number"},
			),
			reflect.TypeOf(TaskBoardTask{}): objectDeclarationWithCreateBody(
				"TaskBoardTask",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("id", tsStringLiteralExpr("")),
						tsObjectField("title", tsStringLiteralExpr("")),
						tsObjectField("description", tsStringLiteralExpr("")),
						tsObjectField("completed", "false"),
						tsObjectField("columnId", "null"),
						tsObjectField("dueDateIso", tsStringLiteralExpr("")),
						tsObjectField("recurrence", "TaskBoardTaskRecurrenceEnum.none"),
						tsObjectField("recurrenceDays", "[]"),
						tsObjectField("recurrenceMonths", "[]"),
						tsObjectField("recurrenceYears", "[]"),
						tsObjectField("sortIndex", "0"),
					},
					"options",
				),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "title", TypeExpr: "string"},
				TypeProperty{Name: "description", TypeExpr: "string"},
				TypeProperty{Name: "completed", TypeExpr: "boolean"},
				TypeProperty{Name: "columnId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "dueDateIso", TypeExpr: "string"},
				TypeProperty{Name: "recurrence", TypeExpr: "TaskBoardTaskRecurrence"},
				TypeProperty{Name: "recurrenceDays", TypeExpr: "Array<TaskBoardRecurringWeekday>"},
				TypeProperty{Name: "recurrenceMonths", TypeExpr: "Array<TaskBoardRecurringMonth>"},
				TypeProperty{Name: "recurrenceYears", TypeExpr: "Array<number>"},
				TypeProperty{Name: "sortIndex", TypeExpr: "number"},
			),
			reflect.TypeOf(UserDefaultTaskBoardSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultTaskBoardSectionImpl",
				"TaskBoard",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "viewMode", TypeExpr: "TaskBoardViewMode"},
				TypeProperty{Name: "columns", TypeExpr: "Array<TaskBoardColumn> | null"},
				TypeProperty{Name: "tasks", TypeExpr: "Array<TaskBoardTask>"},
			),
			reflect.TypeOf(TaskBoardSectionImpl{}): aliasDeclaration(
				"TaskBoardSectionImpl",
				`Omit<BaseSectionImpl, "viewMode"> & {
  type: typeof SectionTypeEnum.TaskBoard;
  viewMode: TaskBoardViewMode;
  columns: Array<TaskBoardColumn>;
  tasks: Array<TaskBoardTask>;
}`,
			),
			reflect.TypeOf(LineChartSettings{}): objectDeclarationWithCreateBody(
				"LineChartSettings",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("type", "ChartTypeEnum.line"),
						tsObjectField("xAxisColumn", "null"),
						tsObjectField("secondYAxisColumns", "[]"),
						tsObjectField("xAxisLog", "false"),
						tsObjectField("y1AxisLog", "false"),
						tsObjectField("y2AxisLog", "false"),
					},
					"options",
				),
				TypeProperty{Name: "type", TypeExpr: "typeof ChartTypeEnum.line"},
				TypeProperty{Name: "xAxisColumn", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "secondYAxisColumns", TypeExpr: "Array<string>"},
				TypeProperty{Name: "xAxisLog", TypeExpr: "boolean"},
				TypeProperty{Name: "y1AxisLog", TypeExpr: "boolean"},
				TypeProperty{Name: "y2AxisLog", TypeExpr: "boolean"},
			),
			reflect.TypeOf(ScatterChartSettings{}): objectDeclarationWithCreateBody(
				"ScatterChartSettings",
				buildTSMergeGeneratedOptionsCreateBodyTS(
					[]tsObjectEntry{
						tsObjectField("type", "ChartTypeEnum.scatter"),
						tsObjectField("xAxisColumn", "null"),
						tsObjectField("categoryColumn", "null"),
						tsObjectField("xAxisLog", "false"),
						tsObjectField("yAxisLog", "false"),
					},
					"options",
				),
				TypeProperty{Name: "type", TypeExpr: "typeof ChartTypeEnum.scatter"},
				TypeProperty{Name: "xAxisColumn", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "categoryColumn", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "xAxisLog", TypeExpr: "boolean"},
				TypeProperty{Name: "yAxisLog", TypeExpr: "boolean"},
			),
			reflect.TypeOf(BaseChartSettingsUnion{}): aliasDeclaration(
				"BaseChartSettingsUnion",
				"LineChartSettings | ScatterChartSettings",
			),
			reflect.TypeOf(UserDefaultChartSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultChartSectionImpl",
				"Chart",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "dataPath", TypeExpr: "string"},
				TypeProperty{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion"},
			),
			reflect.TypeOf(ChartSectionImpl{}): aliasDeclaration(
				"ChartSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Chart;
  dataPath: string;
  chartSettings: BaseChartSettingsUnion;
}`,
			),
			reflect.TypeOf(UserDefaultSpreadsheetSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
				"UserDefaultSpreadsheetSectionImpl",
				"Spreadsheet",
				TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
				TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
				TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
				TypeProperty{Name: "size", TypeExpr: "SectionSize"},
				TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
				TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
				TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
				TypeProperty{Name: "filePath", TypeExpr: "string"},
				TypeProperty{Name: "activeSheet", TypeExpr: "string | null"},
				TypeProperty{Name: "readOnly", TypeExpr: "boolean"},
				TypeProperty{Name: "showRowNumbers", TypeExpr: "boolean"},
				TypeProperty{Name: "density", TypeExpr: "SpreadsheetGridDensity"},
				TypeProperty{Name: "autoReloadOnExternalChange", TypeExpr: "boolean"},
			),
			reflect.TypeOf(SpreadsheetSectionImpl{}): aliasDeclaration(
				"SpreadsheetSectionImpl",
				`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Spreadsheet;
  filePath: string;
  activeSheet?: string | null;
  readOnly: boolean;
  showRowNumbers: boolean;
  density: SpreadsheetGridDensity;
  autoReloadOnExternalChange: boolean;
}`,
			),
			reflect.TypeOf(PrepareSectionsForCopyRequestInput{}): objectDeclaration(
				"PrepareSectionsForCopyRequestInput",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionIds", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(PasteSectionsRequestInput{}): objectDeclaration(
				"PasteSectionsRequestInput",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "data", TypeExpr: "ClipboardProjectStateCoreWithSectionVariantMap"},
				TypeProperty{Name: "position", TypeExpr: "Position"},
				TypeProperty{Name: "asRef", TypeExpr: "boolean"},
			),
			reflect.TypeOf(CreateChildSectionsRequestInput{}): objectDeclaration(
				"CreateChildSectionsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "parentId", TypeExpr: "string"},
				TypeProperty{Name: "implType", TypeExpr: "SectionType"},
				TypeProperty{Name: "numChildren", TypeExpr: "number"},
				TypeProperty{Name: "startIdx", TypeExpr: "number | null", Optional: true},
			),
			reflect.TypeOf(CreateChildSectionsViaIncrementerRequestInput{}): objectDeclaration(
				"CreateChildSectionsViaIncrementerRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "calledBy", TypeExpr: "string"},
				TypeProperty{Name: "implType", TypeExpr: "SectionType"},
				TypeProperty{Name: "numChildren", TypeExpr: "number"},
			),
			reflect.TypeOf(DeleteChildSectionsViaDecrementerRequestInput{}): objectDeclaration(
				"DeleteChildSectionsViaDecrementerRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "calledBy", TypeExpr: "string"},
				TypeProperty{Name: "numChildren", TypeExpr: "number"},
			),
			reflect.TypeOf(CreateEdgeRequestInput{}): objectDeclaration(
				"CreateEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "sourceVariantId", TypeExpr: "string"},
				TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetVariantId", TypeExpr: "string"},
				TypeProperty{Name: "targetPortId", TypeExpr: "string"},
				TypeProperty{Name: "type", TypeExpr: "string", Optional: true},
				TypeProperty{Name: "label", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
				TypeProperty{Name: "animated", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "data", TypeExpr: "Record<string, unknown> | null", Optional: true},
			),
			reflect.TypeOf(UpdateEdgeRequestInput{}): objectDeclaration(
				"UpdateEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edge", TypeExpr: "Edge"},
			),
			reflect.TypeOf(DeleteEdgesRequestInput{}): objectDeclaration(
				"DeleteEdgesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edgeIds", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(ReconnectEdgeRequestInput{}): objectDeclaration(
				"ReconnectEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edgeId", TypeExpr: "string"},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "sourceVariantId", TypeExpr: "string"},
				TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetVariantId", TypeExpr: "string"},
				TypeProperty{Name: "targetPortId", TypeExpr: "string"},
			),
			reflect.TypeOf(SetEdgesRequestInput{}): objectDeclaration(
				"SetEdgesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edges", TypeExpr: "Array<Edge>"},
			),
			reflect.TypeOf(CreateStateMachineEdgeRequestInput{}): objectDeclaration(
				"CreateStateMachineEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "machineGroupId", TypeExpr: "string"},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetPortId", TypeExpr: "string"},
				TypeProperty{Name: "sourceFilter", TypeExpr: "StateMachineSourceFilter | null", Optional: true},
				TypeProperty{Name: "sourceActivationCountCondition", TypeExpr: "StateMachineSourceActivationCountCondition | null", Optional: true},
				TypeProperty{Name: "targetAction", TypeExpr: "StateMachineTargetAction | null", Optional: true},
				TypeProperty{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
				TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
				TypeProperty{Name: "selected", TypeExpr: "boolean", Optional: true},
			),
			reflect.TypeOf(UpdateStateMachineEdgeRequestInput{}): objectDeclaration(
				"UpdateStateMachineEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edge", TypeExpr: "StateMachineEdge"},
			),
			reflect.TypeOf(DeleteStateMachineEdgesRequestInput{}): objectDeclaration(
				"DeleteStateMachineEdgesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edgeIds", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(SetStateMachineEdgesRequestInput{}): objectDeclaration(
				"SetStateMachineEdgesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edges", TypeExpr: "Array<StateMachineEdge>"},
			),
			reflect.TypeOf(CreateAgenticEdgeRequestInput{}): objectDeclaration(
				"CreateAgenticEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
				TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
				TypeProperty{Name: "kind", TypeExpr: "AgenticEdgeKind"},
				TypeProperty{Name: "contextMode", TypeExpr: "AgenticEdgeContextMode | null", Optional: true},
				TypeProperty{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
				TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
				TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
			),
			reflect.TypeOf(UpdateAgenticEdgeRequestInput{}): objectDeclaration(
				"UpdateAgenticEdgeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edge", TypeExpr: "AgenticEdge"},
			),
			reflect.TypeOf(DeleteAgenticEdgesRequestInput{}): objectDeclaration(
				"DeleteAgenticEdgesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edgeIds", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(SetAgenticEdgesRequestInput{}): objectDeclaration(
				"SetAgenticEdgesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "edges", TypeExpr: "Array<AgenticEdge>"},
			),
			reflect.TypeOf(MoveSectionsRequestInput{}): objectDeclaration(
				"MoveSectionsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionIds", TypeExpr: "Array<string>"},
				TypeProperty{Name: "newParentId", TypeExpr: "string | null"},
				TypeProperty{Name: "newIndex", TypeExpr: "number | null"},
				TypeProperty{Name: "positionsById", TypeExpr: "Record<string, Position> | null"},
			),
			reflect.TypeOf(SetSectionSizesRequestInput{}): objectDeclaration(
				"SetSectionSizesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionSizes", TypeExpr: "Record<string, SectionSize>"},
			),
			reflect.TypeOf(SetSectionEdgeOutputsRequestInput{}): objectDeclaration(
				"SetSectionEdgeOutputsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
			),
			reflect.TypeOf(SetParentDefaultChildSectionTypeRequestInput{}): objectDeclaration(
				"SetParentDefaultChildSectionTypeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
			),
			reflect.TypeOf(SetListRootViewModeRequestInput{}): objectDeclaration(
				"SetListRootViewModeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "viewMode", TypeExpr: "ListRootViewMode"},
			),
			reflect.TypeOf(SetBrowserAreaViewModeRequestInput{}): objectDeclaration(
				"SetBrowserAreaViewModeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "viewMode", TypeExpr: "BrowserAreaViewMode"},
			),
			reflect.TypeOf(SetBrowserSavedSearchesRequestInput{}): objectDeclaration(
				"SetBrowserSavedSearchesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>"},
			),
			reflect.TypeOf(SetSpreadsheetSectionSettingsRequestInput{}): objectDeclaration(
				"SetSpreadsheetSectionSettingsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "readOnly", TypeExpr: "boolean"},
				TypeProperty{Name: "showRowNumbers", TypeExpr: "boolean"},
				TypeProperty{Name: "density", TypeExpr: "SpreadsheetGridDensity"},
				TypeProperty{Name: "autoReloadOnExternalChange", TypeExpr: "boolean"},
			),
			reflect.TypeOf(SetTaskBoardSectionStateRequestInput{}): objectDeclaration(
				"SetTaskBoardSectionStateRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "viewMode", TypeExpr: "TaskBoardViewMode"},
				TypeProperty{Name: "columns", TypeExpr: "Array<TaskBoardColumn>"},
				TypeProperty{Name: "tasks", TypeExpr: "Array<TaskBoardTask>"},
			),
			reflect.TypeOf(AppendDrawAreaLayerItemRequestInput{}): objectDeclaration(
				"AppendDrawAreaLayerItemRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "layerIdx", TypeExpr: "number"},
				TypeProperty{Name: "element", TypeExpr: "DrawAreaLayerItem"},
			),
			reflect.TypeOf(SetChartTypeRequestInput{}): objectDeclaration(
				"SetChartTypeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "chartType", TypeExpr: "ChartType"},
			),
			reflect.TypeOf(SetChartSettingsRequestInput{}): objectDeclaration(
				"SetChartSettingsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion"},
				TypeProperty{Name: "changedSettings", TypeExpr: "Array<string>"},
			),
			reflect.TypeOf(SetTextBlockDisplayModeRequestInput{}): objectDeclaration(
				"SetTextBlockDisplayModeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "textDisplayMode", TypeExpr: "TextBlockDisplayMode"},
			),
			reflect.TypeOf(SetTextBlockFormatRequestInput{}): objectDeclaration(
				"SetTextBlockFormatRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "format", TypeExpr: "TextBlockFormat"},
			),
			reflect.TypeOf(CodeFileBindingUpdate{}): objectDeclaration(
				"CodeFileBindingUpdate",
				TypeProperty{Name: "canonical_path", TypeExpr: "string"},
				TypeProperty{Name: "access_mode", TypeExpr: "CodeFileAccessMode"},
			),
			reflect.TypeOf(SetCodeFileBindingRequestInput{}): objectDeclaration(
				"SetCodeFileBindingRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "binding", TypeExpr: "CodeFileBindingUpdate"},
			),
			reflect.TypeOf(GetLLMChatResponse{}): objectDeclaration(
				"GetLLMChatResponse",
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
				TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
				TypeProperty{Name: "llmConfig", TypeExpr: "LLMConfig | null", Optional: true},
				TypeProperty{Name: "contextUsage", TypeExpr: "ChatContextUsage | null", Optional: true},
			),
			reflect.TypeOf(ExternalAgentChatResponse{}): objectDeclaration(
				"ExternalAgentChatResponse",
				TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
				TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
				TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>"},
				TypeProperty{Name: "contextUsage", TypeExpr: "ChatContextUsage | null", Optional: true},
			),
			reflect.TypeOf(PluginListEntry{}): objectDeclaration(
				"PluginListEntry",
				TypeProperty{Name: "pluginId", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "version", TypeExpr: "string"},
				TypeProperty{Name: "sourceScope", TypeExpr: "PluginScope"},
				TypeProperty{Name: "sourceScopeLabel", TypeExpr: "string"},
				TypeProperty{Name: "sourceManager", TypeExpr: "PluginSourceManager"},
				TypeProperty{Name: "sourceManagerHint", TypeExpr: "string | null"},
				TypeProperty{Name: "canonicalSourceKey", TypeExpr: "string"},
				TypeProperty{Name: "sourceDigestSha256", TypeExpr: "string | null"},
				TypeProperty{Name: "frontend", TypeExpr: "PluginFrontendDescriptor"},
				TypeProperty{Name: "content", TypeExpr: "PluginContentDescriptor"},
				TypeProperty{Name: "config", TypeExpr: "PluginConfigDescriptor"},
				TypeProperty{Name: "effectiveCapabilities", TypeExpr: "Array<string>"},
				TypeProperty{Name: "enablementSource", TypeExpr: "PluginEnablementSource | null"},
				TypeProperty{Name: "restartRequired", TypeExpr: "boolean"},
			),
			reflect.TypeOf(PluginStatusEntry{}): objectDeclaration(
				"PluginStatusEntry",
				TypeProperty{Name: "pluginId", TypeExpr: "string"},
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "version", TypeExpr: "string"},
				TypeProperty{Name: "state", TypeExpr: "PluginRuntimeState"},
				TypeProperty{Name: "sourceScope", TypeExpr: "PluginScope"},
				TypeProperty{Name: "sourceScopeLabel", TypeExpr: "string"},
				TypeProperty{Name: "sourceManager", TypeExpr: "PluginSourceManager"},
				TypeProperty{Name: "sourceManagerHint", TypeExpr: "string | null"},
				TypeProperty{Name: "sourcePath", TypeExpr: "string"},
				TypeProperty{Name: "canonicalSourceKey", TypeExpr: "string"},
				TypeProperty{Name: "sourceDigestSha256", TypeExpr: "string | null"},
				TypeProperty{Name: "shadowedBySourcePath", TypeExpr: "string | null"},
				TypeProperty{Name: "requestedCapabilities", TypeExpr: "Array<string>"},
				TypeProperty{Name: "effectiveCapabilities", TypeExpr: "Array<string>"},
				TypeProperty{Name: "blockedCapabilities", TypeExpr: "Array<PluginBlockedCapability>"},
				TypeProperty{Name: "registeredCodegenTargets", TypeExpr: "Array<PluginRegisteredCodegenTarget>"},
				TypeProperty{Name: "registeredBackendRoutes", TypeExpr: "Array<PluginRegisteredBackendRoute>"},
				TypeProperty{Name: "registeredStaticDirs", TypeExpr: "Array<PluginRegisteredStaticDir>"},
				TypeProperty{Name: "registeredListenerEndpoints", TypeExpr: "Array<PluginRegisteredListenerEndpoint>"},
				TypeProperty{Name: "enablementSource", TypeExpr: "PluginEnablementSource | null"},
				TypeProperty{Name: "restartRequired", TypeExpr: "boolean"},
				TypeProperty{Name: "runtimePayloadDigestSha256", TypeExpr: "string"},
				TypeProperty{Name: "errors", TypeExpr: "Array<PluginErrorInfo>"},
			),
			reflect.TypeOf(BinaryUploadRequestInput{}): {
				Name:  "BinaryUploadRequestInput",
				Kind:  "alias",
				Alias: "FormData",
			},
			reflect.TypeOf(BinaryDownloadResponse{}): {
				Name:  "BinaryDownloadResponse",
				Kind:  "alias",
				Alias: "Uint8Array",
			},
			reflect.TypeOf(CanvasPoint{}): aliasDeclaration(
				"CanvasPoint",
				"[number, number]",
			),
			reflect.TypeOf(DrawAreaTransform{}): aliasDeclaration(
				"DrawAreaTransform",
				"[number, number, number, number, number, number]",
			),
			reflect.TypeOf(BrushStroke{}): objectDeclarationWithCreateExpr(
				"BrushStroke",
				`mergeGeneratedOptions(
    {
      strokeStyle: "",
      lineWidth: 1,
      lineCap: DrawAreaBrushShapeEnum.round,
      points: [],
      globalCompositeOperation: "source-over",
    },
    options,
  )`,
				TypeProperty{Name: "strokeStyle", TypeExpr: "string"},
				TypeProperty{Name: "lineWidth", TypeExpr: "number"},
				TypeProperty{Name: "lineCap", TypeExpr: "DrawAreaBrushShape"},
				TypeProperty{Name: "points", TypeExpr: `Array<CanvasPoint | "BREAK">`},
				TypeProperty{Name: "globalCompositeOperation", TypeExpr: "string"},
			),
			reflect.TypeOf(BrushStrokeWithTransform{}): objectDeclaration(
				"BrushStrokeWithTransform",
				TypeProperty{Name: "strokeStyle", TypeExpr: "string"},
				TypeProperty{Name: "lineWidth", TypeExpr: "number"},
				TypeProperty{Name: "lineCap", TypeExpr: "DrawAreaBrushShape"},
				TypeProperty{Name: "points", TypeExpr: `Array<CanvasPoint | "BREAK">`},
				TypeProperty{Name: "globalCompositeOperation", TypeExpr: "string"},
				TypeProperty{Name: "transform", TypeExpr: "DrawAreaTransform"},
			),
			reflect.TypeOf(DrawAreaLayerItemTransform{}): objectDeclarationWithCreateExpr(
				"DrawAreaLayerItemTransform",
				`mergeGeneratedOptions(
    {
      transform: [1, 0, 0, 1, 0, 0],
      eraserStrokes: [],
    },
    options,
  )`,
				TypeProperty{Name: "transform", TypeExpr: "DrawAreaTransform"},
				TypeProperty{Name: "eraserStrokes", TypeExpr: "Array<BrushStrokeWithTransform>"},
			),
			reflect.TypeOf(DrawAreaLayerItem{}): objectDeclarationWithCreateExpr(
				"DrawAreaLayerItem",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.BrushStroke,
      dataPath: "",
      transformId: "",
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.Image | typeof ArtifactTypeEnum.BrushStroke"},
				TypeProperty{Name: "dataPath", TypeExpr: "string"},
				TypeProperty{Name: "transformId", TypeExpr: "string"},
			),
			reflect.TypeOf(DrawAreaLayer{}): objectDeclarationWithCreateExpr(
				"DrawAreaLayer",
				`mergeGeneratedOptions(
    {
      name: createRandomName(),
      elements: [],
      visible: true,
      layerOpacity: 1,
    },
    options,
  )`,
				TypeProperty{Name: "name", TypeExpr: "string"},
				TypeProperty{Name: "elements", TypeExpr: "Array<DrawAreaLayerItem>"},
				TypeProperty{Name: "visible", TypeExpr: "boolean"},
				TypeProperty{Name: "layerOpacity", TypeExpr: "number"},
			),
			reflect.TypeOf(ImageArtifact{}): objectDeclarationWithCreateExpr(
				"ImageArtifact",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.Image,
      id: createPngArtifactId(),
      value: createBinaryContentRef(),
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.Image"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "BinaryContentRef"},
			),
			reflect.TypeOf(BrushStrokeArtifact{}): objectDeclarationWithCreateExpr(
				"BrushStrokeArtifact",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.BrushStroke,
      id: createJsonArtifactId(),
      value: createBrushStroke(),
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.BrushStroke"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "BrushStroke"},
			),
			reflect.TypeOf(DrawAreaLayerItemTransformArtifact{}): objectDeclarationWithCreateExpr(
				"DrawAreaLayerItemTransformArtifact",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.DrawAreaLayerItemTransform,
      id: createJsonArtifactId(),
      value: createDrawAreaLayerItemTransform(),
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.DrawAreaLayerItemTransform"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "DrawAreaLayerItemTransform"},
			),
			reflect.TypeOf(ChartDataValue{}): aliasDeclaration(
				"ChartDataValue",
				"Record<string, Array<string | number>>",
			),
			reflect.TypeOf(ChartData{}): aliasDeclaration(
				"ChartData",
				"ChartDataValue",
			),
			reflect.TypeOf(ChartDataType{}): aliasDeclaration(
				"ChartDataType",
				"ChartDataValue",
			),
			reflect.TypeOf(ChartDataArtifact{}): objectDeclarationWithCreateExpr(
				"ChartDataArtifact",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.ChartData,
      id: createCsvArtifactId(),
      value: {},
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.ChartData"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "ChartDataValue"},
			),
			reflect.TypeOf(FileArtifact{}): objectDeclarationWithCreateExpr(
				"FileArtifact",
				`mergeGeneratedOptions(
    {
      type: ArtifactTypeEnum.File,
      id: createFileArtifactId(),
      value: createBinaryContentRef(),
    },
    options,
  )`,
				TypeProperty{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.File"},
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "value", TypeExpr: "BinaryContentRef"},
			),
			reflect.TypeOf(ArtifactUnion{}): aliasDeclaration(
				"ArtifactUnion",
				"ImageArtifact | BrushStrokeArtifact | DrawAreaLayerItemTransformArtifact | ChartDataArtifact | FileArtifact",
			),
			reflect.TypeOf(UpdateArtifactMsgContent{}): objectDeclaration(
				"UpdateArtifactMsgContent",
				TypeProperty{Name: "artifacts", TypeExpr: "Array<ArtifactUnion>"},
				TypeProperty{Name: "updateType", TypeExpr: `"update" | "delete"`},
			),
			reflect.TypeOf(WebsocketConnectionInfo{}): objectDeclarationWithCreateBody(
				"WebsocketConnectionInfo",
				buildTSObjectCreateBodyTS([]tsObjectEntry{
					tsObjectField("id", tsStringLiteralExpr("")),
					tsObjectField("connectionType", "WebsocketConnectionTypeEnum.SERVER"),
					tsObjectField("currentAddress", "null"),
					tsObjectField("shareSessionId", "null"),
					tsObjectSpread("options"),
				}),
				TypeProperty{Name: "id", TypeExpr: "string"},
				TypeProperty{Name: "connectionType", TypeExpr: "WebsocketConnectionType"},
				TypeProperty{Name: "currentAddress", TypeExpr: "string | null"},
				TypeProperty{Name: "shareSessionId", TypeExpr: "string | null"},
			),
			reflect.TypeOf(WebsocketMsgCurrentAddressUpdate{}): objectDeclarationWithCreateBody(
				"WebsocketMsgCurrentAddressUpdate",
				buildTSObjectCreateBodyTS([]tsObjectEntry{
					tsObjectField("id", "null"),
					tsObjectField("messageType", "WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate"),
					tsObjectField("content", tsStringLiteralExpr("")),
					tsObjectSpread("options"),
				}),
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate"},
				TypeProperty{Name: "content", TypeExpr: "string"},
			),
			reflect.TypeOf(UISettingRevealActivationStep{}): objectDeclaration(
				"UISettingRevealActivationStep",
				TypeProperty{Name: "type", TypeExpr: "string"},
				TypeProperty{Name: "itemValue", TypeExpr: "string"},
			),
			reflect.TypeOf(UISettingRevealTarget{}): objectDeclaration(
				"UISettingRevealTarget",
				TypeProperty{Name: "settingId", TypeExpr: "string"},
				TypeProperty{Name: "side", TypeExpr: "string"},
				TypeProperty{Name: "overviewTabKey", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "uiEditorTabName", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "pluginId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "paneId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "strategy", TypeExpr: "string"},
				TypeProperty{Name: "anchorId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "pluginRevealKey", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "revealActivationSteps", TypeExpr: "Array<UISettingRevealActivationStep>"},
			),
			reflect.TypeOf(UISettingRevealContent{}): objectDeclaration(
				"UISettingRevealContent",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "chatId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "activeSectionId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "reveals", TypeExpr: "Array<UISettingRevealTarget>"},
				TypeProperty{Name: "durationMs", TypeExpr: "number"},
				TypeProperty{Name: "requestId", TypeExpr: "string"},
			),
			reflect.TypeOf(UISettingRevealResultStatus{}): objectDeclaration(
				"UISettingRevealResultStatus",
				TypeProperty{Name: "settingId", TypeExpr: "string"},
				TypeProperty{Name: "status", TypeExpr: `"revealed" | "failed"`},
				TypeProperty{Name: "errorCode", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "errorMessage", TypeExpr: "string | null", Optional: true},
			),
			reflect.TypeOf(UISettingRevealResultContent{}): objectDeclaration(
				"UISettingRevealResultContent",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "requestId", TypeExpr: "string"},
				TypeProperty{Name: "statuses", TypeExpr: "Array<UISettingRevealResultStatus>"},
			),
			reflect.TypeOf(WebsocketMsgRealtimeUIChangeContent{}): objectDeclaration(
				"WebsocketMsgRealtimeUIChangeContent",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "dependencyKey", TypeExpr: "BaseDependencyKeyUnion"},
				TypeProperty{Name: "value", TypeExpr: "BaseDependencyValueUnion"},
			),
			reflect.TypeOf(WebsocketMsgRealtimeUIChange{}): objectDeclaration(
				"WebsocketMsgRealtimeUIChange",
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.RealtimeUIChange"},
				TypeProperty{Name: "content", TypeExpr: "WebsocketMsgRealtimeUIChangeContent"},
			),
			reflect.TypeOf(WebsocketMsgRealtimeDependencyEventContent{}): objectDeclaration(
				"WebsocketMsgRealtimeDependencyEventContent",
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "dependencyEvent", TypeExpr: "DependencyEvent"},
			),
			reflect.TypeOf(WebsocketMsgRealtimeDependencyEvent{}): objectDeclaration(
				"WebsocketMsgRealtimeDependencyEvent",
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.RealtimeDependencyEvent"},
				TypeProperty{Name: "content", TypeExpr: "WebsocketMsgRealtimeDependencyEventContent"},
			),
			reflect.TypeOf(WebsocketMsgUISettingRevealResult{}): objectDeclaration(
				"WebsocketMsgUISettingRevealResult",
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.UISettingRevealResult"},
				TypeProperty{Name: "content", TypeExpr: "UISettingRevealResultContent"},
			),
			reflect.TypeOf(WebsocketMsg{}): aliasDeclaration(
				"WebsocketMsg",
				"WebsocketMsgCurrentAddressUpdate | WebsocketMsgRealtimeUIChange | WebsocketMsgRealtimeDependencyEvent | WebsocketMsgUISettingRevealResult",
			),
			reflect.TypeOf(FrontendWebsocketMsgUnion{}): objectDeclaration(
				"FrontendWebsocketMsgUnion",
				TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "messageType", TypeExpr: "WebsocketMsgTypeForFrontend"},
				TypeProperty{Name: "content", TypeExpr: "any"},
			),
		},
	}
	converter.manualExtraDeclarations = projectStateAliasFactoryDeclarations()
	return converter
}

func (c *typeConverter) AddRootType(root reflect.Type) error {
	if root == nil {
		return nil
	}
	_, err := c.renderTypeExpr(root)
	return err
}

func (c *typeConverter) Declarations() []TypeDeclaration {
	return c.declarations
}

func (c *typeConverter) renderTypeExpr(t reflect.Type) (string, error) {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return "null", nil
	}
	if t == timeType {
		return "string", nil
	}
	if t == rawJSONType {
		return "JSONValue", nil
	}
	if t.Name() != "" && t.PkgPath() != "" {
		if err := c.ensureDeclaration(t); err != nil {
			return "", err
		}
		return t.Name(), nil
	}

	switch t.Kind() {
	case reflect.Pointer:
		inner, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return "", err
		}
		return inner + " | null", nil
	case reflect.String:
		return "string", nil
	case reflect.Bool:
		return "boolean", nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "number", nil
	case reflect.Slice, reflect.Array:
		inner, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("Array<%s>", inner), nil
	case reflect.Map:
		keyExpr, err := c.renderMapKeyExpr(t.Key())
		if err != nil {
			return "", err
		}
		valueExpr, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("Record<%s, %s>", keyExpr, valueExpr), nil
	case reflect.Struct:
		properties, err := c.structProperties(t)
		if err != nil {
			return "", err
		}
		return renderInlineObject(properties), nil
	case reflect.Interface:
		return "unknown", nil
	default:
		if t.Name() != "" && t.PkgPath() != "" {
			if err := c.ensureDeclaration(t); err != nil {
				return "", err
			}
			return t.Name(), nil
		}
		return "", fmt.Errorf("unsupported Go type for TS conversion: %s", t.String())
	}
}

func (c *typeConverter) ensureDeclaration(t reflect.Type) error {
	t = canonicalFrontendBindingType(t)
	if t == nil || t.PkgPath() == "" || t == timeType {
		return nil
	}
	if _, ok := c.seen[t]; ok {
		return nil
	}
	c.seen[t] = struct{}{}

	if decl, ok := c.manualTypes[t]; ok {
		c.declarations = append(c.declarations, decl)
		if extras, ok := c.manualExtraDeclarations[t]; ok {
			c.declarations = append(c.declarations, extras...)
		}
		return nil
	}

	if values, ok := c.stringEnums[t]; ok {
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:       t.Name(),
			Kind:       "enum",
			EnumValues: values,
		})
		return nil
	}
	if values, ok, err := stringenumvalues.Default().Values(t); err != nil {
		return err
	} else if ok {
		enumValues := make([]EnumValue, 0, len(values))
		for _, value := range values {
			enumValues = append(enumValues, EnumValue{
				Name:  value.Name,
				Value: value.Value,
			})
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:       t.Name(),
			Kind:       "enum",
			EnumValues: enumValues,
		})
		return nil
	}

	switch t.Kind() {
	case reflect.Struct:
		properties, err := c.structProperties(t)
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:       t.Name(),
			Kind:       "object",
			Properties: properties,
		})
		return nil
	case reflect.String:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: "string",
		})
		return nil
	case reflect.Bool:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: "boolean",
		})
		return nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: "number",
		})
		return nil
	case reflect.Slice, reflect.Array:
		inner, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: fmt.Sprintf("Array<%s>", inner),
		})
		return nil
	case reflect.Map:
		keyExpr, err := c.renderMapKeyExpr(t.Key())
		if err != nil {
			return err
		}
		valueExpr, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: fmt.Sprintf("Record<%s, %s>", keyExpr, valueExpr),
		})
		return nil
	default:
		return fmt.Errorf("unsupported named Go type for TS declaration: %s", t.String())
	}
}

func canonicalFrontendBindingType(t reflect.Type) reflect.Type {
	if t == nil {
		return nil
	}
	if override, ok := discoveredWrapperTypeOverrides[t]; ok {
		return override
	}
	return t
}

func (c *typeConverter) structProperties(t reflect.Type) ([]TypeProperty, error) {
	properties := make([]TypeProperty, 0, t.NumField())
	for i := range t.NumField() {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		name, optional, skip := jsonFieldName(field)
		if skip {
			continue
		}
		typeExpr, err := c.renderTypeExpr(field.Type)
		if err != nil {
			return nil, fmt.Errorf("%s.%s: %w", t.Name(), field.Name, err)
		}
		properties = append(properties, TypeProperty{
			Name:     name,
			TypeExpr: typeExpr,
			Optional: optional,
		})
	}
	return properties, nil
}

func (c *typeConverter) renderMapKeyExpr(t reflect.Type) (string, error) {
	if t.Kind() == reflect.Pointer {
		return c.renderMapKeyExpr(t.Elem())
	}
	switch t.Kind() {
	case reflect.String:
		return "string", nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "number", nil
	case reflect.Bool:
		return "boolean", nil
	default:
		return "", fmt.Errorf("unsupported map key type for TS conversion: %s", t.String())
	}
}

func jsonFieldName(field reflect.StructField) (name string, optional bool, skip bool) {
	tag := field.Tag.Get("json")
	if tag == "-" {
		return "", false, true
	}
	if tag == "" {
		return lowerCamelCase(field.Name), false, false
	}
	parts := strings.Split(tag, ",")
	name = strings.TrimSpace(parts[0])
	if name == "" {
		name = lowerCamelCase(field.Name)
	}
	for _, part := range parts[1:] {
		if strings.TrimSpace(part) == "omitempty" {
			optional = true
		}
	}
	return name, optional, false
}

func lowerCamelCase(value string) string {
	if value == "" {
		return value
	}
	return strings.ToLower(value[:1]) + value[1:]
}

func renderInlineObject(properties []TypeProperty) string {
	if len(properties) == 0 {
		return "Record<string, never>"
	}
	lines := make([]string, 0, len(properties)+2)
	lines = append(lines, "{")
	for _, property := range properties {
		optional := ""
		if property.Optional {
			optional = "?"
		}
		lines = append(lines, fmt.Sprintf("  %s%s: %s;", property.Name, optional, property.TypeExpr))
	}
	lines = append(lines, "}")
	return strings.Join(lines, "\n")
}
