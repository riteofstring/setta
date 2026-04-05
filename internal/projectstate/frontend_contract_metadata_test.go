package projectstate

import (
	"reflect"
	"testing"
)

func TestFrontendDefaultsMaterializeGeneratorValues(t *testing.T) {
	viewMode := FrontendDefaultViewMode()
	if viewMode.SortIndex != 0 || viewMode.IsUserFacing || viewMode.IsTab {
		t.Fatalf("unexpected view mode defaults: %#v", viewMode)
	}
	if viewMode.VisibilityBySectionID == nil {
		t.Fatal("expected view mode visibility map to be initialized")
	}
	if viewMode.TopLevelSections == nil {
		t.Fatal("expected view mode top-level sections map to be initialized")
	}
	if viewMode.Viewport != nil {
		t.Fatalf("expected view mode viewport to default to nil, got %#v", viewMode.Viewport)
	}

	clipboard := FrontendDefaultSectionsClipboardData()
	if clipboard.Type != ClipboardDataTypeSections {
		t.Fatalf("expected clipboard type %q, got %q", ClipboardDataTypeSections, clipboard.Type)
	}
	if clipboard.Data.Core.Sections == nil || clipboard.Data.Core.SectionImpls == nil || clipboard.Data.SectionVariantMap == nil {
		t.Fatalf("expected clipboard defaults to initialize maps, got %#v", clipboard)
	}

	window := FrontendDefaultWindowSpaceWindow()
	if window.SurfaceKind != WindowSpaceSurfaceKindProjectChat || window.Mode != ChatWindowModeProjectAI {
		t.Fatalf("unexpected window space defaults: %#v", window)
	}
	if !reflect.DeepEqual(window.NormalizedBounds, DefaultNormalizedFloatingWindowBounds()) {
		t.Fatalf("expected default normalized bounds, got %#v", window.NormalizedBounds)
	}
	if !reflect.DeepEqual(FrontendDefaultChatWindowBounds(), DefaultChatWindowBounds()) {
		t.Fatalf("expected chat window bounds defaults to mirror owner defaults")
	}
	if !reflect.DeepEqual(FrontendDefaultNormalizedFloatingWindowBounds(), DefaultNormalizedFloatingWindowBounds()) {
		t.Fatalf("expected normalized floating bounds defaults to mirror owner defaults")
	}
	if !reflect.DeepEqual(FrontendDefaultProjectChatWindowingState(), DefaultProjectChatWindowingState()) {
		t.Fatalf("expected project chat windowing defaults to mirror owner defaults")
	}

	action := FrontendDefaultStateMachineTargetAction()
	if action.Type != StateMachineTargetActionTypeSendPrompt {
		t.Fatalf("expected default target action type %q, got %q", StateMachineTargetActionTypeSendPrompt, action.Type)
	}
	if action.ThreadStrategy != StateMachineThreadStrategyContinueCurrentThread {
		t.Fatalf("expected default thread strategy %q, got %q", StateMachineThreadStrategyContinueCurrentThread, action.ThreadStrategy)
	}
	if action.PromptInputs == nil {
		t.Fatal("expected default prompt inputs map to be initialized")
	}
}

func TestFrontendBindingTagsLiveOnOwnerTypes(t *testing.T) {
	type tagExpectation struct {
		typ      reflect.Type
		field    string
		tagName  string
		tagValue string
	}

	expectations := []tagExpectation{
		{typ: reflect.TypeOf(ViewMode{}), field: "SortIndex", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(AgenticEdge{}), field: "Style", tagName: "ts_type", tagValue: "Record<string, unknown>"},
		{typ: reflect.TypeOf(ClipboardProjectStateCore{}), field: "Sections", tagName: "ts_type", tagValue: "Record<string, Core>"},
		{typ: reflect.TypeOf(ClipboardProjectStateCore{}), field: "Sections", tagName: "ts_optional", tagValue: "false"},
		{typ: reflect.TypeOf(ClipboardProjectStateCoreWithSectionVariantMap{}), field: "SectionVariantMap", tagName: "ts_optional", tagValue: "false"},
		{typ: reflect.TypeOf(SectionsClipboardData{}), field: "Type", tagName: "ts_type", tagValue: "typeof ClipboardDataTypeEnum.Sections"},
		{typ: reflect.TypeOf(DrawAreaLayerItem{}), field: "Type", tagName: "ts_type", tagValue: "typeof ArtifactTypeEnum.Image | typeof ArtifactTypeEnum.BrushStroke"},
		{typ: reflect.TypeOf(TaskBoardTask{}), field: "ColumnID", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(TaskBoardTask{}), field: "Recurrence", tagName: "ts_type", tagValue: "TaskBoardTaskRecurrence"},
		{typ: reflect.TypeOf(WatchCodeRegistryEntry{}), field: "Kind", tagName: "ts_type", tagValue: "string"},
		{typ: reflect.TypeOf(FrontendCodeFileBinding{}), field: "AccessMode", tagName: "ts_type", tagValue: "CodeFileAccessMode"},
		{typ: reflect.TypeOf(CodeSectionDiagnosticsIgnoreState{}), field: "SuppressedCodes", tagName: "ts_type", tagValue: "Array<string | number>"},
		{typ: reflect.TypeOf(StateMachineSourceFilter{}), field: "Type", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(StateMachineTargetAction{}), field: "ThreadStrategy", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(StateMachineEdge{}), field: "Style", tagName: "ts_type", tagValue: "Record<string, unknown> | null"},
		{typ: reflect.TypeOf(LineChartSettings{}), field: "Type", tagName: "ts_type", tagValue: "typeof ChartTypeEnum.line"},
		{typ: reflect.TypeOf(ScatterChartSettings{}), field: "Type", tagName: "ts_type", tagValue: "typeof ChartTypeEnum.scatter"},
		{typ: reflect.TypeOf(BrowserSavedSearch{}), field: "TypeFilters", tagName: "ts_type", tagValue: "BrowserSavedSearchTypeFilters"},
		{typ: reflect.TypeOf(SectionSize{}), field: "Width", tagName: "json", tagValue: "width"},
		{typ: reflect.TypeOf(SectionSize{}), field: "Width", tagName: "ts_create_expr", tagValue: "SectionSizeModeEnum.auto"},
		{typ: reflect.TypeOf(SectionSize{}), field: "Height", tagName: "json", tagValue: "height"},
		{typ: reflect.TypeOf(SectionSize{}), field: "Height", tagName: "ts_create_expr", tagValue: "SectionSizeModeEnum.auto"},
	}

	for _, expectation := range expectations {
		field, ok := expectation.typ.FieldByName(expectation.field)
		if !ok {
			t.Fatalf("%s.%s field not found", expectation.typ.Name(), expectation.field)
		}
		if got := field.Tag.Get(expectation.tagName); got != expectation.tagValue {
			t.Fatalf(
				"%s.%s tag %q = %q, want %q",
				expectation.typ.Name(),
				expectation.field,
				expectation.tagName,
				got,
				expectation.tagValue,
			)
		}
	}
}
