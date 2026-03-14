package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

type InvalidSectionVariantSortOrderError struct {
	Message string
}

func (e *InvalidSectionVariantSortOrderError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (d *Document) SetSectionVariant(projectID string, sectionID string, variantID string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionVariant(sectionID, variantID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionVariant(ctx context.Context, projectID string, sectionID string, variantID string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionVariant(projectID, sectionID, variantID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionVariant(sectionID string, variantID string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	section, variant, _, err := p.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return err
	}
	if p.SectionVariantMap == nil {
		p.SectionVariantMap = map[string]string{}
	}
	p.SectionVariantMap[section.ID] = variant.ID
	return nil
}

func (d *Document) SetDefaultSectionVariant(projectID string, sectionID string, variantID string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetDefaultSectionVariant(sectionID, variantID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetDefaultSectionVariant(ctx context.Context, projectID string, sectionID string, variantID string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetDefaultSectionVariant(projectID, sectionID, variantID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetDefaultSectionVariant(sectionID string, variantID string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	section, variant, _, err := p.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return err
	}
	section.DefaultVariantID = variant.ID
	p.Sections[section.ID] = section
	return nil
}

func (d *Document) SetSectionVariantSortOrder(projectID string, sectionID string, orderedVariantIDs []string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionVariantSortOrder(sectionID, orderedVariantIDs); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionVariantSortOrder(ctx context.Context, projectID string, sectionID string, orderedVariantIDs []string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionVariantSortOrder(projectID, sectionID, orderedVariantIDs); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionVariantSortOrder(sectionID string, orderedVariantIDs []string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return ErrSectionIDRequired
	}
	section, ok := p.Sections[trimmedSectionID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrSectionNotFound, trimmedSectionID)
	}
	if len(orderedVariantIDs) != len(section.VariantIDs) {
		return &InvalidSectionVariantSortOrderError{
			Message: "orderedVariantIds must contain every variant exactly once.",
		}
	}

	normalized := make([]string, len(orderedVariantIDs))
	seen := make(map[string]struct{}, len(orderedVariantIDs))
	for index, variantID := range orderedVariantIDs {
		trimmedVariantID := strings.TrimSpace(variantID)
		if !containsString(section.VariantIDs, trimmedVariantID) {
			return fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantMembership, trimmedSectionID, trimmedVariantID)
		}
		if _, duplicate := seen[trimmedVariantID]; duplicate {
			return &InvalidSectionVariantSortOrderError{
				Message: "orderedVariantIds must not contain duplicate variant IDs.",
			}
		}
		seen[trimmedVariantID] = struct{}{}
		normalized[index] = trimmedVariantID
	}

	section.VariantIDs = normalized
	p.Sections[section.ID] = section
	return nil
}

func IsInvalidSectionVariantSortOrderError(err error) bool {
	var invalid *InvalidSectionVariantSortOrderError
	return errors.As(err, &invalid)
}
