package main

import (
	"bytes"
	"fmt"
	"sort"
	"strings"
)

func (generator *generator) renderObjectSchema(buffer *bytes.Buffer, typeName string, schema jsonSchema) error {
	required := requiredFields(schema.Required)
	fmt.Fprintf(buffer, "type %s struct {\n", typeName)
	for _, propertyName := range sortedPropertyNames(schema.Properties) {
		property := schema.Properties[propertyName]
		goType, err := generator.goTypeForProperty(typeName, propertyName, property, required[propertyName])
		if err != nil {
			return fmt.Errorf("%s.%s: %w", typeName, propertyName, err)
		}
		fmt.Fprintf(buffer, "\t%s %s `json:%q`\n", exportedFieldName(propertyName), goType, jsonFieldTag(propertyName, required[propertyName]))
	}
	buffer.WriteString("}\n\n")
	generator.renderObjectValidator(buffer, typeName, schema)
	renderObjectDecoder(buffer, typeName)
	return nil
}

func (generator *generator) goTypeForProperty(typeName string, propertyName string, schema jsonSchema, required bool) (string, error) {
	if override, ok := goTypeOverride(typeName, propertyName, schema, required); ok {
		return override, nil
	}
	return generator.goType(schema, required)
}

func goTypeOverride(typeName string, propertyName string, schema jsonSchema, required bool) (string, bool) {
	if nullableServiceTierOverrideTypes[typeName] &&
		propertyName == "serviceTier" &&
		optionalNullableString(schema, required) {
		return "*CodexNullableString", true
	}
	if propertyName == "type" && strings.HasSuffix(typeName, "ThreadItem") && typeName != "ThreadItem" && len(schema.Enum) == 1 && schemaTypeAllows(schema.Type, "string") {
		return "ThreadItemType", true
	}
	return "", false
}

var nullableServiceTierOverrideTypes = map[string]bool{
	"ThreadForkParams":           true,
	"ThreadResumeParams":         true,
	"ThreadSettingsUpdateParams": true,
	"ThreadStartParams":          true,
}

func optionalNullableString(schema jsonSchema, required bool) bool {
	if required {
		return false
	}
	nullable, inner := nullableInner(schema)
	return nullable && typeString(inner.Type) == "string"
}

func (generator *generator) renderObjectValidator(buffer *bytes.Buffer, typeName string, schema jsonSchema) {
	fmt.Fprintf(buffer, "func validate%s(raw json.RawMessage, name string) error {\n", typeName)
	buffer.WriteString("\tfields, err := codexObjectFields(raw, name)\n")
	buffer.WriteString("\tif err != nil {\n")
	buffer.WriteString("\t\treturn err\n")
	buffer.WriteString("\t}\n")
	fmt.Fprintf(buffer, "\tif err := requireCodexFields(fields, name, %s); err != nil {\n", generator.requiredFieldLiteral(schema.Required, schema.Properties))
	buffer.WriteString("\t\treturn err\n")
	buffer.WriteString("\t}\n")
	if disallowAdditionalProperties(schema) {
		fmt.Fprintf(buffer, "\tif err := rejectUnknownCodexFields(fields, name, %s); err != nil {\n", allowedFieldLiteral(schema.Properties))
		buffer.WriteString("\t\treturn err\n")
		buffer.WriteString("\t}\n")
	}
	for _, propertyName := range sortedPropertyNames(schema.Properties) {
		validation, ok := generator.schemaValidation(schema.Properties[propertyName])
		if !ok {
			continue
		}
		generator.renderPropertyValidation(buffer, propertyName, validation)
	}
	buffer.WriteString("\treturn nil\n")
	buffer.WriteString("}\n\n")
}

func (generator *generator) renderPropertyValidation(buffer *bytes.Buffer, propertyName string, validation schemaValidation) {
	fieldName := fmt.Sprintf("%q", propertyName)
	path := fmt.Sprintf("name+%q", "."+propertyName)
	switch validation.kind {
	case schemaValidationObject:
		fmt.Fprintf(buffer, "\tif err := validateCodexObjectField(fields, %s, %s, %t, %s); err != nil {\n", fieldName, path, validation.allowNull, validation.validator)
		buffer.WriteString("\t\treturn err\n")
		buffer.WriteString("\t}\n")
	case schemaValidationObjectArray:
		fmt.Fprintf(buffer, "\tif err := validateCodexObjectArrayField(fields, %s, %s, %t, %t, %s); err != nil {\n", fieldName, path, validation.allowNull, validation.itemAllowNull, validation.validator)
		buffer.WriteString("\t\treturn err\n")
		buffer.WriteString("\t}\n")
	}
}

func renderObjectDecoder(buffer *bytes.Buffer, typeName string) {
	fmt.Fprintf(buffer, "func Decode%s(raw json.RawMessage) (%s, error) {\n", typeName, typeName)
	fmt.Fprintf(buffer, "\tvar value %s\n", typeName)
	fmt.Fprintf(buffer, "\terr := decodeCodexObject(raw, %q, validate%s, &value)\n", typeName, typeName)
	buffer.WriteString("\treturn value, err\n")
	buffer.WriteString("}\n\n")
}

type requiredFieldSpec struct {
	name      string
	allowNull bool
}

func (generator *generator) requiredFieldLiteral(values []string, properties map[string]jsonSchema) string {
	if len(values) == 0 {
		return "nil"
	}
	fields := make([]requiredFieldSpec, 0, len(values))
	for _, value := range values {
		fields = append(fields, requiredFieldSpec{
			name:      value,
			allowNull: schemaAllowsNull(properties[value]),
		})
	}
	sort.SliceStable(fields, func(left int, right int) bool {
		return fields[left].name < fields[right].name
	})
	entries := make([]string, 0, len(fields))
	for _, field := range fields {
		if field.allowNull {
			entries = append(entries, fmt.Sprintf("{name: %q, allowNull: true}", field.name))
		} else {
			entries = append(entries, fmt.Sprintf("{name: %q}", field.name))
		}
	}
	return "[]codexRequiredField{" + strings.Join(entries, ", ") + "}"
}

func disallowAdditionalProperties(schema jsonSchema) bool {
	value, ok := schema.AdditionalProperties.(bool)
	return ok && !value
}

func allowedFieldLiteral(properties map[string]jsonSchema) string {
	if len(properties) == 0 {
		return "nil"
	}
	names := sortedPropertyNames(properties)
	quoted := make([]string, 0, len(names))
	for _, name := range names {
		quoted = append(quoted, fmt.Sprintf("%q", name))
	}
	return "[]string{" + strings.Join(quoted, ", ") + "}"
}

func requiredFields(fields []string) map[string]bool {
	required := map[string]bool{}
	for _, field := range fields {
		required[field] = true
	}
	return required
}

type schemaValidationKind string

const (
	schemaValidationObject      schemaValidationKind = "object"
	schemaValidationObjectArray schemaValidationKind = "objectArray"
)

type schemaValidation struct {
	kind          schemaValidationKind
	validator     string
	allowNull     bool
	itemAllowNull bool
}

func (generator *generator) schemaValidation(schema jsonSchema) (schemaValidation, bool) {
	allowNull, inner := nullableInner(schema)
	if allowNull {
		schema = inner
	}
	if len(schema.AllOf) == 1 {
		schema = schema.AllOf[0]
	}
	if schema.Ref != "" {
		return generator.objectSchemaValidation(schema.Ref, allowNull)
	}
	if typeString(schema.Type) != "array" || schema.Items == nil {
		return schemaValidation{}, false
	}
	return generator.arraySchemaValidation(*schema.Items, allowNull)
}

func (generator *generator) objectSchemaValidation(ref string, allowNull bool) (schemaValidation, bool) {
	validator, ok := generator.objectValidatorFromRef(ref)
	if !ok {
		return schemaValidation{}, false
	}
	return schemaValidation{kind: schemaValidationObject, validator: validator, allowNull: allowNull}, true
}

func (generator *generator) arraySchemaValidation(item jsonSchema, allowNull bool) (schemaValidation, bool) {
	itemAllowNull, nullableItem := nullableInner(item)
	if itemAllowNull {
		return generator.nullableItemArraySchemaValidation(nullableItem, allowNull)
	}
	if item.Ref == "" {
		return schemaValidation{}, false
	}
	validator, ok := generator.objectValidatorFromRef(item.Ref)
	if !ok {
		return schemaValidation{}, false
	}
	return schemaValidation{
		kind:      schemaValidationObjectArray,
		validator: validator,
		allowNull: allowNull,
	}, true
}

func (generator *generator) nullableItemArraySchemaValidation(item jsonSchema, allowNull bool) (schemaValidation, bool) {
	validator, ok := generator.schemaValidation(item)
	if !ok || validator.kind != schemaValidationObject {
		return schemaValidation{}, false
	}
	return schemaValidation{
		kind:          schemaValidationObjectArray,
		validator:     validator.validator,
		allowNull:     allowNull,
		itemAllowNull: true,
	}, true
}

func (generator *generator) objectValidatorFromRef(ref string) (string, bool) {
	name, err := refName(ref)
	if err != nil {
		return "", false
	}
	schema, ok := generator.schemas[name]
	if !ok || !isObjectSchema(schema) {
		return "", false
	}
	return "validate" + exportedName(name), true
}

func schemaAllowsNull(schema jsonSchema) bool {
	allowNull, _ := nullableInner(schema)
	return allowNull
}
