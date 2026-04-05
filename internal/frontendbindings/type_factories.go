package frontendbindings

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"setta/internal/projectstate"
)

type generatedFactoryPropertyExprBuilder func(defaultsExpr string) string

type genericCreateFieldSpec struct {
	Name string
	Expr string
}

func buildGenericGoBackedCreateBodyTS(
	context string,
	declarationName string,
	structType reflect.Type,
	defaultValue any,
	properties []TypeProperty,
	exprOverrides map[string]string,
) (string, error) {
	if defaultValue == nil {
		return "", fmt.Errorf("%s has no Go default value", declarationName)
	}
	fieldSpecs, err := buildGenericCreateFieldSpecs(
		context,
		structType,
		defaultValue,
		properties,
		exprOverrides,
	)
	if err != nil {
		return "", err
	}
	defaultsObject := mustTSLiteralObjectFromGoValue(context, defaultValue)
	var builder strings.Builder
	builder.WriteString("  const defaults: ")
	builder.WriteString(declarationName)
	builder.WriteString(" = ")
	writeTSObjectLiteral(&builder, "  ", defaultsObject, goJSONFieldOrder(defaultValue))
	builder.WriteString(";\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions<")
	builder.WriteString(declarationName)
	builder.WriteString(">(defaults, options),\n")
	for _, field := range fieldSpecs {
		builder.WriteString("    ")
		builder.WriteString(field.Name)
		builder.WriteString(": ")
		builder.WriteString(field.Expr)
		builder.WriteString(",\n")
	}
	builder.WriteString("  };")
	return builder.String(), nil
}

func buildGenericCreateFieldSpecs(
	context string,
	structType reflect.Type,
	defaultValue any,
	properties []TypeProperty,
	exprOverrides map[string]string,
) ([]genericCreateFieldSpec, error) {
	fieldTypes, err := reflectedFieldTypesByJSONName(structType)
	if err != nil {
		return nil, err
	}
	defaults := mustTSLiteralObjectFromGoValue(context, defaultValue)
	specs := []genericCreateFieldSpec{}
	for _, property := range properties {
		fieldType, ok := fieldTypes[property.Name]
		if !ok {
			return nil, fmt.Errorf("%s is missing field metadata for %q", structType.Name(), property.Name)
		}
		explicitDefaultExpr := ""
		if exprOverrides != nil {
			explicitDefaultExpr = strings.TrimSpace(exprOverrides[property.Name])
		}
		fieldSpec, ok, err := buildGenericCreateFieldSpec(
			fieldType,
			property,
			explicitDefaultExpr,
			renderTSPropertyAccessExpr("defaults", property.Name),
			renderTSPropertyAccessExpr("options", property.Name),
			defaults,
		)
		if err != nil {
			return nil, err
		}
		if ok {
			specs = append(specs, fieldSpec)
		}
	}
	return specs, nil
}

func buildGenericCreateFieldSpec(
	fieldType reflect.Type,
	property TypeProperty,
	explicitDefaultExpr string,
	defaultExpr string,
	optionsExpr string,
	defaults map[string]any,
) (genericCreateFieldSpec, bool, error) {
	defaultExpr = strings.TrimSpace(defaultExpr)
	optionsExpr = strings.TrimSpace(optionsExpr)
	_, hasDefault := defaults[property.Name]
	if explicitDefaultExpr != "" {
		return genericCreateFieldSpec{
			Name: property.Name,
			Expr: buildGenericDefaultFallbackExprTS(fieldType, optionsExpr, explicitDefaultExpr),
		}, true, nil
	}
	if expr, ok := buildGenericNamedStructFieldExprTS(fieldType, optionsExpr, defaultExpr, hasDefault); ok {
		return genericCreateFieldSpec{Name: property.Name, Expr: expr}, true, nil
	}
	if expr, ok := buildGenericMapFieldExprTS(fieldType, property.TypeExpr, optionsExpr, defaultExpr, hasDefault); ok {
		return genericCreateFieldSpec{Name: property.Name, Expr: expr}, true, nil
	}
	return genericCreateFieldSpec{}, false, nil
}

func buildGenericNamedStructFieldExprTS(
	fieldType reflect.Type,
	optionsExpr string,
	defaultExpr string,
	hasDefault bool,
) (string, bool) {
	createFuncName, typeName, nullable, ok := frontendObjectCreateFunctionName(fieldType)
	if !ok {
		return "", false
	}
	if nullable {
		if hasDefault {
			mergedExpr := fmt.Sprintf("(%s ?? %s)", optionsExpr, defaultExpr)
			return fmt.Sprintf(
				"%s === null ? null : (%s === null ? null : %s(%s as Partial<%s>))",
				optionsExpr,
				mergedExpr,
				createFuncName,
				mergedExpr,
				typeName,
			), true
		}
		return fmt.Sprintf(
			"%s === undefined || %s === null ? null : %s(%s)",
			optionsExpr,
			optionsExpr,
			createFuncName,
			optionsExpr,
		), true
	}
	if hasDefault {
		return fmt.Sprintf("%s(%s ?? %s)", createFuncName, optionsExpr, defaultExpr), true
	}
	return fmt.Sprintf("%s(%s ?? {})", createFuncName, optionsExpr), true
}

func buildGenericMapFieldExprTS(
	fieldType reflect.Type,
	resultType string,
	optionsExpr string,
	defaultExpr string,
	hasDefault bool,
) (string, bool) {
	nullable := false
	for fieldType.Kind() == reflect.Pointer {
		nullable = true
		fieldType = fieldType.Elem()
	}
	if fieldType.Kind() != reflect.Map {
		return "", false
	}
	createFuncName, valueTypeName, _, ok := frontendObjectCreateFunctionName(fieldType.Elem())
	if !ok {
		return "", false
	}
	defaultSource := "{}"
	if hasDefault {
		defaultSource = defaultExpr + " ?? {}"
	}
	var builder strings.Builder
	if nullable {
		builder.WriteString(optionsExpr)
		builder.WriteString(" === null\n")
		builder.WriteString("      ? null\n")
		builder.WriteString("      : ")
	}
	builder.WriteString("Object.fromEntries(\n")
	builder.WriteString("      Object.entries({\n")
	builder.WriteString("        ...(")
	builder.WriteString(defaultSource)
	builder.WriteString("),\n")
	builder.WriteString("        ...(")
	builder.WriteString(optionsExpr)
	builder.WriteString(" ?? {}),\n")
	builder.WriteString("      }).map(([key, value]) => [\n")
	builder.WriteString("        key,\n")
	builder.WriteString("        ")
	builder.WriteString(createFuncName)
	builder.WriteString("(value as Partial<")
	builder.WriteString(valueTypeName)
	builder.WriteString(">),\n")
	builder.WriteString("      ]),\n")
	builder.WriteString("    ) as ")
	builder.WriteString(resultType)
	return builder.String(), true
}

func buildGenericDefaultFallbackExprTS(
	fieldType reflect.Type,
	optionsExpr string,
	defaultExpr string,
) string {
	nullable := false
	for fieldType.Kind() == reflect.Pointer {
		nullable = true
		fieldType = fieldType.Elem()
	}
	if nullable {
		return fmt.Sprintf("%s === null ? null : (%s ?? %s)", optionsExpr, optionsExpr, defaultExpr)
	}
	return fmt.Sprintf("%s ?? %s", optionsExpr, defaultExpr)
}

func frontendObjectCreateFunctionName(fieldType reflect.Type) (string, string, bool, bool) {
	nullable := false
	for fieldType.Kind() == reflect.Pointer {
		nullable = true
		fieldType = fieldType.Elem()
	}
	fieldType = canonicalFrontendBindingType(fieldType)
	if fieldType == nil || fieldType.Name() == "" || fieldType.PkgPath() == "" {
		return "", "", false, false
	}
	if fieldType.Kind() != reflect.Struct {
		return "", "", false, false
	}
	typeName := frontendBindingTypeName(fieldType)
	return "create" + typeName, typeName, nullable, true
}

func reflectedFieldTypesByJSONName(structType reflect.Type) (map[string]reflect.Type, error) {
	fields := map[string]reflect.Type{}
	for structType.Kind() == reflect.Pointer {
		structType = structType.Elem()
	}
	if structType.Kind() != reflect.Struct {
		return nil, fmt.Errorf("generic create body requires a struct type, got %s", structType.String())
	}
	for fieldIndex := range structType.NumField() {
		field := structType.Field(fieldIndex)
		if !field.IsExported() {
			continue
		}
		if field.Anonymous {
			embeddedFields, err := reflectedFieldTypesByJSONName(field.Type)
			if err != nil {
				return nil, err
			}
			for name, fieldType := range embeddedFields {
				if _, exists := fields[name]; !exists {
					fields[name] = fieldType
				}
			}
			continue
		}
		name, _, skip := jsonFieldName(field)
		if skip {
			continue
		}
		fields[name] = field.Type
	}
	return fields, nil
}

func reflectedFieldCreateExprOverridesByJSONName(structType reflect.Type) (map[string]string, error) {
	overrides := map[string]string{}
	for structType.Kind() == reflect.Pointer {
		structType = structType.Elem()
	}
	if structType.Kind() != reflect.Struct {
		return nil, fmt.Errorf("field create expr overrides require a struct type, got %s", structType.String())
	}
	for fieldIndex := range structType.NumField() {
		field := structType.Field(fieldIndex)
		if !field.IsExported() {
			continue
		}
		if field.Anonymous {
			embeddedOverrides, err := reflectedFieldCreateExprOverridesByJSONName(field.Type)
			if err != nil {
				return nil, err
			}
			for name, expr := range embeddedOverrides {
				if _, exists := overrides[name]; !exists {
					overrides[name] = expr
				}
			}
			continue
		}
		name, _, skip := jsonFieldName(field)
		if skip {
			continue
		}
		tsMetadata, err := tsFieldMetadata(field)
		if err != nil {
			return nil, err
		}
		if tsMetadata.Skip || strings.TrimSpace(tsMetadata.CreateExpr) == "" {
			continue
		}
		overrides[name] = tsMetadata.CreateExpr
	}
	return overrides, nil
}

func mergedFieldCreateExprOverrides(
	structType reflect.Type,
	explicitOverrides map[string]string,
) (map[string]string, error) {
	tagOverrides, err := reflectedFieldCreateExprOverridesByJSONName(structType)
	if err != nil {
		return nil, err
	}
	if len(tagOverrides) == 0 && len(explicitOverrides) == 0 {
		return nil, nil
	}
	merged := make(map[string]string, len(tagOverrides)+len(explicitOverrides))
	for name, expr := range tagOverrides {
		merged[name] = expr
	}
	for name, expr := range explicitOverrides {
		merged[name] = expr
	}
	return merged, nil
}

func renderTSPropertyAccessExpr(baseExpr string, propertyName string) string {
	if tsIdentifierPattern.MatchString(propertyName) {
		return baseExpr + "." + propertyName
	}
	return baseExpr + "[" + strconv.Quote(propertyName) + "]"
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
		buildGoBackedCreateExprTS("frontend create defaults "+name, name, defaultValue, properties),
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
		"UserDefault"+implType+"SectionImpl",
		defaults,
		properties,
	)
}

func buildGoBackedCreateExprTS(
	context string,
	resultType string,
	value any,
	properties []TypeProperty,
) string {
	filteredDefaults := filterObjectByTypeProperties(
		context,
		mustTSLiteralObjectFromGoValue(context, value),
		properties,
	)
	return buildTSMergeGeneratedOptionsExprFromTSObject(
		filteredDefaults,
		orderedTypePropertyNames(properties),
		"options",
		resultType,
	)
}

func buildGoBackedCreateExprWithExprOverridesTS(
	context string,
	resultType string,
	value any,
	properties []TypeProperty,
	exprOverrides map[string]string,
) string {
	filteredDefaults := filterObjectByTypePropertiesWithExprOverrides(
		context,
		mustTSLiteralObjectFromGoValue(context, value),
		properties,
		exprOverrides,
	)
	return buildTSMergeGeneratedOptionsExprFromGoValueWithExprOverridesTS(
		context,
		filteredDefaults,
		orderedTypePropertyNames(properties),
		"options",
		exprOverrides,
		resultType,
	)
}

func filterObjectByTypeProperties(
	context string,
	object map[string]any,
	properties []TypeProperty,
) map[string]any {
	return filterObjectByTypePropertiesWithExprOverrides(context, object, properties, nil)
}

func filterObjectByTypePropertiesWithExprOverrides(
	context string,
	object map[string]any,
	properties []TypeProperty,
	exprOverrides map[string]string,
) map[string]any {
	filtered := make(map[string]any, len(properties))
	for _, property := range properties {
		value, ok := object[property.Name]
		if !ok {
			if exprOverrides != nil {
				if _, overridden := exprOverrides[property.Name]; overridden {
					continue
				}
			}
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

func orderedTypePropertyNames(properties []TypeProperty) []string {
	names := make([]string, 0, len(properties))
	for _, property := range properties {
		names = append(names, property.Name)
	}
	return names
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

func generatedSectionImplName(t reflect.Type) (string, bool) {
	if t == nil || t.Kind() != reflect.Struct {
		return "", false
	}
	if !generatedFrontendSectionContractType(t) {
		return "", false
	}
	name := normalizedFrontendBindingTypeName(t.Name())
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

func generatedCodeObjImplName(t reflect.Type) (string, bool) {
	if t == nil || t.Kind() != reflect.Struct {
		return "", false
	}
	if !generatedFrontendCodeObjContractType(t) {
		return "", false
	}
	name := normalizedFrontendBindingTypeName(t.Name())
	if name == "" || strings.HasPrefix(name, "Base") || strings.HasPrefix(name, "UserDefault") {
		return "", false
	}
	if !strings.HasSuffix(name, "CodeObjImpl") {
		return "", false
	}
	return name, true
}

func generatedFrontendSectionContractType(t reflect.Type) bool {
	return generatedContractTypeEmbedsAnonymousField(
		t,
		reflect.TypeOf(projectstate.FrontendBaseSectionImpl{}),
	)
}

func generatedFrontendCodeObjContractType(t reflect.Type) bool {
	return generatedContractTypeEmbedsAnonymousField(
		t,
		reflect.TypeOf(projectstate.FrontendBaseCodeObjImpl{}),
	)
}

func generatedContractTypeEmbedsAnonymousField(t reflect.Type, target reflect.Type) bool {
	if t == nil || target == nil || t.Kind() != reflect.Struct {
		return false
	}
	for index := 0; index < t.NumField(); index++ {
		field := t.Field(index)
		if !field.Anonymous {
			continue
		}
		fieldType := field.Type
		if fieldType == target {
			return true
		}
		if fieldType.Kind() == reflect.Pointer {
			fieldType = fieldType.Elem()
		}
		if fieldType.Kind() == reflect.Struct &&
			generatedContractTypeEmbedsAnonymousField(fieldType, target) {
			return true
		}
	}
	return false
}

func generatedSectionImplTypeExpr(sectionName string) string {
	return "SectionTypeEnum." + sectionName
}

func generatedSectionImplDefaultTypeName(sectionName string) string {
	return "UserDefault" + sectionName + "SectionImpl"
}

func generatedOrdinaryFactoryEntries(
	properties []TypeProperty,
	defaults map[string]any,
	defaultsExpr string,
	userDefaultPropertyNames map[string]struct{},
	exprOverrides map[string]generatedFactoryPropertyExprBuilder,
) []string {
	entries := make([]string, 0, len(properties))
	for _, property := range properties {
		expr := generatedOrdinaryFactoryPropertyExpr(
			property,
			defaults,
			defaultsExpr,
			userDefaultPropertyNames,
			exprOverrides,
		)
		entries = append(entries, property.Name+": "+expr)
	}
	return entries
}

func generatedOrdinaryFactoryPropertyExpr(
	property TypeProperty,
	defaults map[string]any,
	defaultsExpr string,
	userDefaultPropertyNames map[string]struct{},
	exprOverrides map[string]generatedFactoryPropertyExprBuilder,
) string {
	if builder, ok := exprOverrides[property.Name]; ok {
		return builder(defaultsExpr)
	}
	if _, ok := userDefaultPropertyNames[property.Name]; ok {
		return defaultsExpr + "." + property.Name
	}
	if value, ok := defaults[property.Name]; ok {
		return renderTSLiteralExpr(value)
	}
	if fallback, ok := generatedOrdinaryFactoryFallbackExpr(property); ok {
		return fallback
	}
	panic(
		fmt.Sprintf(
			"missing generated factory default for %s (%s)",
			property.Name,
			property.TypeExpr,
		),
	)
}

func generatedOrdinaryFactoryFallbackExpr(property TypeProperty) (string, bool) {
	switch {
	case property.TypeExpr == "string":
		return `""`, true
	case property.TypeExpr == "boolean":
		return "false", true
	case property.TypeExpr == "number":
		return "0", true
	case strings.Contains(property.TypeExpr, " | null"):
		return "null", true
	case strings.HasPrefix(property.TypeExpr, "Array<"):
		return "[]", true
	case strings.HasPrefix(property.TypeExpr, "Record<"):
		return "{}", true
	default:
		return "", false
	}
}

func mustGeneratedSectionImplFactoryProperties(
	converter *typeConverter,
	t reflect.Type,
) []TypeProperty {
	properties, err := generatedUserDefaultReflectedProperties(converter, t)
	if err != nil {
		panic("load generated section impl properties: " + err.Error())
	}
	return properties
}

func generatedSectionImplFactoryDefaultValues(sectionName string) map[string]any {
	defaults, err := projectstate.FrontendUserDefaultSectionDefaults(sectionName)
	if err != nil {
		panic("load generated section factory defaults: " + err.Error())
	}
	return defaults
}

func generatedSectionImplFactoryUserDefaultPropertyNames(
	converter *typeConverter,
	sectionName string,
) map[string]struct{} {
	properties, err := generatedUserDefaultSectionProperties(converter, sectionName)
	if err != nil {
		panic("load generated user default section properties: " + err.Error())
	}
	return generatedPropertyNameSet(properties)
}

func generatedSectionImplFactoryExprOverrides(
	sectionName string,
) map[string]generatedFactoryPropertyExprBuilder {
	overrides := map[string]generatedFactoryPropertyExprBuilder{
		"type": func(string) string {
			return generatedSectionImplTypeExpr(sectionName)
		},
	}
	switch sectionName {
	case "TaskBoard":
		overrides["columns"] = func(defaultsExpr string) string {
			return defaultsExpr + `.columns === null || ` + defaultsExpr + `.columns === undefined
        ? []
        : cloneGeneratedValue(` + defaultsExpr + `.columns)`
		}
	}
	return overrides
}

func generatedSectionImplFactoryOptions(
	sectionName string,
) (useDirectDefaults bool, defaultsExpr string, overridesExpr string, prelude string) {
	if sectionName == "Dict" {
		return true, "defaults", "overrides", ""
	}
	overridesExpr = "resolved.overrides"
	if sectionName == "TaskBoard" {
		overridesExpr = "normalizedOverrides"
		prelude = buildTaskBoardOverridesPreludeTS()
	}
	return false, "resolved.defaults", overridesExpr, prelude
}

func generatedSectionImplFactoryEntries(
	converter *typeConverter,
	t reflect.Type,
	sectionName string,
	defaultsExpr string,
) []string {
	return generatedOrdinaryFactoryEntries(
		mustGeneratedSectionImplFactoryProperties(converter, t),
		generatedSectionImplFactoryDefaultValues(sectionName),
		defaultsExpr,
		generatedSectionImplFactoryUserDefaultPropertyNames(converter, sectionName),
		generatedSectionImplFactoryExprOverrides(sectionName),
	)
}

func generatedSectionImplFactoryDeclaration(
	converter *typeConverter,
	t reflect.Type,
) (TypeDeclaration, bool) {
	sectionName, ok := generatedSectionImplName(t)
	if !ok {
		return TypeDeclaration{}, false
	}
	implType := frontendBindingTypeName(t)
	defaultType := generatedSectionImplDefaultTypeName(sectionName)
	name := "create" + implType
	useDirectDefaults, defaultsExpr, overridesExpr, prelude := generatedSectionImplFactoryOptions(sectionName)
	entries := generatedSectionImplFactoryEntries(converter, t, sectionName, defaultsExpr)

	if useDirectDefaults {
		return exportedFunctionDeclaration(
			name,
			implType,
			buildDirectGeneratedFactoryBodyTS(
				entries,
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
			entries,
			prelude,
			overridesExpr,
		),
		defaultsOrOverridesTypeProperty(defaultType, implType),
		optionalOverrideTypeProperty(implType),
	), true
}

func generatedCodeParamCodeObjFactoryEntries(
	converter *typeConverter,
	defaultsExpr string,
) []string {
	userDefaultProperties, err := generatedUserDefaultCodeParamCodeObjProperties(converter)
	if err != nil {
		panic("load generated user default code param properties: " + err.Error())
	}
	properties, err := generatedUserDefaultReflectedProperties(
		converter,
		reflect.TypeOf(projectstate.FrontendCodeParamCodeObjImpl{}),
	)
	if err != nil {
		panic("load generated code param impl properties: " + err.Error())
	}
	return generatedOrdinaryFactoryEntries(
		properties,
		mustTSLiteralObjectFromGoValue(
			"frontend code param factory defaults",
			projectstate.FrontendDefaultCodeParamCodeObjImpl(),
		),
		defaultsExpr,
		generatedPropertyNameSet(userDefaultProperties),
		map[string]generatedFactoryPropertyExprBuilder{
			"type": func(string) string {
				return "CodeObjTypeEnum.CodeParam"
			},
		},
	)
}

func generatedCodeParamCodeObjFactoryDeclaration(converter *typeConverter) TypeDeclaration {
	return exportedFunctionDeclaration(
		"createCodeParamCodeObjImpl",
		"CodeParamCodeObjImpl",
		buildResolvedGeneratedFactoryBodyTS(
			"UserDefaultCodeParamCodeObjImpl",
			"CodeParamCodeObjImpl",
			generatedCodeParamCodeObjFactoryEntries(converter, "resolved.defaults"),
			"",
			"",
		),
		defaultsOrOverridesTypeProperty("UserDefaultCodeParamCodeObjImpl", "CodeParamCodeObjImpl"),
		optionalOverrideTypeProperty("CodeParamCodeObjImpl"),
	)
}

func baseChartSettingsUnionFactoryDeclaration() TypeDeclaration {
	return exportedFunctionDeclaration(
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
	)
}

func additionalFactoryDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		baseChartSettingsUnionFactoryDeclaration(),
	}
}

func additionalDeclarationsForType(converter *typeConverter, t reflect.Type) ([]TypeDeclaration, bool) {
	switch t {
	case reflect.TypeOf(projectstate.FrontendCodeParamCodeObjImpl{}):
		return []TypeDeclaration{generatedCodeParamCodeObjFactoryDeclaration(converter)}, true
	}
	if declaration, ok := generatedSectionImplFactoryDeclaration(converter, t); ok {
		return []TypeDeclaration{declaration}, true
	}
	return nil, false
}
