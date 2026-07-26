package artifactdoc

// Model-visible component names.
const (
	ComponentDocument      ComponentName = "Document"
	ComponentSection       ComponentName = "Section"
	ComponentHeading       ComponentName = "Heading"
	ComponentText          ComponentName = "Text"
	ComponentMarkdown      ComponentName = "Markdown"
	ComponentCodeBlock     ComponentName = "CodeBlock"
	ComponentFileReference ComponentName = "FileReference"
	ComponentStack         ComponentName = "Stack"
	ComponentGrid          ComponentName = "Grid"
	ComponentCard          ComponentName = "Card"
	ComponentSeparator     ComponentName = "Separator"
	ComponentTabs          ComponentName = "Tabs"
	ComponentTab           ComponentName = "Tab"
	ComponentAccordion     ComponentName = "Accordion"
	ComponentAccordionItem ComponentName = "AccordionItem"
	ComponentMetric        ComponentName = "Metric"
	ComponentBadge         ComponentName = "Badge"
	ComponentAlert         ComponentName = "Alert"
	ComponentTable         ComponentName = "Table"
	ComponentBarChart      ComponentName = "BarChart"
	ComponentLineChart     ComponentName = "LineChart"
	ComponentAreaChart     ComponentName = "AreaChart"
	ComponentPieChart      ComponentName = "PieChart"
)

// SettaCatalogV1 is the first frozen Setta artifact catalog.
func SettaCatalogV1() Catalog {
	// Build a fresh value so callers cannot mutate package-owned slices or
	// schemas through the exported manifest fields.
	return newCatalog(CatalogSettaV1, ComponentDocument, settaComponentsV1())
}

// BlockComponents is the content set every container property accepts, which
// the model-facing catalog names once as the block alias. The generator names
// it once too, rather than repeating twenty component references at every
// container slot.
func BlockComponents() []ComponentName {
	return blockComponents()
}

// blockComponents is the content set a document, section, or container accepts.
// Document is absent because it is only ever the root, and Tab and
// AccordionItem are absent because they only exist inside their container.
func blockComponents() []ComponentName {
	return []ComponentName{
		ComponentSection,
		ComponentHeading,
		ComponentText,
		ComponentMarkdown,
		ComponentCodeBlock,
		ComponentFileReference,
		ComponentStack,
		ComponentGrid,
		ComponentCard,
		ComponentSeparator,
		ComponentTabs,
		ComponentAccordion,
		ComponentMetric,
		ComponentBadge,
		ComponentAlert,
		ComponentTable,
		ComponentBarChart,
		ComponentLineChart,
		ComponentAreaChart,
		ComponentPieChart,
	}
}

func settaComponentsV1() []Component {
	components := make([]Component, 0, 23)
	components = append(components, contentComponents()...)
	components = append(components, layoutComponents()...)
	components = append(components, dataComponents()...)
	return components
}

func contentComponents() []Component {
	return []Component{
		{
			Name:    ComponentDocument,
			Summary: "The artifact root. Unframed; holds the document's top-level blocks.",
			Properties: []Property{
				requiredProperty("blocks", "Ordered top-level content.", blockListValue()),
			},
		},
		{
			Name:    ComponentSection,
			Summary: "A titled group of related content.",
			Properties: []Property{
				requiredProperty("title", "Section title.", labelValue()),
				requiredProperty("blocks", "Ordered section content.", blockListValue()),
			},
		},
		{
			Name:    ComponentHeading,
			Summary: "A heading inside a section. The artifact title is rendered separately, so start at section level.",
			Properties: []Property{
				requiredProperty("text", "Heading text.", labelValue()),
				optionalProperty("level", "Heading rank. Defaults to section.", enumValue("section", "subsection", "detail")),
			},
		},
		{
			Name:    ComponentText,
			Summary: "A paragraph rendered as plain text.",
			Properties: []Property{
				requiredProperty("text", "Paragraph text.", plainValue()),
				optionalProperty("tone", "Text emphasis. Defaults to normal.", enumValue("normal", "muted", "strong")),
			},
		},
		{
			Name:    ComponentMarkdown,
			Summary: "Rich prose with lists, emphasis, and inline code. No raw HTML, images, or embedded resources.",
			Properties: []Property{
				requiredProperty("source", "Markdown source.", markdownValue()),
			},
		},
		{
			Name:    ComponentCodeBlock,
			Summary: "A verbatim code or output block.",
			Properties: []Property{
				requiredProperty("code", "Code shown exactly as written.", codeValue()),
				optionalProperty("language", "Syntax highlighting language. Defaults to text.", codeLanguageValue()),
				optionalProperty("caption", "Short caption above the block.", labelValue()),
			},
		},
		{
			Name:    ComponentFileReference,
			Summary: "A reference to one workspace file, by workspace-relative path.",
			Properties: []Property{
				requiredProperty("path", "Workspace-relative path, using forward slashes.", pathValue()),
				optionalProperty("description", "Why this file matters.", labelValue()),
			},
		},
	}
}

func layoutComponents() []Component {
	return []Component{
		{
			Name:    ComponentStack,
			Summary: "Vertically stacked blocks.",
			Properties: []Property{
				requiredProperty("blocks", "Ordered stacked content.", blockListValue()),
				optionalProperty("gap", "Spacing between blocks. Defaults to comfortable.", enumValue("compact", "comfortable")),
			},
		},
		{
			Name:    ComponentGrid,
			Summary: "Blocks laid out in responsive columns.",
			Properties: []Property{
				requiredProperty("blocks", "Ordered grid content.", blockListValue()),
				optionalProperty("columns", "Column count from 2 to 4. Defaults to 2.", integerValue(2, 4)),
			},
		},
		{
			Name:    ComponentCard,
			Summary: "A titled container for content that belongs together. Optional; do not wrap the whole document or every section in one.",
			Properties: []Property{
				requiredProperty("title", "Card title.", labelValue()),
				requiredProperty("blocks", "Ordered card content.", blockListValue()),
			},
		},
		{
			Name:       ComponentSeparator,
			Summary:    "A horizontal rule between blocks.",
			Properties: []Property{},
		},
		{
			Name:    ComponentTabs,
			Summary: "Alternate views of comparable content.",
			Properties: []Property{
				requiredProperty("tabs", "Ordered tabs.", listValue(componentValue(ComponentTab), 1, MaxArrayEntries)),
			},
		},
		{
			Name:    ComponentTab,
			Summary: "One tab. Only valid inside Tabs.",
			Properties: []Property{
				requiredProperty("label", "Tab label.", labelValue()),
				requiredProperty("blocks", "Ordered tab content.", blockListValue()),
			},
		},
		{
			Name:    ComponentAccordion,
			Summary: "Collapsible detail sections.",
			Properties: []Property{
				requiredProperty("items", "Ordered accordion items.", listValue(componentValue(ComponentAccordionItem), 1, MaxArrayEntries)),
			},
		},
		{
			Name:    ComponentAccordionItem,
			Summary: "One collapsible item. Only valid inside Accordion.",
			Properties: []Property{
				requiredProperty("label", "Item label.", labelValue()),
				requiredProperty("blocks", "Ordered item content.", blockListValue()),
			},
		},
	}
}

func dataComponents() []Component {
	return []Component{
		{
			Name:    ComponentMetric,
			Summary: "One headline number with its label.",
			Properties: []Property{
				requiredProperty("label", "What the number measures.", labelValue()),
				requiredProperty("value", "Formatted value, including any unit.", labelValue()),
				optionalProperty("caption", "Supporting detail, such as a comparison.", labelValue()),
				optionalProperty("tone", "Whether the value reads as good or bad. Defaults to neutral.", enumValue("neutral", "positive", "negative")),
			},
		},
		{
			Name:    ComponentBadge,
			Summary: "A short status label.",
			Properties: []Property{
				requiredProperty("label", "Badge text.", labelValue()),
				optionalProperty("tone", "Status meaning. Defaults to neutral.", enumValue("neutral", "info", "success", "warning", "danger")),
			},
		},
		{
			Name:    ComponentAlert,
			Summary: "A callout for something the reader must not miss.",
			Properties: []Property{
				requiredProperty("title", "Alert title.", labelValue()),
				requiredProperty("body", "Alert body, rendered as plain text.", plainValue()),
				optionalProperty("tone", "Alert severity. Defaults to info.", enumValue("info", "success", "warning", "danger")),
			},
		},
		{
			Name:    ComponentTable,
			Summary: "Tabular data. Every row must have one cell per column, in column order.",
			Properties: []Property{
				requiredProperty("columns", "Ordered columns.", tableColumnsValue()),
				requiredProperty("rows", "Ordered rows of cell text.", tableRowsValue()),
				optionalProperty("caption", "Short caption describing the table.", labelValue()),
			},
		},
		chartComponent(ComponentBarChart, "Categorical comparison where magnitude matters."),
		chartComponent(ComponentLineChart, "A trend across an ordered category axis."),
		chartComponent(ComponentAreaChart, "A cumulative or filled trend across an ordered category axis."),
		{
			Name:    ComponentPieChart,
			Summary: "Parts of a whole. Use only when the slices sum to something meaningful.",
			Properties: []Property{
				requiredProperty("slices", "Ordered slices.", pieSlicesValue()),
				optionalProperty("caption", "Short caption describing the chart.", labelValue()),
			},
		},
	}
}

func chartComponent(name ComponentName, summary string) Component {
	return Component{
		Name:    name,
		Summary: summary,
		Properties: []Property{
			requiredProperty("series", "One or more series sharing the same ordered point labels.", chartSeriesValue()),
			optionalProperty("caption", "Short caption describing the chart.", labelValue()),
		},
	}
}

func codeLanguageValue() ValueSchema {
	return enumValue(
		"text",
		"bash",
		"c",
		"cpp",
		"css",
		"diff",
		"go",
		"html",
		"java",
		"javascript",
		"json",
		"kotlin",
		"markdown",
		"python",
		"ruby",
		"rust",
		"sql",
		"swift",
		"toml",
		"typescript",
		"yaml",
	)
}

func tableColumnsValue() ValueSchema {
	column := objectValue(
		requiredField("key", "Stable column key.", labelValue()),
		requiredField("label", "Column header text.", labelValue()),
		optionalField("align", "Cell alignment. Defaults to start.", enumValue("start", "center", "end")),
	)
	return listValue(column, 1, MaxTableColumns)
}

func tableRowsValue() ValueSchema {
	return listValue(listValue(cellValue(), 1, MaxTableColumns), 1, MaxTableRows)
}

func chartSeriesValue() ValueSchema {
	point := objectValue(
		requiredField("label", "Category label on the shared axis.", labelValue()),
		requiredField("value", "Finite value at this point.", numberValue()),
	)
	series := objectValue(
		requiredField("name", "Series name shown in the legend.", labelValue()),
		requiredField("points", "Ordered points.", listValue(point, 1, MaxArrayEntries)),
	)
	return listValue(series, 1, MaxChartSeries)
}

func pieSlicesValue() ValueSchema {
	zero := 0.0
	slice := objectValue(
		requiredField("label", "Slice label.", labelValue()),
		requiredField("value", "Slice value; must not be negative.", ValueSchema{Kind: ValueKindNumber, Minimum: &zero}),
	)
	return listValue(slice, 1, MaxPieSlices)
}
