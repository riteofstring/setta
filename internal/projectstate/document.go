package projectstate

import (
	"errors"
	"fmt"
	"strings"
)

const CurrentSchemaVersion = 1

var (
	ErrProjectPayloadNotObject  = errors.New("project payload must be a JSON object")
	ErrUnsupportedSchemaVersion = errors.New("unsupported project schema version")
	ErrProjectIDRequired        = errors.New("project id is required")
	ErrProjectNameRequired      = errors.New("project name is required")
	ErrDefaultProjectIDRequired = errors.New("default project id must not be blank")
	ErrDefaultProjectNotFound   = errors.New("default project id was not found in projects")
	ErrProjectIDKeyMismatch     = errors.New("project id must match its map key")
)

type Document struct {
	SchemaVersion    int                `json:"schemaVersion"`
	DefaultProjectID string             `json:"defaultProjectId,omitempty"`
	AppDefinition    *AppDefinition     `json:"appDefinition,omitempty"`
	Projects         map[string]Project `json:"projects,omitempty"`

	passwordSecrets PasswordSecretStore
}

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
	SectionVariantMap        map[string]string                 `json:"sectionVariantMap,omitempty"`
	ActiveIDs                []string                          `json:"activeIds,omitempty"`
	Edges                    []Edge                            `json:"edges,omitempty"`
	AgenticEdges             []AgenticEdge                     `json:"agenticEdges,omitempty"`
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
	if d.AppDefinition != nil {
		appDefinition := d.AppDefinition.Clone()
		cloned.AppDefinition = &appDefinition
	}
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

func (d Document) Normalized() (Document, error) {
	if d.SchemaVersion != CurrentSchemaVersion {
		return Document{}, fmt.Errorf("%w: %d", ErrUnsupportedSchemaVersion, d.SchemaVersion)
	}

	normalized := d
	if normalized.Projects == nil {
		normalized.Projects = map[string]Project{}
	}
	if normalized.AppDefinition != nil {
		normalizedAppDefinition, err := normalized.AppDefinition.Normalized()
		if err != nil {
			return Document{}, fmt.Errorf("normalize app definition: %w", err)
		}
		normalized.AppDefinition = &normalizedAppDefinition
	}

	for projectKey, project := range normalized.Projects {
		if strings.TrimSpace(projectKey) == "" {
			return Document{}, ErrProjectIDRequired
		}
		if strings.TrimSpace(project.ID) == "" {
			return Document{}, ErrProjectIDRequired
		}
		if project.ID != projectKey {
			return Document{}, fmt.Errorf("%w: key=%q id=%q", ErrProjectIDKeyMismatch, projectKey, project.ID)
		}
		if strings.TrimSpace(project.Name) == "" {
			return Document{}, fmt.Errorf("%w: %q", ErrProjectNameRequired, project.ID)
		}

		normalizedProject, err := project.Normalized()
		if err != nil {
			return Document{}, fmt.Errorf("normalize project %q: %w", project.ID, err)
		}
		normalized.Projects[projectKey] = normalizedProject
	}

	if normalized.DefaultProjectID != "" {
		if strings.TrimSpace(normalized.DefaultProjectID) == "" {
			return Document{}, ErrDefaultProjectIDRequired
		}
		if _, ok := normalized.Projects[normalized.DefaultProjectID]; !ok {
			return Document{}, fmt.Errorf("%w: %q", ErrDefaultProjectNotFound, normalized.DefaultProjectID)
		}
	}

	return normalized, nil
}
