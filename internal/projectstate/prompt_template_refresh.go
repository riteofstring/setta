package projectstate

import (
	"context"
	"errors"
	"sort"
	"strings"

	"setta/internal/prompttemplates"
)

func (d *Document) RefreshLinkedPromptSectionsForTemplate(promptTemplateID string, template string, format prompttemplates.Format) (bool, error) {
	normalizedPromptTemplateID := strings.TrimSpace(promptTemplateID)
	if normalizedPromptTemplateID == "" || len(d.Projects) == 0 {
		return false, nil
	}

	normalizedFormat, err := normalizePromptFormat(format)
	if err != nil {
		return false, err
	}

	projectIDs := make([]string, 0, len(d.Projects))
	for projectID := range d.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	updated := false
	for _, projectID := range projectIDs {
		project := d.Projects[projectID]
		sectionIDs := make([]string, 0, len(project.Sections))
		for sectionID := range project.Sections {
			sectionIDs = append(sectionIDs, sectionID)
		}
		sort.Strings(sectionIDs)

		projectUpdated := false
		for _, sectionID := range sectionIDs {
			source, err := project.PromptSectionSource(sectionID)
			if err != nil {
				if errors.Is(err, ErrPromptSectionRequired) {
					continue
				}
				return false, err
			}
			if source.PromptTemplateID == nil || *source.PromptTemplateID != normalizedPromptTemplateID {
				continue
			}
			if source.Template == template && source.Format == normalizedFormat {
				continue
			}
			if err := project.SetPromptTemplateLink(sectionID, &normalizedPromptTemplateID, template, normalizedFormat); err != nil {
				return false, err
			}
			projectUpdated = true
			updated = true
		}
		if projectUpdated {
			d.Projects[project.ID] = project
		}
	}

	return updated, nil
}

func (r *Runtime) RefreshLinkedPromptSectionsForTemplate(
	ctx context.Context,
	promptTemplateID string,
	template string,
	format prompttemplates.Format,
) (Snapshot, bool, error) {
	if r == nil {
		return Snapshot{}, false, ErrRuntimeClosed
	}

	return r.mutateAndSaveIfUpdated(ctx, func(document Document) (Document, bool, error) {
		updated, err := document.RefreshLinkedPromptSectionsForTemplate(promptTemplateID, template, format)
		return document, updated, err
	})
}
