package main

import (
	"bytes"
	"fmt"
	"reflect"
)

type unionVariantDiscriminator struct {
	Field string
	Value string
}

func unionVariantDiscriminators(unions []unionSpec) map[reflect.Type]unionVariantDiscriminator {
	result := map[reflect.Type]unionVariantDiscriminator{}
	for _, union := range unions {
		for _, variant := range union.Variants {
			result[variant.Type] = unionVariantDiscriminator{Field: union.Discriminator, Value: variant.KindValue}
		}
	}
	return result
}

func renderUnions(buffer *bytes.Buffer, specs []unionSpec) {
	for _, spec := range specs {
		fmt.Fprintf(buffer, "export type %s =\n", spec.Name)
		for index, variant := range spec.Variants {
			prefix := "  | "
			if index == 0 {
				prefix = "  "
			}
			fmt.Fprintf(buffer, "%s%s\n", prefix, variant.Name)
		}
		buffer.WriteString(";\n\n")
	}
}

func renderUnionDecoders(buffer *bytes.Buffer, specs []unionSpec) {
	for _, spec := range specs {
		fmt.Fprintf(buffer, "export function %s(value: unknown): %s {\n", decoderFunctionName(spec.Type), spec.Name)
		fmt.Fprintf(buffer, "  const record = assertRecord(value, %q);\n", spec.Name)
		fmt.Fprintf(buffer, "  const discriminator = decodeString(requireField(record, %q, %q), %q);\n", spec.Discriminator, spec.Name, spec.Name+"."+spec.Discriminator)
		buffer.WriteString("  switch (discriminator) {\n")
		for _, variant := range spec.Variants {
			fmt.Fprintf(buffer, "    case %q:\n", variant.KindValue)
			fmt.Fprintf(buffer, "      return %s(value);\n", decoderFunctionName(variant.Type))
		}
		buffer.WriteString("    default:\n")
		fmt.Fprintf(buffer, "      throw new Error(%q + \" is unsupported: \" + discriminator);\n", spec.Name+"."+spec.Discriminator)
		buffer.WriteString("  }\n")
		buffer.WriteString("}\n\n")
	}
}

func renderDecoders(buffer *bytes.Buffer, specs []interfaceSpec, unions []unionSpec) error {
	discriminators := unionVariantDiscriminators(unions)
	for _, spec := range specs {
		if err := renderStructDecoder(buffer, spec, discriminators); err != nil {
			return err
		}
	}
	return nil
}
