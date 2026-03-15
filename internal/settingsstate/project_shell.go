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

type MissingSettingsSectionError struct {
	SectionName string
}

func (e MissingSettingsSectionError) Error() string {
	sectionName := strings.TrimSpace(e.SectionName)
	if sectionName == "" {
		return "Missing settings section."
	}
	return fmt.Sprintf("Missing settings section %s.", sectionName)
}

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

	settingsDocument := settingsRuntime.Snapshot().Document
	currentDocument := projectRuntime.Snapshot().Document
	project, err := currentDocument.ProjectByID(SettingsProjectID)
	if err == nil && project.Name == SettingsProjectName {
		if err := validateSettingsProjectShellSections(settingsDocument, project); err != nil {
			return err
		}
		return nil
	}

	builtDocument, err := BuildProjectDocument(settingsDocument)
	if err != nil {
		return err
	}

	_, err = projectRuntime.MutateAndSave(ctx, func(projectDocument projectstate.Document) (projectstate.Document, error) {
		return builtDocument, nil
	})
	return err
}

func RefreshProjectRuntimeFromSettings(
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

	settingsDocument := settingsRuntime.Snapshot().Document
	builtDocument, err := BuildProjectDocument(settingsDocument)
	if err != nil {
		return err
	}

	currentProject, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err == nil && currentProject.Name == SettingsProjectName {
		if err := validateSettingsProjectShellSections(settingsDocument, currentProject); err != nil {
			return err
		}
		builtProject, buildErr := builtDocument.ProjectByID(SettingsProjectID)
		if buildErr != nil {
			return buildErr
		}
		mergedProject := overlayProjectShellState(
			builtProject,
			currentProject,
		)
		repairedProject, repairErr := repairSettingsProjectShellViewModes(
			mergedProject,
			builtProject,
		)
		if repairErr != nil {
			return repairErr
		}
		builtDocument.Projects[SettingsProjectID] = repairedProject
	}

	_, err = projectRuntime.MutateAndSave(
		ctx,
		func(projectDocument projectstate.Document) (projectstate.Document, error) {
			return builtDocument, nil
		},
	)
	return err
}

func validateSettingsProjectShellSections(
	settingsDocument Document,
	project projectstate.Project,
) error {
	requiredSectionNames := orderedSettingsSectionNames(settingsDocument)
	sectionIDByName := settingsSectionIDsByName(project)
	for _, sectionName := range requiredSectionNames {
		if _, ok := sectionIDByName[sectionName]; ok {
			continue
		}
		return MissingSettingsSectionError{SectionName: sectionName}
	}
	return nil
}

func overlayProjectShellState(
	fresh projectstate.Project,
	current projectstate.Project,
) projectstate.Project {
	merged := fresh.Clone()
	currentClone := current.Clone()

	if currentClone.Viewport != nil || currentClone.ViewportInitialized {
		merged.Viewport = currentClone.Viewport
		merged.ViewportInitialized = currentClone.ViewportInitialized
	}
	if len(currentClone.ViewModes) > 0 {
		merged.ViewModes = currentClone.ViewModes
	}
	if currentClone.ActiveViewModeID != "" {
		merged.ActiveViewModeID = currentClone.ActiveViewModeID
	}
	if currentClone.IsEditingViewMode {
		merged.IsEditingViewMode = true
	}
	if len(currentClone.TopLevelSections) > 0 {
		merged.TopLevelSections = currentClone.TopLevelSections
	}
	if len(currentClone.WindowSpaces) > 0 {
		merged.WindowSpaces = currentClone.WindowSpaces
	}
	if len(currentClone.ActiveIDs) > 0 {
		merged.ActiveIDs = currentClone.ActiveIDs
	}
	if len(currentClone.Edges) > 0 {
		merged.Edges = currentClone.Edges
	}
	if len(currentClone.AgenticEdges) > 0 {
		merged.AgenticEdges = currentClone.AgenticEdges
	}
	if len(currentClone.StateMachineEdges) > 0 {
		merged.StateMachineEdges = currentClone.StateMachineEdges
	}
	if currentClone.ProjectChatWindowing != nil {
		merged.ProjectChatWindowing = currentClone.ProjectChatWindowing
	}

	return merged
}

func repairSettingsProjectShellViewModes(
	current projectstate.Project,
	canonical projectstate.Project,
) (projectstate.Project, error) {
	sectionIDByName := settingsSectionIDsByName(current)
	sectionNames := orderedSettingsSectionNamesForProject(sectionIDByName)
	allSectionIDs := resolveOrderedSettingsSectionIDs(sectionNames, sectionIDByName)
	if len(allSectionIDs) == 0 {
		return current, nil
	}

	requiredViewModeNames := map[string]struct{}{}
	for _, spec := range settingsViewModeSpecs {
		requiredViewModeNames[spec.Name] = struct{}{}
	}

	viewModesByName := make(map[string]projectstate.ViewMode, len(current.ViewModes))
	for _, viewMode := range current.ViewModes {
		viewModesByName[viewMode.Name] = viewMode
	}

	needsReset := len(current.TopLevelSections) == 0
	if !needsReset {
		for _, sectionID := range allSectionIDs {
			if _, ok := current.TopLevelSections[sectionID]; !ok {
				needsReset = true
				break
			}
		}
	}
	if !needsReset {
		for requiredName := range requiredViewModeNames {
			viewMode, ok := viewModesByName[requiredName]
			if !ok {
				needsReset = true
				break
			}
			if len(viewMode.VisibilityBySectionID) == 0 {
				needsReset = true
				break
			}
			visibleIDs := map[string]struct{}{}
			for sectionID, visible := range viewMode.VisibilityBySectionID {
				if visible {
					visibleIDs[sectionID] = struct{}{}
				}
			}
			if len(visibleIDs) == 0 || len(viewMode.TopLevelSections) == 0 {
				needsReset = true
				break
			}
			for sectionID := range visibleIDs {
				if _, ok := viewMode.TopLevelSections[sectionID]; !ok {
					needsReset = true
					break
				}
			}
			if needsReset {
				break
			}
		}
	}
	if !needsReset {
		return current, nil
	}

	activeName := ""
	if activeViewMode, ok := current.ViewModes[current.ActiveViewModeID]; ok {
		activeName = activeViewMode.Name
	}

	baseLayouts := cloneTopLevelLayouts(current.TopLevelSections)
	if len(baseLayouts) == 0 {
		baseLayouts = cloneTopLevelLayouts(canonical.TopLevelSections)
	}
	rebuiltViewModes, defaultActiveViewModeID := rebuildSettingsViewModesFromBase(
		sectionNames,
		sectionIDByName,
		baseLayouts,
	)

	repaired := current.Clone()
	repaired.ViewModes = rebuiltViewModes
	repaired.IsEditingViewMode = false
	repaired.ActiveViewModeID = defaultActiveViewModeID
	if activeName != "" {
		for _, viewMode := range rebuiltViewModes {
			if viewMode.Name == activeName {
				repaired.ActiveViewModeID = viewMode.ID
				break
			}
		}
	}
	activeViewMode := rebuiltViewModes[repaired.ActiveViewModeID]
	repaired.TopLevelSections = cloneTopLevelLayouts(activeViewMode.TopLevelSections)
	repaired.Viewport = cloneSettingsViewport(activeViewMode.Viewport)
	repaired.ViewportInitialized = activeViewMode.ViewportInitialized
	return repaired, nil
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
	viewModes, activeViewModeID := rebuildSettingsViewModesFromBase(
		sectionNames,
		sectionIDByName,
		allLayouts,
	)
	project.ViewModes = viewModes
	activeViewMode := viewModes[activeViewModeID]
	return activeViewModeID, cloneTopLevelLayouts(activeViewMode.TopLevelSections)
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

func rebuildSettingsViewModesFromBase(
	sectionNames []string,
	sectionIDByName map[string]string,
	baseLayouts map[string]projectstate.TopLevelSectionLayout,
) (map[string]projectstate.ViewMode, string) {
	allSectionIDs := resolveOrderedSettingsSectionIDs(sectionNames, sectionIDByName)
	viewModes := make(map[string]projectstate.ViewMode, len(settingsViewModeSpecs))
	activeViewModeID := settingsViewModeSpecs[0].ID

	for index, spec := range settingsViewModeSpecs {
		visibleSectionIDs := resolveSettingsViewModeSectionIDs(spec, sectionNames, sectionIDByName)
		visibility := make(map[string]bool, len(allSectionIDs))
		visibleSet := make(map[string]struct{}, len(visibleSectionIDs))
		for _, sectionID := range visibleSectionIDs {
			visibleSet[sectionID] = struct{}{}
		}
		for _, sectionID := range allSectionIDs {
			_, visible := visibleSet[sectionID]
			visibility[sectionID] = visible
		}

		orderedSectionIDs := append([]string{}, visibleSectionIDs...)
		for _, sectionID := range allSectionIDs {
			if _, ok := visibleSet[sectionID]; ok {
				continue
			}
			orderedSectionIDs = append(orderedSectionIDs, sectionID)
		}

		viewModes[spec.ID] = projectstate.ViewMode{
			ID:                    spec.ID,
			Name:                  spec.Name,
			SortIndex:             index,
			IsUserFacing:          true,
			IsTab:                 true,
			VisibilityBySectionID: visibility,
			TopLevelSections:      settingsViewLayoutForOrderedSectionIDs(baseLayouts, orderedSectionIDs),
		}
	}
	return viewModes, activeViewModeID
}

func resolveOrderedSettingsSectionIDs(
	sectionNames []string,
	sectionIDByName map[string]string,
) []string {
	ordered := make([]string, 0, len(sectionNames))
	for _, sectionName := range sectionNames {
		sectionID, ok := sectionIDByName[sectionName]
		if !ok {
			continue
		}
		ordered = append(ordered, sectionID)
	}
	return ordered
}

func orderedSettingsSectionNamesForProject(sectionIDByName map[string]string) []string {
	ordered := make([]string, 0, len(sectionIDByName))
	seen := make(map[string]struct{}, len(sectionIDByName))
	for _, sectionName := range settingsSectionOrder {
		if _, ok := sectionIDByName[sectionName]; !ok {
			continue
		}
		ordered = append(ordered, sectionName)
		seen[sectionName] = struct{}{}
	}
	extraNames := make([]string, 0, len(sectionIDByName)-len(ordered))
	for sectionName := range sectionIDByName {
		if _, ok := seen[sectionName]; ok {
			continue
		}
		extraNames = append(extraNames, sectionName)
	}
	sort.Strings(extraNames)
	return append(ordered, extraNames...)
}

func settingsSectionIDsByName(project projectstate.Project) map[string]string {
	sectionIDByName := make(map[string]string, len(project.Sections))
	for sectionID, section := range project.Sections {
		sectionIDByName[section.Name] = sectionID
	}
	return sectionIDByName
}

func settingsViewLayoutForOrderedSectionIDs(
	baseLayouts map[string]projectstate.TopLevelSectionLayout,
	orderedSectionIDs []string,
) map[string]projectstate.TopLevelSectionLayout {
	layouts := cloneTopLevelLayouts(baseLayouts)
	for index, sectionID := range orderedSectionIDs {
		x := float64(index%settingsViewGridColumns) * settingsViewGridSpacing
		y := float64(index/settingsViewGridColumns) * settingsViewGridSpacing
		layout, ok := layouts[sectionID]
		if !ok {
			layouts[sectionID] = projectstate.TopLevelSectionLayout{
				X: x,
				Y: y,
			}
			continue
		}
		layout.X = x
		layout.Y = y
		layouts[sectionID] = layout
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

func cloneSettingsViewport(viewport *projectstate.Viewport) *projectstate.Viewport {
	if viewport == nil {
		return nil
	}
	cloned := *viewport
	return &cloned
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
