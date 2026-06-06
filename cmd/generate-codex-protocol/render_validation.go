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
		goType, err := generator.goType(property, required[propertyName])
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

func (generator *generator) renderObjectValidator(buffer *bytes.Buffer, typeName string, schema jsonSchema) {
	fmt.Fprintf(buffer, "func validate%s(raw json.RawMessage, name string) error {\n", typeName)
	buffer.WriteString("\tfields, err := codexObjectFields(raw, name)\n")
	buffer.WriteString("\tif err != nil {\n")
	buffer.WriteString("\t\treturn err\n")
	buffer.WriteString("\t}\n")
	fmt.Fprintf(buffer, "\tif err := requireCodexFields(fields, name, %s); err != nil {\n", generator.requiredFieldLiteral(schema.Required, schema.Properties))
	buffer.WriteString("\t\treturn err\n")
	buffer.WriteString("\t}\n")
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
	if schema.Ref != "" {
		validator, ok := generator.objectValidatorFromRef(schema.Ref)
		if !ok {
			return schemaValidation{}, false
		}
		return schemaValidation{kind: schemaValidationObject, validator: validator, allowNull: allowNull}, true
	}
	if typeString(schema.Type) != "array" || schema.Items == nil {
		return schemaValidation{}, false
	}
	item := *schema.Items
	itemAllowNull, nullableItem := nullableInner(item)
	if itemAllowNull {
		validator, ok := generator.schemaValidation(nullableItem)
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
