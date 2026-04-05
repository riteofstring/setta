package frontendbindings

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"
)

type reflectedFieldCreateSpec struct {
	Type            reflect.Type
	CreateExpr      string
	CreateMapValues bool
}

func buildGoBackedCreateBodyTS(
	context string,
	declarationName string,
	structType reflect.Type,
	defaultValue any,
	properties []TypeProperty,
	fieldSpecsByName map[string]reflectedFieldCreateSpec,
) (string, error) {
	if defaultValue == nil {
		return "", fmt.Errorf("%s has no Go default value", declarationName)
	}
	defaultsObject, orderedKeys, fieldLines, err := buildGenericCreateDefaultsAndFieldsTS(
		context,
		structType,
		properties,
		fieldSpecsByName,
		defaultValue,
	)
	if err != nil {
		return "", err
	}
	var builder strings.Builder
	builder.WriteString("  const defaults: ")
	builder.WriteString(declarationName)
	builder.WriteString(" = ")
	builder.WriteString(renderTSObjectLiteralExpr(defaultsObject, orderedKeys, "  "))
	builder.WriteString(";\n")
	builder.WriteString("  return {\n")
	builder.WriteString("    ...mergeGeneratedOptions<")
	builder.WriteString(declarationName)
	builder.WriteString(">(defaults, options),\n")
	for _, line := range fieldLines {
		builder.WriteString(line)
	}
	builder.WriteString("  };")
	return builder.String(), nil
}

func buildGenericCreateDefaultsAndFieldsTS(
	context string,
	structType reflect.Type,
	properties []TypeProperty,
	fieldSpecsByName map[string]reflectedFieldCreateSpec,
	defaultValue any,
) (map[string]any, []string, []string, error) {
	defaultValuesByName, _ := mustOrderedTSLiteralObjectFromGoValue(context, defaultValue)
	filtered := make(map[string]any, len(properties))
	orderedKeys := make([]string, 0, len(properties))
	fieldLines := make([]string, 0, len(properties))
	for _, property := range properties {
		fieldSpec, ok := fieldSpecsByName[property.Name]
		if !ok {
			return nil, nil, nil, fmt.Errorf(
				"%s is missing field metadata for %q",
				structType.Name(),
				property.Name,
			)
		}
		value, hasDefault := defaultValuesByName[property.Name]
		if !hasDefault {
			if !property.Optional {
				panic(fmt.Sprintf("%s is missing property %q", context, property.Name))
			}
		} else {
			filtered[property.Name] = value
			orderedKeys = append(orderedKeys, property.Name)
		}
		expr, ok, err := buildGenericCreateFieldExprTS(
			fieldSpec,
			property,
			renderTSPropertyAccessExpr("defaults", property.Name),
			renderTSPropertyAccessExpr("options", property.Name),
			hasDefault,
		)
		if err != nil {
			return nil, nil, nil, err
		}
		if ok {
			fieldLines = append(fieldLines, "    "+renderTSObjectKey(property.Name)+": "+expr+",\n")
		}
	}
	return filtered, orderedKeys, fieldLines, nil
}

func buildGenericCreateFieldExprTS(
	fieldSpec reflectedFieldCreateSpec,
	property TypeProperty,
	defaultExpr string,
	optionsExpr string,
	hasDefault bool,
) (string, bool, error) {
	defaultExpr = strings.TrimSpace(defaultExpr)
	optionsExpr = strings.TrimSpace(optionsExpr)
	explicitDefaultExpr := strings.TrimSpace(fieldSpec.CreateExpr)
	if explicitDefaultExpr != "" {
		return buildGenericDefaultFallbackExprTS(fieldSpec.Type, optionsExpr, explicitDefaultExpr), true, nil
	}
	if expr, ok := buildGenericNamedStructFieldExprTS(fieldSpec.Type, optionsExpr, defaultExpr, hasDefault); ok {
		return expr, true, nil
	}
	if fieldSpec.CreateMapValues {
		if expr, ok := buildGenericMapFieldExprTS(fieldSpec.Type, property.TypeExpr, optionsExpr, defaultExpr, hasDefault); ok {
			return expr, true, nil
		}
	}
	return "", false, nil
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
			CreateExpr:      strings.TrimSpace(tsMetadata.CreateExpr),
			CreateMapValues: tsMetadata.CreateMapValues,
		}
	}
	return fields, nil
}

func renderTSPropertyAccessExpr(baseExpr string, propertyName string) string {
	if tsIdentifierPattern.MatchString(propertyName) {
		return baseExpr + "." + propertyName
	}
	return baseExpr + "[" + strconv.Quote(propertyName) + "]"
}

func buildGeneratedImplFactoryBodyTS(
	context string,
	implType string,
	defaultValue any,
) string {
	defaultsObject, orderedKeys := mustOrderedTSLiteralObjectFromGoValue(context, defaultValue)
	var builder strings.Builder
	builder.WriteString("  return mergeGeneratedOptions<")
	builder.WriteString(implType)
	builder.WriteString(">(\n")
	builder.WriteString("    ")
	builder.WriteString(renderTSObjectLiteralExpr(defaultsObject, orderedKeys, "    "))
	builder.WriteString(",\n")
	builder.WriteString("    options,\n")
	builder.WriteString("  );")
	return builder.String()
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
