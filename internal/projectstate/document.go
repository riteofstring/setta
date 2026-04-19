package projectstate

import (
	"errors"
	"fmt"
	"strings"
)

const CurrentSchemaVersion = 1

var (
	ErrProjectPayloadNotObject      = errors.New("project payload must be a JSON object")
	ErrUnsupportedSchemaVersion     = errors.New("unsupported project schema version")
	ErrProjectIDRequired            = errors.New("project id is required")
	ErrProjectNameRequired          = errors.New("project name is required")
	ErrDefaultProjectIDRequired     = errors.New("default project id must not be blank")
	ErrDefaultProjectNotFound       = errors.New("default project id was not found in projects")
	ErrProjectIDKeyMismatch         = errors.New("project id must match its map key")
	ErrProjectChatWindowingRequired = errors.New(
		"project chat windowing state is required for each persisted project",
	)
)

// setta-go-type-discovery: skip
type Document struct {
	SchemaVersion    int                `json:"schemaVersion"`
	DefaultProjectID string             `json:"defaultProjectId,omitempty"`
	AppDefinition    RawJSON            `json:"appDefinition,omitempty"`
	Projects         map[string]Project `json:"projects,omitempty"`

	passwordSecrets       PasswordSecretStore
	watchCodeIgnoredRoots []string
}

// setta-go-type-discovery: skip
type Project struct {
	ID                       string                            `json:"id"`
	Name                     string                            `json:"name"`
	ShowParamDisplayNames    bool                              `json:"showParamDisplayNames,omitempty"`
	AllowJSONSourceKeyEdits  bool                              `json:"allowJsonSourceKeyEdits,omitempty"`
	PreviewImgColor          string                            `json:"previewImgColor,omitempty"`
	Viewport                 *Viewport                         `json:"viewport,omitempty"`
	ViewportInitialized      bool                              `json:"viewportInitialized,omitempty"`
	ViewModes                map[string]ViewMode               `json:"viewModes,omitempty"`
	ActiveViewModeID         string                            `json:"activeViewModeId,omitempty"`
	IsEditingViewMode        bool                              `json:"isEditingViewMode,omitempty"`
	CodegenTargets           []ProjectCodegenTarget            `json:"codegenTargets,omitempty"`
	WatchCodeEnabled         bool                              `json:"watchCodeEnabled,omitempty"`
	WatchCodeFolders         []WatchCodeFolder                 `json:"watchCodeFolders,omitempty"`
	WatchCodeFiles           []string                          `json:"watchCodeFiles,omitempty"`
	WatchCodeRegistry        map[string]WatchCodeRegistryEntry `json:"watchCodeRegistry,omitempty"`
	WatchCodeBaselineByPath  map[string][]string               `json:"watchCodeBaselineByPath,omitempty"`
	GeneratedCodeBinding     *CodeFileBinding                  `json:"generatedCodeBinding,omitempty"`
	GeneratedMetadataBinding *CodeFileBinding                  `json:"generatedMetadataBinding,omitempty"`
	EntryCodeBlockID         string                            `json:"entryCodeBlockId,omitempty"`
	TopLevelSectionIDs       []string                          `json:"topLevelSectionIds,omitempty"`
	TopLevelSections         map[string]TopLevelSectionLayout  `json:"topLevelSections,omitempty"`
	WindowSpaces             map[string]WindowSpaceConfig      `json:"windowSpaces,omitempty"`
	SectionVariantMap        map[string]string                 `json:"sectionVariantMap,omitempty"`
	ActiveIDs                []string                          `json:"activeIds,omitempty"`
	Edges                    []Edge                            `json:"edges,omitempty"`
	AgenticEdges             []AgenticEdge                     `json:"agenticEdges,omitempty"`
	StateMachineEdges        []StateMachineEdge                `json:"stateMachineEdges,omitempty"`
	ProjectChatWindowing     *ProjectChatWindowingState        `json:"projectChatWindowing,omitempty"`
	Sections                 map[string]Section                `json:"sections,omitempty"`
	SectionVariants          map[string]SectionVariant         `json:"sectionVariants,omitempty"`
	SectionImpls             map[string]SectionImpl            `json:"sectionImpls,omitempty"`
	CodeObjs                 map[string]CodeObject             `json:"codeObjs,omitempty"`
	CodeObjVariants          map[string]CodeObjectVariant      `json:"codeObjVariants,omitempty"`
	CodeObjImpls             map[string]CodeObjectImpl         `json:"codeObjImpls,omitempty"`

	passwordSecrets PasswordSecretStore
}

func NewDocument() Document {
	return Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects:      map[string]Project{},
	}
}

func (d Document) Clone() Document {
	cloned := d
	cloned.passwordSecrets = d.passwordSecrets
	cloned.watchCodeIgnoredRoots = append([]string(nil), d.watchCodeIgnoredRoots...)
	cloned.AppDefinition = cloneRawJSON(d.AppDefinition)
	if d.Projects == nil {
		return cloned
	}

	cloned.Projects = make(map[string]Project, len(d.Projects))
	for projectID, project := range d.Projects {
		cloned.Projects[projectID] = project.Clone()
	}
	return cloned
}

func (d Document) withPasswordSecrets(store PasswordSecretStore) Document {
	cloned := d.Clone()
	cloned.passwordSecrets = store
	if cloned.Projects == nil {
		return cloned
	}
	for projectID, project := range cloned.Projects {
		project.passwordSecrets = store
		cloned.Projects[projectID] = project
	}
	return cloned
}

func (d Document) withWatchCodeIgnoredRoots(roots []string) Document {
	cloned := d.Clone()
	cloned.watchCodeIgnoredRoots = append([]string(nil), roots...)
	return cloned
}

func (d Document) Normalized() (Document, error) {
	normalized := d
	if err := validateDocumentSchemaVersion(normalized.SchemaVersion); err != nil {
		return Document{}, err
	}

	normalized.Projects = normalizeDocumentProjectMap(normalized.Projects)
	appDefinition, err := normalizeRawJSON(normalized.AppDefinition, "appDefinition")
	if err != nil {
		return Document{}, err
	}
	normalized.AppDefinition = appDefinition
	if err := normalizeDocumentProjects(normalized.Projects); err != nil {
		return Document{}, err
	}
	if err := validateDocumentDefaultProjectID(normalized.DefaultProjectID, normalized.Projects); err != nil {
		return Document{}, err
	}

	return normalized, nil
}

func validateDocumentSchemaVersion(schemaVersion int) error {
	if schemaVersion != CurrentSchemaVersion {
		return fmt.Errorf("%w: %d", ErrUnsupportedSchemaVersion, schemaVersion)
	}
	return nil
}

func normalizeDocumentProjectMap(projects map[string]Project) map[string]Project {
	if projects == nil {
		return map[string]Project{}
	}
	return projects
}

func normalizeDocumentProjects(projects map[string]Project) error {
	for projectKey, project := range projects {
		if err := validateDocumentProjectEntry(projectKey, project); err != nil {
			return err
		}

		normalizedProject, err := project.Normalized()
		if err != nil {
			return fmt.Errorf("normalize project %q: %w", project.ID, err)
		}
		projects[projectKey] = normalizedProject
	}
	return nil
}

func validateDocumentProjectEntry(projectKey string, project Project) error {
	if strings.TrimSpace(projectKey) == "" {
		return ErrProjectIDRequired
	}
	if strings.TrimSpace(project.ID) == "" {
		return ErrProjectIDRequired
	}
	if project.ID != projectKey {
		return fmt.Errorf("%w: key=%q id=%q", ErrProjectIDKeyMismatch, projectKey, project.ID)
	}
	if strings.TrimSpace(project.Name) == "" {
		return fmt.Errorf("%w: %q", ErrProjectNameRequired, project.ID)
	}
	return nil
}

func validateDocumentDefaultProjectID(defaultProjectID string, projects map[string]Project) error {
	if defaultProjectID == "" {
		return nil
	}
	if strings.TrimSpace(defaultProjectID) == "" {
		return ErrDefaultProjectIDRequired
	}
	if _, ok := projects[defaultProjectID]; !ok {
		return fmt.Errorf("%w: %q", ErrDefaultProjectNotFound, defaultProjectID)
	}
	return nil
}
