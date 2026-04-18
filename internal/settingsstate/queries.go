package settingsstate

import (
	"fmt"
	"math"
	"strings"

	"setta/internal/projectstate"
)

const DefaultAutoRefetchCallableParamsOnLSPMismatch = true
const DefaultCompletionGuardEnabled = false
const DefaultAutoBackupEnabled = true
const DefaultAutoBackupFrequencySeconds = 300
const DefaultAutoBackupKeepLastN = 10

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

type AutoBackupPolicy struct {
	Enabled          bool
	FrequencySeconds int
	KeepLastN        int
}

type sectionSizingDimensionSpec struct {
	fieldName string
	fallback  func(projectstate.AutoLayoutSectionMinDimensions) float64
	apply     func(*projectstate.AutoLayoutSectionMinDimensions, float64)
}

var sectionSizingDimensionSpecs = []sectionSizingDimensionSpec{
	{
		fieldName: "minWidth",
		fallback: func(dimensions projectstate.AutoLayoutSectionMinDimensions) float64 {
			return dimensions.MinWidth
		},
		apply: func(dimensions *projectstate.AutoLayoutSectionMinDimensions, value float64) {
			dimensions.MinWidth = math.Max(0, value)
		},
	},
	{
		fieldName: "minHeight",
		fallback: func(dimensions projectstate.AutoLayoutSectionMinDimensions) float64 {
			return dimensions.MinHeight
		},
		apply: func(dimensions *projectstate.AutoLayoutSectionMinDimensions, value float64) {
			dimensions.MinHeight = math.Max(0, value)
		},
	},
	{
		fieldName: "maxWidth",
		fallback: func(dimensions projectstate.AutoLayoutSectionMinDimensions) float64 {
			return dimensions.MaxWidth
		},
		apply: func(dimensions *projectstate.AutoLayoutSectionMinDimensions, value float64) {
			dimensions.MaxWidth = value
		},
	},
	{
		fieldName: "maxHeight",
		fallback: func(dimensions projectstate.AutoLayoutSectionMinDimensions) float64 {
			return dimensions.MaxHeight
		},
		apply: func(dimensions *projectstate.AutoLayoutSectionMinDimensions, value float64) {
			dimensions.MaxHeight = value
		},
	},
}

func AutoBackupPolicyForDocument(document Document) (AutoBackupPolicy, error) {
	policy := AutoBackupPolicy{
		Enabled:          DefaultAutoBackupEnabled,
		FrequencySeconds: DefaultAutoBackupFrequencySeconds,
		KeepLastN:        DefaultAutoBackupKeepLastN,
	}
	if document == nil {
		return policy, nil
	}

	backend, ok, err := objectField(document, "backend")
	if err != nil {
		return AutoBackupPolicy{}, err
	}
	if !ok {
		return policy, nil
	}

	enabled, ok, err := boolField(backend, "autobackup")
	if err != nil {
		return AutoBackupPolicy{}, err
	}
	if ok {
		policy.Enabled = enabled
	}

	frequencySeconds, ok, err := intField(backend, "autobackupFreq")
	if err != nil {
		return AutoBackupPolicy{}, err
	}
	if ok {
		policy.FrequencySeconds = frequencySeconds
	}

	keepLastN, ok, err := intField(backend, "autobackupKeepLastN")
	if err != nil {
		return AutoBackupPolicy{}, err
	}
	if ok {
		policy.KeepLastN = keepLastN
	}

	return policy, nil
}

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

func CompletionGuardEnabled(document Document) (bool, error) {
	if document == nil {
		return DefaultCompletionGuardEnabled, nil
	}

	backend, ok, err := objectField(document, "backend")
	if err != nil {
		return false, err
	}
	if !ok {
		return DefaultCompletionGuardEnabled, nil
	}

	value, ok, err := boolField(backend, "completionGuardEnabled")
	if err != nil {
		return false, err
	}
	if !ok {
		return DefaultCompletionGuardEnabled, nil
	}
	return value, nil
}

func RenameRefactorModeForDocument(document Document) (projectstate.RenameRefactorMode, error) {
	if document == nil {
		return projectstate.RenameRefactorModeAlwaysAsk, nil
	}

	backend, ok, err := objectField(document, "backend")
	if err != nil {
		return "", err
	}
	if !ok {
		return projectstate.RenameRefactorModeAlwaysAsk, nil
	}

	value, ok, err := stringField(backend, "renameRefactorMode")
	if err != nil {
		return "", err
	}
	if !ok {
		return projectstate.RenameRefactorModeAlwaysAsk, nil
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

	if err := applySectionSizingPolicyOverrides(document, &settings); err != nil {
		return projectstate.StructuralMutationSettings{}, err
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

func applySectionSizingPolicyOverrides(
	document Document,
	settings *projectstate.StructuralMutationSettings,
) error {
	byType, ok, err := objectPathField(document, "sectionSizingPolicy", "byType")
	if err != nil || !ok {
		return err
	}
	for sectionType, defaults := range settings.SectionSizingPolicy.ByType {
		typeObject, ok, err := objectField(byType, sectionType)
		if err != nil {
			return err
		}
		if !ok {
			continue
		}
		overrides, err := resolveSectionSizingTypeOverrides(typeObject, sectionType, defaults)
		if err != nil {
			return err
		}
		settings.SectionSizingPolicy.ByType[sectionType] = overrides
	}
	return nil
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

func resolveSectionSizingTypeOverrides(
	typeObject map[string]any,
	sectionType string,
	defaults projectstate.AutoLayoutSectionMinDimensions,
) (projectstate.AutoLayoutSectionMinDimensions, error) {
	resolved := defaults
	for _, spec := range sectionSizingDimensionSpecs {
		value, err := resolveSectionSizingDimension(
			typeObject,
			spec.fieldName,
			spec.fallback(defaults),
			fmt.Sprintf("sectionSizingPolicy.byType.%s.%s", sectionType, spec.fieldName),
		)
		if err != nil {
			return projectstate.AutoLayoutSectionMinDimensions{}, err
		}
		spec.apply(&resolved, value)
	}
	return resolved, nil
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

func objectPathField(object map[string]any, fields ...string) (map[string]any, bool, error) {
	current := object
	for _, field := range fields {
		nested, ok, err := objectField(current, field)
		if err != nil {
			return nil, false, err
		}
		if !ok {
			return nil, false, nil
		}
		current = nested
	}
	return current, true, nil
}

func terminalDefaultHeightForDocument(document Document) (float64, error) {
	defaults := projectstate.DefaultStructuralMutationSettings()
	if document == nil {
		return defaults.TerminalDefaultHeight, nil
	}

	size, ok, err := objectPathField(document, "terminalSectionDefault", "size")
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
	return resolveTerminalDefaultHeightValue(rawValue, defaults.TerminalDefaultHeight)
}

func resolveTerminalDefaultHeightValue(rawValue any, fallback float64) (float64, error) {
	if textValue, ok := rawValue.(string); ok {
		if strings.TrimSpace(textValue) == "" {
			return fallback, nil
		}
		return 0, fmt.Errorf("%w: terminalSectionDefault.size.height=%q", ErrSettingsValueInvalid, textValue)
	}

	height, ok := asFloat(rawValue)
	if !ok || math.IsNaN(height) || math.IsInf(height, 0) || height <= 0 {
		return 0, fmt.Errorf("%w: terminalSectionDefault.size.height=%#v", ErrSettingsValueInvalid, rawValue)
	}
	return height, nil
}
