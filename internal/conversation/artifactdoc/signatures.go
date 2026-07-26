package artifactdoc

import (
	"fmt"
	"strings"
)

// blockAlias names the shared content set once instead of repeating twenty
// component names in every container signature. This is most of the difference
// in the generated instruction size.
const blockAlias = "block"

// GenerationInstructions renders the complete model-facing static-profile
// reference the production artifact tool uses for its developer instructions.
func (catalog Catalog) GenerationInstructions() string {
	return strings.TrimSpace(fmt.Sprintf(`Compose one Setta artifact document in the source field.

Static-profile rules:
- Write one assignment per line. A statement may wrap only while a (, [, or { is open.
- Assign root exactly once to a direct %s call.
- Pass component arguments positionally in the catalog order. Use null only to skip an optional slot before a later argument.
- Values may be quoted strings, finite JSON numbers, true, false, null, arrays, objects, registered component calls, or references to uniquely named statements.
- Every non-root statement must be reachable from root. References may point forward or backward but must not form a cycle.
- Do not use named arguments, comments, expressions, HTML, images, actions, tools, queries, mutations, bindings, state, styling props, URLs outside safe Markdown links, or remote resources.
- Markdown links may use only http, https, or mailto. FileReference paths must be portable workspace-relative paths with forward slashes and no traversal.
- Keep source within %d bytes, statements within %d, rendered components within %d, component depth within %d, and every data array within %d entries.

Example:
root = Document([Heading("Status"), Text("The report is ready.")])

%s`,
		catalog.Root,
		MaxSourceBytes,
		MaxStatements,
		MaxNodes,
		MaxDepth,
		MaxArrayEntries,
		catalog.Signatures(),
	))
}

// Signatures renders the model-facing catalog reference: the block alias, then
// one signature and summary per component, in catalog order.
//
// This is the text the generated developer instructions are built from, and the
// text prompt-size measurements are taken against.
func (catalog Catalog) Signatures() string {
	var builder strings.Builder
	fmt.Fprintf(&builder, "Catalog %s, components:\n", catalog.ID)
	fmt.Fprintf(&builder, "%s = %s\n\n", blockAlias, joinNames(blockComponents(), " | "))
	for index, component := range catalog.Components {
		if index > 0 {
			builder.WriteString("\n")
		}
		fmt.Fprintf(&builder, "%s\n  %s\n", typedSignature(component), component.Summary)
		writePropertyLines(&builder, component)
	}
	return builder.String()
}

// Signature is the component's model-facing call shape: its name, then its
// properties in the positional order arguments are mapped through.
func (component Component) Signature() string {
	return typedSignature(component)
}

func writePropertyLines(builder *strings.Builder, component Component) {
	for _, property := range component.Properties {
		fmt.Fprintf(builder, "  - %s: %s\n", property.Name, property.Description)
	}
}

// typedSignature is the full call shape, used in the catalog reference.
func typedSignature(component Component) string {
	parts := make([]string, 0, len(component.Properties))
	for _, property := range component.Properties {
		parts = append(parts, fmt.Sprintf("%s: %s", propertyLabel(property), valueSignature(property.Schema)))
	}
	return fmt.Sprintf("%s(%s)", component.Name, strings.Join(parts, ", "))
}

// componentSignature is the argument-order reminder used inside corrections,
// where the model already knows the types and needs the order.
func componentSignature(component Component) string {
	parts := make([]string, 0, len(component.Properties))
	for _, property := range component.Properties {
		parts = append(parts, propertyLabel(property))
	}
	return fmt.Sprintf("%s(%s)", component.Name, strings.Join(parts, ", "))
}

func propertyLabel(property Property) string {
	if property.Required {
		return property.Name
	}
	return property.Name + "?"
}

func valueSignature(schema ValueSchema) string {
	switch schema.Kind {
	case ValueKindString:
		return "string"
	case ValueKindNumber:
		return numberSignature(schema)
	case ValueKindBoolean:
		return "boolean"
	case ValueKindEnum:
		return strings.Join(quoteAll(schema.EnumValues), " | ")
	case ValueKindComponent:
		return componentsSignature(schema.Components)
	case ValueKindList:
		return fmt.Sprintf("[%s]", valueSignature(*schema.Element))
	case ValueKindObject:
		return objectShape(schema)
	}
	panic(fmt.Sprintf("artifactdoc: no signature for value kind %q", schema.Kind))
}

func numberSignature(schema ValueSchema) string {
	name := "number"
	if schema.Integer {
		name = "integer"
	}
	if schema.Minimum == nil && schema.Maximum == nil {
		return name
	}
	if schema.Minimum != nil && schema.Maximum != nil {
		return fmt.Sprintf("%s %v..%v", name, *schema.Minimum, *schema.Maximum)
	}
	if schema.Minimum != nil {
		return fmt.Sprintf("%s >= %v", name, *schema.Minimum)
	}
	return fmt.Sprintf("%s <= %v", name, *schema.Maximum)
}

func componentsSignature(components []ComponentName) string {
	if sameComponents(components, blockComponents()) {
		return blockAlias
	}
	return joinNames(components, " | ")
}

// objectShape is the literal shape a model should copy, with required fields
// plain and optional fields marked.
func objectShape(schema ValueSchema) string {
	parts := make([]string, 0, len(schema.Fields))
	for _, field := range schema.Fields {
		name := field.Name
		if !field.Required {
			name += "?"
		}
		parts = append(parts, fmt.Sprintf("%s: %s", name, valueSignature(field.Schema)))
	}
	return fmt.Sprintf("{%s}", strings.Join(parts, ", "))
}

func sameComponents(left []ComponentName, right []ComponentName) bool {
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

func joinNames(components []ComponentName, separator string) string {
	names := make([]string, 0, len(components))
	for _, name := range components {
		names = append(names, string(name))
	}
	return strings.Join(names, separator)
}
