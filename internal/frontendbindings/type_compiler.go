package frontendbindings

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
	"strings"
	"time"
)

var timeType = reflect.TypeOf(time.Time{})

func renderTSLiteralValue(value any, indent string) string {
	payload, err := marshalTSLiteralJSON(value, indent != "")
	if err != nil {
		panic("marshal TypeScript literal value: " + err.Error())
	}
	text := string(payload)
	if indent == "" {
		return text
	}
	return strings.ReplaceAll(text, "\n", "\n"+indent)
}

func marshalTSLiteralJSON(value any, multiline bool) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if multiline {
		encoder.SetIndent("", "  ")
	}
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(buffer.Bytes(), []byte("\n")), nil
}

type typeConverter struct{}

type reflectedStructProperty struct {
	Property                     TypeProperty
	Nullable                     bool
	CreateExpr                   string
	CreateTargetTypeName         string
	MapValueCreateTargetTypeName string
}

func newTypeConverter() *typeConverter { return &typeConverter{} }

func canonicalFrontendBindingType(t reflect.Type) reflect.Type {
	if t == nil {
		return nil
	}
	if t.PkgPath() == "setta/internal/pythonsdkcontracts" {
		contractName := strings.TrimSpace(frontendBindingGeneratedTypeNamesByType[t])
		if contractName == "" {
			contractName = strings.TrimSpace(t.Name())
		}
		if candidate, ok := frontendBindingTypesByName()[contractName]; ok && candidate.PkgPath() != t.PkgPath() {
			return candidate
		}
	}
	return t
}

func CanonicalBindingType(t reflect.Type) reflect.Type { return canonicalFrontendBindingType(t) }

func frontendBindingTypeName(t reflect.Type) string {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return ""
	}
	if name := strings.TrimSpace(frontendBindingGeneratedTypeNamesByType[t]); name != "" {
		return name
	}
	return strings.TrimSpace(t.Name())
}

func BindingTypeName(t reflect.Type) string { return frontendBindingTypeName(t) }

func (c *typeConverter) goBackedCreateFunctionDeclaration(t reflect.Type, defaultLiteral any) (TypeDeclaration, error) {
	typeName := frontendBindingTypeName(t)
	propertySpecs, err := c.structPropertySpecs(t)
	if err != nil {
		return TypeDeclaration{}, err
	}
	createBody, err := buildGoBackedCreateBodyTS(
		"frontend create defaults "+typeName,
		typeName,
		defaultLiteral,
		propertySpecs,
	)
	if err != nil {
		return TypeDeclaration{}, err
	}
	return exportedFunctionDeclaration(
		"create"+typeName,
		typeName,
		createBody,
		TypeProperty{
			Name:         "options",
			TypeExpr:     "Partial<" + typeName + ">",
			DefaultValue: "{}",
		},
	), nil
}

func buildGoBackedCreateBodyTS(
	context string,
	declarationName string,
	defaultLiteral any,
	properties []reflectedStructProperty,
) (string, error) {
	if defaultLiteral == nil {
		return "", fmt.Errorf("%s has no Go default value", declarationName)
	}
	defaultValuesByName, ok := defaultLiteral.(map[string]any)
	if !ok {
		return "", fmt.Errorf("%s default literal did not decode to an object", context)
	}
	propertyAccessExpr := func(baseExpr string, propertyName string) string {
		if tsIdentifierPattern.MatchString(propertyName) {
			return baseExpr + "." + propertyName
		}
		return baseExpr + "[" + fmt.Sprintf("%q", propertyName) + "]"
	}
	defaultsObject := make(map[string]any, len(properties))
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
		}
		expr, ok := buildGenericCreateFieldExprTS(
			propertySpec,
			propertyAccessExpr("defaults", property.Name),
			propertyAccessExpr("options", property.Name),
			hasDefault,
		)
		if !ok {
			continue
		}
		fieldBuilder.WriteString("    ")
		if property.Name != "__proto__" && tsIdentifierPattern.MatchString(property.Name) {
			fieldBuilder.WriteString(property.Name)
		} else {
			fieldBuilder.WriteString(strconv.Quote(property.Name))
		}
		fieldBuilder.WriteString(": ")
		fieldBuilder.WriteString(expr)
		fieldBuilder.WriteString(",\n")
	}
	for key := range defaultValuesByName {
		if _, ok := defaultsObject[key]; ok {
			continue
		}
		panic(fmt.Sprintf("%s has unexpected property %q", context, key))
	}
	var builder strings.Builder
	builder.WriteString("  const defaults: ")
	builder.WriteString(declarationName)
	builder.WriteString(" = ")
	builder.WriteString(renderTSLiteralValue(defaultsObject, "  "))
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
	if propertySpec.CreateExpr != "" {
		if propertySpec.Nullable {
			return fmt.Sprintf("%s === null ? null : (%s ?? %s)", optionsExpr, optionsExpr, propertySpec.CreateExpr), true
		}
		return fmt.Sprintf("%s ?? %s", optionsExpr, propertySpec.CreateExpr), true
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
	if targetTypeName := propertySpec.MapValueCreateTargetTypeName; targetTypeName != "" {
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

func (c *typeConverter) structPropertySpecs(
	t reflect.Type,
) ([]reflectedStructProperty, error) {
	properties := make([]reflectedStructProperty, 0, t.NumField())
	for _, field := range reflect.VisibleFields(t) {
		if !field.IsExported() || field.Anonymous {
			continue
		}
		property, ok, err := c.namedStructPropertySpec(t, field)
		if err != nil {
			return nil, err
		}
		if ok {
			properties = append(properties, property)
		}
	}
	return properties, nil
}

func (c *typeConverter) namedStructPropertySpec(
	ownerType reflect.Type,
	field reflect.StructField,
) (reflectedStructProperty, bool, error) {
	fieldLabel := ownerType.Name() + "." + field.Name
	parseBoolTag := func(tagName string) (bool, bool, error) {
		value := strings.TrimSpace(field.Tag.Get(tagName))
		if value == "" {
			return false, false, nil
		}
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return false, false, fmt.Errorf("%s: invalid %s value %q", fieldLabel, tagName, value)
		}
		return parsed, true, nil
	}

	jsonTag := strings.TrimSpace(field.Tag.Get("json"))
	if jsonTag == "-" {
		return reflectedStructProperty{}, false, nil
	}
	if jsonTag == "" {
		panic(fmt.Sprintf("frontend binding field %s is missing a json tag", field.Name))
	}
	name, jsonOptions, _ := strings.Cut(jsonTag, ",")
	name = strings.TrimSpace(name)
	if name == "" {
		panic(fmt.Sprintf("frontend binding field %s has an empty json field name", field.Name))
	}
	optional := false
	for _, option := range strings.Split(jsonOptions, ",") {
		if strings.TrimSpace(option) == "omitempty" {
			optional = true
		}
	}

	typeExpr := strings.TrimSpace(field.Tag.Get("ts_type"))
	if override, ok, err := parseBoolTag("ts_optional"); err != nil {
		return reflectedStructProperty{}, false, err
	} else if ok {
		optional = override
	}
	createExpr := strings.TrimSpace(field.Tag.Get("ts_create_expr"))
	createMapValues, _, err := parseBoolTag("ts_create_map_values")
	if err != nil {
		return reflectedStructProperty{}, false, err
	}
	if skip, ok, err := parseBoolTag("ts_skip"); err != nil {
		return reflectedStructProperty{}, false, err
	} else if ok && skip {
		return reflectedStructProperty{}, false, nil
	}

	nullable := false
	fieldType := field.Type
	for fieldType != nil && fieldType.Kind() == reflect.Pointer {
		nullable = true
		fieldType = fieldType.Elem()
	}
	createTargetTypeName, _ := frontendBindingCreateTargetTypeName(fieldType)

	mapValueCreateTargetTypeName := ""
	if createMapValues {
		if fieldType == nil || fieldType.Kind() != reflect.Map {
			return reflectedStructProperty{}, false, fmt.Errorf(
				"%s.%s: ts_create_map_values requires a map field",
				ownerType.Name(),
				field.Name,
			)
		}
		var ok bool
		mapValueCreateTargetTypeName, ok = frontendBindingCreateTargetTypeName(fieldType.Elem())
		if !ok {
			return reflectedStructProperty{}, false, fmt.Errorf(
				"%s.%s: ts_create_map_values requires map values with generated create support",
				ownerType.Name(),
				field.Name,
			)
		}
		if typeExpr == "" {
			return reflectedStructProperty{}, false, fmt.Errorf(
				"%s.%s: ts_create_map_values requires explicit ts_type",
				ownerType.Name(),
				field.Name,
			)
		}
	}
	return reflectedStructProperty{
		Property: TypeProperty{
			Name:     name,
			TypeExpr: typeExpr,
			Optional: optional,
		},
		Nullable:                     nullable,
		CreateExpr:                   createExpr,
		CreateTargetTypeName:         createTargetTypeName,
		MapValueCreateTargetTypeName: mapValueCreateTargetTypeName,
	}, true, nil
}

func frontendBindingCreateTargetTypeName(fieldType reflect.Type) (string, bool) {
	fieldType = canonicalFrontendBindingType(fieldType)
	if fieldType == timeType {
		return "", false
	}
	if fieldType == nil || fieldType.Name() == "" || fieldType.PkgPath() == "" {
		return "", false
	}
	if fieldType.Kind() != reflect.Struct {
		return "", false
	}
	return frontendBindingTypeName(fieldType), true
}
