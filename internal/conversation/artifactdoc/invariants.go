package artifactdoc

import "fmt"

// validateInvariants enforces the rules that span more than one property, which
// a per-value schema cannot express: a table's rows have to match its columns,
// and a chart's series have to share one category axis.
func (builder *compiler) validateInvariants(node Node, position Position, context scope) {
	switch node.Component {
	case ComponentTable:
		builder.validateTable(node, position, context)
	case ComponentBarChart, ComponentLineChart, ComponentAreaChart:
		builder.validateChart(node, position, context)
	}
}

func (builder *compiler) validateTable(node Node, position Position, context scope) {
	columns, columnsOK := listProperty(node, "columns")
	rows, rowsOK := listProperty(node, "rows")
	if !columnsOK || !rowsOK {
		return
	}
	builder.validateColumnKeys(columns, position, context.inProperty(node.Component, "columns"))
	rowContext := context.inProperty(node.Component, "rows")
	for index, entry := range rows {
		cells, ok := entry.([]any)
		if !ok || len(cells) == len(columns) {
			continue
		}
		builder.failAt(CodeRowWidthMismatch, position, rowContext,
			fmt.Sprintf("row %d has %d cells but the table has %d columns", index+1, len(cells), len(columns)),
			"give every row one cell per column, in column order, using an empty string for a blank cell")
		return
	}
}

func (builder *compiler) validateColumnKeys(columns []any, position Position, context scope) {
	seen := make(map[string]bool, len(columns))
	for _, entry := range columns {
		key, ok := stringField(entry, "key")
		if !ok {
			continue
		}
		if seen[key] {
			builder.failAt(CodeInvalidValue, position, context,
				fmt.Sprintf("the column key %q is used twice", key),
				"give every column a distinct key")
			return
		}
		seen[key] = true
	}
}

func (builder *compiler) validateChart(node Node, position Position, context scope) {
	series, ok := listProperty(node, "series")
	if !ok {
		return
	}
	context = context.inProperty(node.Component, "series")
	if !builder.validateChartPointBudget(series, position, context) {
		return
	}
	if !builder.validateSeriesNames(series, position, context) {
		return
	}
	builder.validateSharedCategories(series, position, context)
}

func (builder *compiler) validateChartPointBudget(series []any, position Position, context scope) bool {
	total := 0
	for _, entry := range series {
		points, ok := listField(entry, "points")
		if !ok {
			continue
		}
		total += len(points)
	}
	if total <= MaxChartPoints {
		return true
	}
	builder.failAt(CodeLimitExceeded, position, context,
		fmt.Sprintf("the chart plots %d points, over the %d point limit", total, MaxChartPoints),
		fmt.Sprintf("plot at most %d points in total, aggregating or splitting the rest", MaxChartPoints))
	return false
}

func (builder *compiler) validateSeriesNames(series []any, position Position, context scope) bool {
	seen := make(map[string]bool, len(series))
	for _, entry := range series {
		name, ok := stringField(entry, "name")
		if !ok {
			continue
		}
		if seen[name] {
			builder.failAt(CodeInvalidValue, position, context,
				fmt.Sprintf("the series name %q is used twice", name),
				"give every series a distinct name")
			return false
		}
		seen[name] = true
	}
	return true
}

// validateSharedCategories keeps every series on one category axis, because a
// grouped chart whose series disagree about their labels cannot be plotted
// without inventing data.
func (builder *compiler) validateSharedCategories(series []any, position Position, context scope) {
	var expected []string
	for index, entry := range series {
		labels, ok := categoryLabels(entry)
		if !ok {
			return
		}
		if index == 0 {
			expected = labels
			continue
		}
		if !sameStrings(expected, labels) {
			builder.failAt(CodeInvalidValue, position, context,
				"the chart series do not share the same point labels in the same order",
				"give every series the same ordered labels, using a zero value where a series has no data")
			return
		}
	}
}

func categoryLabels(entry any) ([]string, bool) {
	points, ok := listField(entry, "points")
	if !ok {
		return nil, false
	}
	labels := make([]string, 0, len(points))
	for _, point := range points {
		label, ok := stringField(point, "label")
		if !ok {
			return nil, false
		}
		labels = append(labels, label)
	}
	return labels, true
}

func sameStrings(left []string, right []string) bool {
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

func listProperty(node Node, name string) ([]any, bool) {
	value, present := node.Props[name]
	if !present {
		return nil, false
	}
	entries, ok := value.([]any)
	return entries, ok
}

func listField(entry any, name string) ([]any, bool) {
	object, ok := entry.(map[string]any)
	if !ok {
		return nil, false
	}
	value, present := object[name]
	if !present {
		return nil, false
	}
	entries, ok := value.([]any)
	return entries, ok
}

func stringField(entry any, name string) (string, bool) {
	object, ok := entry.(map[string]any)
	if !ok {
		return "", false
	}
	value, present := object[name]
	if !present {
		return "", false
	}
	text, ok := value.(string)
	return text, ok
}
