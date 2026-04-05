package projectstate

type LineChartSettings struct {
	Type               ChartType `json:"type" py_default:"ChartType.line"`
	XAxisColumn        *string   `json:"xAxisColumn,omitempty"`
	SecondYAxisColumns []string  `json:"secondYAxisColumns" py_default:"factory:list"`
	XAxisLog           bool      `json:"xAxisLog" py_default:"False"`
	Y1AxisLog          bool      `json:"y1AxisLog" py_default:"False"`
	Y2AxisLog          bool      `json:"y2AxisLog" py_default:"False"`
}

type ScatterChartSettings struct {
	Type           ChartType `json:"type" py_default:"ChartType.scatter"`
	XAxisColumn    *string   `json:"xAxisColumn,omitempty"`
	CategoryColumn *string   `json:"categoryColumn,omitempty"`
	XAxisLog       bool      `json:"xAxisLog" py_default:"False"`
	YAxisLog       bool      `json:"yAxisLog" py_default:"False"`
}
