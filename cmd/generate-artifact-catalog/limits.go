package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"

	"setta/internal/conversation/artifactdoc"
)

// limit is one Go-owned safety limit carried to the renderer.
type limit struct {
	name        string
	value       int
	description string
}

// artifactLimits are the limits the renderer legitimately needs a number for.
//
// The catalog schemas already carry every limit the parser enforces, so this
// module exists for the Setta renderers reading around those schemas: the
// chart adapter sizes its series palette by the series cap, and the table
// adapter checks a row against the column cap. Mirroring either number by hand
// in TypeScript would be a cross-language constant with no owner.
func artifactLimits() []limit {
	return []limit{
		{"maxSourceBytes", artifactdoc.MaxSourceBytes, "Largest UTF-8 document source, in bytes."},
		{"maxStatements", artifactdoc.MaxStatements, "Most assignments one document may declare."},
		{"maxNodes", artifactdoc.MaxNodes, "Most component nodes one document renders."},
		{"maxDepth", artifactdoc.MaxDepth, "Deepest component nesting."},
		{"maxArrayEntries", artifactdoc.MaxArrayEntries, "Most entries in any single array."},
		{"maxTableColumns", artifactdoc.MaxTableColumns, "Most columns in one table."},
		{"maxTableRows", artifactdoc.MaxTableRows, "Most rows in one table."},
		{"maxChartSeries", artifactdoc.MaxChartSeries, "Most series in one chart."},
		{"maxChartPoints", artifactdoc.MaxChartPoints, "Most points across every series of one chart."},
		{"maxPieSlices", artifactdoc.MaxPieSlices, "Most slices in one pie chart."},
	}
}

// writeLimits renders the Go-owned limits the TypeScript half reads.
func writeLimits(outputDir string) error {
	source := renderLimits()
	if err := os.WriteFile(filepath.Join(outputDir, "artifact-catalog-limits.ts"), source, 0o644); err != nil {
		return fmt.Errorf("write catalog limits module: %w", err)
	}
	return nil
}

func renderLimits() []byte {
	var output bytes.Buffer
	output.WriteString(generatedHeader)
	output.WriteString("/**\n")
	output.WriteString(" * The Go-owned safety limits, as literal types.\n")
	output.WriteString(" *\n")
	output.WriteString(" * The backend is the only acceptance authority for these, so nothing here\n")
	output.WriteString(" * re-validates a stored document. They exist so a Setta renderer that has to\n")
	output.WriteString(" * size something by a limit — a chart's series palette, a table's column\n")
	output.WriteString(" * bound — reads the catalog's number instead of restating it.\n")
	output.WriteString(" */\n")
	output.WriteString("export const artifactCatalogLimits = {\n")
	for _, entry := range artifactLimits() {
		fmt.Fprintf(&output, "  /** %s */\n", entry.description)
		fmt.Fprintf(&output, "  %s: %d,\n", entry.name, entry.value)
	}
	output.WriteString("} as const;\n")
	return output.Bytes()
}
