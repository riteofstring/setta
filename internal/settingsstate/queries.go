package settingsstate

import (
	"fmt"
	"math"
	"strings"

	"setta/internal/projectstate"
)

const DefaultAutoRefetchCallableParamsOnLSPMismatch = true

var sectionDefaultSettingsKeysByType = map[string]string{
	"Browser":           "browserSectionDefault",
	"Callable":          "callableSectionDefault",
	"Chart":             "chartSectionDefault",
	"Chat":              "chatSectionDefault",
	"Code":              "codeSectionDefault",
	"Dict":              "dictSectionDefault",
	"Draw":              "drawSectionDefault",
	"GenPythonCode":     "genPythonCodeSectionDefault",
	"GenPythonMetadata": "genPythonMetadataSectionDefault",
	"GlobalVariables":   "globalVariablesSectionDefault",
	"Group":             "groupSectionDefault",
	"IFrame":            "iFrameSectionDefault",
	"Image":             "imageSectionDefault",
	"ListRoot":          "listRootSectionDefault",
	"MetaControl":       "metaControlSectionDefault",
	"Plugin":            "pluginSectionDefault",
	"Prompt":            "promptSectionDefault",
	"Social":            "socialSectionDefault",
	"Spreadsheet":       "spreadsheetSectionDefault",
	"TaskBoard":         "taskBoardSectionDefault",
	"Terminal":          "terminalSectionDefault",
	"TextBlock":         "textBlockSectionDefault",
}

type RenameRefactorMode = projectstate.RenameRefactorMode

const (
	RenameRefactorModeAlwaysAsk    = projectstate.RenameRefactorModeAlwaysAsk
	RenameRefactorModeAlwaysRename = projectstate.RenameRefactorModeAlwaysRename
	RenameRefactorModeNeverRename  = projectstate.RenameRefactorModeNeverRename
	DefaultRenameRefactorMode      = projectstate.DefaultRenameRefactorMode
)

func AutoRefetchCallableParamsOnLSPMismatchEnabled(document Document) (bool, error) {
	if document == nil {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}

	backend, ok, err := objectField(document, "backend")
	if err != nil {
		return false, err
	}
	if !ok {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}

	value, ok, err := boolField(backend, "autoRefetchCallableParamsOnLspMismatch")
	if err != nil {
		return false, err
	}
	if !ok {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}
	return value, nil
}

func RenameRefactorModeForDocument(document Document) (projectstate.RenameRefactorMode, error) {
	if document == nil {
		return projectstate.DefaultRenameRefactorMode, nil
	}

	backend, ok, err := objectField(document, "backend")
	if err != nil {
		return "", err
	}
	if !ok {
		return projectstate.DefaultRenameRefactorMode, nil
	}

	value, ok, err := stringField(backend, "renameRefactorMode")
	if err != nil {
		return "", err
	}
	if !ok {
		return projectstate.DefaultRenameRefactorMode, nil
	}

	switch strings.ToUpper(strings.TrimSpace(value)) {
	case string(projectstate.RenameRefactorModeAlwaysAsk):
		return projectstate.RenameRefactorModeAlwaysAsk, nil
	case string(projectstate.RenameRefactorModeAlwaysRename):
		return projectstate.RenameRefactorModeAlwaysRename, nil
	case string(projectstate.RenameRefactorModeNeverRename):
		return projectstate.RenameRefactorModeNeverRename, nil
	default:
		return "", fmt.Errorf("%w: renameRefactorMode=%q", ErrSettingsValueInvalid, value)
	}
}

func StructuralMutationSettingsForDocument(document Document) (projectstate.StructuralMutationSettings, error) {
	settings := projectstate.DefaultStructuralMutationSettings()
	if document == nil {
		return settings, nil
	}

	sectionSizingPolicy, ok, err := objectField(document, "sectionSizingPolicy")
	if err != nil {
		return projectstate.StructuralMutationSettings{}, err
	}
	if ok {
		byType, ok, err := objectField(sectionSizingPolicy, "byType")
		if err != nil {
			return projectstate.StructuralMutationSettings{}, err
		}
		if ok {
			for sectionType, defaults := range settings.SectionSizingPolicy.ByType {
				typeObject, ok, err := objectField(byType, sectionType)
				if err != nil {
					return projectstate.StructuralMutationSettings{}, err
				}
				if !ok {
					continue
				}

				minWidth, err := resolveSectionSizingDimension(
					typeObject,
					"minWidth",
					defaults.MinWidth,
					fmt.Sprintf("sectionSizingPolicy.byType.%s.minWidth", sectionType),
				)
				if err != nil {
					return projectstate.StructuralMutationSettings{}, err
				}
				minHeight, err := resolveSectionSizingDimension(
					typeObject,
					"minHeight",
					defaults.MinHeight,
					fmt.Sprintf("sectionSizingPolicy.byType.%s.minHeight", sectionType),
				)
				if err != nil {
					return projectstate.StructuralMutationSettings{}, err
				}
				maxWidth, err := resolveSectionSizingDimension(
					typeObject,
					"maxWidth",
					defaults.MaxWidth,
					fmt.Sprintf("sectionSizingPolicy.byType.%s.maxWidth", sectionType),
				)
				if err != nil {
					return projectstate.StructuralMutationSettings{}, err
				}
				maxHeight, err := resolveSectionSizingDimension(
					typeObject,
					"maxHeight",
					defaults.MaxHeight,
					fmt.Sprintf("sectionSizingPolicy.byType.%s.maxHeight", sectionType),
				)
				if err != nil {
					return projectstate.StructuralMutationSettings{}, err
				}

				settings.SectionSizingPolicy.ByType[sectionType] = projectstate.AutoLayoutSectionMinDimensions{
					MinWidth:  math.Max(0, minWidth),
					MinHeight: math.Max(0, minHeight),
					MaxWidth:  maxWidth,
					MaxHeight: maxHeight,
				}
			}
		}
	}

	sectionDefaults, err := sectionCreateDefaultsForDocument(document)
	if err != nil {
		return projectstate.StructuralMutationSettings{}, err
	}
	settings.SectionDefaultsByType = sectionDefaults

	terminalDefaultHeight, err := terminalDefaultHeightForDocument(document)
	if err != nil {
		return projectstate.StructuralMutationSettings{}, err
	}
	settings.TerminalDefaultHeight = terminalDefaultHeight
	return settings, nil
}

func sectionCreateDefaultsForDocument(document Document) (map[string]map[string]any, error) {
	defaults := make(map[string]map[string]any, len(sectionDefaultSettingsKeysByType))
	for sectionType, settingsKey := range sectionDefaultSettingsKeysByType {
		sectionDefaults, ok, err := objectField(document, settingsKey)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		defaults[sectionType] = cloneMap(sectionDefaults)
	}
	return defaults, nil
}

func resolveSectionSizingDimension(
	object map[string]any,
	field string,
	fallback float64,
	fieldPath string,
) (float64, error) {
	value, ok, err := floatField(object, field)
	if err != nil {
		return 0, fmt.Errorf("%w: %s", err, fieldPath)
	}
	if !ok {
		return fallback, nil
	}
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, fmt.Errorf("%w: %s is not finite", ErrSettingsValueInvalid, fieldPath)
	}
	return value, nil
}

func terminalDefaultHeightForDocument(document Document) (float64, error) {
	defaults := projectstate.DefaultStructuralMutationSettings()
	if document == nil {
		return defaults.TerminalDefaultHeight, nil
	}

	terminalSectionDefault, ok, err := objectField(document, "terminalSectionDefault")
	if err != nil {
		return 0, err
	}
	if !ok {
		return defaults.TerminalDefaultHeight, nil
	}
	size, ok, err := objectField(terminalSectionDefault, "size")
	if err != nil {
		return 0, err
	}
	if !ok {
		return defaults.TerminalDefaultHeight, nil
	}
	rawValue, ok := size["height"]
	if !ok {
		return defaults.TerminalDefaultHeight, nil
	}
	if textValue, ok := rawValue.(string); ok {
		trimmed := strings.TrimSpace(textValue)
		if trimmed == "" {
			return defaults.TerminalDefaultHeight, nil
		}
		if strings.EqualFold(trimmed, "auto") {
			return 0, fmt.Errorf("%w: terminalSectionDefault.size.height=%q", ErrSettingsValueInvalid, textValue)
		}
		return 0, fmt.Errorf("%w: terminalSectionDefault.size.height=%q", ErrSettingsValueInvalid, textValue)
	}

	height, ok := asFloat(rawValue)
	if !ok || math.IsNaN(height) || math.IsInf(height, 0) || height <= 0 {
		return 0, fmt.Errorf("%w: terminalSectionDefault.size.height=%#v", ErrSettingsValueInvalid, rawValue)
	}
	return height, nil
}
