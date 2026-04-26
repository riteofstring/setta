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

const (
	runDisabledReasonManualSectionRequired = "Select a manual code section to run."
	runDisabledReasonManualEntryRequired   = "Select a manual entry code block to run."
	runDisabledReasonNotRunnable           = "Run is only available for Python and Bash."
	runDisabledReasonPluginCodegen         = "Plugin-codegen entry runs are not supported in Go yet."
)

var (
	pythonSectionTypeOrder             = projectstate.AllPythonSectionTypes()
	defaultPythonSectionAllowlistOrder = convertStringSlice[projectstate.FrontendSectionType](
		projectstate.DefaultPythonSectionAllowlistOrder(),
	)
	pythonCodeObjTypeOrder                 = projectstate.AllPythonCodeObjTypes()
	defaultPythonMetaControlAllowlistOrder = convertStringSlice[projectstate.FrontendCodeObjType](
		projectstate.DefaultPythonMetaControlAllowlistOrder(),
	)
)

type SingleConfig struct {
	Sections              map[string]Core                        `json:"sections"`
	SectionImpls          map[string]json.RawMessage             `json:"sectionImpls" ts_type:"Record<string, BaseSectionImplUnion>" shared_schema_map_value_ref:"BaseSectionImpl"`
	SectionCapabilities   map[string]SectionCapabilities         `json:"sectionCapabilities"`
	SectionVariants       map[string]Variant                     `json:"sectionVariants"`
	CodeObjs              map[string]Core                        `json:"codeObjs"`
	CodeObjImpls          map[string]json.RawMessage             `json:"codeObjImpls" ts_type:"Record<string, BaseCodeObjImplUnion>" shared_schema_map_value_ref:"BaseCodeObjImpl"`
	CodeObjVariants       map[string]Variant                     `json:"codeObjVariants"`
	ProjectConfig         ProjectConfig                          `json:"projectConfig"`
	PluginData            ProjectPluginData                      `json:"pluginData" py_default:"go_value"`
	SingletonSections     SingletonSections                      `json:"singletonSections"`
	ParentSectionMap      map[string]*string                     `json:"parentSectionMap"`
	ShownParamIDs         map[string]ShownParamIDs               `json:"shownParamIds"`
	RequiredDecodedImages []string                               `json:"requiredDecodedImages"`
	GenCodeBinding        *CodeFileBinding                       `json:"genCodeBinding"`
	ProjectChatWindowing  projectstate.ProjectChatWindowingState `json:"projectChatWindowing"`
	ArtifactGroups        map[string]any                         `json:"artifactGroups,omitempty"`
}

type ProjectConfig struct {
	ID                      string                                        `json:"id" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id" py_default:"Field(default_factory=create_new_id)"`
	Name                    string                                        `json:"name" py_import:"from setta.utils.generate_memorable_string import generate_memorable_string" py_default:"Field(default_factory=generate_memorable_string)"`
	ShowParamDisplayNames   bool                                          `json:"showParamDisplayNames" py_default:"go_value"`
	AllowJSONSourceKeyEdits bool                                          `json:"allowJsonSourceKeyEdits" py_default:"go_value"`
	PreviewImgColor         string                                        `json:"previewImgColor,omitempty" py_default:"go_value"`
	Viewport                *projectstate.Viewport                        `json:"viewport" py_default:"go_value"`
	ViewportInitialized     bool                                          `json:"viewportInitialized" py_default:"go_value"`
	ViewModes               map[string]projectstate.ViewMode              `json:"viewModes" py_type:"dict[ID, ViewMode]" py_import:"from setta.types.id import ID, create_new_id" py_default:"go_value"`
	ActiveViewModeID        *string                                       `json:"activeViewModeId" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id"`
	IsEditingViewMode       bool                                          `json:"isEditingViewMode" py_default:"go_value"`
	HasPythonCodegenTarget  bool                                          `json:"hasPythonCodegenTarget" py_default:"go_value"`
	RunCapabilities         ProjectRunCapabilities                        `json:"runCapabilities" py_default:"go_value"`
	CodegenTargets          []ProjectCodegenTarget                        `json:"codegenTargets" py_type:"list[ProjectCodegenPythonTarget | ProjectCodegenPluginTarget]" py_default:"go_value"`
	EntryCodeBlockID        *string                                       `json:"entryCodeBlockId" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id"`
	SectionPathSlugsByID    map[string]string                             `json:"sectionPathSlugsById" py_type:"dict[ID, str]" py_import:"from setta.types.id import ID, create_new_id" py_default:"go_value"`
	SectionIDsByPathSlug    map[string][]string                           `json:"sectionIdsByPathSlug" py_type:"dict[str, list[ID]]" py_import:"from setta.types.id import ID, create_new_id" py_default:"go_value"`
	TopLevelSections        map[string]projectstate.TopLevelSectionLayout `json:"topLevelSections" py_type:"dict[ID, TopLevelSectionLayout]" py_import:"from setta.types.id import ID, create_new_id" py_default:"go_value"`
	WindowSpaceSlugsByID    map[string]string                             `json:"windowSpaceSlugsById" py_type:"dict[ID, str]" py_import:"from setta.types.id import ID, create_new_id" py_default:"go_value"`
	WindowSpaceIDsBySlug    map[string][]string                           `json:"windowSpaceIdsBySlug" py_type:"dict[str, list[ID]]" py_import:"from setta.types.id import ID, create_new_id" py_default:"go_value"`
	WindowSpaces            map[string]projectstate.WindowSpaceConfig     `json:"windowSpaces" py_type:"dict[ID, WindowSpaceConfig]" py_import:"from setta.types.id import ID, create_new_id" py_default:"go_value"`
	SectionVariantMap       map[string]string                             `json:"sectionVariantMap" py_type:"dict[ID, ID]" py_import:"from setta.types.id import ID, create_new_id" py_default:"go_value"`
	ActiveIDs               []string                                      `json:"activeIds" py_type:"list[ID]" py_import:"from setta.types.id import ID, create_new_id" py_default:"go_value"`
	Edges                   []projectstate.Edge                           `json:"edges" py_default:"go_value"`
	AgenticEdges            []projectstate.AgenticEdge                    `json:"agenticEdges" py_default:"go_value"`
	StateMachineEdges       []projectstate.StateMachineEdge               `json:"stateMachineEdges" py_default:"go_value"`
}

type ProjectPluginData map[string]projectstate.RawJSON

type ProjectRunCapabilities struct {
	CanRunFromMain          bool    `json:"canRunFromMain"`
	MainRunDisabledReason   *string `json:"mainRunDisabledReason" ts_optional:"true"`
	EffectiveEntrySectionID *string `json:"effectiveEntrySectionId" ts_optional:"true"`
}

type SectionCapabilities struct {
	CanRun                    bool    `json:"canRun"`
	RunDisabledReason         *string `json:"runDisabledReason" ts_optional:"true"`
	RunRequestSectionID       *string `json:"runRequestSectionId" ts_optional:"true"`
	CanSelectAsEntryCodeBlock bool    `json:"canSelectAsEntryCodeBlock"`
	EntryCodeBlockValue       *string `json:"entryCodeBlockValue" ts_optional:"true"`
}

type Core struct {
	ID             string               `json:"id"`
	Name           string               `json:"name"`
	DisplayName    string               `json:"displayName"`
	Variants       []string             `json:"variants"`
	DefaultVariant *string              `json:"defaultVariant"`
	SharedModifier projectstate.RawJSON `json:"sharedModifier" ts_type:"Record<string, unknown>" shared_schema_map_value_ref:"RawMessage" shared_schema_non_null:"true"`
	UnsharedKeys   []string             `json:"unsharedKeys"`
}

type Variant struct {
	ID             string               `json:"id"`
	Name           string               `json:"name"`
	Impl           string               `json:"impl"`
	NonPresetImpls []string             `json:"nonPresetImpls"`
	Modifier       projectstate.RawJSON `json:"modifier" ts_type:"Record<string, unknown>" shared_schema_map_value_ref:"RawMessage" shared_schema_non_null:"true"`
	IsFrozen       bool                 `json:"isFrozen"`
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

type CodeFileBinding = projectstate.FrontendCodeFileBinding

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

	pluginData, err := projectstate.ProjectScopedPluginDataForProject(document.PluginData, trimmedProjectID)
	if err != nil {
		return SingleConfig{}, err
	}

	return buildSingleConfig(project, pluginData)
}

func buildSingleConfig(project projectstate.Project, pluginData ProjectPluginData) (SingleConfig, error) {
	view := SingleConfig{
		Sections:              make(map[string]Core, len(project.Sections)),
		SectionImpls:          make(map[string]json.RawMessage, len(project.SectionImpls)),
		SectionCapabilities:   make(map[string]SectionCapabilities, len(project.Sections)),
		SectionVariants:       make(map[string]Variant, len(project.SectionVariants)),
		CodeObjs:              make(map[string]Core, len(project.CodeObjs)),
		CodeObjImpls:          make(map[string]json.RawMessage, len(project.CodeObjImpls)),
		CodeObjVariants:       make(map[string]Variant, len(project.CodeObjVariants)),
		ProjectConfig:         ProjectConfig{},
		PluginData:            ProjectPluginData(pluginData),
		SingletonSections:     deriveSingletonSections(project),
		ParentSectionMap:      deriveParentSectionMap(project),
		ShownParamIDs:         make(map[string]ShownParamIDs),
		RequiredDecodedImages: deriveRequiredDecodedImages(project),
		GenCodeBinding:        deriveGenCodeBinding(project),
		ProjectChatWindowing:  projectstate.DefaultProjectChatWindowingState(),
		ArtifactGroups:        map[string]any{},
	}

	projectConfig, err := projectConfigFromProject(project)
	if err != nil {
		return SingleConfig{}, err
	}
	view.ProjectConfig = projectConfig
	view.SectionCapabilities = deriveSectionCapabilities(project)
	view.ProjectConfig.RunCapabilities = deriveProjectRunCapabilities(
		project,
		view.SingletonSections,
		view.SectionCapabilities,
	)

	if err := populateSectionViewData(&view, project); err != nil {
		return SingleConfig{}, err
	}
	if err := populateCodeObjectViewData(&view, project); err != nil {
		return SingleConfig{}, err
	}

	shownParamIDs, err := deriveShownParamIDs(project)
	if err != nil {
		return SingleConfig{}, err
	}
	view.ShownParamIDs = shownParamIDs
	view.ProjectChatWindowing = projectstate.ProjectChatWindowingOrDefault(
		project.ProjectChatWindowing,
	)

	return view, nil
}

func projectConfigFromProject(project projectstate.Project) (ProjectConfig, error) {
	topLevelSections := cloneTopLevelSectionLayouts(project.TopLevelSections, project.TopLevelSectionIDs)
	viewModes := cloneProjectViewModes(project.ViewModes, project.TopLevelSectionIDs, topLevelSections)
	codegenTargets := cloneProjectCodegenTargets(project.CodegenTargets)

	sectionPathSlugsByID, sectionIDsByPathSlug, err := projectstate.ActiveSectionSlugMaps(project)
	if err != nil {
		return ProjectConfig{}, err
	}
	windowSpaceSlugsByID, windowSpaceIDsBySlug := projectstate.WindowSpaceSlugMaps(project.WindowSpaces)

	activeViewModeID := stringPointerOrNil(project.ActiveViewModeID)
	entryCodeBlockID := stringPointerOrNil(project.EntryCodeBlockID)
	edges, agenticEdges, stateMachineEdges := cloneProjectEdges(project)

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
		HasPythonCodegenTarget:  project.HasPythonCodegenTarget(),
		RunCapabilities:         ProjectRunCapabilities{},
		CodegenTargets:          codegenTargets,
		EntryCodeBlockID:        entryCodeBlockID,
		SectionPathSlugsByID:    cloneStringMap(sectionPathSlugsByID),
		SectionIDsByPathSlug:    cloneStringSlicesMap(sectionIDsByPathSlug),
		TopLevelSections:        topLevelSections,
		WindowSpaceSlugsByID:    cloneStringMap(windowSpaceSlugsByID),
		WindowSpaceIDsBySlug:    cloneStringSlicesMap(windowSpaceIDsBySlug),
		WindowSpaces:            projectstate.CloneWindowSpacesOrEmpty(project.WindowSpaces),
		SectionVariantMap:       cloneStringMap(project.SectionVariantMap),
		ActiveIDs:               cloneStringSlice(project.ActiveIDs),
		Edges:                   edges,
		AgenticEdges:            agenticEdges,
		StateMachineEdges:       stateMachineEdges,
	}, nil
}

func populateSectionViewData(view *SingleConfig, project projectstate.Project) error {
	for sectionID, section := range project.Sections {
		view.Sections[sectionID] = coreFromSection(section)
	}
	for implID, impl := range project.SectionImpls {
		payload, err := sectionImplPayload(impl)
		if err != nil {
			return fmt.Errorf("project %q section impl %q: %w", project.ID, implID, err)
		}
		view.SectionImpls[implID] = payload
	}
	for variantID, variant := range project.SectionVariants {
		view.SectionVariants[variantID] = variantFromSectionVariant(variant)
	}
	return nil
}

func populateCodeObjectViewData(view *SingleConfig, project projectstate.Project) error {
	for codeObjID, codeObj := range project.CodeObjs {
		view.CodeObjs[codeObjID] = coreFromCodeObject(codeObj)
	}
	for implID, impl := range project.CodeObjImpls {
		payload, err := codeObjImplPayload(impl)
		if err != nil {
			return fmt.Errorf("project %q code object impl %q: %w", project.ID, implID, err)
		}
		view.CodeObjImpls[implID] = payload
	}
	for variantID, variant := range project.CodeObjVariants {
		view.CodeObjVariants[variantID] = variantFromCodeObjectVariant(variant)
	}
	return nil
}

func cloneTopLevelSectionLayouts(
	layouts map[string]projectstate.TopLevelSectionLayout,
	topLevelSectionIDs []string,
) map[string]projectstate.TopLevelSectionLayout {
	cloned := make(map[string]projectstate.TopLevelSectionLayout, len(layouts)+len(topLevelSectionIDs))
	for sectionID, layout := range layouts {
		cloned[sectionID] = layout.Clone()
	}
	for _, sectionID := range topLevelSectionIDs {
		if _, ok := cloned[sectionID]; ok {
			continue
		}
		cloned[sectionID] = projectstate.TopLevelSectionLayout{}
	}
	return cloned
}

func cloneProjectViewModes(
	viewModes map[string]projectstate.ViewMode,
	topLevelSectionIDs []string,
	topLevelSections map[string]projectstate.TopLevelSectionLayout,
) map[string]projectstate.ViewMode {
	cloned := make(map[string]projectstate.ViewMode, len(viewModes))
	for viewModeID, viewMode := range viewModes {
		clonedViewMode := viewMode.Clone()
		repairViewModeTopLevelState(&clonedViewMode, topLevelSectionIDs, topLevelSections)
		cloned[viewModeID] = clonedViewMode
	}
	return cloned
}

func repairViewModeTopLevelState(
	viewMode *projectstate.ViewMode,
	topLevelSectionIDs []string,
	topLevelSections map[string]projectstate.TopLevelSectionLayout,
) {
	if viewMode.VisibilityBySectionID == nil {
		viewMode.VisibilityBySectionID = map[string]bool{}
	}
	if viewMode.TopLevelSections == nil {
		viewMode.TopLevelSections = map[string]projectstate.TopLevelSectionLayout{}
	}
	for _, sectionID := range topLevelSectionIDs {
		if _, ok := viewMode.VisibilityBySectionID[sectionID]; !ok {
			viewMode.VisibilityBySectionID[sectionID] = true
		}
		if _, ok := viewMode.TopLevelSections[sectionID]; ok {
			continue
		}
		viewMode.TopLevelSections[sectionID] = topLevelSections[sectionID].Clone()
	}
}

func cloneProjectCodegenTargets(targets []projectstate.ProjectCodegenTarget) []ProjectCodegenTarget {
	cloned := make([]ProjectCodegenTarget, 0, len(targets))
	for _, target := range targets {
		cloned = append(cloned, ProjectCodegenTarget(codegenTargetPayload(target)))
	}
	return cloned
}

func cloneProjectEdges(project projectstate.Project) (
	[]projectstate.Edge,
	[]projectstate.AgenticEdge,
	[]projectstate.StateMachineEdge,
) {
	edges := make([]projectstate.Edge, len(project.Edges))
	for index, edge := range project.Edges {
		edges[index] = edge.Clone()
	}
	agenticEdges := make([]projectstate.AgenticEdge, len(project.AgenticEdges))
	for index, edge := range project.AgenticEdges {
		agenticEdges[index] = edge.Clone()
	}
	stateMachineEdges := make([]projectstate.StateMachineEdge, len(project.StateMachineEdges))
	for index, edge := range project.StateMachineEdges {
		stateMachineEdges[index] = edge.Clone()
	}
	return edges, agenticEdges, stateMachineEdges
}

func coreFromSection(section projectstate.Section) Core {
	return Core{
		ID:             section.ID,
		Name:           section.Name,
		DisplayName:    section.DisplayName,
		Variants:       cloneStringSlice(section.VariantIDs),
		DefaultVariant: stringPointerOrNil(section.DefaultVariantID),
		SharedModifier: cloneRawJSONObject(section.SharedModifier),
		UnsharedKeys:   cloneStringSlice(section.UnsharedKeys),
	}
}

func coreFromCodeObject(codeObj projectstate.CodeObject) Core {
	return Core{
		ID:             codeObj.ID,
		Name:           codeObj.Name,
		DisplayName:    codeObj.DisplayName,
		Variants:       cloneStringSlice(codeObj.VariantIDs),
		DefaultVariant: stringPointerOrNil(codeObj.DefaultVariantID),
		SharedModifier: cloneRawJSONObject(codeObj.SharedModifier),
		UnsharedKeys:   cloneStringSlice(codeObj.UnsharedKeys),
	}
}

func variantFromSectionVariant(variant projectstate.SectionVariant) Variant {
	return Variant{
		ID:             variant.ID,
		Name:           variant.Name,
		Impl:           variant.ImplID,
		NonPresetImpls: cloneStringSlice(variant.NonPresetImplIDs),
		Modifier:       cloneRawJSONObject(variant.Modifier),
		IsFrozen:       variant.IsFrozen,
	}
}

func variantFromCodeObjectVariant(variant projectstate.CodeObjectVariant) Variant {
	return Variant{
		ID:             variant.ID,
		Name:           variant.Name,
		Impl:           variant.ImplID,
		NonPresetImpls: cloneStringSlice(variant.NonPresetImplIDs),
		Modifier:       cloneRawJSONObject(variant.Modifier),
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

func deriveSectionCapabilities(project projectstate.Project) map[string]SectionCapabilities {
	output := make(map[string]SectionCapabilities, len(project.Sections))
	for _, sectionID := range sortedSectionIDs(project.Sections) {
		output[sectionID] = deriveSectionCapability(project, sectionID)
	}
	return output
}

func deriveSectionCapability(project projectstate.Project, sectionID string) SectionCapabilities {
	_, _, impl, err := project.ResolveSection(sectionID)
	if err != nil {
		return SectionCapabilities{
			RunDisabledReason: stringPointer(runDisabledReasonManualSectionRequired),
		}
	}

	capabilities := SectionCapabilities{}
	switch {
	case impl.IsGeneratedEntrySection():
		capabilities.CanSelectAsEntryCodeBlock = true
		if impl.UsesPluginCodegen() {
			capabilities.RunDisabledReason = stringPointer(runDisabledReasonPluginCodegen)
			return capabilities
		}
		capabilities.CanRun = true
		return capabilities
	case impl.IsCode():
		capabilities.CanSelectAsEntryCodeBlock = true
		capabilities.EntryCodeBlockValue = stringPointer(sectionID)
		if impl.IsRunnableCode() {
			capabilities.CanRun = true
			capabilities.RunRequestSectionID = stringPointer(sectionID)
			return capabilities
		}
		capabilities.RunDisabledReason = stringPointer(runDisabledReasonNotRunnable)
		return capabilities
	default:
		capabilities.RunDisabledReason = stringPointer(runDisabledReasonManualSectionRequired)
		return capabilities
	}
}

func deriveProjectRunCapabilities(
	project projectstate.Project,
	singletons SingletonSections,
	sectionCapabilities map[string]SectionCapabilities,
) ProjectRunCapabilities {
	effectiveEntrySectionID := deriveEffectiveEntrySectionID(project, singletons)
	if effectiveEntrySectionID == nil {
		return ProjectRunCapabilities{
			CanRunFromMain:          false,
			MainRunDisabledReason:   stringPointer(runDisabledReasonManualEntryRequired),
			EffectiveEntrySectionID: nil,
		}
	}

	capabilities, ok := sectionCapabilities[*effectiveEntrySectionID]
	if ok && capabilities.CanRun {
		return ProjectRunCapabilities{
			CanRunFromMain:          true,
			MainRunDisabledReason:   nil,
			EffectiveEntrySectionID: stringPointer(*effectiveEntrySectionID),
		}
	}

	reason := stringPointer(runDisabledReasonManualEntryRequired)
	if ok && capabilities.RunDisabledReason != nil {
		reason = stringPointer(*capabilities.RunDisabledReason)
	}
	return ProjectRunCapabilities{
		CanRunFromMain:          false,
		MainRunDisabledReason:   reason,
		EffectiveEntrySectionID: stringPointer(*effectiveEntrySectionID),
	}
}

func deriveEffectiveEntrySectionID(
	project projectstate.Project,
	singletons SingletonSections,
) *string {
	entryCodeBlockID := strings.TrimSpace(project.EntryCodeBlockID)
	if entryCodeBlockID != "" {
		return stringPointer(entryCodeBlockID)
	}
	if !project.HasPythonCodegenTarget() || singletons.GenPythonCode == nil {
		return nil
	}
	return stringPointer(*singletons.GenPythonCode)
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
			sectionType := stringField(effectiveSection, "type")
			if !isSectionWithParamsType(sectionType) {
				continue
			}
			shownParamIDs := emptyShownParamIDs()
			codeObjVariantMap := stringMapField(effectiveSection, "codeObjVariantMap")
			if len(codeObjVariantMap) == 0 {
				output[variantID] = shownParamIDs
				continue
			}
			topLevelParamIDs, ok, err := topLevelParamIDs(project, codeObjVariantMap, effectiveSection)
			if err != nil {
				return nil, fmt.Errorf("project %q section %q variant %q top-level params: %w", project.ID, sectionID, variantID, err)
			}
			if !ok || len(topLevelParamIDs) == 0 {
				output[variantID] = shownParamIDs
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

func emptyShownParamIDs() ShownParamIDs {
	return ShownParamIDs{
		Pinned: ShownParamIDDetails{
			RequiredParamIDsToPaths: map[string][]string{},
			TopLevelParamIDs:        []string{},
		},
		Unpinned: ShownParamIDDetails{
			RequiredParamIDsToPaths: map[string][]string{},
			TopLevelParamIDs:        []string{},
		},
	}
}

func isSectionWithParamsType(sectionType string) bool {
	switch sectionType {
	case "Callable", "Dict", "GlobalVariables":
		return true
	default:
		return false
	}
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
		currentPath := append(cloneStringSlice(path), codeObjID)
		codeObjType := codeObjType(project, codeObjID, payload)
		if isParamType(codeObjType) {
			paramIDs = append(paramIDs, codeObjID)
			idToPath[codeObjID] = cloneStringSlice(currentPath)
		}

		children := arrayStringField(payload, "children")
		if len(children) > 0 {
			childrenMap[codeObjID] = cloneStringSlice(children)
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
			result.RequiredParamIDsToPaths[pathID] = cloneStringSlice(
				idToPath[pathID],
			)
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
	payload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, codeObjID)
	if err != nil {
		return nil, err
	}
	return payload, nil
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
	return projectstate.SectionImplPayload(impl)
}

func sectionImplPayloadUnchecked(impl projectstate.SectionImpl) json.RawMessage {
	payload, err := sectionImplPayload(impl)
	if err != nil {
		panic(err)
	}
	return payload
}

func codeObjImplPayload(impl projectstate.CodeObjectImpl) (json.RawMessage, error) {
	return projectstate.CodeObjectImplPayload(impl)
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
	if strings.TrimSpace(target.Language) == string(projectstate.CodeLanguagePython) {
		payload, ok := pythonCodegenTargetPayload(target)
		if ok {
			return payload
		}
	}
	return pluginCodegenTargetPayload(target)
}

func pythonCodegenTargetPayload(
	target projectstate.ProjectCodegenTarget,
) (json.RawMessage, bool) {
	config, err := projectstate.DecodePythonCodegenTarget(target)
	if err != nil {
		return nil, false
	}
	sectionPolicy, err := config.DecodedSectionPolicy()
	if err != nil {
		return nil, false
	}
	codeObjValuePolicy, err := config.DecodedCodeObjValuePolicy()
	if err != nil {
		return nil, false
	}
	return mustMarshal(ProjectCodegenPythonTarget{
		Language:         ProjectCodegenLanguagePython,
		GenCodePrefix:    config.GenCodePrefix,
		GenCodeSuffix:    config.GenCodeSuffix,
		GenerateMetadata: config.GenerateMetadata,
		SectionPolicy: frontendPythonSectionPolicy(
			config.SectionPolicy,
			sectionPolicy,
		),
		CodeObjValuePolicy: frontendPythonCodeObjValuePolicy(
			config.CodeObjValuePolicy,
			codeObjValuePolicy,
		),
	}), true
}

func pluginCodegenTargetPayload(target projectstate.ProjectCodegenTarget) json.RawMessage {
	payload := ProjectCodegenPluginTarget{
		Language: target.Language,
		Options:  map[string]any{},
	}
	if rawFields, ok := rawJSONObjectFields(target.Payload); ok {
		if rawOptions, exists := rawFields["options"]; exists {
			var options map[string]any
			if err := json.Unmarshal(rawOptions, &options); err == nil && options != nil {
				payload.Options = options
			}
		}
	}
	return mustMarshal(payload)
}

func FrontendDefaultPythonSectionCodegenPolicy() SectionCodegenPolicy {
	return frontendPythonSectionPolicy(nil, projectstate.DefaultPythonSectionCodegenPolicy())
}

func FrontendDefaultPythonCodeObjValuePolicy() CodeObjValuePolicy {
	return frontendPythonCodeObjValuePolicy(nil, projectstate.DefaultPythonCodeObjValuePolicy())
}

func FrontendDefaultProjectCodegenPythonTarget() ProjectCodegenPythonTarget {
	config, err := projectstate.DecodePythonCodegenTarget(projectstate.ProjectCodegenTarget{
		Language: string(projectstate.CodeLanguagePython),
	})
	if err != nil {
		panic("decode default project codegen python target: " + err.Error())
	}
	return ProjectCodegenPythonTarget{
		Language:           ProjectCodegenLanguagePython,
		GenCodePrefix:      config.GenCodePrefix,
		GenCodeSuffix:      config.GenCodeSuffix,
		GenerateMetadata:   config.GenerateMetadata,
		SectionPolicy:      FrontendDefaultPythonSectionCodegenPolicy(),
		CodeObjValuePolicy: FrontendDefaultPythonCodeObjValuePolicy(),
	}
}

func frontendPythonSectionPolicy(
	raw projectstate.RawJSON,
	policy projectstate.PythonSectionCodegenPolicy,
) SectionCodegenPolicy {
	rawFields, ok := rawJSONObjectFields(raw)
	if !ok {
		return SectionCodegenPolicy{
			Allowlist:            orderedTypedPolicyList(policy.Allowlist, defaultPythonSectionAllowlistOrder, policy.AllowlistAllowAll),
			MetaControlAllowlist: orderedTypedPolicyList(policy.MetaControlAllowlist, defaultPythonMetaControlAllowlistOrder, policy.MetaControlAllowlistAllowAll),
			Exclude:              orderedSetValues(policy.Exclude),
			TypePolicies:         frontendPythonSectionTypePolicies(policy.TypePolicies),
			SectionOverrides:     frontendPythonSectionOverrides(policy.SectionOverrides),
		}
	}

	allowlist := orderedTypedPolicyList(
		policy.Allowlist,
		defaultPythonSectionAllowlistOrder,
		policy.AllowlistAllowAll,
	)
	if rawAllowlist, exists := rawFields["allowlist"]; exists {
		allowlist = decodeOrderedTypedList(rawAllowlist, allowlist)
	}
	metaControlAllowlist := orderedTypedPolicyList(
		policy.MetaControlAllowlist,
		defaultPythonMetaControlAllowlistOrder,
		policy.MetaControlAllowlistAllowAll,
	)
	if rawAllowlist, exists := rawFields["metaControlAllowlist"]; exists {
		metaControlAllowlist = decodeOrderedTypedList(
			rawAllowlist,
			metaControlAllowlist,
		)
	}
	exclude := orderedSetValues(policy.Exclude)
	if rawExclude, exists := rawFields["exclude"]; exists {
		exclude = decodeOrderedStringList(rawExclude, exclude)
	}
	typePolicies := frontendPythonSectionTypePolicies(policy.TypePolicies)
	if rawTypePolicies, exists := rawFields["typePolicies"]; exists {
		typePolicies = frontendPythonSectionTypePoliciesFromRaw(
			rawTypePolicies,
			policy.TypePolicies,
		)
	}
	sectionOverrides := frontendPythonSectionOverrides(policy.SectionOverrides)
	if rawOverrides, exists := rawFields["sectionOverrides"]; exists {
		sectionOverrides = frontendPythonSectionOverridesFromRaw(
			rawOverrides,
			policy.SectionOverrides,
		)
	}
	return SectionCodegenPolicy{
		Allowlist:            allowlist,
		MetaControlAllowlist: metaControlAllowlist,
		Exclude:              exclude,
		TypePolicies:         typePolicies,
		SectionOverrides:     sectionOverrides,
	}
}

func frontendPythonCodeObjValuePolicy(
	raw projectstate.RawJSON,
	policy projectstate.PythonCodeObjValuePolicy,
) CodeObjValuePolicy {
	rawFields, ok := rawJSONObjectFields(raw)
	if !ok {
		return CodeObjValuePolicy{
			TypePolicies:     frontendPythonCodeObjTypePolicies(policy.TypePolicies),
			CodeObjOverrides: frontendPythonCodeObjOverrides(policy.CodeObjOverrides),
		}
	}

	typePolicies := frontendPythonCodeObjTypePolicies(policy.TypePolicies)
	if rawTypePolicies, exists := rawFields["typePolicies"]; exists {
		typePolicies = frontendPythonCodeObjTypePoliciesFromRaw(
			rawTypePolicies,
			policy.TypePolicies,
		)
	}
	codeObjOverrides := frontendPythonCodeObjOverrides(policy.CodeObjOverrides)
	if rawOverrides, exists := rawFields["codeObjOverrides"]; exists {
		codeObjOverrides = frontendPythonCodeObjOverridesFromRaw(
			rawOverrides,
			policy.CodeObjOverrides,
		)
	}
	return CodeObjValuePolicy{
		TypePolicies:     typePolicies,
		CodeObjOverrides: codeObjOverrides,
	}
}

func frontendPythonSectionTypePolicies(
	policies map[string]projectstate.PythonSectionTypeCodegenPolicy,
) map[string]SectionTypeCodegenPolicy {
	result := make(map[string]SectionTypeCodegenPolicy, len(policies))
	for _, key := range orderedPolicyKeys(policies, pythonSectionTypeOrder) {
		result[key] = frontendSectionTypeCodegenPolicyValue(policies[key])
	}
	return result
}

func frontendPythonSectionOverrides(
	overrides map[string]projectstate.PythonSectionCodegenOverride,
) map[string]SectionCodegenOverride {
	result := make(map[string]SectionCodegenOverride, len(overrides))
	for _, key := range orderedMapKeys(overrides) {
		result[key] = frontendSectionCodegenOverrideValue(overrides[key])
	}
	return result
}

func frontendPythonSectionTypePoliciesFromRaw(
	raw json.RawMessage,
	policies map[string]projectstate.PythonSectionTypeCodegenPolicy,
) map[string]SectionTypeCodegenPolicy {
	fields, ok := rawJSONObjectFields(raw)
	if !ok {
		return frontendPythonSectionTypePolicies(policies)
	}
	result := make(map[string]SectionTypeCodegenPolicy, len(fields))
	for _, key := range orderedPolicyKeys(fields, pythonSectionTypeOrder) {
		result[key] = frontendSectionTypeCodegenPolicyValue(policies[key])
	}
	return result
}

func frontendPythonSectionOverridesFromRaw(
	raw json.RawMessage,
	overrides map[string]projectstate.PythonSectionCodegenOverride,
) map[string]SectionCodegenOverride {
	fields, ok := rawJSONObjectFields(raw)
	if !ok {
		return frontendPythonSectionOverrides(overrides)
	}
	result := make(map[string]SectionCodegenOverride, len(fields))
	for _, key := range orderedPolicyKeys(fields, nil) {
		result[key] = frontendSectionCodegenOverrideValue(overrides[key])
	}
	return result
}

func frontendPythonCodeObjTypePolicies(
	policies map[string]projectstate.PythonCodeObjTypeValuePolicy,
) map[string]CodeObjTypeValuePolicy {
	result := make(map[string]CodeObjTypeValuePolicy, len(policies))
	for _, key := range orderedPolicyKeys(policies, pythonCodeObjTypeOrder) {
		result[key] = frontendCodeObjTypeValuePolicyValue(policies[key])
	}
	return result
}

func frontendPythonCodeObjTypePoliciesFromRaw(
	raw json.RawMessage,
	policies map[string]projectstate.PythonCodeObjTypeValuePolicy,
) map[string]CodeObjTypeValuePolicy {
	fields, ok := rawJSONObjectFields(raw)
	if !ok {
		return frontendPythonCodeObjTypePolicies(policies)
	}
	result := make(map[string]CodeObjTypeValuePolicy, len(fields))
	for _, key := range orderedPolicyKeys(fields, pythonCodeObjTypeOrder) {
		result[key] = frontendCodeObjTypeValuePolicyValue(policies[key])
	}
	return result
}

func frontendPythonCodeObjOverrides(
	overrides map[string]projectstate.PythonCodeObjValueOverride,
) map[string]CodeObjValueOverride {
	result := make(map[string]CodeObjValueOverride, len(overrides))
	for _, key := range orderedMapKeys(overrides) {
		result[key] = frontendCodeObjValueOverrideValue(overrides[key])
	}
	return result
}

func frontendPythonCodeObjOverridesFromRaw(
	raw json.RawMessage,
	overrides map[string]projectstate.PythonCodeObjValueOverride,
) map[string]CodeObjValueOverride {
	fields, ok := rawJSONObjectFields(raw)
	if !ok {
		return frontendPythonCodeObjOverrides(overrides)
	}
	result := make(map[string]CodeObjValueOverride, len(fields))
	for _, key := range orderedPolicyKeys(fields, nil) {
		result[key] = frontendCodeObjValueOverrideValue(overrides[key])
	}
	return result
}

func orderedTypedPolicyList[T ~string](
	values map[string]struct{},
	reference []T,
	allowAll bool,
) []T {
	if allowAll {
		return nil
	}
	return orderedTypedSetValuesByReference(values, reference)
}

func orderedSetValues(values map[string]struct{}) []string {
	return orderedSetValuesByReference(values, nil)
}

func orderedTypedSetValuesByReference[T ~string](
	values map[string]struct{},
	reference []T,
) []T {
	if len(values) == 0 {
		return []T{}
	}
	ordered := make([]T, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, key := range reference {
		stringKey := string(key)
		if _, ok := values[stringKey]; !ok {
			continue
		}
		ordered = append(ordered, key)
		seen[stringKey] = struct{}{}
	}
	extras := make([]string, 0, len(values)-len(seen))
	for key := range values {
		if _, ok := seen[key]; ok {
			continue
		}
		extras = append(extras, key)
	}
	sort.Strings(extras)
	for _, key := range extras {
		ordered = append(ordered, T(key))
	}
	return ordered
}

func orderedSetValuesByReference(
	values map[string]struct{},
	reference []string,
) []string {
	if len(values) == 0 {
		return []string{}
	}
	ordered := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, key := range reference {
		if _, ok := values[key]; !ok {
			continue
		}
		ordered = append(ordered, key)
		seen[key] = struct{}{}
	}
	extras := make([]string, 0, len(values)-len(seen))
	for key := range values {
		if _, ok := seen[key]; ok {
			continue
		}
		extras = append(extras, key)
	}
	sort.Strings(extras)
	return append(ordered, extras...)
}

func rawJSONObjectFields(raw json.RawMessage) (map[string]json.RawMessage, bool) {
	if len(raw) == 0 {
		return nil, false
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
		return nil, false
	}
	return fields, true
}

func decodeOrderedStringList(raw json.RawMessage, fallback []string) []string {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "null" {
		return nil
	}
	var values []string
	if err := json.Unmarshal(raw, &values); err != nil {
		return fallback
	}
	return values
}

func decodeOrderedTypedList[T ~string](raw json.RawMessage, fallback []T) []T {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "null" {
		return nil
	}
	var values []string
	if err := json.Unmarshal(raw, &values); err != nil {
		return fallback
	}
	converted := make([]T, 0, len(values))
	for _, value := range values {
		converted = append(converted, T(value))
	}
	return converted
}

func orderedPolicyKeys[T any](values map[string]T, reference []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	ordered := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, key := range reference {
		if _, ok := values[key]; !ok {
			continue
		}
		ordered = append(ordered, key)
		seen[key] = struct{}{}
	}
	extras := make([]string, 0, len(values)-len(seen))
	for key := range values {
		if _, ok := seen[key]; ok {
			continue
		}
		extras = append(extras, key)
	}
	sort.Strings(extras)
	return append(ordered, extras...)
}

func orderedMapKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
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
		AccessMode:    projectstate.CodeFileAccessMode(stringField(payload, "access_mode")),
		AutoBinding:   boolField(payload, "autoBinding"),
	}, nil
}

func bindingAccessMode(mode projectstate.CodeFileAccessMode) projectstate.CodeFileAccessMode {
	if strings.TrimSpace(string(mode)) == "" {
		return projectstate.CodeFileAccessModeReadWrite
	}
	return mode
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

func cloneStringSlice(source []string) []string {
	if len(source) == 0 {
		return []string{}
	}
	return append([]string(nil), source...)
}

func cloneStringSlicesMap(source map[string][]string) map[string][]string {
	if source == nil {
		return map[string][]string{}
	}
	cloned := make(map[string][]string, len(source))
	for key, values := range source {
		cloned[key] = cloneStringSlice(values)
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

func cloneRawJSONObject(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return mustMarshal(map[string]any{})
	}
	return cloneRawJSON(raw)
}

func mustMarshal(payload any) json.RawMessage {
	content, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return content
}
