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
	Projects         map[string]Project `json:"projects,omitempty"`
}

type Project struct {
	ID                       string                    `json:"id"`
	Name                     string                    `json:"name"`
	CodegenTargets           []ProjectCodegenTarget    `json:"codegenTargets,omitempty"`
	GeneratedCodeBinding     *CodeFileBinding          `json:"generatedCodeBinding,omitempty"`
	GeneratedMetadataBinding *CodeFileBinding          `json:"generatedMetadataBinding,omitempty"`
	EntryCodeBlockID         string                    `json:"entryCodeBlockId,omitempty"`
	TopLevelSectionIDs       []string                  `json:"topLevelSectionIds,omitempty"`
	SectionVariantMap        map[string]string         `json:"sectionVariantMap,omitempty"`
	Sections                 map[string]Section        `json:"sections,omitempty"`
	SectionVariants          map[string]SectionVariant `json:"sectionVariants,omitempty"`
	SectionImpls             map[string]SectionImpl    `json:"sectionImpls,omitempty"`
}

func NewDocument() Document {
	return Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects:      map[string]Project{},
	}
}

func (d Document) Clone() Document {
	cloned := d
	if d.Projects == nil {
		return cloned
	}

	cloned.Projects = make(map[string]Project, len(d.Projects))
	for projectID, project := range d.Projects {
		cloned.Projects[projectID] = project.Clone()
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
