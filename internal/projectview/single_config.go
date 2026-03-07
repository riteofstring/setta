package projectview

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"

	"setta/internal/projectstate"
)

var (
	ErrProjectConfigIDRequired = errors.New("project config id is required")
	ErrFrontendObjectRequired  = errors.New("frontend payload must be a JSON object")
)

type SingleConfig struct {
	Sections              map[string]Core            `json:"sections"`
	SectionImpls          map[string]json.RawMessage `json:"sectionImpls"`
	SectionVariants       map[string]Variant         `json:"sectionVariants"`
	CodeObjs              map[string]Core            `json:"codeObjs"`
	CodeObjImpls          map[string]json.RawMessage `json:"codeObjImpls"`
	CodeObjVariants       map[string]Variant         `json:"codeObjVariants"`
	ProjectConfig         ProjectConfig              `json:"projectConfig"`
	SingletonSections     SingletonSections          `json:"singletonSections"`
	ParentSectionMap      map[string]*string         `json:"parentSectionMap"`
	ShownParamIDs         map[string]ShownParamIDs   `json:"shownParamIds"`
	RequiredDecodedImages []string                   `json:"requiredDecodedImages"`
	GenCodeBinding        *CodeFileBinding           `json:"genCodeBinding"`
}

type ProjectConfig struct {
	ID                      string                                        `json:"id"`
	Name                    string                                        `json:"name"`
	ShowParamDisplayNames   bool                                          `json:"showParamDisplayNames"`
	AllowJSONSourceKeyEdits bool                                          `json:"allowJsonSourceKeyEdits"`
	PreviewImgColor         string                                        `json:"previewImgColor,omitempty"`
	Viewport                *projectstate.Viewport                        `json:"viewport"`
	ViewportInitialized     bool                                          `json:"viewportInitialized"`
	ViewModes               map[string]projectstate.ViewMode              `json:"viewModes"`
	ActiveViewModeID        *string                                       `json:"activeViewModeId"`
	IsEditingViewMode       bool                                          `json:"isEditingViewMode"`
	CodegenTargets          []json.RawMessage                             `json:"codegenTargets"`
	EntryCodeBlockID        *string                                       `json:"entryCodeBlockId"`
	TopLevelSections        map[string]projectstate.TopLevelSectionLayout `json:"topLevelSections"`
	SectionVariantMap       map[string]string                             `json:"sectionVariantMap"`
	ActiveIDs               []string                                      `json:"activeIds"`
	Edges                   []projectstate.Edge                           `json:"edges"`
	AgenticEdges            []projectstate.AgenticEdge                    `json:"agenticEdges"`
}

type Core struct {
	ID             string          `json:"id"`
	Name           string          `json:"name"`
	DisplayName    string          `json:"displayName"`
	Variants       []string        `json:"variants"`
	DefaultVariant *string         `json:"defaultVariant"`
	SharedModifier json.RawMessage `json:"sharedModifier"`
	UnsharedKeys   []string        `json:"unsharedKeys"`
}

type Variant struct {
	ID             string          `json:"id"`
	Name           string          `json:"name"`
	Impl           string          `json:"impl"`
	NonPresetImpls []string        `json:"nonPresetImpls"`
	Modifier       json.RawMessage `json:"modifier"`
	IsFrozen       bool            `json:"isFrozen"`
}

type SingletonSections struct {
	GlobalVariables   *string `json:"GlobalVariables"`
	GenPythonCode     *string `json:"GenPythonCode"`
	GenPythonMetadata *string `json:"GenPythonMetadata"`
}

type ShownParamIDs struct {
	Pinned   ShownParamIDDetails `json:"pinned"`
	Unpinned ShownParamIDDetails `json:"unpinned"`
}

type ShownParamIDDetails struct {
	RequiredParamIDsToPaths map[string][]string `json:"requiredParamIdsToPaths"`
	TopLevelParamIDs        []string            `json:"topLevelParamIds"`
}

type CodeFileBinding struct {
	CanonicalPath string `json:"canonical_path"`
	AccessMode    string `json:"access_mode"`
	AutoBinding   bool   `json:"autoBinding"`
}

func DefaultSingleConfig(document projectstate.Document) (SingleConfig, error) {
	projectID := strings.TrimSpace(document.DefaultProjectID)
	if projectID == "" {
		return SingleConfig{}, fmt.Errorf("%w: default project id", ErrProjectConfigIDRequired)
	}
	return SingleConfigByProjectID(document, projectID)
}

func SingleConfigByProjectID(document projectstate.Document, projectID string) (SingleConfig, error) {
	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return SingleConfig{}, ErrProjectConfigIDRequired
	}

	project, err := document.ProjectByID(trimmedProjectID)
	if err != nil {
		return SingleConfig{}, err
	}

	view := SingleConfig{
		Sections:              make(map[string]Core, len(project.Sections)),
		SectionImpls:          make(map[string]json.RawMessage, len(project.SectionImpls)),
		SectionVariants:       make(map[string]Variant, len(project.SectionVariants)),
		CodeObjs:              make(map[string]Core, len(project.CodeObjs)),
		CodeObjImpls:          make(map[string]json.RawMessage, len(project.CodeObjImpls)),
		CodeObjVariants:       make(map[string]Variant, len(project.CodeObjVariants)),
		ProjectConfig:         projectConfigFromProject(project),
		SingletonSections:     deriveSingletonSections(project),
		ParentSectionMap:      deriveParentSectionMap(project),
		ShownParamIDs:         make(map[string]ShownParamIDs),
		RequiredDecodedImages: deriveRequiredDecodedImages(project),
		GenCodeBinding:        deriveGenCodeBinding(project),
	}

	for sectionID, section := range project.Sections {
		view.Sections[sectionID] = coreFromSection(section)
	}
	for implID, impl := range project.SectionImpls {
		payload, err := sectionImplPayload(impl)
		if err != nil {
			return SingleConfig{}, fmt.Errorf("project %q section impl %q: %w", project.ID, implID, err)
		}
		view.SectionImpls[implID] = payload
	}
	for variantID, variant := range project.SectionVariants {
		view.SectionVariants[variantID] = variantFromSectionVariant(variant)
	}
	for codeObjID, codeObj := range project.CodeObjs {
		view.CodeObjs[codeObjID] = coreFromCodeObject(codeObj)
	}
	for implID, impl := range project.CodeObjImpls {
		payload, err := codeObjImplPayload(impl)
		if err != nil {
			return SingleConfig{}, fmt.Errorf("project %q code object impl %q: %w", project.ID, implID, err)
		}
		view.CodeObjImpls[implID] = payload
	}
	for variantID, variant := range project.CodeObjVariants {
		view.CodeObjVariants[variantID] = variantFromCodeObjectVariant(variant)
	}

	shownParamIDs, err := deriveShownParamIDs(project)
	if err != nil {
		return SingleConfig{}, err
	}
	view.ShownParamIDs = shownParamIDs

	return view, nil
}

func projectConfigFromProject(project projectstate.Project) ProjectConfig {
	viewModes := make(map[string]projectstate.ViewMode, len(project.ViewModes))
	for viewModeID, viewMode := range project.ViewModes {
		viewModes[viewModeID] = viewMode.Clone()
	}

	topLevelSections := make(map[string]projectstate.TopLevelSectionLayout, len(project.TopLevelSections)+len(project.TopLevelSectionIDs))
	for sectionID, layout := range project.TopLevelSections {
		topLevelSections[sectionID] = layout.Clone()
	}
	for _, sectionID := range project.TopLevelSectionIDs {
		if _, ok := topLevelSections[sectionID]; !ok {
			topLevelSections[sectionID] = projectstate.TopLevelSectionLayout{}
		}
	}

	codegenTargets := make([]json.RawMessage, 0, len(project.CodegenTargets))
	for _, target := range project.CodegenTargets {
		codegenTargets = append(codegenTargets, codegenTargetPayload(target))
	}

	activeViewModeID := stringPointerOrNil(project.ActiveViewModeID)
	entryCodeBlockID := stringPointerOrNil(project.EntryCodeBlockID)

	edges := make([]projectstate.Edge, len(project.Edges))
	for index, edge := range project.Edges {
		edges[index] = edge.Clone()
	}
	agenticEdges := make([]projectstate.AgenticEdge, len(project.AgenticEdges))
	for index, edge := range project.AgenticEdges {
		agenticEdges[index] = edge.Clone()
	}

	return ProjectConfig{
		ID:                      project.ID,
		Name:                    project.Name,
		ShowParamDisplayNames:   project.ShowParamDisplayNames,
		AllowJSONSourceKeyEdits: project.AllowJSONSourceKeyEdits,
		PreviewImgColor:         project.PreviewImgColor,
		Viewport:                cloneViewport(project.Viewport),
		ViewportInitialized:     project.ViewportInitialized,
		ViewModes:               viewModes,
		ActiveViewModeID:        activeViewModeID,
		IsEditingViewMode:       project.IsEditingViewMode,
		CodegenTargets:          codegenTargets,
		EntryCodeBlockID:        entryCodeBlockID,
		TopLevelSections:        topLevelSections,
		SectionVariantMap:       cloneStringMap(project.SectionVariantMap),
		ActiveIDs:               append([]string(nil), project.ActiveIDs...),
		Edges:                   edges,
		AgenticEdges:            agenticEdges,
	}
}

func coreFromSection(section projectstate.Section) Core {
	return Core{
		ID:             section.ID,
		Name:           section.Name,
		DisplayName:    section.DisplayName,
		Variants:       append([]string(nil), section.VariantIDs...),
		DefaultVariant: stringPointerOrNil(section.DefaultVariantID),
		SharedModifier: cloneRawJSON(section.SharedModifier),
		UnsharedKeys:   append([]string(nil), section.UnsharedKeys...),
	}
}

func coreFromCodeObject(codeObj projectstate.CodeObject) Core {
	return Core{
		ID:             codeObj.ID,
		Name:           codeObj.Name,
		DisplayName:    codeObj.DisplayName,
		Variants:       append([]string(nil), codeObj.VariantIDs...),
		DefaultVariant: stringPointerOrNil(codeObj.DefaultVariantID),
		SharedModifier: cloneRawJSON(codeObj.SharedModifier),
		UnsharedKeys:   append([]string(nil), codeObj.UnsharedKeys...),
	}
}

func variantFromSectionVariant(variant projectstate.SectionVariant) Variant {
	return Variant{
		ID:             variant.ID,
		Name:           variant.Name,
		Impl:           variant.ImplID,
		NonPresetImpls: append([]string(nil), variant.NonPresetImplIDs...),
		Modifier:       cloneRawJSON(variant.Modifier),
		IsFrozen:       variant.IsFrozen,
	}
}

func variantFromCodeObjectVariant(variant projectstate.CodeObjectVariant) Variant {
	return Variant{
		ID:             variant.ID,
		Name:           variant.Name,
		Impl:           variant.ImplID,
		NonPresetImpls: append([]string(nil), variant.NonPresetImplIDs...),
		Modifier:       cloneRawJSON(variant.Modifier),
		IsFrozen:       variant.IsFrozen,
	}
}

func deriveSingletonSections(project projectstate.Project) SingletonSections {
	var singletons SingletonSections
	for _, sectionID := range sortedSectionIDs(project.Sections) {
		variantID, ok := project.SectionVariantMap[sectionID]
		if !ok {
			continue
		}
		sectionType, err := effectiveSectionType(project, sectionID, variantID)
		if err != nil {
			continue
		}
		switch sectionType {
		case "GlobalVariables":
			if singletons.GlobalVariables == nil {
				singletons.GlobalVariables = stringPointer(sectionID)
			}
		case "GenPythonCode":
			if singletons.GenPythonCode == nil {
				singletons.GenPythonCode = stringPointer(sectionID)
			}
		case "GenPythonMetadata":
			if singletons.GenPythonMetadata == nil {
				singletons.GenPythonMetadata = stringPointer(sectionID)
			}
		}
	}
	return singletons
}

func deriveParentSectionMap(project projectstate.Project) map[string]*string {
	parentSectionMap := make(map[string]*string, len(project.Sections))
	for _, sectionID := range sortedSectionIDs(project.Sections) {
		parentID := strings.TrimSpace(project.Sections[sectionID].ParentSectionID)
		parentSectionMap[sectionID] = stringPointerOrNil(parentID)
	}
	return parentSectionMap
}

func deriveShownParamIDs(project projectstate.Project) (map[string]ShownParamIDs, error) {
	output := make(map[string]ShownParamIDs)
	for _, sectionID := range sortedSectionIDs(project.Sections) {
		section := project.Sections[sectionID]
		for _, variantID := range section.VariantIDs {
			effectiveSection, err := effectiveSectionObject(project, sectionID, variantID)
			if err != nil {
				return nil, fmt.Errorf("project %q section %q variant %q: %w", project.ID, sectionID, variantID, err)
			}
			codeObjVariantMap := stringMapField(effectiveSection, "codeObjVariantMap")
			if len(codeObjVariantMap) == 0 {
				continue
			}
			topLevelParamIDs, ok, err := topLevelParamIDs(project, codeObjVariantMap, effectiveSection)
			if err != nil {
				return nil, fmt.Errorf("project %q section %q variant %q top-level params: %w", project.ID, sectionID, variantID, err)
			}
			if !ok {
				continue
			}
			paramIDs, idToPath, childrenMap, err := traverseParamHierarchy(project, codeObjVariantMap, topLevelParamIDs)
			if err != nil {
				return nil, fmt.Errorf("project %q section %q variant %q param traversal: %w", project.ID, sectionID, variantID, err)
			}
			pinnedParams := stringSet(arrayStringField(effectiveSection, "pinnedParams"))
			output[variantID] = filterForUIDisplay(paramIDs, idToPath, childrenMap, pinnedParams)
		}
	}
	return output, nil
}

func deriveRequiredDecodedImages(project projectstate.Project) []string {
	output := map[string]struct{}{}
	for _, sectionID := range sortedSectionIDs(project.Sections) {
		section := project.Sections[sectionID]
		for _, variantID := range section.VariantIDs {
			effectiveSection, err := effectiveSectionObject(project, sectionID, variantID)
			if err != nil {
				continue
			}
			if stringField(effectiveSection, "type") != "Draw" {
				continue
			}
			for _, path := range collectDrawImagePaths(effectiveSection) {
				output[path] = struct{}{}
			}
		}
	}
	return sortedKeys(output)
}

func deriveGenCodeBinding(project projectstate.Project) *CodeFileBinding {
	if !project.HasPythonCodegenTarget() {
		return nil
	}
	if project.GeneratedCodeBinding != nil {
		return codeFileBindingFromProjectState(project.GeneratedCodeBinding)
	}
	singletons := deriveSingletonSections(project)
	if singletons.GenPythonCode == nil {
		return nil
	}
	sectionID := *singletons.GenPythonCode
	variantID, ok := project.SectionVariantMap[sectionID]
	if !ok {
		return nil
	}
	effectiveSection, err := effectiveSectionObject(project, sectionID, variantID)
	if err != nil {
		return nil
	}
	bindingObject, ok := objectField(effectiveSection, "codeFileBinding")
	if !ok {
		return nil
	}
	binding, err := decodeFrontendBinding(bindingObject)
	if err != nil {
		return nil
	}
	return binding
}

func topLevelParamIDs(project projectstate.Project, codeObjVariantMap map[string]string, sectionPayload map[string]any) ([]string, bool, error) {
	callableID := stringField(sectionPayload, "callable")
	if callableID != "" {
		children, err := effectiveCodeObjChildren(project, codeObjVariantMap, callableID)
		return children, true, err
	}
	topLevelParamID := stringField(sectionPayload, "topLevelParamId")
	if topLevelParamID != "" {
		children, err := effectiveCodeObjChildren(project, codeObjVariantMap, topLevelParamID)
		return children, true, err
	}
	return nil, false, nil
}

func traverseParamHierarchy(project projectstate.Project, codeObjVariantMap map[string]string, rootIDs []string) ([]string, map[string][]string, map[string][]string, error) {
	paramIDs := []string{}
	idToPath := map[string][]string{}
	childrenMap := map[string][]string{}
	visited := map[string]struct{}{}

	var walk func(string, []string) error
	walk = func(codeObjID string, path []string) error {
		if _, ok := visited[codeObjID]; ok {
			return nil
		}
		visited[codeObjID] = struct{}{}

		payload, err := effectiveCodeObjObject(project, codeObjVariantMap, codeObjID)
		if err != nil {
			return err
		}
		currentPath := append(append([]string(nil), path...), codeObjID)
		codeObjType := codeObjType(project, codeObjID, payload)
		if isParamType(codeObjType) {
			paramIDs = append(paramIDs, codeObjID)
			idToPath[codeObjID] = append([]string(nil), currentPath...)
		}

		children := arrayStringField(payload, "children")
		if len(children) > 0 {
			childrenMap[codeObjID] = append([]string(nil), children...)
		}
		for _, childID := range children {
			if err := walk(childID, currentPath); err != nil {
				return err
			}
		}
		return nil
	}

	for _, rootID := range rootIDs {
		if err := walk(rootID, nil); err != nil {
			return nil, nil, nil, err
		}
	}

	return paramIDs, idToPath, childrenMap, nil
}

func filterForUIDisplay(paramIDs []string, idToPath map[string][]string, childrenMap map[string][]string, pinnedParams map[string]struct{}) ShownParamIDs {
	paramsForPinnedArea := map[string]struct{}{}
	paramsForUnpinnedArea := map[string]struct{}{}

	for _, paramID := range paramIDs {
		if _, ok := pinnedParams[paramID]; !ok {
			continue
		}
		for _, pathID := range idToPath[paramID] {
			paramsForPinnedArea[pathID] = struct{}{}
		}
		addDescendants(paramID, childrenMap, paramsForPinnedArea)
	}

	for _, paramID := range paramIDs {
		if _, ok := pinnedParams[paramID]; ok {
			continue
		}
		for _, pathID := range idToPath[paramID] {
			paramsForUnpinnedArea[pathID] = struct{}{}
		}
	}

	return ShownParamIDs{
		Pinned:   buildShownParamArea(paramIDs, paramsForPinnedArea, idToPath, childrenMap),
		Unpinned: buildShownParamArea(paramIDs, paramsForUnpinnedArea, idToPath, childrenMap),
	}
}

func buildShownParamArea(paramIDs []string, candidates map[string]struct{}, idToPath map[string][]string, childrenMap map[string][]string) ShownParamIDDetails {
	result := ShownParamIDDetails{
		RequiredParamIDsToPaths: map[string][]string{},
		TopLevelParamIDs:        []string{},
	}
	included := map[string]struct{}{}

	for _, paramID := range paramIDs {
		if !shouldIncludeParam(paramID, candidates, childrenMap) {
			continue
		}
		path := idToPath[paramID]
		for _, pathID := range path {
			result.RequiredParamIDsToPaths[pathID] = append([]string(nil), idToPath[pathID]...)
		}
		included[paramID] = struct{}{}
	}

	for _, paramID := range paramIDs {
		if _, ok := included[paramID]; !ok {
			continue
		}
		hasParent := false
		for parentID := range included {
			if slices.Contains(childrenMap[parentID], paramID) {
				hasParent = true
				break
			}
		}
		if !hasParent {
			result.TopLevelParamIDs = append(result.TopLevelParamIDs, paramID)
		}
	}

	return result
}

func shouldIncludeParam(paramID string, candidates map[string]struct{}, childrenMap map[string][]string) bool {
	if _, ok := candidates[paramID]; !ok {
		return false
	}
	children := childrenMap[paramID]
	if len(children) == 0 {
		return true
	}
	for _, childID := range children {
		if shouldIncludeParam(childID, candidates, childrenMap) {
			return true
		}
	}
	return false
}

func addDescendants(paramID string, childrenMap map[string][]string, target map[string]struct{}) {
	for _, childID := range childrenMap[paramID] {
		target[childID] = struct{}{}
		addDescendants(childID, childrenMap, target)
	}
}

func effectiveSectionType(project projectstate.Project, sectionID string, variantID string) (string, error) {
	payload, err := effectiveSectionObject(project, sectionID, variantID)
	if err != nil {
		return "", err
	}
	if sectionType := stringField(payload, "type"); sectionType != "" {
		return sectionType, nil
	}
	_, _, impl, err := project.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return "", err
	}
	return fallbackSectionType(impl), nil
}

func effectiveSectionObject(project projectstate.Project, sectionID string, variantID string) (map[string]any, error) {
	section, ok := project.Sections[sectionID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", projectstate.ErrSectionNotFound, sectionID)
	}
	variant, ok := project.SectionVariants[variantID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", projectstate.ErrSectionVariantNotFound, variantID)
	}
	impl, ok := project.SectionImpls[variant.ImplID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", projectstate.ErrSectionImplNotFound, variant.ImplID)
	}
	base, err := rawObjectFromPayload(sectionImplPayloadUnchecked(impl))
	if err != nil {
		return nil, err
	}
	sharedModifier, err := rawObjectFromModifier(section.SharedModifier)
	if err != nil {
		return nil, err
	}
	modifier, err := rawObjectFromModifier(variant.Modifier)
	if err != nil {
		return nil, err
	}
	return mergeObjects(mergeObjects(base, sharedModifier), modifier), nil
}

func effectiveCodeObjChildren(project projectstate.Project, codeObjVariantMap map[string]string, codeObjID string) ([]string, error) {
	payload, err := effectiveCodeObjObject(project, codeObjVariantMap, codeObjID)
	if err != nil {
		return nil, err
	}
	return arrayStringField(payload, "children"), nil
}

func effectiveCodeObjObject(project projectstate.Project, codeObjVariantMap map[string]string, codeObjID string) (map[string]any, error) {
	codeObj, ok := project.CodeObjs[codeObjID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", projectstate.ErrCodeObjNotFound, codeObjID)
	}
	variantID, ok := codeObjVariantMap[codeObjID]
	if !ok {
		return nil, fmt.Errorf("%w: codeObj=%q", projectstate.ErrCodeObjVariantNotFound, codeObjID)
	}
	variant, ok := project.CodeObjVariants[variantID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", projectstate.ErrCodeObjVariantNotFound, variantID)
	}
	impl, ok := project.CodeObjImpls[variant.ImplID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", projectstate.ErrCodeObjImplNotFound, variant.ImplID)
	}
	base, err := rawObjectFromPayload(codeObjImplPayloadUnchecked(impl))
	if err != nil {
		return nil, err
	}
	sharedModifier, err := rawObjectFromModifier(codeObj.SharedModifier)
	if err != nil {
		return nil, err
	}
	modifier, err := rawObjectFromModifier(variant.Modifier)
	if err != nil {
		return nil, err
	}
	return mergeObjects(mergeObjects(base, sharedModifier), modifier), nil
}

func codeObjType(project projectstate.Project, codeObjID string, payload map[string]any) string {
	if objectType := stringField(payload, "type"); objectType != "" {
		return objectType
	}
	variantIDs := project.CodeObjs[codeObjID].VariantIDs
	if len(variantIDs) == 0 {
		return ""
	}
	if variant, ok := project.CodeObjVariants[variantIDs[0]]; ok {
		if impl, ok := project.CodeObjImpls[variant.ImplID]; ok {
			return impl.Type
		}
	}
	return ""
}

func isParamType(codeObjType string) bool {
	switch codeObjType {
	case "CodeCallable", "":
		return false
	default:
		return true
	}
}

func collectDrawImagePaths(sectionPayload map[string]any) []string {
	output := []string{}
	layers, ok := sectionPayload["layers"].([]any)
	if !ok {
		return output
	}
	for _, rawLayer := range layers {
		layer, ok := rawLayer.(map[string]any)
		if !ok {
			continue
		}
		elements, ok := layer["elements"].([]any)
		if !ok {
			continue
		}
		for _, rawElement := range elements {
			element, ok := rawElement.(map[string]any)
			if !ok {
				continue
			}
			if stringField(element, "type") != "Image" {
				continue
			}
			dataPath := stringField(element, "dataPath")
			if dataPath != "" {
				output = append(output, dataPath)
			}
		}
	}
	return output
}

func sectionImplPayload(impl projectstate.SectionImpl) (json.RawMessage, error) {
	payload := sectionImplPayloadUnchecked(impl)
	_, err := rawObjectFromPayload(payload)
	if err != nil {
		return nil, err
	}
	return payload, nil
}

func sectionImplPayloadUnchecked(impl projectstate.SectionImpl) json.RawMessage {
	if len(impl.Payload) > 0 {
		return cloneRawJSON(impl.Payload)
	}
	payload := map[string]any{
		"id":   impl.ID,
		"type": fallbackSectionType(impl),
	}
	switch {
	case impl.IsCode():
		payload["codeLanguage"] = string(impl.Code.Language)
		if impl.Code.Binding != nil {
			payload["codeFileBinding"] = bindingObject(impl.Code.Binding)
		}
		if impl.Code.AttachedTerminalSectionID != "" {
			payload["attachedTerminalSectionId"] = impl.Code.AttachedTerminalSectionID
		}
		payload["children"] = append([]string(nil), impl.Code.Children...)
	case impl.IsDraw():
		if impl.Draw.RenderedImagePath != "" {
			payload["renderedImagePath"] = impl.Draw.RenderedImagePath
		}
	}
	return mustMarshal(payload)
}

func codeObjImplPayload(impl projectstate.CodeObjectImpl) (json.RawMessage, error) {
	payload := codeObjImplPayloadUnchecked(impl)
	_, err := rawObjectFromPayload(payload)
	if err != nil {
		return nil, err
	}
	return payload, nil
}

func codeObjImplPayloadUnchecked(impl projectstate.CodeObjectImpl) json.RawMessage {
	if len(impl.Payload) > 0 {
		return cloneRawJSON(impl.Payload)
	}
	return mustMarshal(map[string]any{
		"id":   impl.ID,
		"type": impl.Type,
	})
}

func fallbackSectionType(impl projectstate.SectionImpl) string {
	switch {
	case impl.IsCode():
		return "Code"
	case impl.IsTerminal():
		return "Terminal"
	case impl.IsDraw():
		return "Draw"
	case impl.IsGenerated():
		switch impl.Generated.Kind {
		case projectstate.GeneratedSectionKindPythonCode:
			return "GenPythonCode"
		case projectstate.GeneratedSectionKindPythonMetadata:
			return "GenPythonMetadata"
		case projectstate.GeneratedSectionKindPlugin:
			return "Plugin"
		}
	}
	if impl.Kind == "" {
		return ""
	}
	return string(impl.Kind)
}

func codegenTargetPayload(target projectstate.ProjectCodegenTarget) json.RawMessage {
	if len(target.Payload) > 0 {
		return cloneRawJSON(target.Payload)
	}
	return mustMarshal(map[string]any{
		"language": target.Language,
	})
}

func codeFileBindingFromProjectState(binding *projectstate.CodeFileBinding) *CodeFileBinding {
	if binding == nil {
		return nil
	}
	return &CodeFileBinding{
		CanonicalPath: binding.Path,
		AccessMode:    bindingAccessMode(binding.AccessMode),
		AutoBinding:   false,
	}
}

func decodeFrontendBinding(payload map[string]any) (*CodeFileBinding, error) {
	canonicalPath := stringField(payload, "canonical_path")
	if canonicalPath == "" {
		return nil, nil
	}
	return &CodeFileBinding{
		CanonicalPath: canonicalPath,
		AccessMode:    stringField(payload, "access_mode"),
		AutoBinding:   boolField(payload, "autoBinding"),
	}, nil
}

func bindingObject(binding *projectstate.CodeFileBinding) map[string]any {
	return map[string]any{
		"canonical_path": binding.Path,
		"access_mode":    bindingAccessMode(binding.AccessMode),
		"autoBinding":    false,
	}
}

func bindingAccessMode(mode projectstate.CodeFileAccessMode) string {
	if strings.TrimSpace(string(mode)) == "" {
		return string(projectstate.CodeFileAccessModeReadWrite)
	}
	return string(mode)
}

func rawObjectFromModifier(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	return rawObjectFromPayload(raw)
}

func rawObjectFromPayload(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return nil, ErrFrontendObjectRequired
	}
	return object, nil
}

func mergeObjects(base map[string]any, modifier map[string]any) map[string]any {
	merged := cloneObject(base)
	for key, value := range modifier {
		baseObject, baseIsObject := merged[key].(map[string]any)
		modifierObject, modifierIsObject := value.(map[string]any)
		if baseIsObject && modifierIsObject {
			merged[key] = mergeObjects(baseObject, modifierObject)
			continue
		}
		merged[key] = cloneValue(value)
	}
	return merged
}

func cloneObject(source map[string]any) map[string]any {
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = cloneValue(value)
	}
	return cloned
}

func cloneValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneObject(typed)
	case []any:
		cloned := make([]any, len(typed))
		for index, entry := range typed {
			cloned[index] = cloneValue(entry)
		}
		return cloned
	default:
		return typed
	}
}

func stringField(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok {
		return ""
	}
	output, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(output)
}

func boolField(object map[string]any, key string) bool {
	value, ok := object[key]
	if !ok {
		return false
	}
	output, ok := value.(bool)
	return ok && output
}

func arrayStringField(object map[string]any, key string) []string {
	value, ok := object[key]
	if !ok {
		return nil
	}
	rawEntries, ok := value.([]any)
	if !ok {
		return nil
	}
	output := make([]string, 0, len(rawEntries))
	for _, entry := range rawEntries {
		stringValue, ok := entry.(string)
		if ok && strings.TrimSpace(stringValue) != "" {
			output = append(output, strings.TrimSpace(stringValue))
		}
	}
	return output
}

func stringMapField(object map[string]any, key string) map[string]string {
	value, ok := object[key]
	if !ok {
		return nil
	}
	rawMap, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	output := make(map[string]string, len(rawMap))
	for mapKey, rawValue := range rawMap {
		stringValue, ok := rawValue.(string)
		if ok && strings.TrimSpace(stringValue) != "" {
			output[mapKey] = strings.TrimSpace(stringValue)
		}
	}
	return output
}

func objectField(object map[string]any, key string) (map[string]any, bool) {
	value, ok := object[key]
	if !ok {
		return nil, false
	}
	rawObject, ok := value.(map[string]any)
	return rawObject, ok
}

func stringSet(values []string) map[string]struct{} {
	output := make(map[string]struct{}, len(values))
	for _, value := range values {
		output[value] = struct{}{}
	}
	return output
}

func sortedSectionIDs(sections map[string]projectstate.Section) []string {
	ids := make([]string, 0, len(sections))
	for sectionID := range sections {
		ids = append(ids, sectionID)
	}
	sort.Strings(ids)
	return ids
}

func sortedKeys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func stringPointer(value string) *string {
	output := value
	return &output
}

func stringPointerOrNil(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return stringPointer(trimmed)
}

func cloneStringMap(source map[string]string) map[string]string {
	if source == nil {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}

func cloneViewport(viewport *projectstate.Viewport) *projectstate.Viewport {
	if viewport == nil {
		return nil
	}
	cloned := *viewport
	return &cloned
}

func cloneRawJSON(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	cloned := make(json.RawMessage, len(raw))
	copy(cloned, raw)
	return cloned
}

func mustMarshal(payload map[string]any) json.RawMessage {
	content, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return content
}
