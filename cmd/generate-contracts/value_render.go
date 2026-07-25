package main

import (
	"bytes"
	"fmt"
	"strings"
)

type generatedValueSpec struct {
	Key  string
	JSON string
}

func renderConversationPaletteCatalog(buffer *bytes.Buffer, specs []generatedValueSpec) {
	if len(specs) == 0 {
		return
	}
	buffer.WriteString("export const conversationPaletteCatalog = {\n")
	for _, spec := range specs {
		fmt.Fprintf(buffer, "  %q: %s,\n", spec.Key, spec.JSON)
	}
	buffer.WriteString("} as const satisfies Readonly<Record<ConversationPaletteID, unknown>>;\n\n")
}

func renderValueSets(buffer *bytes.Buffer, specs []valueSetSpec) {
	for _, spec := range specs {
		fmt.Fprintf(buffer, "export type %s = %s;\n\n", spec.Name, literalUnion(spec.Values))
		fmt.Fprintf(buffer, "export const %sValues = [%s] as const satisfies readonly %s[];\n\n", lowerCamel(spec.Name), literalList(spec.Values), spec.Name)
		fmt.Fprintf(buffer, "export function decode%s(value: unknown, label = %q): %s {\n", spec.Name, spec.Name, spec.Name)
		buffer.WriteString("  const decoded = decodeString(value, label);\n")
		buffer.WriteString("  switch (decoded) {\n")
		for _, value := range spec.Values {
			fmt.Fprintf(buffer, "    case %q:\n", value)
			buffer.WriteString("      return decoded;\n")
		}
		buffer.WriteString("    default:\n")
		buffer.WriteString("      throw new Error(label + \" is unsupported: \" + decoded);\n")
		buffer.WriteString("  }\n")
		buffer.WriteString("}\n\n")
	}
}

func renderStringAliases(buffer *bytes.Buffer, specs []stringAliasSpec) {
	for _, spec := range specs {
		fmt.Fprintf(buffer, "export type %s = string;\n\n", spec.Name)
		fmt.Fprintf(buffer, "export function decode%s(value: unknown, label = %q): %s {\n", spec.Name, spec.Name, spec.Name)
		buffer.WriteString("  return decodeString(value, label);\n")
		buffer.WriteString("}\n\n")
	}
}

func literalList(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, fmt.Sprintf("%q", value))
	}
	return strings.Join(quoted, ", ")
}

func literalUnion(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, fmt.Sprintf("%q", value))
	}
	return strings.Join(quoted, " | ")
}
