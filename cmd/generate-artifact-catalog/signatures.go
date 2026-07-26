package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/conversation/artifactdoc"
)

// writeSignatures renders the model-facing half of the catalog: the call shape
// and description the model is given for each component, the catalog reference
// block those lines are assembled into, and the complete static-profile
// generation instructions.
//
// The backend sends this text; the desktop reads it to check that what the
// model is told to write is what the pinned parser will positionally map.
func writeSignatures(outputDir string, catalog artifactdoc.Catalog) error {
	source := renderSignatures(catalog)
	if err := os.WriteFile(filepath.Join(outputDir, "artifact-catalog-signatures.ts"), source, 0o644); err != nil {
		return fmt.Errorf("write catalog signatures module: %w", err)
	}
	return nil
}

func renderSignatures(catalog artifactdoc.Catalog) []byte {
	var output bytes.Buffer
	output.WriteString(generatedHeader)
	output.WriteString("import type { ArtifactComponentName } from \"./artifact-catalog\";\n\n")
	output.WriteString("/** One property, as the model is told to pass it. */\n")
	output.WriteString("export interface ArtifactCatalogProperty {\n")
	output.WriteString("  readonly name: string;\n")
	output.WriteString("  readonly required: boolean;\n")
	output.WriteString("  readonly description: string;\n")
	output.WriteString("}\n\n")
	output.WriteString("/** One component, as the model is told to call it. */\n")
	output.WriteString("export interface ArtifactCatalogSignature {\n")
	output.WriteString("  readonly component: ArtifactComponentName;\n")
	output.WriteString("  readonly signature: string;\n")
	output.WriteString("  readonly summary: string;\n")
	output.WriteString("  readonly properties: readonly ArtifactCatalogProperty[];\n")
	output.WriteString("}\n\n")
	output.WriteString("/**\n")
	output.WriteString(" * Every model-visible component, in the catalog order arguments are mapped\n")
	output.WriteString(" * through. Property order here is argument order.\n")
	output.WriteString(" */\n")
	output.WriteString("export const artifactCatalogSignatures: readonly ArtifactCatalogSignature[] = [\n")
	for _, component := range catalog.Components {
		writeComponentSignature(&output, component)
	}
	output.WriteString("];\n\n")
	output.WriteString("/** The catalog reference block the model receives verbatim. */\n")
	writeTextConstant(&output, "artifactCatalogReference", catalog.Signatures())
	output.WriteString("\n")
	output.WriteString("/** The complete static-profile instructions the model composes against. */\n")
	writeTextConstant(&output, "artifactGenerationInstructions", catalog.GenerationInstructions())
	return output.Bytes()
}

func writeComponentSignature(output *bytes.Buffer, component artifactdoc.Component) {
	output.WriteString("  {\n")
	fmt.Fprintf(output, "    component: %s,\n", quote(string(component.Name)))
	fmt.Fprintf(output, "    signature: %s,\n", quote(component.Signature()))
	fmt.Fprintf(output, "    summary: %s,\n", quote(component.Summary))
	if len(component.Properties) == 0 {
		output.WriteString("    properties: [],\n  },\n")
		return
	}
	output.WriteString("    properties: [\n")
	for _, property := range component.Properties {
		fmt.Fprintf(
			output,
			"      { name: %s, required: %t, description: %s },\n",
			quote(property.Name),
			property.Required,
			quote(property.Description),
		)
	}
	output.WriteString("    ],\n  },\n")
}

// writeTextConstant emits a multi-line block as its lines. Joining them at
// runtime keeps the text readable in review, which is the point of checking
// the model-facing prompt in beside the catalog it comes from.
func writeTextConstant(output *bytes.Buffer, name string, text string) {
	fmt.Fprintf(output, "export const %s = [\n", name)
	for _, line := range strings.Split(text, "\n") {
		fmt.Fprintf(output, "  %s,\n", quote(line))
	}
	output.WriteString("].join(\"\\n\");\n")
}

// quote renders one string as a TypeScript literal. HTML escaping is off
// because this module exists to be read: the catalog states numeric bounds
// with > and <, and \u003e in a checked-in prompt hides the text under review.
func quote(text string) string {
	var encoded bytes.Buffer
	encoder := json.NewEncoder(&encoded)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(text); err != nil {
		// A string is always encodable, so a failure here is not a data case.
		panic(fmt.Sprintf("generate-artifact-catalog: encode %q: %v", text, err))
	}
	return strings.TrimSuffix(encoded.String(), "\n")
}
