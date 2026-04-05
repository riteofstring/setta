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

var frontendSDKMirrorOwnerTypesByName = newFrontendSDKMirrorOwnerTypesByName()
var timeType = reflect.TypeOf(time.Time{})
var rawJSONType = reflect.TypeOf(json.RawMessage{})

func mustTSLiteralValueFromGoValue(context string, value any) any {
	payload, err := marshalTSLiteralJSON(value, false)
	if err != nil {
		panic(context + ": marshal Go default: " + err.Error())
	}
	var normalized any
	if err := json.Unmarshal(payload, &normalized); err != nil {
		panic(context + ": decode Go default: " + err.Error())
	}
	return normalized
}

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
	FieldIndex                   []int
	Nullable                     bool
	CreateExpr                   string
	CreateTargetTypeName         string
	MapValueCreateTargetTypeName string
}

func newFrontendSDKMirrorOwnerTypesByName() map[string]reflect.Type {
	owners := map[string]reflect.Type{}
	for _, t := range DiscoveredConvertibleTypes() {
		if t.PkgPath() != "setta/internal/realtime" {
			continue
		}
		if strings.TrimSpace(t.Name()) == "" {
			continue
		}
		owners[t.Name()] = t
	}
	return owners
}

func newTypeConverter() *typeConverter {
	return &typeConverter{}
}

func canonicalFrontendBindingType(t reflect.Type) reflect.Type {
	if t == nil {
		return nil
	}
	if t.PkgPath() == "setta/internal/pythonsdkcontracts" {
		if ownerType, ok := frontendSDKMirrorOwnerTypesByName[t.Name()]; ok {
			return ownerType
		}
	}
	return t
}

func CanonicalBindingType(t reflect.Type) reflect.Type {
	return canonicalFrontendBindingType(t)
}

func frontendBindingTypeName(t reflect.Type) string {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return ""
	}
	if name, ok := frontendBindingPublicTypeNames()[t]; ok && strings.TrimSpace(name) != "" {
		return name
	}
	return normalizedFrontendBindingTypeName(t.Name())
}

func (c *typeConverter) goBackedCreateFunctionDeclaration(t reflect.Type, defaultValue any) (TypeDeclaration, error) {
	typeName := frontendBindingTypeName(t)
	propertySpecs, err := c.structPropertySpecs(t)
	if err != nil {
		return TypeDeclaration{}, err
	}
	createBody, err := buildGoBackedCreateBodyTS(
		"frontend create defaults "+typeName,
		typeName,
		defaultValue,
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
	defaultValue any,
	properties []reflectedStructProperty,
) (string, error) {
	if defaultValue == nil {
		return "", fmt.Errorf("%s has no Go default value", declarationName)
	}
	normalizedDefaults := mustTSLiteralValueFromGoValue(context, defaultValue)
	defaultValuesByName, ok := normalizedDefaults.(map[string]any)
	if !ok {
		panic(context + ": Go default did not decode to an object")
	}
	reflectedDefaults := reflect.ValueOf(defaultValue)
	defaultsObject := make(map[string]any, len(properties))
	var fieldBuilder strings.Builder
	for _, propertySpec := range properties {
		property := propertySpec.Property
		value, hasDefault := resolvedGoBackedCreatePropertyDefault(
			context,
			reflectedDefaults,
			defaultValuesByName,
			propertySpec,
		)
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

func resolvedGoBackedCreatePropertyDefault(
	context string,
	reflectedDefaults reflect.Value,
	defaultValuesByName map[string]any,
	propertySpec reflectedStructProperty,
) (any, bool) {
	property := propertySpec.Property
	value, hasDefault := defaultValuesByName[property.Name]
	fieldValue, hasFieldValue := reflectedStructFieldValue(reflectedDefaults, propertySpec.FieldIndex)
	if !hasFieldValue {
		return value, hasDefault
	}
	fieldContext := context + "." + property.Name
	if !hasDefault {
		value = mustTSLiteralValueFromGoValue(fieldContext, fieldValue.Interface())
		hasDefault = true
	}
	return mergeTSLiteralValueFromFieldValue(fieldContext, fieldValue, value), true
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

func reflectedStructFieldValue(value reflect.Value, fieldIndex []int) (reflect.Value, bool) {
	for _, index := range fieldIndex {
		for value.IsValid() && value.Kind() == reflect.Pointer {
			if value.IsNil() {
				return reflect.Value{}, false
			}
			value = value.Elem()
		}
		if !value.IsValid() || value.Kind() != reflect.Struct || index >= value.NumField() {
			return reflect.Value{}, false
		}
		value = value.Field(index)
	}
	if !value.IsValid() {
		return reflect.Value{}, false
	}
	return value, true
}

func mergeTSLiteralValueFromFieldValue(context string, value reflect.Value, normalized any) any {
	if !value.IsValid() {
		return normalized
	}
	for value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return nil
		}
		value = value.Elem()
	}
	if value.Kind() != reflect.Struct {
		return normalized
	}
	object, ok := normalized.(map[string]any)
	if !ok {
		return normalized
	}
	valueType := value.Type()
	for fieldIndex := 0; fieldIndex < valueType.NumField(); fieldIndex++ {
		field := valueType.Field(fieldIndex)
		if !field.IsExported() {
			continue
		}
		fieldValue := value.Field(fieldIndex)
		if field.Anonymous {
			merged := mergeTSLiteralValueFromFieldValue(context, fieldValue, object)
			mergedObject, ok := merged.(map[string]any)
			if ok {
				object = mergedObject
			}
			continue
		}
		name, _, skip := jsonFieldName(field)
		if skip {
			continue
		}
		fieldContext := context + "." + name
		normalizedField, ok := object[name]
		if !ok {
			object[name] = mustTSLiteralValueFromGoValue(fieldContext, fieldValue.Interface())
			continue
		}
		object[name] = mergeTSLiteralValueFromFieldValue(fieldContext, fieldValue, normalizedField)
	}
	return object
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
	return c.structPropertySpecsWithFieldIndex(t, nil)
}

func (c *typeConverter) structPropertySpecsWithFieldIndex(
	t reflect.Type,
	fieldIndexPrefix []int,
) ([]reflectedStructProperty, error) {
	properties := make([]reflectedStructProperty, 0, t.NumField())
	for i := range t.NumField() {
		field := t.Field(i)
		fieldIndex := append(append([]int(nil), fieldIndexPrefix...), field.Index...)
		fieldProperties, err := c.structPropertySpecsForField(
			t,
			field,
			fieldIndex,
		)
		if err != nil {
			return nil, err
		}
		properties = append(properties, fieldProperties...)
	}
	return properties, nil
}

func (c *typeConverter) structPropertySpecsForField(
	ownerType reflect.Type,
	field reflect.StructField,
	fieldIndex []int,
) ([]reflectedStructProperty, error) {
	if !field.IsExported() {
		return nil, nil
	}
	if field.Anonymous {
		return c.embeddedStructPropertySpecs(
			ownerType,
			field,
			fieldIndex,
		)
	}
	property, ok, err := c.namedStructPropertySpec(
		ownerType,
		field,
		fieldIndex,
	)
	if err != nil || !ok {
		return nil, err
	}
	return []reflectedStructProperty{property}, nil
}

func (c *typeConverter) embeddedStructPropertySpecs(
	ownerType reflect.Type,
	field reflect.StructField,
	fieldIndex []int,
) ([]reflectedStructProperty, error) {
	embeddedType := field.Type
	for embeddedType.Kind() == reflect.Pointer {
		embeddedType = embeddedType.Elem()
	}
	if embeddedType.Kind() != reflect.Struct {
		return nil, fmt.Errorf(
			"%s.%s: anonymous field must be a struct, got %s",
			ownerType.Name(),
			field.Name,
			field.Type.String(),
		)
	}
	return c.structPropertySpecsWithFieldIndex(
		embeddedType,
		fieldIndex,
	)
}

func (c *typeConverter) namedStructPropertySpec(
	ownerType reflect.Type,
	field reflect.StructField,
	fieldIndex []int,
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
		FieldIndex:                   fieldIndex,
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
