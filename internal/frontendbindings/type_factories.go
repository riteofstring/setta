package frontendbindings

import (
	"fmt"
	"reflect"
	"strings"
)

func buildGoBackedCreateBodyTS(
	context string,
	declarationName string,
	structType reflect.Type,
	defaultValue any,
	properties []TypeProperty,
	fieldsByName map[string]reflect.StructField,
) (string, error) {
	if defaultValue == nil {
		return "", fmt.Errorf("%s has no Go default value", declarationName)
	}
	defaultValuesByName, _ := mustOrderedTSLiteralObjectFromGoValue(context, defaultValue)
	defaultsObject := make(map[string]any, len(properties))
	orderedKeys := make([]string, 0, len(properties))
	var fieldBuilder strings.Builder
	for _, property := range properties {
		field, ok := fieldsByName[property.Name]
		if !ok {
			return "", fmt.Errorf("%s is missing field metadata for %q", structType.Name(), property.Name)
		}
		tsMetadata, err := tsFieldMetadata(field)
		if err != nil {
			return "", fmt.Errorf("%s.%s: %w", structType.Name(), field.Name, err)
		}
		if tsMetadata.CreateMapValues && !reflectedMapFieldNeedsGeneratedCreate(field.Type) {
			return "", fmt.Errorf(
				"%s.%s ts_create_map_values requires map values with generated create support",
				structType.Name(),
				field.Name,
			)
		}
		value, hasDefault := defaultValuesByName[property.Name]
		if !hasDefault {
			if !property.Optional {
				panic(fmt.Sprintf("%s is missing property %q", context, property.Name))
			}
		} else {
			defaultsObject[property.Name] = value
			orderedKeys = append(orderedKeys, property.Name)
		}
		expr, ok, err := buildGenericCreateFieldExprTS(
			field.Type,
			tsMetadata,
			property,
			tsPropertyAccessExpr("defaults", property.Name),
			tsPropertyAccessExpr("options", property.Name),
			hasDefault,
		)
		if err != nil {
			return "", err
		}
		if !ok {
			continue
		}
		fieldBuilder.WriteString("    ")
		fieldBuilder.WriteString(renderTSObjectKey(property.Name))
		fieldBuilder.WriteString(": ")
		fieldBuilder.WriteString(expr)
		fieldBuilder.WriteString(",\n")
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
	builder.WriteString(fieldBuilder.String())
	builder.WriteString("  };")
	return builder.String(), nil
}

func buildGenericCreateFieldExprTS(
	fieldType reflect.Type,
	tsMetadata tsFieldMetadataSpec,
	property TypeProperty,
	defaultExpr string,
	optionsExpr string,
	hasDefault bool,
) (string, bool, error) {
	defaultExpr = strings.TrimSpace(defaultExpr)
	optionsExpr = strings.TrimSpace(optionsExpr)
	explicitDefaultExpr := strings.TrimSpace(tsMetadata.CreateExpr)
	if explicitDefaultExpr != "" {
		return buildGenericDefaultFallbackExprTS(fieldType, optionsExpr, explicitDefaultExpr), true, nil
	}
	if expr, ok := buildGenericNamedStructFieldExprTS(fieldType, optionsExpr, defaultExpr, hasDefault); ok {
		return expr, true, nil
	}
	if tsMetadata.CreateMapValues {
		if expr, ok := buildGenericMapFieldExprTS(fieldType, property.TypeExpr, optionsExpr, defaultExpr, hasDefault); ok {
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

func reflectedFieldsByJSONName(structType reflect.Type) (map[string]reflect.StructField, error) {
	fields := map[string]reflect.StructField{}
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
			embeddedFields, err := reflectedFieldsByJSONName(field.Type)
			if err != nil {
				return nil, err
			}
			for name, embeddedField := range embeddedFields {
				if _, exists := fields[name]; !exists {
					fields[name] = embeddedField
				}
			}
			continue
		}
		name, _, skip := jsonFieldName(field)
		if skip {
			continue
		}
		fields[name] = field
	}
	return fields, nil
}

func tsPropertyAccessExpr(baseExpr string, propertyName string) string {
	if tsIdentifierPattern.MatchString(propertyName) {
		return baseExpr + "." + propertyName
	}
	return baseExpr + "[" + fmt.Sprintf("%q", propertyName) + "]"
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
