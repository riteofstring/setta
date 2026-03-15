package settingsstate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"setta/internal/projectstate"
)

const (
	SettingsProjectID               = "settings"
	SettingsProjectName             = "settings"
	settingsViewGridColumns         = 3
	settingsViewGridSpacing float64 = 600
)

var hexColorPattern = regexp.MustCompile(`^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)

type settingsViewModeSpec struct {
	ID           string
	Name         string
	SectionNames []string
}

var settingsSectionOrder = []string{
	"backend",
	"browserSectionDefault",
	"buttonParamCodeObjDefault",
	"callableSectionDefault",
	"chartSectionDefault",
	"chatSectionDefault",
	"chatWindowing",
	"codeCallableCodeObjDefault",
	"codeParamCodeObjDefault",
	"codeSectionDefault",
	"colorPickerParamCodeObjDefault",
	"dateParamCodeObjDefault",
	"dictSectionDefault",
	"drawSectionDefault",
	"dropdownParamCodeObjDefault",
	"dropzoneParamCodeObjDefault",
	"genPythonCodeSectionDefault",
	"genPythonMetadataSectionDefault",
	"globalVariablesSectionDefault",
	"groupSectionDefault",
	"gui",
	"iFrameSectionDefault",
	"imageSectionDefault",
	"languageServer",
	"listRootSectionDefault",
	"metaControlSectionDefault",
	"nestedParamCodeObjDefault",
	"passwordParamCodeObjDefault",
	"pluginSectionDefault",
	"promptSectionDefault",
	"rotaryParamCodeObjDefault",
	"sectionSizingPolicy",
	"shortcuts",
	"sliderParamCodeObjDefault",
	"socialSectionDefault",
	"spreadsheetSectionDefault",
	"stateMachineEndSectionDefault",
	"stateMachineGateSectionDefault",
	"stateMachineStartSectionDefault",
	"switchParamCodeObjDefault",
	"taskBoardSectionDefault",
	"terminalSectionDefault",
	"textAreaParamCodeObjDefault",
	"textBlockSectionDefault",
	"textParamCodeObjDefault",
	"timeParamCodeObjDefault",
}

var settingsViewModeSpecs = []settingsViewModeSpec{
	{
		ID:   "settings-core",
		Name: "Core",
		SectionNames: []string{
			"shortcuts",
			"gui",
			"backend",
			"sectionSizingPolicy",
			"languageServer",
		},
	},
	{
		ID:   "settings-structure-and-code",
		Name: "Section Defaults Structure and Code",
		SectionNames: []string{
			"callableSectionDefault",
			"dictSectionDefault",
			"listRootSectionDefault",
			"groupSectionDefault",
			"globalVariablesSectionDefault",
			"metaControlSectionDefault",
			"codeSectionDefault",
			"genPythonCodeSectionDefault",
			"genPythonMetadataSectionDefault",
			"stateMachineStartSectionDefault",
			"stateMachineGateSectionDefault",
			"stateMachineEndSectionDefault",
		},
	},
	{
		ID:   "settings-content-and-media",
		Name: "Section Defaults Content and Media",
		SectionNames: []string{
			"browserSectionDefault",
			"chatSectionDefault",
			"chartSectionDefault",
			"drawSectionDefault",
			"iFrameSectionDefault",
			"imageSectionDefault",
			"promptSectionDefault",
			"socialSectionDefault",
			"terminalSectionDefault",
			"textBlockSectionDefault",
		},
	},
	{
		ID:   "settings-param-defaults",
		Name: "Param Defaults",
		SectionNames: []string{
			"buttonParamCodeObjDefault",
			"codeCallableCodeObjDefault",
			"codeParamCodeObjDefault",
			"colorPickerParamCodeObjDefault",
			"dropdownParamCodeObjDefault",
			"dropzoneParamCodeObjDefault",
			"nestedParamCodeObjDefault",
			"passwordParamCodeObjDefault",
			"rotaryParamCodeObjDefault",
			"sliderParamCodeObjDefault",
			"switchParamCodeObjDefault",
			"textAreaParamCodeObjDefault",
			"textParamCodeObjDefault",
		},
	},
	{
		ID:   "settings-all",
		Name: "All Settings",
	},
}

func BuildProjectDocument(document Document) (projectstate.Document, error) {
	normalized, err := document.Normalized()
	if err != nil {
		return projectstate.Document{}, err
	}

	sectionNames := orderedSettingsSectionNames(normalized)
	project := projectstate.Project{
		ID:                      SettingsProjectID,
		Name:                    SettingsProjectName,
		ShowParamDisplayNames:   true,
		AllowJSONSourceKeyEdits: false,
		TopLevelSectionIDs:      make([]string, 0, len(sectionNames)),
		SectionVariantMap:       map[string]string{},
		Sections:                map[string]projectstate.Section{},
		SectionVariants:         map[string]projectstate.SectionVariant{},
		SectionImpls:            map[string]projectstate.SectionImpl{},
		CodeObjs:                map[string]projectstate.CodeObject{},
		CodeObjVariants:         map[string]projectstate.CodeObjectVariant{},
		CodeObjImpls:            map[string]projectstate.CodeObjectImpl{},
		ViewModes:               map[string]projectstate.ViewMode{},
	}
	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	project.ProjectChatWindowing = &defaultWindowing

	sectionIDByName := make(map[string]string, len(sectionNames))
	for _, sectionName := range sectionNames {
		sectionID, err := addSettingsSection(&project, sectionName, normalized[sectionName])
		if err != nil {
			return projectstate.Document{}, err
		}
		sectionIDByName[sectionName] = sectionID
	}

	activeViewModeID, activeLayouts := populateSettingsViewModes(&project, sectionNames, sectionIDByName)
	project.ActiveViewModeID = activeViewModeID
	project.TopLevelSections = activeLayouts

	output, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: SettingsProjectID,
		Projects: map[string]projectstate.Project{
			SettingsProjectID: project,
		},
	}.Normalized()
	if err != nil {
		return projectstate.Document{}, err
	}
	return output, nil
}

func EnsureProjectRuntimeBootstrapped(
	ctx context.Context,
	settingsRuntime *Runtime,
	projectRuntime *projectstate.Runtime,
) error {
	if settingsRuntime == nil {
		return fmt.Errorf("settings runtime is required")
	}
	if projectRuntime == nil {
		return fmt.Errorf("settings project runtime is required")
	}

	currentDocument := projectRuntime.Snapshot().Document
	project, err := currentDocument.ProjectByID(SettingsProjectID)
	if err == nil && project.Name == SettingsProjectName {
		return nil
	}

	builtDocument, err := BuildProjectDocument(settingsRuntime.Snapshot().Document)
	if err != nil {
		return err
	}

	_, err = projectRuntime.MutateAndSave(ctx, func(projectDocument projectstate.Document) (projectstate.Document, error) {
		return builtDocument, nil
	})
	return err
}

func addSettingsSection(project *projectstate.Project, sectionName string, rawValue any) (string, error) {
	sectionID := settingsSectionID(sectionName)
	sectionVariantID := settingsSectionVariantID(sectionName)
	sectionImplID := settingsSectionImplID(sectionName)
	rootCodeObjID, codeObjVariantMap, err := addSettingsCodeObject(project, sectionName, nil, sectionName, rawValue)
	if err != nil {
		return "", err
	}

	sectionPayload, err := marshalSettingsPayload(map[string]any{
		"id":                sectionImplID,
		"type":              "Dict",
		"isJsonSource":      true,
		"jsonSourceKeys":    []string{sectionName},
		"topLevelParamId":   rootCodeObjID,
		"codeObjVariantMap": codeObjVariantMap,
	})
	if err != nil {
		return "", err
	}

	project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, sectionID)
	project.SectionVariantMap[sectionID] = sectionVariantID
	project.Sections[sectionID] = projectstate.Section{
		ID:               sectionID,
		Name:             sectionName,
		DisplayName:      humanizeSettingsIdentifier(sectionName),
		VariantIDs:       []string{sectionVariantID},
		DefaultVariantID: sectionVariantID,
	}
	project.SectionVariants[sectionVariantID] = projectstate.SectionVariant{
		ID:     sectionVariantID,
		ImplID: sectionImplID,
	}
	project.SectionImpls[sectionImplID] = projectstate.SectionImpl{
		ID:      sectionImplID,
		Kind:    projectstate.SectionKind("dict"),
		Payload: sectionPayload,
	}
	return sectionID, nil
}

func addSettingsCodeObject(
	project *projectstate.Project,
	sectionName string,
	parentPath []string,
	name string,
	value any,
) (string, map[string]string, error) {
	path := append(append([]string(nil), parentPath...), name)
	codeObjID := settingsCodeObjID(sectionName, path)
	variantID := settingsCodeObjVariantID(sectionName, path)
	implID := settingsCodeObjImplID(sectionName, path)
	codeObjVariantMap := map[string]string{codeObjID: variantID}

	payload := map[string]any{
		"id":    implID,
		"type":  "TextParam",
		"value": encodeSettingsScalarValue(value),
	}
	implType := "TextParam"

	if objectValue, ok := asObject(value); ok {
		childNames := orderedSettingsObjectKeys(objectValue)
		childIDs := make([]string, 0, len(childNames))
		for _, childName := range childNames {
			childID, childVariantMap, err := addSettingsCodeObject(project, sectionName, path, childName, objectValue[childName])
			if err != nil {
				return "", nil, err
			}
			childIDs = append(childIDs, childID)
			for childCodeObjID, childVariantID := range childVariantMap {
				codeObjVariantMap[childCodeObjID] = childVariantID
			}
		}
		payload = map[string]any{
			"id":       implID,
			"type":     "NestedParam",
			"children": childIDs,
		}
		implType = "NestedParam"
	} else {
		fullPath := "settings." + strings.Join(path, ".")
		allowedValues := allowedValuesForPath(fullPath)
		if _, ok := value.(string); ok {
			payload["settingsValueEncoding"] = "raw_string"
		}
		switch {
		case len(allowedValues) > 0:
			implType = "DropdownParam"
			payload["type"] = implType
			payload["choices"] = allowedValues
		case settingsValueIsHexColor(value):
			implType = "ColorPickerParam"
			payload["type"] = implType
		case settingsValueIsStructuredScalar(value):
			implType = "TextAreaParam"
			payload["type"] = implType
		case settingsValueIsBool(value):
			implType = "SwitchParam"
			payload["type"] = implType
		}
	}

	implPayload, err := marshalSettingsPayload(payload)
	if err != nil {
		return "", nil, err
	}

	project.CodeObjs[codeObjID] = projectstate.CodeObject{
		ID:               codeObjID,
		Name:             name,
		DisplayName:      humanizeSettingsIdentifier(name),
		VariantIDs:       []string{variantID},
		DefaultVariantID: variantID,
	}
	project.CodeObjVariants[variantID] = projectstate.CodeObjectVariant{
		ID:     variantID,
		ImplID: implID,
	}
	project.CodeObjImpls[implID] = projectstate.CodeObjectImpl{
		ID:      implID,
		Type:    implType,
		Payload: implPayload,
	}
	return codeObjID, codeObjVariantMap, nil
}

func populateSettingsViewModes(
	project *projectstate.Project,
	sectionNames []string,
	sectionIDByName map[string]string,
) (string, map[string]projectstate.TopLevelSectionLayout) {
	allSectionIDs := make([]string, 0, len(sectionNames))
	for _, sectionName := range sectionNames {
		if sectionID, ok := sectionIDByName[sectionName]; ok {
			allSectionIDs = append(allSectionIDs, sectionID)
		}
	}
	allLayouts := settingsLayoutsForSectionIDs(allSectionIDs)

	activeViewModeID := settingsViewModeSpecs[0].ID
	for index, spec := range settingsViewModeSpecs {
		orderedSectionIDs := resolveSettingsViewModeSectionIDs(spec, sectionNames, sectionIDByName)
		visibility := make(map[string]bool, len(allSectionIDs))
		visibleSet := make(map[string]struct{}, len(orderedSectionIDs))
		for _, sectionID := range orderedSectionIDs {
			visibleSet[sectionID] = struct{}{}
		}
		for _, sectionID := range allSectionIDs {
			_, visible := visibleSet[sectionID]
			visibility[sectionID] = visible
		}

		project.ViewModes[spec.ID] = projectstate.ViewMode{
			ID:                    spec.ID,
			Name:                  spec.Name,
			SortIndex:             index,
			IsUserFacing:          true,
			IsTab:                 true,
			VisibilityBySectionID: visibility,
			TopLevelSections:      cloneTopLevelLayouts(allLayouts),
		}
	}
	return activeViewModeID, cloneTopLevelLayouts(allLayouts)
}

func resolveSettingsViewModeSectionIDs(
	spec settingsViewModeSpec,
	sectionNames []string,
	sectionIDByName map[string]string,
) []string {
	resolved := []string{}
	if len(spec.SectionNames) == 0 {
		for _, sectionName := range sectionNames {
			sectionID, ok := sectionIDByName[sectionName]
			if ok {
				resolved = append(resolved, sectionID)
			}
		}
		return resolved
	}
	for _, sectionName := range spec.SectionNames {
		sectionID, ok := sectionIDByName[sectionName]
		if ok {
			resolved = append(resolved, sectionID)
		}
	}
	return resolved
}

func settingsLayoutsForSectionIDs(sectionIDs []string) map[string]projectstate.TopLevelSectionLayout {
	layouts := make(map[string]projectstate.TopLevelSectionLayout, len(sectionIDs))
	for index, sectionID := range sectionIDs {
		column := index % settingsViewGridColumns
		row := index / settingsViewGridColumns
		layouts[sectionID] = projectstate.TopLevelSectionLayout{
			X:      float64(column) * settingsViewGridSpacing,
			Y:      float64(row) * settingsViewGridSpacing,
			ZIndex: index,
		}
	}
	return layouts
}

func orderedSettingsSectionNames(document Document) []string {
	seen := map[string]struct{}{}
	ordered := []string{}
	for _, sectionName := range settingsSectionOrder {
		if _, ok := document[sectionName]; !ok {
			continue
		}
		ordered = append(ordered, sectionName)
		seen[sectionName] = struct{}{}
	}

	extra := make([]string, 0, len(document))
	for sectionName := range document {
		if _, ok := seen[sectionName]; ok {
			continue
		}
		extra = append(extra, sectionName)
	}
	sort.Strings(extra)
	return append(ordered, extra...)
}

func orderedSettingsObjectKeys(object map[string]any) []string {
	keys := make([]string, 0, len(object))
	for key := range object {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func settingsValueIsBool(value any) bool {
	_, ok := value.(bool)
	return ok
}

func settingsValueIsStructuredScalar(value any) bool {
	switch value.(type) {
	case nil, []any:
		return true
	default:
		return false
	}
}

func settingsValueIsHexColor(value any) bool {
	text, ok := value.(string)
	return ok && hexColorPattern.MatchString(text)
}

func encodeSettingsScalarValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return ""
		}
		return string(encoded)
	}
}

func settingsSectionID(sectionName string) string {
	return "settings-section__" + sectionName
}

func settingsSectionVariantID(sectionName string) string {
	return "settings-section-variant__" + sectionName
}

func settingsSectionImplID(sectionName string) string {
	return "settings-section-impl__" + sectionName
}

func settingsCodeObjID(sectionName string, path []string) string {
	return "settings-codeobj__" + sectionName + "__" + strings.Join(path, "__")
}

func settingsCodeObjVariantID(sectionName string, path []string) string {
	return "settings-codeobj-variant__" + sectionName + "__" + strings.Join(path, "__")
}

func settingsCodeObjImplID(sectionName string, path []string) string {
	return "settings-codeobj-impl__" + sectionName + "__" + strings.Join(path, "__")
}

func marshalSettingsPayload(payload map[string]any) (projectstate.RawJSON, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return projectstate.RawJSON(encoded), nil
}

func cloneTopLevelLayouts(
	source map[string]projectstate.TopLevelSectionLayout,
) map[string]projectstate.TopLevelSectionLayout {
	cloned := make(map[string]projectstate.TopLevelSectionLayout, len(source))
	for sectionID, layout := range source {
		cloned[sectionID] = layout.Clone()
	}
	return cloned
}

func humanizeSettingsIdentifier(identifier string) string {
	if strings.TrimSpace(identifier) == "" {
		return ""
	}

	replacer := strings.NewReplacer(
		"iFrame", "IFrame",
		"genPython", "GeneratedPython",
		"autobackup", "AutoBackup",
	)
	normalized := replacer.Replace(identifier)
	tokens := splitSettingsIdentifier(normalized)
	if len(tokens) == 0 {
		return identifier
	}

	output := make([]string, 0, len(tokens))
	for _, token := range tokens {
		switch strings.ToUpper(token) {
		case "API", "CPU", "CSS", "CSV", "DB", "GPU", "GUI", "HTML", "HTTP", "HTTPS", "ID", "IO", "JSON", "JS", "LSP", "PDF", "SQL", "SVG", "UI", "URL", "XML", "YAML":
			output = append(output, strings.ToUpper(token))
		default:
			if len(token) == 1 {
				output = append(output, strings.ToUpper(token))
				continue
			}
			output = append(output, strings.ToUpper(token[:1])+token[1:])
		}
	}
	return strings.Join(output, " ")
}

func splitSettingsIdentifier(identifier string) []string {
	replacer := strings.NewReplacer("-", "_")
	normalized := replacer.Replace(identifier)
	parts := strings.Split(normalized, "_")
	tokens := []string{}
	for _, part := range parts {
		if part == "" {
			continue
		}
		current := strings.Builder{}
		runes := []rune(part)
		for index, currentRune := range runes {
			if index > 0 && isSettingsWordBoundary(runes[index-1], currentRune, runes, index) {
				tokens = append(tokens, current.String())
				current.Reset()
			}
			current.WriteRune(currentRune)
		}
		if current.Len() > 0 {
			tokens = append(tokens, current.String())
		}
	}
	return tokens
}

func isSettingsWordBoundary(previous rune, current rune, runes []rune, index int) bool {
	if previous >= '0' && previous <= '9' {
		return (current < '0' || current > '9')
	}
	if current >= '0' && current <= '9' {
		return previous < '0' || previous > '9'
	}
	if previous >= 'a' && previous <= 'z' && current >= 'A' && current <= 'Z' {
		return true
	}
	if previous >= 'A' && previous <= 'Z' && current >= 'A' && current <= 'Z' {
		if index+1 >= len(runes) {
			return false
		}
		next := runes[index+1]
		return next >= 'a' && next <= 'z'
	}
	return false
}

func IsSettingsProjectID(projectID string) bool {
	return strings.TrimSpace(projectID) == SettingsProjectID
}

func IsSettingsProjectName(projectName string) bool {
	return strings.TrimSpace(projectName) == SettingsProjectName
}

func ProjectRuntimeForID(
	mainRuntime *projectstate.Runtime,
	settingsRuntime *projectstate.Runtime,
	projectID string,
) (*projectstate.Runtime, error) {
	if IsSettingsProjectID(projectID) {
		if settingsRuntime == nil {
			return nil, errors.New("settings project runtime is required")
		}
		return settingsRuntime, nil
	}
	if mainRuntime == nil {
		return nil, errors.New("project runtime is required")
	}
	return mainRuntime, nil
}
