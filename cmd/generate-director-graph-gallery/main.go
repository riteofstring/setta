package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/director"
)

type galleryFixture struct {
	Name        string                     `json:"name"`
	Description string                     `json:"description"`
	Graphs      []director.WorkstreamGraph `json:"graphs"`
}

func main() {
	outputDir := flag.String(
		"output-dir",
		"desktop/src/renderer/src/features/director-graph/projection-gallery-fixtures",
		"generated TypeScript gallery fixture module directory",
	)
	flag.Parse()

	fixtures, err := buildFixtures()
	if err != nil {
		fatalf("build Director graph gallery fixtures: %v", err)
	}
	if err := writeFixtures(*outputDir, fixtures); err != nil {
		fatalf("write Director graph gallery fixtures: %v", err)
	}
}

func buildFixtures() ([]galleryFixture, error) {
	source := director.ProjectionFixtures()
	fixtures := make([]galleryFixture, 0, len(source))
	coverage := newFixtureCoverage()
	for _, fixture := range source {
		final, err := buildFixture(fixture.Name, fixture.Description, fixture.Events)
		if err != nil {
			return nil, err
		}
		fixtures = append(fixtures, final)
		coverage.observe(final.Graphs)

		for boundary := 1; boundary < len(fixture.Events); boundary++ {
			prefixName := fmt.Sprintf("%s_prefix_%02d", fixture.Name, boundary)
			prefixDescription := fmt.Sprintf("%s Prefix through durable event %d.", fixture.Description, boundary)
			prefix, err := buildFixture(prefixName, prefixDescription, fixture.Events[:boundary])
			if err != nil {
				return nil, err
			}
			if coverage.contributes(prefix.Graphs) {
				fixtures = append(fixtures, prefix)
				coverage.observe(prefix.Graphs)
			}
		}
	}
	return fixtures, nil
}

func buildFixture(name string, description string, events []director.ProjectorEvent) (galleryFixture, error) {
	projection, err := director.ProjectDirectorGraph(events)
	if err != nil {
		return galleryFixture{}, fmt.Errorf("%s: project graph: %w", name, err)
	}
	graphs := make([]director.WorkstreamGraph, 0, len(projection.WorkstreamIDs)+1)
	// The Director lane is a graph scope rather than a registry row, so it is
	// fetched by name the way the snapshot fetches it. A history in which the
	// Director said nothing has an empty lane, and an empty lane is not a scene.
	lane, err := projection.Graph(director.DirectorLaneID, director.WorkstreamDetailSelected)
	if err != nil {
		return galleryFixture{}, fmt.Errorf("%s: director lane graph: %w", name, err)
	}
	if len(lane.Nodes) > 0 {
		if err := director.ValidateWorkstreamGraph(lane, projection.Authority); err != nil {
			return galleryFixture{}, fmt.Errorf("%s: validate director lane graph: %w", name, err)
		}
		graphs = append(graphs, lane)
	}
	for _, workstreamID := range projection.WorkstreamIDs {
		graph, err := projection.Graph(workstreamID, director.WorkstreamDetailSelected)
		if err != nil {
			return galleryFixture{}, fmt.Errorf("%s/%s: selected graph: %w", name, workstreamID, err)
		}
		if err := director.ValidateWorkstreamGraph(graph, projection.Authority); err != nil {
			return galleryFixture{}, fmt.Errorf("%s/%s: validate selected graph: %w", name, workstreamID, err)
		}
		graphs = append(graphs, graph)
	}
	return galleryFixture{Name: name, Description: description, Graphs: graphs}, nil
}

type fixtureCoverage struct {
	nodeKinds       map[director.SemanticNodeKind]bool
	nodeStatuses    map[director.SemanticNodeStatus]bool
	evidenceClasses map[director.EvidenceClass]bool
	edgeKinds       map[director.SemanticEdgeKind]bool
}

func newFixtureCoverage() *fixtureCoverage {
	return &fixtureCoverage{
		nodeKinds:       map[director.SemanticNodeKind]bool{},
		nodeStatuses:    map[director.SemanticNodeStatus]bool{},
		evidenceClasses: map[director.EvidenceClass]bool{},
		edgeKinds:       map[director.SemanticEdgeKind]bool{},
	}
}

func (coverage *fixtureCoverage) contributes(graphs []director.WorkstreamGraph) bool {
	for _, graph := range graphs {
		for _, node := range graph.Nodes {
			if !coverage.nodeKinds[node.Kind] ||
				!coverage.nodeStatuses[node.Status] ||
				!coverage.evidenceClasses[node.EvidenceClass] {
				return true
			}
		}
		for _, edge := range graph.Edges {
			if !coverage.edgeKinds[edge.Kind] {
				return true
			}
		}
	}
	return false
}

func (coverage *fixtureCoverage) observe(graphs []director.WorkstreamGraph) {
	for _, graph := range graphs {
		for _, node := range graph.Nodes {
			coverage.nodeKinds[node.Kind] = true
			coverage.nodeStatuses[node.Status] = true
			coverage.evidenceClasses[node.EvidenceClass] = true
		}
		for _, edge := range graph.Edges {
			coverage.edgeKinds[edge.Kind] = true
		}
	}
}

func writeFixtures(outputDir string, fixtures []galleryFixture) error {
	legacyOutput := filepath.Join(filepath.Dir(outputDir), "projection-gallery-fixtures.ts")
	if err := os.Remove(legacyOutput); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove legacy generated file: %w", err)
	}
	if err := os.RemoveAll(outputDir); err != nil {
		return fmt.Errorf("remove generated fixture directory: %w", err)
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("create generated fixture directory: %w", err)
	}
	if err := os.WriteFile(filepath.Join(outputDir, "types.ts"), renderTypes(), 0o644); err != nil {
		return fmt.Errorf("write types module: %w", err)
	}
	imports := make([]string, 0, len(fixtures))
	fixtureNames := make([]string, 0, len(fixtures))
	for index, fixture := range fixtures {
		moduleName := fmt.Sprintf("%03d_%s", index, fixture.Name)
		fileName := safeFixtureFileName(moduleName)
		bindingName := fmt.Sprintf("fixture%03d", index)
		source, err := renderFixture(fixture)
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(outputDir, fileName+".ts"), source, 0o644); err != nil {
			return fmt.Errorf("write fixture %s: %w", fixture.Name, err)
		}
		imports = append(imports, fmt.Sprintf("import { projectionGalleryFixture as %s } from \"./%s\";\n", bindingName, fileName))
		fixtureNames = append(fixtureNames, bindingName)
	}
	if err := os.WriteFile(filepath.Join(outputDir, "index.ts"), renderIndex(imports, fixtureNames), 0o644); err != nil {
		return fmt.Errorf("write index module: %w", err)
	}
	return nil
}

func renderTypes() []byte {
	var output bytes.Buffer
	output.WriteString("// Code generated by ./scripts/go.sh run ./cmd/generate-director-graph-gallery; DO NOT EDIT.\n\n")
	output.WriteString("import { decodeWorkstreamGraph, type WorkstreamGraph } from \"@generated/backend\";\n\n")
	output.WriteString("export interface ProjectionGalleryFixture {\n")
	output.WriteString("  readonly name: string;\n")
	output.WriteString("  readonly description: string;\n")
	output.WriteString("  readonly graphs: readonly WorkstreamGraph[];\n")
	output.WriteString("}\n\n")
	output.WriteString("interface RawProjectionGalleryFixture {\n")
	output.WriteString("  readonly name: string;\n")
	output.WriteString("  readonly description: string;\n")
	output.WriteString("  readonly graphs: readonly unknown[];\n")
	output.WriteString("}\n\n")
	output.WriteString("export function decodeProjectionGalleryFixture(raw: RawProjectionGalleryFixture): ProjectionGalleryFixture {\n")
	output.WriteString("  return {\n")
	output.WriteString("    name: raw.name,\n")
	output.WriteString("    description: raw.description,\n")
	output.WriteString("    graphs: raw.graphs.map((graph) => decodeWorkstreamGraph(graph)),\n")
	output.WriteString("  };\n")
	output.WriteString("}\n")
	return output.Bytes()
}

func renderFixture(fixture galleryFixture) ([]byte, error) {
	payload, err := json.MarshalIndent(fixture, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal fixture %s: %w", fixture.Name, err)
	}
	var output bytes.Buffer
	output.WriteString("// Code generated by ./scripts/go.sh run ./cmd/generate-director-graph-gallery; DO NOT EDIT.\n\n")
	output.WriteString("import { decodeProjectionGalleryFixture } from \"./types\";\n\n")
	output.WriteString("const rawProjectionGalleryFixture = ")
	output.Write(payload)
	output.WriteString(" as const;\n\n")
	output.WriteString("export const projectionGalleryFixture = decodeProjectionGalleryFixture(rawProjectionGalleryFixture);\n")
	return output.Bytes(), nil
}

func renderIndex(imports []string, fixtureNames []string) []byte {
	var output bytes.Buffer
	output.WriteString("// Code generated by ./scripts/go.sh run ./cmd/generate-director-graph-gallery; DO NOT EDIT.\n\n")
	for _, statement := range imports {
		output.WriteString(statement)
	}
	output.WriteString("\nexport const projectionGalleryFixtures = [\n")
	for _, name := range fixtureNames {
		output.WriteString("\t")
		output.WriteString(name)
		output.WriteString(",\n")
	}
	output.WriteString("] as const;\n")
	return output.Bytes()
}

func safeFixtureFileName(name string) string {
	var builder strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			builder.WriteRune(r + ('a' - 'A'))
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
		default:
			builder.WriteRune('_')
		}
	}
	return builder.String()
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
