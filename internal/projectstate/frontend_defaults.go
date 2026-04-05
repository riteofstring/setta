package projectstate

func FrontendDefaultViewport() Viewport {
	return Viewport{
		X:    0,
		Y:    0,
		Zoom: 1,
	}
}

func FrontendDefaultTopLevelSectionLayout() TopLevelSectionLayout {
	return TopLevelSectionLayout{
		X: 0,
		Y: 0,
	}
}

func FrontendDefaultViewMode() ViewMode {
	return ViewMode{
		ID:                    "",
		Name:                  "",
		VisibilityBySectionID: map[string]bool{},
		TopLevelSections:      map[string]TopLevelSectionLayout{},
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

func FrontendDefaultLineChartSettings() LineChartSettings {
	return LineChartSettings{
		Type:               ChartTypeLine,
		SecondYAxisColumns: []string{},
	}
}

func FrontendDefaultScatterChartSettings() ScatterChartSettings {
	return ScatterChartSettings{
		Type: ChartTypeScatter,
	}
}

func FrontendDefaultChatWindowDockMetrics() ChatWindowDockMetrics {
	return ChatWindowDockMetrics{}
}

func FrontendDefaultProjectChatWindowInstance() ProjectChatWindowInstance {
	return ProjectChatWindowInstance{
		InstanceID:  "",
		Placement:   ChatWindowPlacementBottomDocked,
		Bounds:      DefaultChatWindowBounds(),
		DockMetrics: FrontendDefaultChatWindowDockMetrics(),
		Mode:        ChatWindowModeProjectAI,
	}
}

func FrontendDefaultWindowSpaceWindow() WindowSpaceWindow {
	return WindowSpaceWindow{
		SurfaceKind:      WindowSpaceSurfaceKindProjectChat,
		Mode:             ChatWindowModeProjectAI,
		NormalizedBounds: DefaultNormalizedFloatingWindowBounds(),
	}
}

func FrontendDefaultWindowSpaceState() WindowSpaceState {
	return WindowSpaceState{
		WindowsByID: map[string]WindowSpaceWindow{},
		Order:       []string{},
	}
}

func FrontendDefaultWindowSpaceConfig() WindowSpaceConfig {
	defaults := FrontendDefaultWindowSpaceState()
	return WindowSpaceConfig{
		WindowsByID: defaults.WindowsByID,
		Order:       defaults.Order,
		ID:          "",
		Name:        "",
	}
}

func FrontendDefaultClipboardProjectStateCore() ClipboardProjectStateCore {
	return ClipboardProjectStateCore{
		Sections:        map[string]Section{},
		SectionImpls:    map[string]SectionImpl{},
		SectionVariants: map[string]SectionVariant{},
		CodeObjs:        map[string]CodeObject{},
		CodeObjImpls:    map[string]CodeObjectImpl{},
		CodeObjVariants: map[string]CodeObjectVariant{},
	}
}

func FrontendDefaultClipboardProjectStateCoreWithSectionVariantMap() ClipboardProjectStateCoreWithSectionVariantMap {
	return ClipboardProjectStateCoreWithSectionVariantMap{
		Core:              FrontendDefaultClipboardProjectStateCore(),
		SectionVariantMap: map[string]string{},
	}
}

func FrontendDefaultSectionsClipboardData() SectionsClipboardData {
	return SectionsClipboardData{
		Type: ClipboardDataTypeSections,
		Data: FrontendDefaultClipboardProjectStateCoreWithSectionVariantMap(),
	}
}

func FrontendDefaultCodeParamCodeObjImpl() FrontendCodeParamCodeObjImpl {
	return FrontendCodeParamCodeObjImpl{
		FrontendBaseValueParamCodeObjImpl: FrontendBaseValueParamCodeObjImpl{
			FrontendBaseParamCodeObjImpl: FrontendBaseParamCodeObjImpl{
				FrontendBaseCodeObjImpl: FrontendBaseCodeObjImpl{
					Type:        FrontendCodeObjTypeCodeParam,
					ID:          "",
					Name:        "",
					Description: "",
					IsPreset:    false,
				},
				FrontendParamCodeObjFields: FrontendParamCodeObjFields{
					CoreNameType:     FrontendParamNameTypeText,
					CoreNameEditable: false,
					PassingStyle:     FrontendParameterPassingStyleDefault,
					TypeAnnotation:   "",
				},
			},
			DefaultVal: "",
			Value:      "",
		},
	}
}

func FrontendDefaultSectionSize() SectionSize {
	return SectionSize{
		Width:  AutoSectionSizeValue(),
		Height: AutoSectionSizeValue(),
	}
}

func FrontendDefaultStateMachineGateUIState() StateMachineGateUIState {
	return StateMachineGateUIState{}
}

func FrontendDefaultStateMachineSourceFilter() StateMachineSourceFilter {
	return StateMachineSourceFilter{
		Type: StateMachineSourceFilterTypeRunCompleted,
	}
}

func FrontendDefaultStateMachineSourceActivationCountCondition() StateMachineSourceActivationCountCondition {
	return StateMachineSourceActivationCountCondition{
		Operator: StateMachineCountOperatorEQ,
		Value:    0,
	}
}

func FrontendDefaultStateMachineTargetAction() StateMachineTargetAction {
	return StateMachineTargetAction{
		Type:           StateMachineTargetActionTypeSendPrompt,
		PromptInputs:   map[string]string{},
		ThreadStrategy: StateMachineThreadStrategyContinueCurrentThread,
	}
}

func FrontendDefaultStateMachineEdge() StateMachineEdge {
	return StateMachineEdge{
		ID:              "",
		MachineGroupID:  "",
		SourceSectionID: "",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "",
		TargetPortID:    StateMachineEdgeTargetPortID,
	}
}

func FrontendDefaultAgenticEdge() AgenticEdge {
	return AgenticEdge{
		ID:              "",
		SourceSectionID: "",
		TargetSectionID: "",
		Kind:            AgenticEdgeKindSectionChat,
		ContextMode:     AgenticEdgeContextModeReferenceOnly,
		Style:           RawJSON([]byte(`{}`)),
		Hidden:          false,
		ZIndex:          0,
		Selected:        false,
	}
}
