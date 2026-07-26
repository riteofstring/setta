package artifactdoc

// Go-owned safety limits for the static profile.
//
// These bound prompt size, tool argument size, parse cost, and rendered DOM at
// the only place that can enforce them before persistence. Lowering a limit is
// a product decision; raising one requires measured evidence.
const (
	// MaxSourceBytes bounds the UTF-8 source a single artifact may carry.
	MaxSourceBytes = 64 * 1024
	// MaxStatements bounds assignments in one document.
	MaxStatements = 256
	// MaxNodes bounds rendered component nodes after reference expansion, so a
	// small source cannot expand into a large tree by reusing statements.
	MaxNodes = 256
	// MaxDepth bounds component nesting.
	MaxDepth = 12
	// MaxSyntaxDepth bounds parser recursion before catalog validation runs.
	// A valid maximum-depth component tree can use two delimiters per
	// component, plus a small fixed amount for table and chart data.
	MaxSyntaxDepth = MaxDepth*2 + 8
	// MaxArrayEntries bounds entries in any single array.
	MaxArrayEntries = 100
	// MaxTableColumns bounds table columns.
	MaxTableColumns = 12
	// MaxTableRows bounds table rows.
	MaxTableRows = 100
	// MaxChartSeries bounds series in one chart.
	MaxChartSeries = 8
	// MaxChartPoints bounds points across every series of one chart.
	MaxChartPoints = 200
	// MaxPieSlices is lowered below MaxChartPoints because a pie chart stops
	// being readable long before a line chart does.
	MaxPieSlices = 24
	// MaxDiagnostics bounds how many failures one compile reports, so a badly
	// broken document still returns a correction the model can act on.
	MaxDiagnostics = 10
)

// String size limits by role. Roles exist so a heading, a paragraph, a Markdown
// block, a code block, a table cell, and a workspace path each get the size and
// safety rules they actually need.
const (
	// MaxLabelBytes bounds single-line labels, titles, and captions.
	MaxLabelBytes = 200
	// MaxTextBytes bounds a plain prose block.
	MaxTextBytes = 4 * 1024
	// MaxMarkdownBytes bounds a Markdown block.
	MaxMarkdownBytes = 16 * 1024
	// MaxCodeBytes bounds a code block.
	MaxCodeBytes = 16 * 1024
	// MaxPathBytes bounds a workspace-relative file reference.
	MaxPathBytes = 1024
	// MaxCellBytes bounds one table cell.
	MaxCellBytes = 512
)
