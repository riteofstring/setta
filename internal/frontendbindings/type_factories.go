package frontendbindings

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"setta/internal/projectstate"
)

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
	if fieldType == timeType {
		return "", "", false, false
	}
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
	defaults, err := projectstate.FrontendSectionImplDefaultValue(implType)
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

func orderedTypePropertyNames(properties []TypeProperty) []string {
	names := make([]string, 0, len(properties))
	for _, property := range properties {
		names = append(names, property.Name)
	}
	return names
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
	if _, err := projectstate.FrontendSectionImplDefaultValue(sectionName); err != nil {
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

type generatedImplFactorySpec struct {
	DefaultType  string
	DefaultValue any
}

func generatedImplFactoryDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	spec, ok := generatedImplFactorySpecForType(t)
	if !ok {
		return TypeDeclaration{}, false
	}
	implType := frontendBindingTypeName(t)
	return exportedFunctionDeclaration(
		"create"+implType,
		implType,
		buildGeneratedImplFactoryBodyTS(
			"frontend generated impl defaults "+implType,
			spec.DefaultType,
			implType,
			spec.DefaultValue,
		),
		defaultsOrOverridesTypeProperty(spec.DefaultType, implType),
		optionalOverrideTypeProperty(implType),
	), true
}

func generatedImplFactorySpecForType(t reflect.Type) (generatedImplFactorySpec, bool) {
	if sectionName, ok := generatedSectionImplName(t); ok {
		defaultValue, err := projectstate.FrontendSectionImplDefaultValue(sectionName)
		if err != nil {
			panic("load generated section impl defaults: " + err.Error())
		}
		return generatedImplFactorySpec{
			DefaultType:  generatedSectionImplDefaultTypeName(sectionName),
			DefaultValue: defaultValue,
		}, true
	}
	if t == reflect.TypeOf(projectstate.FrontendCodeParamCodeObjImpl{}) {
		return generatedImplFactorySpec{
			DefaultType:  "UserDefaultCodeParamCodeObjImpl",
			DefaultValue: projectstate.FrontendDefaultCodeParamCodeObjImpl(),
		}, true
	}
	return generatedImplFactorySpec{}, false
}

func buildGeneratedImplFactoryBodyTS(
	context string,
	defaultType string,
	implType string,
	defaultValue any,
) string {
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
	builder.WriteString("  const defaults = ")
	builder.WriteString(
		buildTSMergeGeneratedOptionsExprFromGoValueTS(
			context,
			defaultValue,
			goJSONFieldOrder(defaultValue),
			"resolved.defaults as Partial<"+implType+">",
			implType,
		),
	)
	builder.WriteString(";\n")
	builder.WriteString("  return mergeGeneratedOptions<")
	builder.WriteString(implType)
	builder.WriteString(">(defaults, resolved.overrides);")
	return builder.String()
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

func additionalDeclarationsForType(_ *typeConverter, t reflect.Type) ([]TypeDeclaration, bool) {
	declarations := []TypeDeclaration{}
	if declaration, ok := generatedImplFactoryDeclaration(t); ok {
		declarations = append(declarations, declaration)
	}
	if schemaDeclarations, ok := safeParseSchemaDeclarationsForType(t); ok {
		declarations = append(declarations, schemaDeclarations...)
	}
	if len(declarations) == 0 {
		return nil, false
	}
	return declarations, true
}
