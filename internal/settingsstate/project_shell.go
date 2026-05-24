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
	settingsSectionWidth    float64 = 550
)

var hexColorPattern = regexp.MustCompile(`^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)

type settingsViewModeSpec struct {
	ID           string
	Name         string
	SectionNames []string
}

var settingsSectionOrder = []string{
	"shortcuts",
	"gui",
	"backend",
	"chatWindowing",
	"sectionSizingPolicy",
	"languageServer",
	"browserSectionDefault",
	"callableSectionDefault",
	"chartSectionDefault",
	"chatSectionDefault",
	"codeSectionDefault",
	"dictSectionDefault",
	"drawSectionDefault",
	"genPythonCodeSectionDefault",
	"genPythonMetadataSectionDefault",
	"globalVariablesSectionDefault",
	"groupSectionDefault",
	"iFrameSectionDefault",
	"imageSectionDefault",
	"listRootSectionDefault",
	"metaControlSectionDefault",
	"pluginSectionDefault",
	"promptSectionDefault",
	"socialSectionDefault",
	"spreadsheetSectionDefault",
	"stateMachineEndSectionDefault",
	"stateMachineGateSectionDefault",
	"stateMachineStartSectionDefault",
	"taskBoardSectionDefault",
	"terminalSectionDefault",
	"textBlockSectionDefault",
	"buttonParamCodeObjDefault",
	"codeCallableCodeObjDefault",
	"codeParamCodeObjDefault",
	"colorPickerParamCodeObjDefault",
	"dateParamCodeObjDefault",
	"dropdownParamCodeObjDefault",
	"dropzoneParamCodeObjDefault",
	"nestedParamCodeObjDefault",
	"passwordParamCodeObjDefault",
	"rotaryParamCodeObjDefault",
	"sliderParamCodeObjDefault",
	"switchParamCodeObjDefault",
	"textAreaParamCodeObjDefault",
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

func buildProjectDocumentWithSharedSettingsPath(
	document Document,
	sharedSettingsPath string,
) (projectstate.Document, error) {
	normalized, err := document.Normalized()
	if err != nil {
		return projectstate.Document{}, err
	}
	if strings.TrimSpace(sharedSettingsPath) == "" {
		sharedSettingsPath = DefaultFileName
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
		sectionID, err := addSettingsSection(
			&project,
			sharedSettingsPath,
			sectionName,
			normalized[sectionName],
		)
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
		return RefreshProjectRuntimeFromSettings(ctx, settingsRuntime, projectRuntime)
	}

	builtDocument, err := buildProjectDocumentWithSharedSettingsPath(
		settingsDocument,
		sharedSettingsPathForRuntime(settingsRuntime),
	)
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
	builtDocument, err := buildProjectDocumentWithSharedSettingsPath(
		settingsDocument,
		sharedSettingsPathForRuntime(settingsRuntime),
	)
	if err != nil {
		return err
	}

	currentProject, err := projectRuntime.Snapshot().Document.ProjectByID(SettingsProjectID)
	if err == nil && currentProject.Name == SettingsProjectName {
		builtProject, buildErr := builtDocument.ProjectByID(SettingsProjectID)
		if buildErr != nil {
			return buildErr
		}
		preserveSettingsCodeObjectDisplayNames(&builtProject, currentProject)
		if settingsProjectShellStateIsValid(currentProject, builtProject) {
			builtProject = overlayProjectShellState(
				builtProject,
				currentProject,
			)
		}
		builtDocument.Projects[SettingsProjectID] = builtProject
	}

	_, err = projectRuntime.MutateAndSave(ctx, func(projectDocument projectstate.Document) (projectstate.Document, error) {
		return builtDocument, nil
	})
	return err
}

func overlayProjectShellState(
	fresh projectstate.Project,
	current projectstate.Project,
) projectstate.Project {
	merged := fresh.Clone()
	currentClone := current.Clone()

	overlayProjectShellViewState(&merged, currentClone)
	overlayProjectShellLayoutState(&merged, currentClone)
	overlayProjectShellEdgeState(&merged, currentClone)
	if currentClone.ProjectChatWindowing != nil {
		merged.ProjectChatWindowing = currentClone.ProjectChatWindowing
	}

	return merged
}

func overlayProjectShellViewState(
	merged *projectstate.Project,
	current projectstate.Project,
) {
	if merged == nil {
		return
	}
	if current.Viewport != nil || current.ViewportInitialized {
		merged.Viewport = current.Viewport
		merged.ViewportInitialized = current.ViewportInitialized
	}
	if len(current.ViewModes) > 0 {
		merged.ViewModes = current.ViewModes
	}
	if current.ActiveViewModeID != "" {
		merged.ActiveViewModeID = current.ActiveViewModeID
	}
	if current.IsEditingViewMode {
		merged.IsEditingViewMode = true
	}
}

func overlayProjectShellLayoutState(
	merged *projectstate.Project,
	current projectstate.Project,
) {
	if merged == nil {
		return
	}
	if len(current.TopLevelSections) > 0 {
		merged.TopLevelSections = current.TopLevelSections
	}
	if len(current.WindowSpaces) > 0 {
		merged.WindowSpaces = current.WindowSpaces
	}
	if len(current.ActiveIDs) > 0 {
		merged.ActiveIDs = current.ActiveIDs
	}
}

func overlayProjectShellEdgeState(
	merged *projectstate.Project,
	current projectstate.Project,
) {
	if merged == nil {
		return
	}
	if len(current.Edges) > 0 {
		merged.Edges = current.Edges
	}
	if len(current.AgenticEdges) > 0 {
		merged.AgenticEdges = current.AgenticEdges
	}
	if len(current.StateMachineEdges) > 0 {
		merged.StateMachineEdges = current.StateMachineEdges
	}
}

func preserveSettingsCodeObjectDisplayNames(
	fresh *projectstate.Project,
	current projectstate.Project,
) {
	if fresh == nil {
		return
	}
	for codeObjID, freshCodeObj := range fresh.CodeObjs {
		currentCodeObj, ok := current.CodeObjs[codeObjID]
		if !ok {
			continue
		}
		freshCodeObj.DisplayName = currentCodeObj.DisplayName
		fresh.CodeObjs[codeObjID] = freshCodeObj
	}
}

func settingsProjectShellStateIsValid(
	current projectstate.Project,
	canonical projectstate.Project,
) bool {
	allSectionIDs, ok := settingsProjectShellSectionIDs(canonical)
	if !ok {
		return false
	}
	if !settingsProjectShellHasCompleteTopLevelLayout(current.TopLevelSections, allSectionIDs) {
		return false
	}
	if !settingsProjectShellHasActiveViewMode(current) {
		return false
	}
	return settingsProjectShellViewModesMatchSpecs(current.ViewModes, allSectionIDs)
}

func settingsProjectShellSectionIDs(canonical projectstate.Project) ([]string, bool) {
	sectionIDByName := settingsSectionIDsByName(canonical)
	sectionNames := orderedSettingsSectionNamesForProject(sectionIDByName)
	allSectionIDs := resolveOrderedSettingsSectionIDs(sectionNames, sectionIDByName)
	if len(allSectionIDs) == 0 {
		return nil, false
	}
	return allSectionIDs, true
}

func settingsProjectShellHasCompleteTopLevelLayout(
	topLevelSections map[string]projectstate.TopLevelSectionLayout,
	allSectionIDs []string,
) bool {
	if len(topLevelSections) == 0 {
		return false
	}
	for _, sectionID := range allSectionIDs {
		if _, ok := topLevelSections[sectionID]; ok {
			continue
		}
		return false
	}
	return true
}

func settingsProjectShellHasActiveViewMode(project projectstate.Project) bool {
	if project.ActiveViewModeID == "" {
		return false
	}
	_, ok := project.ViewModes[project.ActiveViewModeID]
	return ok
}

func settingsProjectShellViewModesMatchSpecs(
	viewModes map[string]projectstate.ViewMode,
	allSectionIDs []string,
) bool {
	viewModesByName := settingsViewModesByName(viewModes)
	for _, spec := range settingsViewModeSpecs {
		viewMode, ok := viewModesByName[spec.Name]
		if !ok {
			return false
		}
		if !settingsProjectShellViewModeIsValid(viewMode, allSectionIDs) {
			return false
		}
	}
	return true
}

func settingsViewModesByName(
	viewModes map[string]projectstate.ViewMode,
) map[string]projectstate.ViewMode {
	viewModesByName := make(map[string]projectstate.ViewMode, len(viewModes))
	for _, viewMode := range viewModes {
		viewModesByName[viewMode.Name] = viewMode
	}
	return viewModesByName
}

func settingsProjectShellViewModeIsValid(
	viewMode projectstate.ViewMode,
	allSectionIDs []string,
) bool {
	if len(viewMode.VisibilityBySectionID) == 0 || len(viewMode.TopLevelSections) == 0 {
		return false
	}
	visibleCount := 0
	for _, sectionID := range allSectionIDs {
		visible, ok := viewMode.VisibilityBySectionID[sectionID]
		if !ok {
			return false
		}
		if !visible {
			continue
		}
		visibleCount++
		if _, ok := viewMode.TopLevelSections[sectionID]; ok {
			continue
		}
		return false
	}
	return visibleCount > 0
}

func addSettingsSection(
	project *projectstate.Project,
	sharedSettingsPath string,
	sectionName string,
	rawValue any,
) (string, error) {
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
		"configLanguage":    "json",
		"isJsonSource":      true,
		"jsonSourceKeys":    []string{sectionName},
		"size":              map[string]any{"width": settingsSectionWidth, "height": "auto"},
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
		DisplayName:      "",
		VariantIDs:       []string{sectionVariantID},
		DefaultVariantID: sectionVariantID,
	}
	project.SectionVariants[sectionVariantID] = projectstate.SectionVariant{
		ID:     sectionVariantID,
		Name:   sharedSettingsPath,
		ImplID: sectionImplID,
	}
	project.SectionImpls[sectionImplID] = projectstate.SectionImpl{
		ID:      sectionImplID,
		Kind:    projectstate.SectionKind("dict"),
		Payload: sectionPayload,
	}
	return sectionID, nil
}

func sharedSettingsPathForRuntime(settingsRuntime *Runtime) string {
	if settingsRuntime != nil && settingsRuntime.store != nil {
		if path := strings.TrimSpace(settingsRuntime.store.Path()); path != "" {
			return path
		}
	}
	return DefaultFileName
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
			payload["choices"] = encodeSettingsDropdownChoices(allowedValues)
		case settingsValueIsHexColor(value):
			implType = "ColorPickerParam"
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

func encodeSettingsDropdownChoices(values []string) []string {
	choices := make([]string, 0, len(values))
	for _, value := range values {
		choices = append(choices, value)
	}
	return choices
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
		"iFrame", "Iframe",
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
		case "API", "CPU", "CSS", "CSV", "DB", "GPU", "GUI", "HTML", "HTTP", "HTTPS", "ID", "IFRAME", "IO", "JSON", "JS", "LSP", "PDF", "SQL", "SVG", "UI", "URL", "XML", "YAML":
			if strings.ToUpper(token) == "IFRAME" {
				output = append(output, "IFrame")
				continue
			}
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

type settingsIdentifierRuneClass uint8

const (
	settingsIdentifierRuneOther settingsIdentifierRuneClass = iota
	settingsIdentifierRuneDigit
	settingsIdentifierRuneLower
	settingsIdentifierRuneUpper
)

func isSettingsWordBoundary(previous rune, current rune, runes []rune, index int) bool {
	previousClass := classifySettingsIdentifierRune(previous)
	currentClass := classifySettingsIdentifierRune(current)

	switch {
	case previousClass == settingsIdentifierRuneDigit || currentClass == settingsIdentifierRuneDigit:
		return previousClass != currentClass
	case previousClass == settingsIdentifierRuneLower && currentClass == settingsIdentifierRuneUpper:
		return true
	case previousClass != settingsIdentifierRuneUpper || currentClass != settingsIdentifierRuneUpper:
		return false
	case index+1 >= len(runes):
		return false
	default:
		return classifySettingsIdentifierRune(runes[index+1]) == settingsIdentifierRuneLower
	}
}

func classifySettingsIdentifierRune(value rune) settingsIdentifierRuneClass {
	switch {
	case value >= '0' && value <= '9':
		return settingsIdentifierRuneDigit
	case value >= 'a' && value <= 'z':
		return settingsIdentifierRuneLower
	case value >= 'A' && value <= 'Z':
		return settingsIdentifierRuneUpper
	default:
		return settingsIdentifierRuneOther
	}
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
