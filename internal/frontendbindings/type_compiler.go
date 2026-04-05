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
		for candidate, candidateName := range frontendBindingGeneratedTypeNamesByType {
			if candidate.PkgPath() == t.PkgPath() {
				continue
			}
			if strings.TrimSpace(candidateName) != contractName && strings.TrimSpace(candidate.Name()) != contractName {
				continue
			}
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
			tsPropertyAccessExpr("defaults", property.Name),
			tsPropertyAccessExpr("options", property.Name),
			hasDefault,
		)
		if !ok {
			continue
		}
		appendGoBackedCreateFieldAssignment(&fieldBuilder, property.Name, expr)
	}
	ensureNoUnexpectedGoBackedCreateDefaults(context, defaultValuesByName, defaultsObject)
	return renderGoBackedCreateBody(declarationName, defaultsObject, fieldBuilder.String()), nil
}

func appendGoBackedCreateFieldAssignment(
	builder *strings.Builder,
	propertyName string,
	expr string,
) {
	builder.WriteString("    ")
	if propertyName != "__proto__" && tsIdentifierPattern.MatchString(propertyName) {
		builder.WriteString(propertyName)
	} else {
		builder.WriteString(strconv.Quote(propertyName))
	}
	builder.WriteString(": ")
	builder.WriteString(expr)
	builder.WriteString(",\n")
}

func ensureNoUnexpectedGoBackedCreateDefaults(
	context string,
	defaultValuesByName map[string]any,
	defaultsObject map[string]any,
) {
	for key := range defaultValuesByName {
		if _, ok := defaultsObject[key]; ok {
			continue
		}
		panic(fmt.Sprintf("%s has unexpected property %q", context, key))
	}
}

func renderGoBackedCreateBody(
	declarationName string,
	defaultsObject map[string]any,
	fieldAssignments string,
) string {
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
	builder.WriteString(fieldAssignments)
	builder.WriteString("  };")
	return builder.String()
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

func tsPropertyAccessExpr(baseExpr string, propertyName string) string {
	if tsIdentifierPattern.MatchString(propertyName) {
		return baseExpr + "." + propertyName
	}
	return baseExpr + "[" + fmt.Sprintf("%q", propertyName) + "]"
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
	name, optional, skip := jsonFieldName(field)
	if skip {
		return reflectedStructProperty{}, false, nil
	}
	tsMetadata, err := tsFieldMetadata(field)
	if err != nil {
		return reflectedStructProperty{}, false, fmt.Errorf("%s.%s: %w", ownerType.Name(), field.Name, err)
	}
	if tsMetadata.Skip {
		return reflectedStructProperty{}, false, nil
	}
	if tsMetadata.Optional != nil {
		optional = *tsMetadata.Optional
	}
	typeExpr := strings.TrimSpace(tsMetadata.TypeExpr)
	fieldType, nullable := unwrapNullableFieldType(field.Type)
	createTargetTypeName, _ := frontendBindingCreateTargetTypeName(fieldType)
	mapValueCreateTargetTypeName, err := resolvedMapValueCreateTargetTypeName(
		ownerType,
		field,
		fieldType,
		typeExpr,
		tsMetadata,
	)
	if err != nil {
		return reflectedStructProperty{}, false, err
	}
	return reflectedStructProperty{
		Property: TypeProperty{
			Name:     name,
			TypeExpr: typeExpr,
			Optional: optional,
		},
		Nullable:                     nullable,
		CreateExpr:                   strings.TrimSpace(tsMetadata.CreateExpr),
		CreateTargetTypeName:         createTargetTypeName,
		MapValueCreateTargetTypeName: mapValueCreateTargetTypeName,
	}, true, nil
}

func resolvedMapValueCreateTargetTypeName(
	ownerType reflect.Type,
	field reflect.StructField,
	fieldType reflect.Type,
	typeExpr string,
	tsMetadata tsFieldMetadataSpec,
) (string, error) {
	if !tsMetadata.CreateMapValues {
		return "", nil
	}
	if fieldType == nil || fieldType.Kind() != reflect.Map {
		return "", fmt.Errorf("%s.%s: ts_create_map_values requires a map field", ownerType.Name(), field.Name)
	}
	mapValueCreateTargetTypeName, ok := frontendBindingCreateTargetTypeName(fieldType.Elem())
	if !ok {
		return "", fmt.Errorf(
			"%s.%s: ts_create_map_values requires map values with generated create support",
			ownerType.Name(),
			field.Name,
		)
	}
	if typeExpr == "" {
		return "", fmt.Errorf(
			"%s.%s: ts_create_map_values requires explicit ts_type",
			ownerType.Name(),
			field.Name,
		)
	}
	return mapValueCreateTargetTypeName, nil
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

func unwrapNullableFieldType(fieldType reflect.Type) (reflect.Type, bool) {
	nullable := false
	for fieldType != nil && fieldType.Kind() == reflect.Pointer {
		nullable = true
		fieldType = fieldType.Elem()
	}
	return fieldType, nullable
}

func jsonFieldName(field reflect.StructField) (name string, optional bool, skip bool) {
	tag := field.Tag.Get("json")
	if tag == "-" {
		return "", false, true
	}
	if tag == "" {
		panic(fmt.Sprintf("frontend binding field %s is missing a json tag", field.Name))
	}
	parts := strings.Split(tag, ",")
	name = strings.TrimSpace(parts[0])
	if name == "" {
		panic(fmt.Sprintf("frontend binding field %s has an empty json field name", field.Name))
	}
	for _, part := range parts[1:] {
		if strings.TrimSpace(part) == "omitempty" {
			optional = true
		}
	}
	return name, optional, false
}

type tsFieldMetadataSpec struct {
	TypeExpr        string
	Optional        *bool
	CreateExpr      string
	CreateMapValues bool
	Skip            bool
}

func tsFieldMetadata(field reflect.StructField) (tsFieldMetadataSpec, error) {
	spec := tsFieldMetadataSpec{}

	if tag := strings.TrimSpace(field.Tag.Get("ts_type")); tag != "" {
		spec.TypeExpr = tag
	}

	if tag := strings.TrimSpace(field.Tag.Get("ts_optional")); tag != "" {
		optional, err := strconv.ParseBool(tag)
		if err != nil {
			return tsFieldMetadataSpec{}, fmt.Errorf("invalid ts_optional value %q", tag)
		}
		spec.Optional = &optional
	}

	if tag := strings.TrimSpace(field.Tag.Get("ts_create_expr")); tag != "" {
		spec.CreateExpr = tag
	}

	if tag := strings.TrimSpace(field.Tag.Get("ts_create_map_values")); tag != "" {
		createMapValues, err := strconv.ParseBool(tag)
		if err != nil {
			return tsFieldMetadataSpec{}, fmt.Errorf("invalid ts_create_map_values value %q", tag)
		}
		spec.CreateMapValues = createMapValues
	}

	if tag := strings.TrimSpace(field.Tag.Get("ts_skip")); tag != "" {
		skip, err := strconv.ParseBool(tag)
		if err != nil {
			return tsFieldMetadataSpec{}, fmt.Errorf("invalid ts_skip value %q", tag)
		}
		spec.Skip = skip
	}

	return spec, nil
}
