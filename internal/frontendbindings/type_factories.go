package frontendbindings

import (
	"fmt"
	"reflect"
	"strings"
)

func buildGoBackedCreateBodyTS(
	context string,
	declarationName string,
	defaultValue any,
	properties []reflectedStructProperty,
) (string, error) {
	if defaultValue == nil {
		return "", fmt.Errorf("%s has no Go default value", declarationName)
	}
	defaultValuesByName, _ := mustOrderedTSLiteralObjectFromGoValue(context, defaultValue)
	defaultsObject := make(map[string]any, len(properties))
	orderedKeys := make([]string, 0, len(properties))
	var fieldBuilder strings.Builder
	for _, propertySpec := range properties {
		property := propertySpec.Property
		field := propertySpec.Field
		tsMetadata, err := tsFieldMetadata(field)
		if err != nil {
			return "", fmt.Errorf("%s.%s: %w", declarationName, field.Name, err)
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
			declarationName+"."+field.Name,
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
	fieldContext string,
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
		_, nullable := unwrapNullableFieldType(fieldType)
		if nullable {
			return fmt.Sprintf("%s === null ? null : (%s ?? %s)", optionsExpr, optionsExpr, explicitDefaultExpr), true, nil
		}
		return fmt.Sprintf("%s ?? %s", optionsExpr, explicitDefaultExpr), true, nil
	}
	if target, ok := frontendObjectCreateTarget(fieldType); ok {
		if target.Nullable {
			if hasDefault {
				mergedExpr := fmt.Sprintf("%s === null ? null : (%s ?? %s)", optionsExpr, optionsExpr, defaultExpr)
				return fmt.Sprintf(
					"%s === null ? null : %s(%s as Partial<%s>)",
					mergedExpr,
					target.FuncName,
					mergedExpr,
					target.TypeName,
				), true, nil
			}
			return fmt.Sprintf(
				"%s === undefined || %s === null ? null : %s(%s)",
				optionsExpr,
				optionsExpr,
				target.FuncName,
				optionsExpr,
			), true, nil
		}
		if hasDefault {
			return fmt.Sprintf("%s(%s ?? %s)", target.FuncName, optionsExpr, defaultExpr), true, nil
		}
		return fmt.Sprintf("%s(%s ?? {})", target.FuncName, optionsExpr), true, nil
	}
	if tsMetadata.CreateMapValues {
		fieldType, nullable := unwrapNullableFieldType(fieldType)
		if fieldType == nil || fieldType.Kind() != reflect.Map {
			return "", false, fmt.Errorf("%s ts_create_map_values requires a map field", fieldContext)
		}
		target, ok := frontendObjectCreateTarget(fieldType.Elem())
		if !ok {
			return "", false, fmt.Errorf("%s ts_create_map_values requires map values with generated create support", fieldContext)
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
		builder.WriteString(target.FuncName)
		builder.WriteString("(value as Partial<")
		builder.WriteString(target.TypeName)
		builder.WriteString(">),\n")
		builder.WriteString("      ]),\n")
		builder.WriteString("    ) as ")
		builder.WriteString(property.TypeExpr)
		return builder.String(), true, nil
	}
	return "", false, nil
}

type frontendObjectCreateTargetSpec struct {
	FuncName string
	TypeName string
	Nullable bool
}

func frontendObjectCreateTarget(fieldType reflect.Type) (frontendObjectCreateTargetSpec, bool) {
	fieldType, nullable := unwrapNullableFieldType(fieldType)
	fieldType = canonicalFrontendBindingType(fieldType)
	if fieldType == timeType {
		return frontendObjectCreateTargetSpec{}, false
	}
	if fieldType == nil || fieldType.Name() == "" || fieldType.PkgPath() == "" {
		return frontendObjectCreateTargetSpec{}, false
	}
	if fieldType.Kind() != reflect.Struct {
		return frontendObjectCreateTargetSpec{}, false
	}
	typeName := frontendBindingTypeName(fieldType)
	return frontendObjectCreateTargetSpec{
		FuncName: "create" + typeName,
		TypeName: typeName,
		Nullable: nullable,
	}, true
}

func unwrapNullableFieldType(fieldType reflect.Type) (reflect.Type, bool) {
	nullable := false
	for fieldType != nil && fieldType.Kind() == reflect.Pointer {
		nullable = true
		fieldType = fieldType.Elem()
	}
	return fieldType, nullable
}

func tsPropertyAccessExpr(baseExpr string, propertyName string) string {
	if tsIdentifierPattern.MatchString(propertyName) {
		return baseExpr + "." + propertyName
	}
	return baseExpr + "[" + fmt.Sprintf("%q", propertyName) + "]"
}
