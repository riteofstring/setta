package frontendbindings

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"
)

type genericCreateFieldSpec struct {
	Name string
	Expr string
}

type reflectedFieldCreateSpec struct {
	Type            reflect.Type
	CreateMapValues bool
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
	fieldSpecsByName, err := reflectedFieldCreateSpecsByJSONName(structType)
	if err != nil {
		return nil, err
	}
	defaults := mustTSLiteralObjectFromGoValue(context, defaultValue)
	specs := []genericCreateFieldSpec{}
	for _, property := range properties {
		fieldSpec, ok := fieldSpecsByName[property.Name]
		if !ok {
			return nil, fmt.Errorf("%s is missing field metadata for %q", structType.Name(), property.Name)
		}
		explicitDefaultExpr := ""
		if exprOverrides != nil {
			explicitDefaultExpr = strings.TrimSpace(exprOverrides[property.Name])
		}
		createFieldSpec, ok, err := buildGenericCreateFieldSpec(
			fieldSpec,
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
			specs = append(specs, createFieldSpec)
		}
	}
	return specs, nil
}

func buildGenericCreateFieldSpec(
	fieldSpec reflectedFieldCreateSpec,
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
			Expr: buildGenericDefaultFallbackExprTS(fieldSpec.Type, optionsExpr, explicitDefaultExpr),
		}, true, nil
	}
	if expr, ok := buildGenericNamedStructFieldExprTS(fieldSpec.Type, optionsExpr, defaultExpr, hasDefault); ok {
		return genericCreateFieldSpec{Name: property.Name, Expr: expr}, true, nil
	}
	if fieldSpec.CreateMapValues {
		if expr, ok := buildGenericMapFieldExprTS(fieldSpec.Type, property.TypeExpr, optionsExpr, defaultExpr, hasDefault); ok {
			return genericCreateFieldSpec{Name: property.Name, Expr: expr}, true, nil
		}
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

func reflectedFieldCreateSpecsByJSONName(structType reflect.Type) (map[string]reflectedFieldCreateSpec, error) {
	fields := map[string]reflectedFieldCreateSpec{}
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
			embeddedFields, err := reflectedFieldCreateSpecsByJSONName(field.Type)
			if err != nil {
				return nil, err
			}
			for name, fieldSpec := range embeddedFields {
				if _, exists := fields[name]; !exists {
					fields[name] = fieldSpec
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
		if tsMetadata.Skip {
			continue
		}
		if tsMetadata.CreateMapValues && !reflectedMapFieldNeedsGeneratedCreate(field.Type) {
			return nil, fmt.Errorf(
				"%s.%s ts_create_map_values requires map values with generated create support",
				structType.Name(),
				field.Name,
			)
		}
		fields[name] = reflectedFieldCreateSpec{
			Type:            field.Type,
			CreateMapValues: tsMetadata.CreateMapValues,
		}
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

func renderTSPropertyAccessExpr(baseExpr string, propertyName string) string {
	if tsIdentifierPattern.MatchString(propertyName) {
		return baseExpr + "." + propertyName
	}
	return baseExpr + "[" + strconv.Quote(propertyName) + "]"
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

func orderedTypePropertyNames(properties []TypeProperty) []string {
	names := make([]string, 0, len(properties))
	for _, property := range properties {
		names = append(names, property.Name)
	}
	return names
}

func buildGeneratedImplFactoryBodyTS(
	context string,
	implType string,
	defaultValue any,
) string {
	return "  return " + buildTSMergeGeneratedOptionsExprFromGoValueTS(
		context,
		defaultValue,
		goJSONFieldOrder(defaultValue),
		"options",
		implType,
	) + ";"
}

func additionalDeclarationsForType(_ *typeConverter, t reflect.Type) ([]TypeDeclaration, bool) {
	declarations := []TypeDeclaration{}
	if familyDeclarations, ok, err := discriminatedObjectFamilyAdditionalDeclarations(t); err != nil {
		panic(err)
	} else if ok {
		declarations = append(declarations, familyDeclarations...)
	}
	if len(declarations) == 0 {
		return nil, false
	}
	return declarations, true
}
