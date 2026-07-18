package main

import (
	"bytes"
	"fmt"
	"reflect"
)

func (collector *contractCollector) registerUnionVariantDiscriminator(spec unionSpec, variant unionVariantSpec) error {
	if variant.Type.Kind() != reflect.Struct {
		return fmt.Errorf("%s.%s variant must be a struct, got %s", spec.Name, variant.Name, variant.Type)
	}
	field, ok := contractDiscriminatorField(variant.Type, spec.Discriminator)
	if !ok {
		return fmt.Errorf("%s.%s variant has no %s discriminator field", spec.Name, variant.Name, spec.Discriminator)
	}
	if field.Type.Kind() != reflect.String {
		return fmt.Errorf("%s.%s discriminator %s must be a string", spec.Name, variant.Name, spec.Discriminator)
	}
	fields := collector.fieldLiterals[variant.Type]
	if fields == nil {
		fields = map[string]string{}
		collector.fieldLiterals[variant.Type] = fields
	}
	if existing, exists := fields[spec.Discriminator]; exists && existing != variant.KindValue {
		return fmt.Errorf(
			"%s.%s discriminator %s is registered as both %q and %q",
			spec.Name,
			variant.Name,
			spec.Discriminator,
			existing,
			variant.KindValue,
		)
	}
	fields[spec.Discriminator] = variant.KindValue
	return nil
}

func contractDiscriminatorField(goType reflect.Type, discriminator string) (reflect.StructField, bool) {
	for index := range goType.NumField() {
		field := goType.Field(index)
		if field.PkgPath == "" && jsonName(field) == discriminator {
			return field, true
		}
	}
	return reflect.StructField{}, false
}

func skipContractField(field reflect.StructField, jsonName string) bool {
	return field.PkgPath != "" || jsonName == "-"
}

func (collector *contractCollector) attachFieldLiterals() {
	for index := range collector.specs {
		collector.specs[index].FieldLiterals = collector.fieldLiterals[collector.specs[index].Type]
	}
}

func renderContractLiteralDecoder(buffer *bytes.Buffer, specs []interfaceSpec) {
	if !hasContractLiteralFields(specs) {
		return
	}
	buffer.WriteString("function decodeContractLiteral<T extends string>(value: string, expected: T, label: string): T {\n")
	buffer.WriteString("  if (value !== expected) {\n")
	buffer.WriteString("    throw new Error(label + \" must be \" + expected + \", got \" + value);\n")
	buffer.WriteString("  }\n")
	buffer.WriteString("  return expected;\n")
	buffer.WriteString("}\n\n")
}

func hasContractLiteralFields(specs []interfaceSpec) bool {
	for _, spec := range specs {
		if len(spec.FieldLiterals) > 0 {
			return true
		}
	}
	return false
}
