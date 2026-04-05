package frontendbindings

import (
	"fmt"
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
		value, hasDefault := defaultValuesByName[property.Name]
		if !hasDefault {
			if !property.Optional {
				panic(fmt.Sprintf("%s is missing property %q", context, property.Name))
			}
		} else {
			defaultsObject[property.Name] = value
			orderedKeys = append(orderedKeys, property.Name)
		}
		expr, ok := buildGenericCreateFieldExprTS(
			propertySpec,
			tsPropertyAccessExpr("defaults", property.Name),
			tsPropertyAccessExpr("options", property.Name),
			hasDefault,
		)
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
	propertySpec reflectedStructProperty,
	defaultExpr string,
	optionsExpr string,
	hasDefault bool,
) (string, bool) {
	defaultExpr = strings.TrimSpace(defaultExpr)
	optionsExpr = strings.TrimSpace(optionsExpr)
	explicitDefaultExpr := strings.TrimSpace(propertySpec.Metadata.CreateExpr)
	if explicitDefaultExpr != "" {
		if propertySpec.Nullable {
			return fmt.Sprintf("%s === null ? null : (%s ?? %s)", optionsExpr, optionsExpr, explicitDefaultExpr), true
		}
		return fmt.Sprintf("%s ?? %s", optionsExpr, explicitDefaultExpr), true
	}
	if targetTypeName := propertySpec.CreateTargetTypeName; targetTypeName != "" {
		targetFuncName := "create" + targetTypeName
		if propertySpec.Nullable {
			if hasDefault {
				mergedExpr := fmt.Sprintf("%s === null ? null : (%s ?? %s)", optionsExpr, optionsExpr, defaultExpr)
				return fmt.Sprintf(
					"%s === null ? null : %s(%s as Partial<%s>)",
					mergedExpr,
					targetFuncName,
					mergedExpr,
					targetTypeName,
				), true
			}
			return fmt.Sprintf(
				"%s === undefined || %s === null ? null : %s(%s)",
				optionsExpr,
				optionsExpr,
				targetFuncName,
				optionsExpr,
			), true
		}
		if hasDefault {
			return fmt.Sprintf("%s(%s ?? %s)", targetFuncName, optionsExpr, defaultExpr), true
		}
		return fmt.Sprintf("%s(%s ?? {})", targetFuncName, optionsExpr), true
	}
	if propertySpec.Metadata.CreateMapValues {
		targetTypeName := propertySpec.MapValueCreateTargetTypeName
		targetFuncName := "create" + targetTypeName
		defaultSource := "{}"
		if hasDefault {
			defaultSource = defaultExpr + " ?? {}"
		}
		var builder strings.Builder
		if propertySpec.Nullable {
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
		builder.WriteString(targetFuncName)
		builder.WriteString("(value as Partial<")
		builder.WriteString(targetTypeName)
		builder.WriteString(">),\n")
		builder.WriteString("      ]),\n")
		builder.WriteString("    ) as ")
		builder.WriteString(propertySpec.Property.TypeExpr)
		return builder.String(), true
	}
	return "", false
}

func tsPropertyAccessExpr(baseExpr string, propertyName string) string {
	if tsIdentifierPattern.MatchString(propertyName) {
		return baseExpr + "." + propertyName
	}
	return baseExpr + "[" + fmt.Sprintf("%q", propertyName) + "]"
}
