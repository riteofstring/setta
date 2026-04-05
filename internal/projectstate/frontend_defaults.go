package projectstate

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
)

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

func FrontendDefaultChatWindowBounds() ChatWindowBounds {
	return DefaultChatWindowBounds()
}

func FrontendDefaultNormalizedFloatingWindowBounds() NormalizedFloatingWindowBounds {
	return DefaultNormalizedFloatingWindowBounds()
}

func FrontendDefaultProjectChatWindowingState() ProjectChatWindowingState {
	return DefaultProjectChatWindowingState()
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

func FrontendSectionImplDefaultValue(implType string) (any, error) {
	switch strings.TrimSpace(implType) {
	case "Browser":
		return frontendSectionImplDefaultValue[FrontendBrowserSectionImpl](
			FrontendSectionTypeBrowser,
			createdBrowserSectionDefaults(),
		)
	case "Callable":
		return frontendSectionImplDefaultValue[FrontendCallableSectionImpl](
			FrontendSectionTypeCallable,
			createdCallableSectionDefaults(),
		)
	case "Chart":
		return frontendSectionImplDefaultValue[FrontendChartSectionImpl](
			FrontendSectionTypeChart,
			createdFrontendChartSectionDefaults(),
		)
	case "Chat":
		return frontendSectionImplDefaultValue[FrontendChatSectionImpl](
			FrontendSectionTypeChat,
			createdChatSectionDefaults(),
		)
	case "Code":
		return frontendSectionImplDefaultValue[FrontendCodeSectionImpl](
			FrontendSectionTypeCode,
			createdCodeSectionDefaults(),
		)
	case "Dict":
		return frontendSectionImplDefaultValue[FrontendDictSectionImpl](
			FrontendSectionTypeDict,
			createdDictSectionDefaults(),
		)
	case "Group":
		return frontendSectionImplDefaultValue[FrontendGroupSectionImpl](
			FrontendSectionTypeGroup,
			createdGroupSectionDefaults(),
		)
	case "ListRoot":
		return frontendSectionImplDefaultValue[FrontendListRootSectionImpl](
			FrontendSectionTypeListRoot,
			createdListRootSectionDefaults(),
		)
	case "Prompt":
		return frontendSectionImplDefaultValue[FrontendPromptSectionImpl](
			FrontendSectionTypePrompt,
			createdPromptSectionDefaults(),
		)
	case "Spreadsheet":
		return frontendSectionImplDefaultValue[FrontendSpreadsheetSectionImpl](
			FrontendSectionTypeSpreadsheet,
			createdSpreadsheetSectionDefaults(),
		)
	case "StateMachineEnd":
		return frontendSectionImplDefaultValue[FrontendStateMachineEndSectionImpl](
			FrontendSectionTypeStateMachineEnd,
			createdStateMachineEndSectionDefaults(""),
		)
	case "StateMachineGate":
		return frontendSectionImplDefaultValue[FrontendStateMachineGateSectionImpl](
			FrontendSectionTypeStateMachineGate,
			createdStateMachineGateSectionDefaults(""),
		)
	case "StateMachineStart":
		return frontendSectionImplDefaultValue[FrontendStateMachineStartSectionImpl](
			FrontendSectionTypeStateMachineStart,
			createdStateMachineStartSectionDefaults(""),
		)
	case "TaskBoard":
		return frontendSectionImplDefaultValue[FrontendTaskBoardSectionImpl](
			FrontendSectionTypeTaskBoard,
			createdTaskBoardSectionDefaults(),
		)
	case "Terminal":
		return frontendSectionImplDefaultValue[FrontendTerminalSectionImpl](
			FrontendSectionTypeTerminal,
			createdTerminalSectionDefaults(),
		)
	case "TextBlock":
		return frontendSectionImplDefaultValue[FrontendTextBlockSectionImpl](
			FrontendSectionTypeTextBlock,
			createdTextBlockSectionDefaults(),
		)
	default:
		return nil, fmt.Errorf("%w: %q", ErrTopLevelSectionImplTypeUnsupported, implType)
	}
}

func frontendSectionImplDefaultValue[T any](
	sectionType FrontendSectionType,
	defaults map[string]any,
) (T, error) {
	var value T
	payload, err := json.Marshal(defaults)
	if err != nil {
		return value, fmt.Errorf("marshal frontend section defaults %s: %w", sectionType, err)
	}
	if err := json.Unmarshal(payload, &value); err != nil {
		return value, fmt.Errorf("decode frontend section defaults %s: %w", sectionType, err)
	}
	if err := applyFrontendSectionImplBaseDefaults(sectionType, &value); err != nil {
		return value, err
	}
	return value, nil
}

var frontendBaseSectionImplType = reflect.TypeOf(FrontendBaseSectionImpl{})

func applyFrontendSectionImplBaseDefaults(
	sectionType FrontendSectionType,
	target any,
) error {
	value := reflect.ValueOf(target)
	if !value.IsValid() || value.Kind() != reflect.Pointer || value.IsNil() {
		return fmt.Errorf("frontend section defaults %s require a non-nil pointer target", sectionType)
	}
	base, ok := frontendBaseSectionImplField(value.Elem())
	if !ok {
		return fmt.Errorf("frontend section defaults %s are missing FrontendBaseSectionImpl", sectionType)
	}
	base.FieldByName("Type").Set(reflect.ValueOf(sectionType))
	base.FieldByName("ID").SetString("")
	return nil
}

func frontendBaseSectionImplField(value reflect.Value) (reflect.Value, bool) {
	for value.IsValid() && value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return reflect.Value{}, false
		}
		value = value.Elem()
	}
	if !value.IsValid() || value.Kind() != reflect.Struct {
		return reflect.Value{}, false
	}
	valueType := value.Type()
	for fieldIndex := 0; fieldIndex < valueType.NumField(); fieldIndex++ {
		fieldType := valueType.Field(fieldIndex)
		fieldValue := value.Field(fieldIndex)
		if fieldType.Type == frontendBaseSectionImplType {
			return fieldValue, true
		}
		if !fieldType.Anonymous {
			continue
		}
		if embedded, ok := frontendBaseSectionImplField(fieldValue); ok {
			return embedded, true
		}
	}
	return reflect.Value{}, false
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
