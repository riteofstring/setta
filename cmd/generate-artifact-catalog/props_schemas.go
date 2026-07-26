package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"setta/internal/conversation/artifactdoc"
)

// inlineEnumValues is the longest enum the generator keeps on one line.
const inlineEnumValues = 6

// writePropsSchemas renders the Zod half of the catalog: one props schema per
// component.
//
// These are the schemas @openuidev/react-lang's defineComponent takes, so they
// decide two things the renderer cutover depends on. library.toJSONSchema()
// compiles them into the parser's positional-argument map, which has to agree
// with the JSON Schema rendered beside them, and z.infer types the props each
// component's renderer receives.
func writePropsSchemas(outputDir string, catalog artifactdoc.Catalog) error {
	source := renderPropsSchemas(catalog)
	if err := os.WriteFile(filepath.Join(outputDir, "artifact-catalog-props.ts"), source, 0o644); err != nil {
		return fmt.Errorf("write catalog props module: %w", err)
	}
	return nil
}

func renderPropsSchemas(catalog artifactdoc.Catalog) []byte {
	var output bytes.Buffer
	output.WriteString(generatedHeader)
	output.WriteString("import type { ElementNode } from \"@openuidev/react-lang\";\n")
	output.WriteString("import { z } from \"zod/v4\";\n\n")
	output.WriteString("import type { ArtifactComponentName } from \"./artifact-catalog\";\n\n")
	writeSlotHelper(&output)
	writeBlockSlot(&output)
	for _, component := range catalog.Components {
		writeComponentProps(&output, component)
	}
	writeSchemaRecord(&output, catalog)
	return output.Bytes()
}

func writeSlotHelper(output *bytes.Buffer) {
	output.WriteString("/**\n")
	output.WriteString(" * One nested-component slot.\n")
	output.WriteString(" *\n")
	output.WriteString(" * A slot's schema is the child's own props object, which is how OpenUI\n")
	output.WriteString(" * declares a sub-component and what makes `library.toJSONSchema()` emit\n")
	output.WriteString(" * `$ref: \"#/$defs/<Component>\"` for it. The value a parent renderer actually\n")
	output.WriteString(" * receives is the child's parsed element node, so that is the declared type.\n")
	output.WriteString(" *\n")
	output.WriteString(" * Every caller gets a fresh schema instance. A shared one is visited twice by\n")
	output.WriteString(" * `z.toJSONSchema()`, which lifts a repeated schema into an anonymous `$defs`\n")
	output.WriteString(" * entry, and the parser reads every `$defs` key as a component name.\n")
	output.WriteString(" */\n")
	output.WriteString("function componentSlot(props: z.ZodType): z.ZodType<ElementNode> {\n")
	output.WriteString("  return props as unknown as z.ZodType<ElementNode>;\n")
	output.WriteString("}\n\n")
}

func writeBlockSlot(output *bytes.Buffer) {
	output.WriteString("/** The content set every container slot accepts. */\n")
	output.WriteString("function blockNode(): z.ZodType<ElementNode> {\n")
	output.WriteString("  return componentSlot(\n")
	output.WriteString("    z.lazy(() =>\n")
	output.WriteString("      z.union([\n")
	for _, name := range artifactdoc.BlockComponents() {
		fmt.Fprintf(output, "        %s,\n", propsBinding(name))
	}
	output.WriteString("      ]),\n")
	output.WriteString("    ),\n")
	output.WriteString("  );\n")
	output.WriteString("}\n\n")
}

func writeComponentProps(output *bytes.Buffer, component artifactdoc.Component) {
	fmt.Fprintf(output, "/** %s */\n", component.Summary)
	if len(component.Properties) == 0 {
		fmt.Fprintf(output, "const %s = z.object({});\n\n", propsBinding(component.Name))
		return
	}
	fmt.Fprintf(output, "const %s = z.object({\n", propsBinding(component.Name))
	for _, property := range component.Properties {
		fmt.Fprintf(output, "  /** %s */\n", property.Description)
		fmt.Fprintf(output, "  %s: %s", property.Name, zodValue(property.Schema, "  "))
		if !property.Required {
			output.WriteString(".optional()")
		}
		output.WriteString(",\n")
	}
	output.WriteString("});\n\n")
}

func writeSchemaRecord(output *bytes.Buffer, catalog artifactdoc.Catalog) {
	output.WriteString("/**\n")
	output.WriteString(" * Every component's props schema, in the catalog order arguments are mapped\n")
	output.WriteString(" * through. Pass each one to `defineComponent` beside its Setta renderer.\n")
	output.WriteString(" */\n")
	output.WriteString("export const artifactComponentPropsSchemas = {\n")
	for _, component := range catalog.Components {
		fmt.Fprintf(output, "  %s: %s,\n", component.Name, propsBinding(component.Name))
	}
	output.WriteString("} satisfies Record<ArtifactComponentName, z.ZodObject>;\n\n")
	output.WriteString("/** The props each component's renderer receives from the OpenUI renderer. */\n")
	output.WriteString("export type ArtifactComponentProps = {\n")
	output.WriteString("  readonly [Name in ArtifactComponentName]: z.infer<\n")
	output.WriteString("    (typeof artifactComponentPropsSchemas)[Name]\n")
	output.WriteString("  >;\n")
	output.WriteString("};\n")
}

// zodValue renders one property, element, or field schema as a Zod expression.
//
// The constraints carried through are the ones the catalog states exactly, the
// same set the JSON Schema half carries. String byte limits stay behind,
// because they are UTF-8 acceptance rules the backend owns rather than
// anything a JavaScript string length can express.
//
// indent is the leading whitespace of the line the expression starts on, so a
// multi-line expression closes under the line that opened it.
func zodValue(schema artifactdoc.ValueSchema, indent string) string {
	switch schema.Kind {
	case artifactdoc.ValueKindString:
		return "z.string()"
	case artifactdoc.ValueKindEnum:
		return zodEnum(schema.EnumValues, indent)
	case artifactdoc.ValueKindNumber:
		return zodNumber(schema)
	case artifactdoc.ValueKindBoolean:
		return "z.boolean()"
	case artifactdoc.ValueKindComponent:
		return zodSlot(schema.Components)
	case artifactdoc.ValueKindList:
		return zodArray(schema, indent)
	case artifactdoc.ValueKindObject:
		return zodObject(schema.Fields, indent)
	}
	// The catalog is a Go-owned constant, so an unhandled kind is a catalog bug
	// rather than anything a generator run can recover from.
	panic(fmt.Sprintf("generate-artifact-catalog: no Zod schema for value kind %q", schema.Kind))
}

func zodEnum(values []string, indent string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, strconv.Quote(value))
	}
	if len(quoted) <= inlineEnumValues {
		return fmt.Sprintf("z.enum([%s])", strings.Join(quoted, ", "))
	}
	var builder strings.Builder
	builder.WriteString("z.enum([\n")
	for _, value := range quoted {
		fmt.Fprintf(&builder, "%s  %s,\n", indent, value)
	}
	fmt.Fprintf(&builder, "%s])", indent)
	return builder.String()
}

func zodNumber(schema artifactdoc.ValueSchema) string {
	expression := "z.number()"
	if schema.Integer {
		expression += ".int()"
	}
	if schema.Minimum != nil {
		expression += fmt.Sprintf(".min(%s)", strconv.FormatFloat(*schema.Minimum, 'g', -1, 64))
	}
	if schema.Maximum != nil {
		expression += fmt.Sprintf(".max(%s)", strconv.FormatFloat(*schema.Maximum, 'g', -1, 64))
	}
	return expression
}

func zodArray(schema artifactdoc.ValueSchema, indent string) string {
	expression := fmt.Sprintf("z.array(%s)", zodValue(*schema.Element, indent))
	if schema.MinItems > 0 {
		expression += fmt.Sprintf(".min(%d)", schema.MinItems)
	}
	if schema.MaxItems > 0 {
		expression += fmt.Sprintf(".max(%d)", schema.MaxItems)
	}
	return expression
}

func zodObject(fields []artifactdoc.ObjectField, indent string) string {
	if len(fields) == 0 {
		return "z.object({})"
	}
	var builder strings.Builder
	builder.WriteString("z.object({\n")
	inner := indent + "  "
	for _, field := range fields {
		fmt.Fprintf(&builder, "%s%s: %s", inner, field.Name, zodValue(field.Schema, inner))
		if !field.Required {
			builder.WriteString(".optional()")
		}
		builder.WriteString(",\n")
	}
	fmt.Fprintf(&builder, "%s})", indent)
	return builder.String()
}

// zodSlot renders a slot for one allowed component set. Every component is
// reached through z.lazy, because a container's content set names components
// the catalog declares after it, including the container itself.
func zodSlot(components []artifactdoc.ComponentName) string {
	if sameComponents(components, artifactdoc.BlockComponents()) {
		return "blockNode()"
	}
	if len(components) == 1 {
		return fmt.Sprintf("componentSlot(z.lazy(() => %s))", propsBinding(components[0]))
	}
	bindings := make([]string, 0, len(components))
	for _, name := range components {
		bindings = append(bindings, propsBinding(name))
	}
	return fmt.Sprintf("componentSlot(z.lazy(() => z.union([%s])))", strings.Join(bindings, ", "))
}

func sameComponents(left []artifactdoc.ComponentName, right []artifactdoc.ComponentName) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

// propsBinding is the module-level binding one component's props schema is
// declared as.
func propsBinding(name artifactdoc.ComponentName) string {
	first, width := utf8.DecodeRuneInString(string(name))
	return string(unicode.ToLower(first)) + string(name)[width:] + "Props"
}
