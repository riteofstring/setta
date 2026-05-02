package projectstate

import (
	"errors"
	"fmt"

	"setta/internal/prompttemplates"
)

func buildCreatedSectionObject(
	implID string,
	implType string,
	base map[string]any,
	settings StructuralMutationSettings,
	overrides map[string]any,
) (map[string]any, error) {
	payload := cloneProjectObject(base)
	if defaults, ok := settings.SectionDefaultsByType[implType]; ok {
		payload = mergeProjectObjects(payload, defaults)
	}
	if len(overrides) != 0 {
		payload = mergeProjectObjects(payload, overrides)
	}
	if rawBinding, ok := payload["codeFileBinding"]; ok && rawBinding == nil {
		delete(payload, "codeFileBinding")
	}
	payload["id"] = implID
	payload["type"] = implType
	return payload, nil
}

func createdBaseSectionDefaults(implType string) map[string]any {
	return map[string]any{
		"name":                    "",
		"isFrozen":                false,
		"isInOtherProjectConfigs": false,
		"tagColor":                nil,
		"styleColor":              nil,
		"size":                    createdSectionSizeDefaults(implType),
		"aspectRatio":             false,
		"aspectRatioExtraHeight":  0,
		"aspectRatioExtraWidth":   0,
		"isMinimized":             false,
		"positionAndSizeLocked":   false,
		"isPreset":                false,
	}
}

func createdSectionSizeDefaults(implType string) map[string]any {
	switch implType {
	case "Chat":
		return map[string]any{"width": 400.0, "height": 200.0}
	case "Browser":
		return map[string]any{"width": 720.0, "height": 460.0}
	case "Chart":
		return map[string]any{"width": 300.0, "height": 300.0}
	case "Code", "GenPythonCode", "GenPythonMetadata", "TextBlock":
		return map[string]any{"width": 500.0, "height": 150.0}
	case "Draw":
		return map[string]any{"width": 402.0, "height": 100.0}
	case "Prompt":
		return map[string]any{"width": 300.0, "height": 150.0}
	case "Spreadsheet":
		return map[string]any{"width": 760.0, "height": 500.0}
	case "TaskBoard":
		return map[string]any{"width": 720.0, "height": 430.0}
	default:
		return map[string]any{"width": 250.0, "height": 150.0}
	}
}

func createdBaseSectionWithParamsDefaults(implType string) map[string]any {
	defaults := createdBaseSectionDefaults(implType)
	return applySectionWithParamsDefaults(defaults, true)
}

func applySectionWithParamsDefaults(
	defaults map[string]any,
	includeConfigLanguage bool,
) map[string]any {
	defaults["codeObjVariantMap"] = map[string]any{}
	defaults["hideUnpinnedParams"] = false
	defaults["paramFilter"] = ""
	defaults["columnWidth"] = nil
	if includeConfigLanguage {
		defaults["configLanguage"] = "python"
	}
	defaults["pinnedParams"] = []any{}
	defaults["selectedParams"] = []any{}
	defaults["ignoreTypeErrors"] = map[string]any{
		"callable": false,
		"params":   map[string]any{},
	}
	defaults["edgeInputParams"] = []any{}
	defaults["edgeOutputPorts"] = []any{}
	return defaults
}

func createdBaseParentSectionDefaults(implType string) map[string]any {
	defaults := createdBaseSectionDefaults(implType)
	defaults["children"] = []any{}
	return defaults
}

func createdBaseCodeSectionLikeDefaults(implType string) map[string]any {
	defaults := createdBaseParentSectionDefaults(implType)
	defaults["code"] = ""
	defaults["codeFileBinding"] = nil
	defaults["attachedTerminalSectionId"] = nil
	return defaults
}

func createdCallableSectionDefaults() map[string]any {
	defaults := createdBaseSectionWithParamsDefaults("Callable")
	defaults["callable"] = nil
	defaults["hideParams"] = false
	return defaults
}

func createdListRootSectionDefaults() map[string]any {
	defaults := createdBaseParentSectionDefaults("ListRoot")
	defaults["defaultChildSectionType"] = "Callable"
	defaults["viewMode"] = string(ListRootViewModeDefault)
	return defaults
}

func createdChatSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Chat")
	defaults["managed"] = false
	defaults["engineConfigId"] = nil
	defaults["transcriptionProfileId"] = nil
	defaults["agentProfileId"] = nil
	defaults["chatId"] = nil
	defaults["thinking"] = true
	defaults["permissionMode"] = "minimal"
	defaults["searchEnabled"] = true
	defaults["dictationMode"] = "auto"
	defaults["messages"] = []any{}
	defaults["inputText"] = ""
	defaults["waitingForResponse"] = false
	defaults["toolCallArguments"] = map[string]any{}
	defaults["activeBranchId"] = nil
	defaults["branches"] = map[string]any{}
	return defaults
}

func createdCodeSectionDefaults() map[string]any {
	defaults := createdBaseCodeSectionLikeDefaults("Code")
	defaults["codeLanguage"] = "python"
	defaults["diagnosticsIgnoreState"] = map[string]any{
		"muted":           false,
		"suppressedCodes": []any{},
	}
	return defaults
}

func createdGeneratedCodeSectionDefaults(implType string) map[string]any {
	return createdBaseCodeSectionLikeDefaults(implType)
}

func createdDictSectionDefaults() map[string]any {
	defaults := createdBaseSectionWithParamsDefaults("Dict")
	defaults["children"] = []any{}
	defaults["topLevelParamId"] = nil
	defaults["isJsonSource"] = false
	defaults["jsonSourceKeys"] = []any{}
	defaults["jsonSourceMissing"] = false
	return defaults
}

func createdGlobalVariablesSectionDefaults() map[string]any {
	return createdDictSectionDefaults()
}

func createdGroupSectionDefaults() map[string]any {
	defaults := createdBaseParentSectionDefaults("Group")
	defaults["isHorizontalOrientation"] = false
	defaults["overflowMode"] = false
	defaults["defaultChildSectionType"] = "Callable"
	return defaults
}

func createdMetaControlSectionDefaults(paramID string, paramVariantID string) map[string]any {
	defaults := applySectionWithParamsDefaults(
		createdBaseSectionDefaults("MetaControl"),
		false,
	)
	defaults["metaControlParamId"] = paramID
	if paramID != "" && paramVariantID != "" {
		defaults["codeObjVariantMap"] = map[string]any{
			paramID: paramVariantID,
		}
	}
	defaults["showSectionTitle"] = false
	return defaults
}

func createdImageSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Image")
	defaults["imagePath"] = ""
	return defaults
}

func createdChartSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Chart")
	defaults["dataPath"] = ""
	defaults["chartSettings"] = chartSettingsObject(defaultChartSettingsState(ChartTypeLine))
	return defaults
}

func createdFrontendChartSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Chart")
	defaults["dataPath"] = ""
	defaults["chartSettings"] = frontendChartSettingsObject(defaultChartSettingsState(ChartTypeLine))
	return defaults
}

func createdDrawSectionDefaults() map[string]any {
	layer, err := newCreatedDrawLayer()
	if err != nil {
		panic(err)
	}
	defaults := createdBaseSectionDefaults("Draw")
	defaults["layers"] = []any{layer}
	defaults["renderedImagePath"] = nil
	defaults["activeLayerIdx"] = 0
	defaults["brushColor"] = "#ff0000"
	defaults["brushSize"] = 16
	defaults["brushShape"] = "butt"
	defaults["brushOpacity"] = 1.0
	defaults["eraserBrushSize"] = 16
	defaults["drawThrottleDelay"] = 0
	defaults["canvasMode"] = "draw"
	defaults["colorChoices"] = []any{}
	return defaults
}

func createdTerminalSectionDefaults() map[string]any {
	return createdBaseSectionDefaults("Terminal")
}

func createdTextBlockSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("TextBlock")
	defaults["format"] = "Plaintext"
	defaults["masterFontSizePx"] = 14
	defaults["headingAsSectionName"] = false
	defaults["metaControlStyle"] = false
	defaults["textDisplayMode"] = "Render"
	defaults["text"] = ""
	return defaults
}

func createdPromptSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Prompt")
	defaults["promptTemplateId"] = nil
	defaults["template"] = ""
	defaults["format"] = string(prompttemplates.FormatJinja)
	defaults["inputs"] = map[string]any{}
	defaults["renderedText"] = ""
	defaults["missingVariables"] = []any{}
	defaults["renderError"] = nil
	return defaults
}

func createdSocialSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Social")
	defaults["url"] = ""
	return defaults
}

func createdIFrameSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("IFrame")
	defaults["code"] = ""
	return defaults
}

func createdBrowserSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Browser")
	defaults["folder"] = ""
	defaults["hideColumn"] = false
	defaults["columnWidth"] = nil
	defaults["typesColumnWidth"] = nil
	defaults["viewMode"] = string(BrowserAreaViewModeList)
	defaults["savedSearches"] = []any{}
	return defaults
}

func createdPluginSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Plugin")
	defaults["pluginId"] = ""
	defaults["kind"] = "default"
	defaults["data"] = map[string]any{}
	defaults["schemaVersion"] = nil
	return defaults
}

func createdTaskBoardSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("TaskBoard")
	defaults["viewMode"] = string(TaskBoardViewModeKanban)
	defaults["columns"] = nil
	defaults["tasks"] = []any{}
	return defaults
}

func newCreatedDrawLayer() (map[string]any, error) {
	layerName, err := generateMemorableString()
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"name":         layerName,
		"elements":     []any{},
		"visible":      true,
		"layerOpacity": 1.0,
	}, nil
}

func initializeCreatedDrawSectionObject(payload map[string]any) error {
	layer, err := newCreatedDrawLayer()
	if err != nil {
		return err
	}
	payload["layers"] = []any{layer}
	return nil
}

func initializeCreatedTaskBoardColumns(
	payload map[string]any,
	settings StructuralMutationSettings,
	overrides map[string]any,
) error {
	if taskBoardColumnsExplicitlyOverridden(overrides) {
		return nil
	}
	settingsDefaults, ok := settings.SectionDefaultsByType["TaskBoard"]
	if !ok || settingsDefaults["columns"] != nil {
		return nil
	}
	todoColumn, err := newCreatedTaskBoardColumnPayload("Todo", "#3b82f6", 0)
	if err != nil {
		return err
	}
	doingColumn, err := newCreatedTaskBoardColumnPayload("Doing", "#a855f7", 1)
	if err != nil {
		return err
	}
	doneColumn, err := newCreatedTaskBoardColumnPayload("Done", "#10b981", 2)
	if err != nil {
		return err
	}
	payload["columns"] = []any{
		todoColumn,
		doingColumn,
		doneColumn,
	}
	return nil
}

func taskBoardColumnsExplicitlyOverridden(overrides map[string]any) bool {
	if len(overrides) == 0 {
		return false
	}
	_, ok := overrides["columns"]
	return ok
}

func newCreatedTaskBoardColumnPayload(name string, color string, sortIndex int) (map[string]any, error) {
	columnID, err := newProjectStateID()
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id":        columnID,
		"name":      name,
		"color":     color,
		"sortIndex": sortIndex,
	}, nil
}

func createdSpreadsheetSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Spreadsheet")
	defaults["filePath"] = ""
	defaults["activeSheet"] = nil
	defaults["readOnly"] = false
	defaults["showRowNumbers"] = true
	defaults["density"] = string(SpreadsheetGridDensityCompact)
	defaults["autoReloadOnExternalChange"] = false
	return defaults
}

func newMetaControlParam(controlType string) (CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	codeObjID, err := newProjectStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	variantID, err := newProjectStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	if !isSupportedMetaControlCodeObjType(controlType) {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, fmt.Errorf("%w: %q", ErrTopLevelMetaControlCodeObjTypeUnsupported, controlType)
	}
	impl, err := newCodeObjectImplForType(controlType)
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	name, err := generateMemorableString()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	return CodeObject{
			ID:               codeObjID,
			Name:             name,
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		},
		CodeObjectVariant{
			ID:               variantID,
			ImplID:           impl.ID,
			NonPresetImplIDs: []string{impl.ID},
		},
		impl,
		nil
}

func (p *Project) syncCreatedTextBlockSectionName(sectionID string) error {
	section, _, payload, err := p.resolveTextBlockMutationState(sectionID)
	if err != nil {
		if errors.Is(err, ErrTextBlockSectionRequired) {
			return nil
		}
		return err
	}
	if !payloadBoolField(payload, "headingAsSectionName") {
		return nil
	}
	return p.syncTextBlockSectionName(
		section.ID,
		payloadRawStringField(payload, "text"),
		payloadStringField(payload, "format"),
	)
}
