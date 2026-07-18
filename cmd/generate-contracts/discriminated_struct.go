package main

import (
	"bytes"
	"fmt"
	"reflect"
)

// discriminatedStructSpec describes a concrete Go struct whose discriminator
// controls whether one or more pointer fields are required or null. The Go
// struct remains convenient for JSON persistence while generated TypeScript is
// narrowed to the valid wire shapes.
type discriminatedStructSpec struct {
	Discriminator string
	Variants      []discriminatedStructVariant
}

type discriminatedStructVariant struct {
	DiscriminatorValue string
	Fields             []discriminatedStructField
}

type discriminatedStructField struct {
	Name    string
	NonNull bool
}

func contractDiscriminatedStructForType(goType reflect.Type) (discriminatedStructSpec, bool) {
	spec, ok := contractDiscriminatedStructs()[goType]
	return spec, ok
}

func validateDiscriminatedStruct(
	goType reflect.Type,
	spec discriminatedStructSpec,
	valueSets map[string]valueSetSpec,
) error {
	discriminator, ok := contractFieldByJSONName(goType, spec.Discriminator)
	if !ok {
		return fmt.Errorf("%s has no %s discriminator field", goType.Name(), spec.Discriminator)
	}
	if discriminator.Type.Kind() != reflect.String || discriminator.Type.Name() == "" {
		return fmt.Errorf("%s.%s discriminator must be a named string", goType.Name(), discriminator.Name)
	}
	valueSet, ok := valueSets[discriminator.Type.Name()]
	if !ok {
		return fmt.Errorf("%s.%s discriminator has no registered value set", goType.Name(), discriminator.Name)
	}
	if len(spec.Variants) != len(valueSet.Values) {
		return fmt.Errorf(
			"%s discriminated struct has %d variants, want %d %s values",
			goType.Name(),
			len(spec.Variants),
			len(valueSet.Values),
			discriminator.Type.Name(),
		)
	}
	return validateDiscriminatedStructVariants(goType, spec, valueSet.Values)
}

func validateDiscriminatedStructVariants(
	goType reflect.Type,
	spec discriminatedStructSpec,
	values []string,
) error {
	wantValues := make(map[string]bool, len(values))
	for _, value := range values {
		wantValues[value] = true
	}
	var constrainedFields map[string]bool
	seenValues := make(map[string]bool, len(spec.Variants))
	for _, variant := range spec.Variants {
		if !wantValues[variant.DiscriminatorValue] {
			return fmt.Errorf(
				"%s discriminated struct has unsupported %s value %q",
				goType.Name(),
				spec.Discriminator,
				variant.DiscriminatorValue,
			)
		}
		if seenValues[variant.DiscriminatorValue] {
			return fmt.Errorf(
				"%s discriminated struct has duplicate %s value %q",
				goType.Name(),
				spec.Discriminator,
				variant.DiscriminatorValue,
			)
		}
		seenValues[variant.DiscriminatorValue] = true
		fields, err := validateDiscriminatedStructVariantFields(goType, variant)
		if err != nil {
			return err
		}
		if constrainedFields == nil {
			constrainedFields = fields
			continue
		}
		if !reflect.DeepEqual(fields, constrainedFields) {
			return fmt.Errorf(
				"%s discriminated struct variant %q constrains inconsistent fields",
				goType.Name(),
				variant.DiscriminatorValue,
			)
		}
	}
	return nil
}

func validateDiscriminatedStructVariantFields(
	goType reflect.Type,
	variant discriminatedStructVariant,
) (map[string]bool, error) {
	if len(variant.Fields) == 0 {
		return nil, fmt.Errorf(
			"%s discriminated struct variant %q has no constrained fields",
			goType.Name(),
			variant.DiscriminatorValue,
		)
	}
	fields := make(map[string]bool, len(variant.Fields))
	for _, constraint := range variant.Fields {
		if fields[constraint.Name] {
			return nil, fmt.Errorf(
				"%s discriminated struct variant %q repeats field %s",
				goType.Name(),
				variant.DiscriminatorValue,
				constraint.Name,
			)
		}
		field, ok := contractFieldByJSONName(goType, constraint.Name)
		if !ok {
			return nil, fmt.Errorf("%s has no constrained field %s", goType.Name(), constraint.Name)
		}
		if field.Type.Kind() != reflect.Pointer {
			return nil, fmt.Errorf(
				"%s.%s constrained field must be a pointer",
				goType.Name(),
				field.Name,
			)
		}
		fields[constraint.Name] = true
	}
	return fields, nil
}

func renderDiscriminatedStructType(
	buffer *bytes.Buffer,
	contract interfaceSpec,
	spec discriminatedStructSpec,
) error {
	constrained := discriminatedStructFieldNames(spec)
	fmt.Fprintf(buffer, "export type %s = {\n", contract.Name)
	for index := range contract.Type.NumField() {
		field := contract.Type.Field(index)
		name := jsonName(field)
		if skipContractField(field, name) || name == spec.Discriminator || constrained[name] {
			continue
		}
		if err := renderContractTypeField(buffer, contract, field, name, "  "); err != nil {
			return err
		}
	}
	buffer.WriteString("} & (\n")
	for _, variant := range spec.Variants {
		buffer.WriteString("  | {\n")
		fmt.Fprintf(buffer, "      %s: %q;\n", spec.Discriminator, variant.DiscriminatorValue)
		for _, constraint := range variant.Fields {
			field, _ := contractFieldByJSONName(contract.Type, constraint.Name)
			tsType := "null"
			if constraint.NonNull {
				var err error
				tsType, err = typeScriptType(field.Type.Elem())
				if err != nil {
					return fmt.Errorf("%s.%s: %w", contract.Name, field.Name, err)
				}
			}
			fmt.Fprintf(buffer, "      %s: %s;\n", constraint.Name, tsType)
		}
		buffer.WriteString("    }\n")
	}
	buffer.WriteString(");\n\n")
	return nil
}

func renderContractTypeField(
	buffer *bytes.Buffer,
	contract interfaceSpec,
	field reflect.StructField,
	name string,
	indent string,
) error {
	tsType := ""
	if literal, ok := contract.FieldLiterals[name]; ok {
		tsType = fmt.Sprintf("%q", literal)
	} else {
		var err error
		tsType, err = typeScriptType(field.Type)
		if err != nil {
			return fmt.Errorf("%s.%s: %w", contract.Name, field.Name, err)
		}
	}
	fmt.Fprintf(buffer, "%s%s: %s;\n", indent, name, tsType)
	return nil
}

func renderDiscriminatedStructDecoder(
	buffer *bytes.Buffer,
	contract interfaceSpec,
	spec discriminatedStructSpec,
) error {
	buffer.WriteString("  const result = {\n")
	if err := renderStructDecoderFields(buffer, contract); err != nil {
		return err
	}
	buffer.WriteString("  };\n")
	fmt.Fprintf(buffer, "  switch (result.%s) {\n", spec.Discriminator)
	for _, variant := range spec.Variants {
		fmt.Fprintf(buffer, "    case %q: {\n", variant.DiscriminatorValue)
		for _, constraint := range variant.Fields {
			operator := "!=="
			expectation := "must be null"
			if constraint.NonNull {
				operator = "==="
				expectation = "is required"
			}
			fmt.Fprintf(buffer, "      if (result.%s %s null) {\n", constraint.Name, operator)
			fmt.Fprintf(
				buffer,
				"        throw new Error(%q);\n",
				fmt.Sprintf(
					"%s.%s %s when %s is %s",
					contract.Name,
					constraint.Name,
					expectation,
					spec.Discriminator,
					variant.DiscriminatorValue,
				),
			)
			buffer.WriteString("      }\n")
		}
		buffer.WriteString("      return {\n        ...result,\n")
		fmt.Fprintf(buffer, "        %s: %q,\n", spec.Discriminator, variant.DiscriminatorValue)
		for _, constraint := range variant.Fields {
			value := "null"
			if constraint.NonNull {
				value = "result." + constraint.Name
			}
			fmt.Fprintf(buffer, "        %s: %s,\n", constraint.Name, value)
		}
		buffer.WriteString("      };\n    }\n")
	}
	buffer.WriteString("    default:\n")
	fmt.Fprintf(
		buffer,
		"      throw new Error(%q + result.%s);\n",
		contract.Name+"."+spec.Discriminator+" is unsupported: ",
		spec.Discriminator,
	)
	buffer.WriteString("  }\n}\n\n")
	return nil
}

func discriminatedStructFieldNames(spec discriminatedStructSpec) map[string]bool {
	fields := map[string]bool{}
	for _, variant := range spec.Variants {
		for _, field := range variant.Fields {
			fields[field.Name] = true
		}
	}
	return fields
}

func contractFieldByJSONName(goType reflect.Type, name string) (reflect.StructField, bool) {
	for index := range goType.NumField() {
		field := goType.Field(index)
		if !skipContractField(field, jsonName(field)) && jsonName(field) == name {
			return field, true
		}
	}
	return reflect.StructField{}, false
}
