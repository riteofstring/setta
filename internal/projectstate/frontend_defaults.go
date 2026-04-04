package projectstate

func FrontendDefaultViewport() Viewport {
	return Viewport{
		X:    0,
		Y:    0,
		Zoom: 1,
	}
}

func FrontendDefaultTypeErrorIgnoreState() TypeErrorIgnoreState {
	return TypeErrorIgnoreState{
		Callable: false,
		Params:   map[string]bool{},
	}
}

func FrontendDefaultBrowserSavedSearchTypeFilters() BrowserSavedSearchTypeFilters {
	return BrowserSavedSearchTypeFilters{
		Image: true,
		Video: true,
		Audio: true,
		Text:  true,
		Data:  true,
	}
}

func FrontendDefaultBrowserSavedSearch() BrowserSavedSearch {
	typeFilters := FrontendDefaultBrowserSavedSearchTypeFilters()
	return BrowserSavedSearch{
		ID:          "",
		Name:        "",
		Query:       "",
		SearchScope: BrowserSearchScopeRecursive,
		TypeFilters: &typeFilters,
		Color:       "#3b82f6",
		QuickInfo:   "",
	}
}

func FrontendDefaultTaskBoardColumn() TaskBoardColumn {
	return TaskBoardColumn{
		ID:        "",
		Name:      "",
		Color:     "#3b82f6",
		SortIndex: 0,
	}
}

func FrontendDefaultTaskBoardTask() TaskBoardTask {
	return TaskBoardTask{
		ID:               "",
		Title:            "",
		Description:      "",
		Completed:        false,
		ColumnID:         nil,
		DueDateISO:       "",
		Recurrence:       "none",
		RecurrenceDays:   []string{},
		RecurrenceMonths: []string{},
		RecurrenceYears:  []int{},
		SortIndex:        0,
	}
}

func FrontendDefaultDrawAreaLayerItem() DrawAreaLayerItem {
	return DrawAreaLayerItem{
		Type:        DrawAreaLayerItemTypeBrushStroke,
		DataPath:    "",
		TransformID: "",
	}
}

func FrontendDefaultLineChartSettings() map[string]any {
	return map[string]any{
		"type":               ChartTypeLine,
		"xAxisColumn":        nil,
		"secondYAxisColumns": []string{},
		"xAxisLog":           false,
		"y1AxisLog":          false,
		"y2AxisLog":          false,
	}
}

func FrontendDefaultScatterChartSettings() map[string]any {
	return map[string]any{
		"type":           ChartTypeScatter,
		"xAxisColumn":    nil,
		"categoryColumn": nil,
		"xAxisLog":       false,
		"yAxisLog":       false,
	}
}
