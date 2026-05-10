package projectview

import (
	"encoding/json"
	"errors"
	"fmt"
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
