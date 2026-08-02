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

	updated := false
	for _, projectID := range sortedPromptRefreshProjectIDs(d.Projects) {
		project, projectUpdated, err := refreshLinkedPromptSectionsForProject(
			d.Projects[projectID],
			normalizedPromptTemplateID,
			template,
			normalizedFormat,
		)
		if err != nil {
			return false, err
		}
		if !projectUpdated {
			continue
		}
		d.Projects[project.ID] = project
		updated = true
	}

	return updated, nil
}

func refreshLinkedPromptSectionsForProject(
	project Project,
	promptTemplateID string,
	template string,
	format prompttemplates.Format,
) (Project, bool, error) {
	updated := false
	for _, sectionID := range sortedPromptRefreshSectionIDs(project.Sections) {
		refreshNeeded, err := linkedPromptSectionRefreshNeeded(project, sectionID, promptTemplateID, template, format)
		if err != nil {
			if errors.Is(err, ErrPromptSectionRequired) {
				continue
			}
			return Project{}, false, err
		}
		if !refreshNeeded {
			continue
		}
		if err := project.SetPromptTemplateLink(sectionID, &promptTemplateID, template, format); err != nil {
			return Project{}, false, err
		}
		updated = true
	}
	return project, updated, nil
}

func linkedPromptSectionRefreshNeeded(
	project Project,
	sectionID string,
	promptTemplateID string,
	template string,
	format prompttemplates.Format,
) (bool, error) {
	source, err := project.PromptSectionSource(sectionID)
	if err != nil {
		return false, err
	}
	if source.PromptTemplateID == nil || *source.PromptTemplateID != promptTemplateID {
		return false, nil
	}
	return source.Template != template || source.Format != format, nil
}

func sortedPromptRefreshProjectIDs(projects map[string]Project) []string {
	ids := make([]string, 0, len(projects))
	for projectID := range projects {
		ids = append(ids, projectID)
	}
	sort.Strings(ids)
	return ids
}

func sortedPromptRefreshSectionIDs(sections map[string]Section) []string {
	ids := make([]string, 0, len(sections))
	for sectionID := range sections {
		ids = append(ids, sectionID)
	}
	sort.Strings(ids)
	return ids
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
