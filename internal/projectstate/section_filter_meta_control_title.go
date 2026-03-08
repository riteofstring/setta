package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrSectionParamFilterUnsupported = errors.New("section does not support param filter")
	ErrMetaControlSectionRequired    = errors.New("section must resolve to a meta control section")
)

func (d *Document) SetSectionParamFilter(projectID string, sectionID string, value string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionParamFilter(sectionID, value); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionParamFilter(ctx context.Context, projectID string, sectionID string, value string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionParamFilter(projectID, sectionID, value); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionParamFilter(sectionID string, value string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	sectionType, err := p.resolveCurrentSectionPresentationType(trimmedSectionID)
	if err != nil {
		return err
	}
	if !sectionTypeSupportsParamPresentation(sectionType) {
		return fmt.Errorf("%w: section=%q type=%q", ErrSectionParamFilterUnsupported, trimmedSectionID, sectionType)
	}
	return p.setCurrentSectionField(trimmedSectionID, "paramFilter", value)
}

func (d *Document) SetMetaControlShowSectionTitle(projectID string, sectionID string, showSectionTitle bool) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetMetaControlShowSectionTitle(sectionID, showSectionTitle); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetMetaControlShowSectionTitle(
	ctx context.Context,
	projectID string,
	sectionID string,
	showSectionTitle bool,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetMetaControlShowSectionTitle(projectID, sectionID, showSectionTitle); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetMetaControlShowSectionTitle(sectionID string, showSectionTitle bool) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	sectionType, err := p.resolveCurrentSectionPresentationType(trimmedSectionID)
	if err != nil {
		return err
	}
	if sectionType != "MetaControl" {
		return fmt.Errorf("%w: section=%q type=%q", ErrMetaControlSectionRequired, trimmedSectionID, sectionType)
	}
	return p.setCurrentSectionField(trimmedSectionID, "showSectionTitle", showSectionTitle)
}

func (p Project) resolveCurrentSectionPresentationType(sectionID string) (string, error) {
	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return "", err
	}
	payload, err := effectiveSectionPayload(p, section.ID, variant.ID)
	if err != nil {
		return "", err
	}
	return canonicalSectionType(payloadStringField(payload, "type"), impl), nil
}

func sectionTypeSupportsParamPresentation(sectionType string) bool {
	switch strings.TrimSpace(sectionType) {
	case "Callable", "Dict", "GlobalVariables":
		return true
	default:
		return false
	}
}
