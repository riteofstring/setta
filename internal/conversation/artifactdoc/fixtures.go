package artifactdoc

import (
	"fmt"
	"strings"
)

// The conformance corpus.
//
// Accepted fixtures are the documents the profile promises to accept. Together
// they exercise every catalog component, every value shape, reference reuse,
// and the boundaries of the Go-owned limits. They are also the corpus the
// pinned upstream OpenUI parser has to interpret identically before the
// production cutover may begin.
//
// Rejected fixtures are the documents the profile promises to refuse, one per
// stable failure code. A code with no rejected fixture is a code no one has
// proven the compiler can produce.

// AcceptedFixture is one document the compiler must accept.
type AcceptedFixture struct {
	Name        string
	Description string
	Source      string
}

// RejectedFixture is one document the compiler must refuse, with the code it
// must report.
type RejectedFixture struct {
	Name        string
	Description string
	Source      string
	Code        Code
}

// AcceptedFixtures returns the accepted corpus in stable order.
func AcceptedFixtures() []AcceptedFixture {
	fixtures := []AcceptedFixture{
		{
			Name:        "minimal_document",
			Description: "The smallest useful artifact: a heading and a paragraph.",
			Source: `root = Document([
  Heading("Support review"),
  Text("Ticket volume fell 12 percent quarter over quarter.")
])`,
		},
		{
			Name:        "content_blocks",
			Description: "Every content component, including all heading ranks and text tones.",
			Source: `root = Document([
  Heading("Release notes", "section"),
  Heading("Highlights", "subsection"),
  Heading("Details", "detail"),
  Text("The renderer now streams previews."),
  Text("Bundle size is unchanged.", "muted"),
  Text("Delete local app data first.", "strong"),
  Markdown("- Faster first paint\n- Bounded parse cache\n\nSee the [release notes](https://example.com/releases)."),
  Separator(),
  CodeBlock("go build ./...", "bash", "Build the backend"),
  FileReference("internal/conversation/domain.go", "Owns the artifact contract")
])`,
		},
		{
			Name:        "layout_containers",
			Description: "Sections, stacks, grids, cards, tabs, and accordions, with one container reused by reference.",
			Source: `overview = Card("Overview", [
  Metric("Open tickets", "128", "down 12% quarter over quarter", "positive")
])
root = Document([
  Section("Status", [
    Stack([
      overview,
      Grid([
        Text("Backend services are healthy."),
        Text("Desktop build is green.")
      ], 2)
    ], "compact")
  ]),
  Tabs([
    Tab("Backend", [Text("Go services are healthy.")]),
    Tab("Desktop", [Text("Electron build is green.")])
  ]),
  Accordion([
    AccordionItem("Risks", [Text("Chart bundle size.")]),
    AccordionItem("Follow-ups", [Text("Measure preview latency.")])
  ])
])`,
		},
		{
			Name:        "data_display",
			Description: "Metrics, badges, an alert, and a table, with an optional argument skipped by null.",
			Source: `root = Document([
  Grid([
    Metric("Resolved", "412", "best week this quarter", "positive"),
    Metric("Escalated", "17", null, "negative")
  ], 2),
  Badge("Stable", "success"),
  Badge("Draft"),
  Alert("Migration required", "Delete local app data before the next run.", "warning"),
  Table(
    [
      {key: "team", label: "Team"},
      {key: "open", label: "Open", align: "end"}
    ],
    [
      ["Platform", "42"],
      ["Desktop", "18"]
    ],
    "Open tickets by team"
  )
])`,
		},
		{
			Name:        "charts",
			Description: "Every chart component, with one series statement shared by three charts.",
			Source: `revenue = [
  {
    name: "Direct",
    points: [
      {label: "Q1", value: 12.5},
      {label: "Q2", value: 18},
      {label: "Q3", value: 21.25}
    ]
  },
  {
    name: "Partner",
    points: [
      {label: "Q1", value: 4},
      {label: "Q2", value: 6.5},
      {label: "Q3", value: 9}
    ]
  }
]
root = Document([
  BarChart(revenue, "Revenue by channel"),
  LineChart(revenue),
  AreaChart(revenue, "Cumulative view"),
  PieChart([
    {label: "Direct", value: 62},
    {label: "Partner", value: 38}
  ], "Share of revenue")
])`,
		},
		{
			Name:        "forward_and_shared_references",
			Description: "Statements defined after root, and one statement rendered in two places.",
			Source: `root = Document([
  Section("Summary", [summary]),
  Section("Appendix", [summary, footnote])
])
summary = Markdown("The rollout is on schedule.")
footnote = Text("Generated from durable trajectory facts.", "muted")`,
		},
		{
			Name:        "mixed_report",
			Description: "A realistic mixed-content report of the kind the rail preview has to summarize.",
			Source: `root = Document([
  Heading("Weekly platform review"),
  Text("Latency held flat while ticket volume dropped."),
  Alert("Action needed", "The chart bundle must stay out of the initial chunk.", "warning"),
  Section("Numbers", [
    Grid([
      Metric("p95 latency", "182 ms", "flat week over week"),
      Metric("Open tickets", "128", "down 12%", "positive")
    ], 2),
    Table(
      [{key: "surface", label: "Surface"}, {key: "p95", label: "p95", align: "end"}],
      [["Command center", "182 ms"], ["Artifact browser", "96 ms"]],
      "Latency by surface"
    )
  ]),
  Section("Trend", [
    BarChart([
      {name: "Tickets", points: [{label: "W1", value: 168}, {label: "W2", value: 141}, {label: "W3", value: 128}]}
    ], "Open tickets by week")
  ]),
  Section("References", [
    FileReference("docs/plans/openui-artifact-system-plan.md", "Plan of record"),
    CodeBlock("./scripts/go.sh run ./cmd/generate-contracts", "bash")
  ])
])`,
		},
		{
			Name:        "optional_slots_skipped",
			Description: "Optional arguments omitted at the end and skipped in the middle with null.",
			Source: `root = Document([
  CodeBlock("SELECT 1", null, "Smoke query"),
  Metric("Latency", "42 ms", null, "positive"),
  Stack([Text("Compact stack.")], "compact")
])`,
		},
		{
			Name:        "maximum_table",
			Description: "A table at the column and row limits.",
			Source:      maximumTableSource(),
		},
		{
			Name:        "maximum_nesting",
			Description: "A component chain at the nesting limit.",
			Source:      maximumNestingSource(),
		},
	}
	return fixtures
}

// RejectedFixtures returns the rejected corpus in stable order.
func RejectedFixtures() []RejectedFixture {
	rejected := make([]RejectedFixture, 0, 32)
	rejected = append(rejected, rejectedSourceFixtures()...)
	rejected = append(rejected, rejectedStatementFixtures()...)
	rejected = append(rejected, rejectedComponentFixtures()...)
	rejected = append(rejected, rejectedLimitFixtures()...)
	rejected = append(rejected, rejectedSafetyFixtures()...)
	return rejected
}

func rejectedSourceFixtures() []RejectedFixture {
	return []RejectedFixture{
		{
			Name:        "empty_source",
			Description: "Whitespace only.",
			Source:      "   \n  \n",
			Code:        CodeSourceEmpty,
		},
		{
			Name:        "oversize_source",
			Description: "Source past the byte limit.",
			Source:      oversizeSource(),
			Code:        CodeSourceTooLarge,
		},
		{
			Name:        "invalid_utf8",
			Description: "A byte sequence that is not UTF-8.",
			Source:      "root = Document([Text(\"\xff\")])",
			Code:        CodeInvalidUTF8,
		},
		{
			Name:        "unclosed_call",
			Description: "A component call that is never closed.",
			Source:      `root = Document([Text("Unfinished")`,
			Code:        CodeSyntax,
		},
		{
			Name:        "two_statements_on_one_line",
			Description: "Two assignments sharing a line.",
			Source:      `intro = Text("A") root = Document([intro])`,
			Code:        CodeSyntax,
		},
		{
			Name:        "unterminated_string",
			Description: "A string literal left open at the end of a line.",
			Source: `root = Document([
  Text("Unfinished)
])`,
			Code: CodeSyntax,
		},
		{
			Name:        "comment",
			Description: "A comment line.",
			Source: `# Weekly review
root = Document([Text("Body")])`,
			Code: CodeUnsupportedSyntax,
		},
		{
			Name:        "named_argument",
			Description: "A named component argument.",
			Source:      `root = Document([Text(text = "Body")])`,
			Code:        CodeUnsupportedSyntax,
		},
		{
			Name:        "arithmetic",
			Description: "An arithmetic expression where a number belongs.",
			Source:      `root = Document([Grid([Text("A"), Text("B")], 1 + 1)])`,
			Code:        CodeUnsupportedSyntax,
		},
		{
			Name:        "openui_query",
			Description: "An OpenUI data feature outside the profile.",
			Source:      `root = Document([Query("select * from tickets")])`,
			Code:        CodeUnsupportedSyntax,
		},
	}
}

func rejectedStatementFixtures() []RejectedFixture {
	return []RejectedFixture{
		{
			Name:        "missing_root",
			Description: "No root assignment.",
			Source:      `intro = Text("Body")`,
			Code:        CodeMissingRoot,
		},
		{
			Name:        "root_is_not_a_document",
			Description: "Root assigned something other than the root component.",
			Source:      `root = Section("Status", [Text("Body")])`,
			Code:        CodeInvalidValue,
		},
		{
			Name:        "duplicate_statement",
			Description: "One statement name assigned twice.",
			Source: `intro = Text("First")
intro = Text("Second")
root = Document([intro])`,
			Code: CodeDuplicateStatement,
		},
		{
			Name:        "unknown_reference",
			Description: "A reference that names no statement.",
			Source:      `root = Document([missing])`,
			Code:        CodeUnknownReference,
		},
		{
			Name:        "cyclic_reference",
			Description: "Two statements that refer to each other.",
			Source: `left = Stack([right])
right = Stack([left])
root = Document([left])`,
			Code: CodeCyclicReference,
		},
		{
			Name:        "unused_statement",
			Description: "Content that root never reaches.",
			Source: `spare = Text("Never rendered")
root = Document([Text("Body")])`,
			Code: CodeUnusedStatement,
		},
	}
}

func rejectedComponentFixtures() []RejectedFixture {
	return []RejectedFixture{
		{
			Name:        "unknown_component",
			Description: "A component that is not in the catalog.",
			Source:      `root = Document([Callout("Heads up")])`,
			Code:        CodeUnknownComponent,
		},
		{
			Name:        "nested_document",
			Description: "The root component nested inside itself.",
			Source:      `root = Document([Document([Text("Body")])])`,
			Code:        CodeInvalidValue,
		},
		{
			Name:        "tab_outside_tabs",
			Description: "A container-only component used as a block.",
			Source:      `root = Document([Tab("Backend", [Text("Body")])])`,
			Code:        CodeInvalidValue,
		},
		{
			Name:        "too_many_arguments",
			Description: "More arguments than the component declares.",
			Source:      `root = Document([Heading("Status", "section", "extra")])`,
			Code:        CodeArgumentCount,
		},
		{
			Name:        "missing_required_argument",
			Description: "A required property with no argument.",
			Source:      `root = Document([Heading()])`,
			Code:        CodeMissingProperty,
		},
		{
			Name:        "null_required_argument",
			Description: "A required property explicitly skipped.",
			Source:      `root = Document([Heading(null, "section")])`,
			Code:        CodeMissingProperty,
		},
		{
			Name:        "wrong_argument_type",
			Description: "A number where a string belongs.",
			Source:      `root = Document([Heading(42)])`,
			Code:        CodeInvalidValue,
		},
		{
			Name:        "unknown_enum_value",
			Description: "An enum value outside the catalog value set.",
			Source:      `root = Document([Heading("Status", "huge")])`,
			Code:        CodeInvalidValue,
		},
		{
			Name:        "unknown_object_field",
			Description: "An object field the catalog does not declare.",
			Source: `root = Document([
  Table([{key: "team", label: "Team", width: 200}], [["Platform"]])
])`,
			Code: CodeInvalidValue,
		},
		{
			Name:        "row_width_mismatch",
			Description: "A table row that does not match the column count.",
			Source: `root = Document([
  Table(
    [{key: "team", label: "Team"}, {key: "open", label: "Open"}],
    [["Platform", "42"], ["Desktop"]]
  )
])`,
			Code: CodeRowWidthMismatch,
		},
		{
			Name:        "duplicate_column_key",
			Description: "Two table columns sharing a key.",
			Source: `root = Document([
  Table(
    [{key: "team", label: "Team"}, {key: "team", label: "Squad"}],
    [["Platform", "Desktop"]]
  )
])`,
			Code: CodeInvalidValue,
		},
		{
			Name:        "chart_axis_mismatch",
			Description: "Chart series that do not share one category axis.",
			Source: `root = Document([
  BarChart([
    {name: "Direct", points: [{label: "Q1", value: 1}, {label: "Q2", value: 2}]},
    {name: "Partner", points: [{label: "Q1", value: 3}, {label: "Q3", value: 4}]}
  ])
])`,
			Code: CodeInvalidValue,
		},
		{
			Name:        "non_finite_number",
			Description: "A number literal that is not finite.",
			Source: `root = Document([
  BarChart([{name: "Direct", points: [{label: "Q1", value: 1e400}]}])
])`,
			Code: CodeInvalidValue,
		},
	}
}

func rejectedLimitFixtures() []RejectedFixture {
	return []RejectedFixture{
		{
			Name:        "array_over_limit",
			Description: "A block array past the entry limit.",
			Source:      oversizeBlockArraySource(),
			Code:        CodeLimitExceeded,
		},
		{
			Name:        "nesting_over_limit",
			Description: "A component chain past the nesting limit.",
			Source:      oversizeNestingSource(),
			Code:        CodeLimitExceeded,
		},
		{
			Name:        "markdown_over_limit",
			Description: "A Markdown block past its byte limit.",
			Source:      oversizeMarkdownSource(),
			Code:        CodeLimitExceeded,
		},
		{
			Name:        "chart_points_over_limit",
			Description: "A chart past the total point budget.",
			Source:      oversizeChartSource(),
			Code:        CodeLimitExceeded,
		},
		{
			Name:        "statements_over_limit",
			Description: "More statements than the document limit allows.",
			Source:      oversizeStatementSource(),
			Code:        CodeLimitExceeded,
		},
	}
}

func rejectedSafetyFixtures() []RejectedFixture {
	return []RejectedFixture{
		{
			Name:        "markdown_raw_html",
			Description: "Raw HTML inside Markdown.",
			Source:      `root = Document([Markdown("<script>alert(1)</script>")])`,
			Code:        CodeUnsafeValue,
		},
		{
			Name:        "markdown_image",
			Description: "An embedded image inside Markdown.",
			Source:      `root = Document([Markdown("![chart](https://example.com/chart.png)")])`,
			Code:        CodeUnsafeValue,
		},
		{
			Name:        "markdown_script_link",
			Description: "A link protocol that executes.",
			Source:      `root = Document([Markdown("[run](javascript:alert(1))")])`,
			Code:        CodeUnsafeValue,
		},
		{
			Name:        "markdown_file_link",
			Description: "A link that reaches the local filesystem.",
			Source:      `root = Document([Markdown("[open](file:///etc/passwd)")])`,
			Code:        CodeUnsafeValue,
		},
		{
			Name:        "absolute_file_reference",
			Description: "An absolute file reference.",
			Source:      `root = Document([FileReference("/etc/passwd")])`,
			Code:        CodeUnsafeValue,
		},
		{
			Name:        "traversing_file_reference",
			Description: "A file reference that leaves the workspace.",
			Source:      `root = Document([FileReference("../../etc/passwd")])`,
			Code:        CodeUnsafeValue,
		},
		{
			Name:        "windows_file_reference",
			Description: "A Windows absolute path.",
			Source:      `root = Document([FileReference("C:/Windows/System32/drivers/etc/hosts")])`,
			Code:        CodeUnsafeValue,
		},
		{
			Name:        "bidirectional_override",
			Description: "A bidirectional override that would make rendered text lie.",
			Source:      bidirectionalOverrideSource(),
			Code:        CodeUnsafeValue,
		},
		{
			Name:        "multiline_label",
			Description: "A newline inside a single-line label.",
			Source:      `root = Document([Heading("Status\nreview")])`,
			Code:        CodeInvalidValue,
		},
	}
}

// bidirectionalOverrideSource writes the override as an escape, so the fixture
// stays readable in a source file and still reaches the compiler as the real
// character.
func bidirectionalOverrideSource() string {
	text := "transfer" + string(embeddingEnd) + " dexif "
	return fmt.Sprintf("root = Document([Text(%q)])", text)
}

func maximumTableSource() string {
	columns := make([]string, 0, MaxTableColumns)
	for index := range MaxTableColumns {
		columns = append(columns, fmt.Sprintf(`{key: "c%d", label: "Column %d"}`, index, index))
	}
	rows := make([]string, 0, MaxTableRows)
	for row := range MaxTableRows {
		cells := make([]string, 0, MaxTableColumns)
		for column := range MaxTableColumns {
			cells = append(cells, fmt.Sprintf(`"r%dc%d"`, row, column))
		}
		rows = append(rows, "["+strings.Join(cells, ", ")+"]")
	}
	return fmt.Sprintf(
		"root = Document([Table([%s], [%s], \"Every column and row the profile allows\")])",
		strings.Join(columns, ", "),
		strings.Join(rows, ", "),
	)
}

func nestedStackSource(stacks int) string {
	return fmt.Sprintf(
		"root = Document([%s%s%s])",
		strings.Repeat("Stack([", stacks),
		`Text("Deepest block")`,
		strings.Repeat("])", stacks),
	)
}

func maximumNestingSource() string {
	// Document, the stacks, and the innermost Text together reach MaxDepth.
	return nestedStackSource(MaxDepth - 2)
}

func oversizeNestingSource() string {
	return nestedStackSource(MaxDepth - 1)
}

func oversizeSource() string {
	return fmt.Sprintf("root = Document([Text(%q)])", strings.Repeat("x", MaxSourceBytes))
}

func oversizeMarkdownSource() string {
	return fmt.Sprintf("root = Document([Markdown(%q)])", strings.Repeat("a", MaxMarkdownBytes+1))
}

func oversizeBlockArraySource() string {
	blocks := make([]string, 0, MaxArrayEntries+1)
	for index := range MaxArrayEntries + 1 {
		blocks = append(blocks, fmt.Sprintf(`Text("Line %d")`, index))
	}
	return "root = Document([" + strings.Join(blocks, ", ") + "])"
}

func oversizeChartSource() string {
	seriesCount := MaxChartPoints/MaxArrayEntries + 1
	series := make([]string, 0, seriesCount)
	for index := range seriesCount {
		points := make([]string, 0, MaxArrayEntries)
		for point := range MaxArrayEntries {
			points = append(points, fmt.Sprintf(`{label: "p%d", value: %d}`, point, point))
		}
		series = append(series, fmt.Sprintf(`{name: "s%d", points: [%s]}`, index, strings.Join(points, ", ")))
	}
	return fmt.Sprintf("root = Document([BarChart([%s])])", strings.Join(series, ", "))
}

func oversizeStatementSource() string {
	lines := make([]string, 0, MaxStatements+2)
	references := make([]string, 0, MaxStatements+1)
	for index := range MaxStatements + 1 {
		lines = append(lines, fmt.Sprintf(`line%d = Text("Line %d")`, index, index))
		references = append(references, fmt.Sprintf("line%d", index))
	}
	lines = append(lines, "root = Document(["+strings.Join(references, ", ")+"])")
	return strings.Join(lines, "\n")
}
