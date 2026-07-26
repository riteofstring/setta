package artifactdoc

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestAcceptedFixturesCompile(t *testing.T) {
	catalog := SettaCatalogV1()
	for _, fixture := range AcceptedFixtures() {
		t.Run(fixture.Name, func(t *testing.T) {
			document, err := Compile(catalog, fixture.Source)
			if err != nil {
				t.Fatalf("compile %s: %v", fixture.Name, err)
			}
			if document.Language != DocumentLanguageOpenUI {
				t.Fatalf("language is %q, want %q", document.Language, DocumentLanguageOpenUI)
			}
			if document.CatalogID != CatalogSettaV1 {
				t.Fatalf("catalog is %q, want %q", document.CatalogID, CatalogSettaV1)
			}
			if document.Root.Component != ComponentDocument {
				t.Fatalf("root component is %q, want %q", document.Root.Component, ComponentDocument)
			}
			if _, err := json.Marshal(document); err != nil {
				t.Fatalf("encode compiled document: %v", err)
			}
		})
	}
}

// The accepted corpus is the evidence the upstream OpenUI parser will be
// checked against, so a component absent from it is a component nobody has
// proven either side renders.
func TestAcceptedFixturesCoverEveryCatalogComponent(t *testing.T) {
	catalog := SettaCatalogV1()
	seen := map[ComponentName]bool{}
	for _, fixture := range AcceptedFixtures() {
		document, err := Compile(catalog, fixture.Source)
		if err != nil {
			t.Fatalf("compile %s: %v", fixture.Name, err)
		}
		collectComponents(document.Root, seen)
	}
	for _, name := range catalog.Names() {
		if !seen[name] {
			t.Errorf("no accepted fixture renders %s", name)
		}
	}
}

func TestRejectedFixturesReportExpectedCode(t *testing.T) {
	catalog := SettaCatalogV1()
	for _, fixture := range RejectedFixtures() {
		t.Run(fixture.Name, func(t *testing.T) {
			_, err := Compile(catalog, fixture.Source)
			if err == nil {
				t.Fatalf("compile %s was accepted, want %s", fixture.Name, fixture.Code)
			}
			var failure *CompileError
			if !errors.As(err, &failure) {
				t.Fatalf("compile %s returned %T, want *CompileError", fixture.Name, err)
			}
			if len(failure.Diagnostics) == 0 || failure.Diagnostics[0].Code != fixture.Code {
				t.Fatalf("compile %s first reported %v, want %s", fixture.Name, failure.Codes(), fixture.Code)
			}
			assertDiagnosticsAreActionable(t, failure)
		})
	}
}

func TestRejectedFixturesCoverEveryCode(t *testing.T) {
	covered := map[Code]bool{}
	for _, fixture := range RejectedFixtures() {
		covered[fixture.Code] = true
	}
	for _, code := range AllCodes() {
		if !covered[code] {
			t.Errorf("no rejected fixture proves the compiler reports %s", code)
		}
	}
}

func TestCompilingTheSameSourceTwiceProducesTheSameTree(t *testing.T) {
	catalog := SettaCatalogV1()
	for _, fixture := range AcceptedFixtures() {
		first := mustCompileJSON(t, catalog, fixture.Source)
		second := mustCompileJSON(t, catalog, fixture.Source)
		if first != second {
			t.Fatalf("%s compiled to two different trees", fixture.Name)
		}
	}
}

func TestAcceptedFixturesReachGlobalBoundaries(t *testing.T) {
	catalog := SettaCatalogV1()
	sourceFixture := acceptedFixture(t, "maximum_source")
	if len(sourceFixture.Source) != MaxSourceBytes {
		t.Fatalf("maximum source is %d bytes, want %d", len(sourceFixture.Source), MaxSourceBytes)
	}

	graphFixture := acceptedFixture(t, "maximum_statements_and_nodes")
	statements, diagnostic := parseDocument(graphFixture.Source)
	if diagnostic != nil {
		t.Fatalf("parse maximum statements fixture: %v", diagnostic)
	}
	if len(statements) != MaxStatements {
		t.Fatalf("maximum graph has %d statements, want %d", len(statements), MaxStatements)
	}
	document, err := Compile(catalog, graphFixture.Source)
	if err != nil {
		t.Fatalf("compile maximum graph: %v", err)
	}
	if countComponents(document.Root) != MaxNodes {
		t.Fatalf("maximum graph has %d nodes, want %d", countComponents(document.Root), MaxNodes)
	}

	nestingFixture := acceptedFixture(t, "maximum_nesting")
	document, err = Compile(catalog, nestingFixture.Source)
	if err != nil {
		t.Fatalf("compile maximum nesting: %v", err)
	}
	if componentDepth(document.Root) != MaxDepth {
		t.Fatalf("maximum nesting has depth %d, want %d", componentDepth(document.Root), MaxDepth)
	}

	table := compileFixtureComponent(t, catalog, "maximum_table", ComponentTable)
	columns, _ := listProperty(table, "columns")
	rows, _ := listProperty(table, "rows")
	if len(columns) != MaxTableColumns || len(rows) != MaxTableRows {
		t.Fatalf("maximum table has %d columns and %d rows, want %d and %d",
			len(columns), len(rows), MaxTableColumns, MaxTableRows)
	}

	chart := compileFixtureComponent(t, catalog, "maximum_chart", ComponentLineChart)
	series, _ := listProperty(chart, "series")
	points := 0
	for _, entry := range series {
		current, _ := listField(entry, "points")
		points += len(current)
	}
	if len(series) != MaxChartSeries || points != MaxChartPoints {
		t.Fatalf("maximum chart has %d series and %d points, want %d and %d",
			len(series), points, MaxChartSeries, MaxChartPoints)
	}

	pie := compileFixtureComponent(t, catalog, "maximum_pie", ComponentPieChart)
	slices, _ := listProperty(pie, "slices")
	if len(slices) != MaxPieSlices {
		t.Fatalf("maximum pie has %d slices, want %d", len(slices), MaxPieSlices)
	}

	stringDocument, err := Compile(catalog, acceptedFixture(t, "maximum_string_values").Source)
	if err != nil {
		t.Fatalf("compile maximum string values: %v", err)
	}
	assertComponentStringLength(t, stringDocument.Root, ComponentHeading, "text", MaxLabelBytes)
	assertComponentStringLength(t, stringDocument.Root, ComponentText, "text", MaxTextBytes)
	assertComponentStringLength(t, stringDocument.Root, ComponentMarkdown, "source", MaxMarkdownBytes)
	assertComponentStringLength(t, stringDocument.Root, ComponentFileReference, "path", MaxPathBytes)
	stringTable, ok := findComponent(stringDocument.Root, ComponentTable)
	if !ok {
		t.Fatal("maximum string fixture has no Table")
	}
	stringRows, rowsOK := listProperty(stringTable, "rows")
	if !rowsOK || len(stringRows) != 1 {
		t.Fatalf("maximum string table rows are %#v, want one row", stringTable.Props["rows"])
	}
	cells, cellsOK := stringRows[0].([]any)
	if !cellsOK || len(cells) != 1 {
		t.Fatalf("maximum string table cells are %#v, want one cell", stringRows[0])
	}
	cell, cellOK := cells[0].(string)
	if !cellOK || len(cell) != MaxCellBytes {
		t.Fatalf("maximum cell is %d bytes, want %d", len(cell), MaxCellBytes)
	}
}

func TestBooleanLiteralCompilesWhenTheCatalogDeclaresOne(t *testing.T) {
	const component ComponentName = "BooleanProbe"
	catalog := newCatalog("setta.test.boolean", component, []Component{{
		Name:    component,
		Summary: "Exercises the boolean literal in the static grammar.",
		Properties: []Property{
			requiredProperty("enabled", "Whether the probe is enabled.", ValueSchema{Kind: ValueKindBoolean}),
		},
	}})
	document, err := Compile(catalog, "root = BooleanProbe(true)")
	if err != nil {
		t.Fatalf("compile boolean: %v", err)
	}
	enabled, ok := document.Root.Props["enabled"].(bool)
	if !ok || !enabled {
		t.Fatalf("boolean prop is %#v, want true", document.Root.Props["enabled"])
	}
}

func TestSettaCatalogReturnsFreshManifestData(t *testing.T) {
	first := SettaCatalogV1()
	first.Components[0].Name = "Mutated"
	first.Components[0].Properties[0].Name = "mutated"
	first.Components[0].Properties[0].Schema.Element.Components[0] = ComponentDocument

	second := SettaCatalogV1()
	if second.Components[0].Name != ComponentDocument ||
		second.Components[0].Properties[0].Name != "blocks" ||
		second.Components[0].Properties[0].Schema.Element.Components[0] == ComponentDocument {
		t.Fatalf("catalog mutation escaped into a later manifest: %+v", second.Components[0])
	}
}

func TestOmittedOptionalPropertiesAreAbsentRatherThanNull(t *testing.T) {
	document, err := Compile(SettaCatalogV1(), `root = Document([Heading("Status")])`)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	blocks, ok := listProperty(document.Root, "blocks")
	if !ok || len(blocks) != 1 {
		t.Fatalf("root blocks are %v, want one entry", document.Root.Props["blocks"])
	}
	heading, ok := blocks[0].(Node)
	if !ok {
		t.Fatalf("block is %T, want Node", blocks[0])
	}
	if _, present := heading.Props["level"]; present {
		t.Fatalf("omitted level is present as %v", heading.Props["level"])
	}
}

func TestReferencedStatementRendersOnceForEachUse(t *testing.T) {
	source := `shared = Text("Reused")
root = Document([shared, shared])`
	document, err := Compile(SettaCatalogV1(), source)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	blocks, _ := listProperty(document.Root, "blocks")
	if len(blocks) != 2 {
		t.Fatalf("root has %d blocks, want 2", len(blocks))
	}
	for index, block := range blocks {
		node, ok := block.(Node)
		if !ok || node.Component != ComponentText {
			t.Fatalf("block %d is %v, want a Text node", index, block)
		}
	}
}

func TestSignaturesDescribeEveryComponent(t *testing.T) {
	catalog := SettaCatalogV1()
	signatures := catalog.Signatures()
	for _, component := range catalog.Components {
		if !strings.Contains(signatures, string(component.Name)+"(") {
			t.Errorf("catalog signatures omit %s", component.Name)
		}
		if component.Summary == "" {
			t.Errorf("%s has no model-facing summary", component.Name)
		}
	}
}

func TestGenerationInstructionsAreCatalogComplete(t *testing.T) {
	catalog := SettaCatalogV1()
	instructions := catalog.GenerationInstructions()
	if strings.TrimSpace(instructions) != instructions {
		t.Fatal("generation instructions have surrounding whitespace")
	}
	for _, component := range catalog.Components {
		if !strings.Contains(instructions, string(component.Name)+"(") {
			t.Errorf("generation instructions omit %s", component.Name)
		}
	}
	representative := acceptedFixture(t, "mixed_report")
	arguments, err := json.Marshal(struct {
		Title  string `json:"title"`
		Source string `json:"source"`
	}{
		Title:  "Weekly platform review",
		Source: representative.Source,
	})
	if err != nil {
		t.Fatalf("encode representative tool arguments: %v", err)
	}
	t.Logf(
		"catalog prompt and representative tool arguments: instructionBytes=%d argumentJSONBytes=%d sourceBytes=%d",
		len(instructions),
		len(arguments),
		len(representative.Source),
	)
}

func TestCatalogPropertiesAreFullyDeclared(t *testing.T) {
	catalog := SettaCatalogV1()
	componentNames := map[ComponentName]bool{}
	for _, component := range catalog.Components {
		if componentNames[component.Name] {
			t.Errorf("catalog declares %s more than once", component.Name)
		}
		componentNames[component.Name] = true
	}
	for _, component := range catalog.Components {
		propertyNames := map[string]bool{}
		for _, property := range component.Properties {
			if propertyNames[property.Name] {
				t.Errorf("%s declares %s more than once", component.Name, property.Name)
			}
			propertyNames[property.Name] = true
			if property.Description == "" {
				t.Errorf("%s.%s has no description", component.Name, property.Name)
			}
			assertSchemaIsComplete(t, componentNames, string(component.Name)+"."+property.Name, property.Schema)
		}
	}
	if !componentNames[catalog.Root] {
		t.Errorf("catalog root %s is not registered", catalog.Root)
	}
	for _, name := range blockComponents() {
		if !componentNames[name] {
			t.Errorf("block component %s is not registered", name)
		}
	}
}

func assertSchemaIsComplete(t *testing.T, componentNames map[ComponentName]bool, path string, schema ValueSchema) {
	t.Helper()
	switch schema.Kind {
	case ValueKindString:
		if schema.Role == "" || schema.MaxBytes == 0 {
			t.Errorf("%s is a string with no role or size limit", path)
		}
	case ValueKindEnum:
		if len(schema.EnumValues) == 0 {
			t.Errorf("%s is an enum with no values", path)
		}
		seen := map[string]bool{}
		for _, value := range schema.EnumValues {
			if seen[value] {
				t.Errorf("%s declares enum value %q more than once", path, value)
			}
			seen[value] = true
		}
	case ValueKindComponent:
		if len(schema.Components) == 0 {
			t.Errorf("%s accepts a component but names none", path)
		}
		for _, name := range schema.Components {
			if !componentNames[name] {
				t.Errorf("%s accepts unregistered component %s", path, name)
			}
		}
	case ValueKindList:
		if schema.Element == nil {
			t.Fatalf("%s is a list with no element schema", path)
		}
		assertSchemaIsComplete(t, componentNames, path+"[]", *schema.Element)
	case ValueKindObject:
		if len(schema.Fields) == 0 {
			t.Errorf("%s is an object with no fields", path)
		}
		seen := map[string]bool{}
		for _, field := range schema.Fields {
			if seen[field.Name] {
				t.Errorf("%s declares object field %s more than once", path, field.Name)
			}
			seen[field.Name] = true
			if field.Description == "" {
				t.Errorf("%s.%s has no description", path, field.Name)
			}
			assertSchemaIsComplete(t, componentNames, path+"."+field.Name, field.Schema)
		}
	}
}

func assertDiagnosticsAreActionable(t *testing.T, failure *CompileError) {
	t.Helper()
	if len(failure.Diagnostics) > MaxDiagnostics {
		t.Fatalf("compile reported %d diagnostics, over the %d cap", len(failure.Diagnostics), MaxDiagnostics)
	}
	for _, diagnostic := range failure.Diagnostics {
		if diagnostic.Message == "" || diagnostic.Correction == "" {
			t.Errorf("%s has no message or correction", diagnostic.Code)
		}
		if diagnostic.Position.Line < 1 || diagnostic.Position.Column < 1 {
			t.Errorf("%s has position %+v", diagnostic.Code, diagnostic.Position)
		}
		if !strings.HasPrefix(diagnostic.Field(), "source") {
			t.Errorf("%s reports field %q", diagnostic.Code, diagnostic.Field())
		}
	}
}

func mustCompileJSON(t *testing.T, catalog Catalog, source string) string {
	t.Helper()
	document, err := Compile(catalog, source)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	encoded, err := json.Marshal(document)
	if err != nil {
		t.Fatalf("encode compiled document: %v", err)
	}
	return string(encoded)
}

func acceptedFixture(t *testing.T, name string) AcceptedFixture {
	t.Helper()
	for _, fixture := range AcceptedFixtures() {
		if fixture.Name == name {
			return fixture
		}
	}
	t.Fatalf("accepted fixture %q does not exist", name)
	return AcceptedFixture{}
}

func compileFixtureComponent(
	t *testing.T,
	catalog Catalog,
	fixtureName string,
	componentName ComponentName,
) Node {
	t.Helper()
	document, err := Compile(catalog, acceptedFixture(t, fixtureName).Source)
	if err != nil {
		t.Fatalf("compile %s: %v", fixtureName, err)
	}
	component, ok := findComponent(document.Root, componentName)
	if !ok {
		t.Fatalf("%s has no %s", fixtureName, componentName)
	}
	return component
}

func assertComponentStringLength(
	t *testing.T,
	root Node,
	componentName ComponentName,
	property string,
	want int,
) {
	t.Helper()
	component, ok := findComponent(root, componentName)
	if !ok {
		t.Fatalf("document has no %s", componentName)
	}
	value, ok := component.Props[property].(string)
	if !ok || len(value) != want {
		t.Fatalf("%s.%s is %d bytes, want %d", componentName, property, len(value), want)
	}
}

func findComponent(node Node, name ComponentName) (Node, bool) {
	if node.Component == name {
		return node, true
	}
	for _, value := range node.Props {
		if found, ok := findValueComponent(value, name); ok {
			return found, true
		}
	}
	return Node{}, false
}

func findValueComponent(value any, name ComponentName) (Node, bool) {
	switch typed := value.(type) {
	case Node:
		return findComponent(typed, name)
	case []any:
		for _, entry := range typed {
			if found, ok := findValueComponent(entry, name); ok {
				return found, true
			}
		}
	case map[string]any:
		for _, entry := range typed {
			if found, ok := findValueComponent(entry, name); ok {
				return found, true
			}
		}
	}
	return Node{}, false
}

func countComponents(node Node) int {
	count := 1
	for _, value := range node.Props {
		count += countValueComponents(value)
	}
	return count
}

func countValueComponents(value any) int {
	switch typed := value.(type) {
	case Node:
		return countComponents(typed)
	case []any:
		count := 0
		for _, entry := range typed {
			count += countValueComponents(entry)
		}
		return count
	case map[string]any:
		count := 0
		for _, entry := range typed {
			count += countValueComponents(entry)
		}
		return count
	}
	return 0
}

func componentDepth(node Node) int {
	depth := 1
	for _, value := range node.Props {
		candidate := 1 + valueComponentDepth(value)
		if candidate > depth {
			depth = candidate
		}
	}
	return depth
}

func valueComponentDepth(value any) int {
	switch typed := value.(type) {
	case Node:
		return componentDepth(typed)
	case []any:
		depth := 0
		for _, entry := range typed {
			if candidate := valueComponentDepth(entry); candidate > depth {
				depth = candidate
			}
		}
		return depth
	case map[string]any:
		depth := 0
		for _, entry := range typed {
			if candidate := valueComponentDepth(entry); candidate > depth {
				depth = candidate
			}
		}
		return depth
	}
	return 0
}

func collectComponents(node Node, seen map[ComponentName]bool) {
	seen[node.Component] = true
	for _, value := range node.Props {
		collectValueComponents(value, seen)
	}
}

func collectValueComponents(value any, seen map[ComponentName]bool) {
	switch typed := value.(type) {
	case Node:
		collectComponents(typed, seen)
	case []any:
		for _, entry := range typed {
			collectValueComponents(entry, seen)
		}
	case map[string]any:
		for _, entry := range typed {
			collectValueComponents(entry, seen)
		}
	}
}

func BenchmarkCompileRepresentativeDocument(b *testing.B) {
	benchmarkCompileFixture(b, "mixed_report")
}

func BenchmarkCompileMaximumSource(b *testing.B) {
	benchmarkCompileFixture(b, "maximum_source")
}

func benchmarkCompileFixture(b *testing.B, name string) {
	b.Helper()
	var source string
	for _, fixture := range AcceptedFixtures() {
		if fixture.Name == name {
			source = fixture.Source
			break
		}
	}
	if source == "" {
		b.Fatalf("accepted fixture %q does not exist", name)
	}
	catalog := SettaCatalogV1()
	b.ReportAllocs()
	b.SetBytes(int64(len(source)))
	b.ResetTimer()
	for range b.N {
		if _, err := Compile(catalog, source); err != nil {
			b.Fatalf("compile %s: %v", name, err)
		}
	}
}
