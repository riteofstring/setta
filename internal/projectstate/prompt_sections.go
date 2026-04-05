package projectstate

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/promptrender"
	"setta/internal/prompttemplates"
)

type PromptSectionSource struct {
	PromptTemplateID *string
	Template         string
	Format           prompttemplates.Format
}

func (p *Project) SetPromptTemplate(sectionID string, template string) error {
	section, _, payload, err := p.resolvePromptSectionMutationState(sectionID)
	if err != nil {
		return err
	}

	format, err := normalizePromptFormat(prompttemplates.Format(payloadStringField(payload, "format")))
	if err != nil {
		return err
	}
	result := renderPromptSection(template, payloadRawStringMapField(payload, "inputs"), format)
	return p.applyPromptSectionUpdates(section.ID, map[string]any{
		"promptTemplateId": nil,
		"template":         template,
		"renderedText":     result.RenderedText,
		"missingVariables": clonePromptMissingVariables(result.MissingVariables),
		"renderError":      optionalStringValue(result.RenderError),
	})
}

func (d *Document) SetPromptTemplate(projectID string, sectionID string, template string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetPromptTemplate(sectionID, template); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetPromptTemplate(ctx context.Context, projectID string, sectionID string, template string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetPromptTemplate(projectID, sectionID, template); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) PromptSectionSource(sectionID string) (PromptSectionSource, error) {
	_, _, payload, err := p.resolvePromptSectionMutationState(sectionID)
	if err != nil {
		return PromptSectionSource{}, err
	}

	format, err := normalizePromptFormat(prompttemplates.Format(payloadStringField(payload, "format")))
	if err != nil {
		return PromptSectionSource{}, err
	}

	var promptTemplateID *string
	if rawPromptTemplateID := strings.TrimSpace(payloadRawStringField(payload, "promptTemplateId")); rawPromptTemplateID != "" {
		promptTemplateID = &rawPromptTemplateID
	}

	return PromptSectionSource{
		PromptTemplateID: promptTemplateID,
		Template:         payloadRawStringField(payload, "template"),
		Format:           format,
	}, nil
}

func (d *Document) PromptSectionSource(projectID string, sectionID string) (PromptSectionSource, error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return PromptSectionSource{}, err
	}
	return project.PromptSectionSource(sectionID)
}

func (p *Project) SetPromptTemplateLink(sectionID string, promptTemplateID *string, template string, format prompttemplates.Format) error {
	section, _, payload, err := p.resolvePromptSectionMutationState(sectionID)
	if err != nil {
		return err
	}

	normalizedPromptTemplateID := normalizeOptionalTrimmedStringPointer(promptTemplateID)
	normalizedFormat, err := normalizePromptFormat(format)
	if err != nil {
		return err
	}
	result := renderPromptSection(template, payloadRawStringMapField(payload, "inputs"), normalizedFormat)
	return p.applyPromptSectionUpdates(section.ID, map[string]any{
		"promptTemplateId": optionalStringValue(normalizedPromptTemplateID),
		"template":         template,
		"format":           string(normalizedFormat),
		"renderedText":     result.RenderedText,
		"missingVariables": clonePromptMissingVariables(result.MissingVariables),
		"renderError":      optionalStringValue(result.RenderError),
	})
}

func (d *Document) SetPromptTemplateLink(projectID string, sectionID string, promptTemplateID *string, template string, format prompttemplates.Format) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetPromptTemplateLink(sectionID, promptTemplateID, template, format); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetPromptTemplateLink(ctx context.Context, projectID string, sectionID string, promptTemplateID *string, template string, format prompttemplates.Format) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetPromptTemplateLink(projectID, sectionID, promptTemplateID, template, format); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetPromptInputs(sectionID string, inputs map[string]string) error {
	section, _, payload, err := p.resolvePromptSectionMutationState(sectionID)
	if err != nil {
		return err
	}

	format, err := normalizePromptFormat(prompttemplates.Format(payloadStringField(payload, "format")))
	if err != nil {
		return err
	}
	clonedInputs := clonePromptInputs(inputs)
	result := renderPromptSection(payloadRawStringField(payload, "template"), clonedInputs, format)
	return p.applyPromptSectionUpdates(section.ID, map[string]any{
		"inputs":           clonedInputs,
		"renderedText":     result.RenderedText,
		"missingVariables": clonePromptMissingVariables(result.MissingVariables),
		"renderError":      optionalStringValue(result.RenderError),
	})
}

func (d *Document) SetPromptInputs(projectID string, sectionID string, inputs map[string]string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetPromptInputs(sectionID, inputs); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetPromptInputs(ctx context.Context, projectID string, sectionID string, inputs map[string]string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetPromptInputs(projectID, sectionID, inputs); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetPromptFormat(sectionID string, format prompttemplates.Format) error {
	section, _, payload, err := p.resolvePromptSectionMutationState(sectionID)
	if err != nil {
		return err
	}

	normalizedFormat, err := normalizePromptFormat(format)
	if err != nil {
		return err
	}
	result := renderPromptSection(payloadRawStringField(payload, "template"), payloadRawStringMapField(payload, "inputs"), normalizedFormat)
	return p.applyPromptSectionUpdates(section.ID, map[string]any{
		"format":           string(normalizedFormat),
		"renderedText":     result.RenderedText,
		"missingVariables": clonePromptMissingVariables(result.MissingVariables),
		"renderError":      optionalStringValue(result.RenderError),
	})
}

func (d *Document) SetPromptFormat(projectID string, sectionID string, format prompttemplates.Format) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetPromptFormat(sectionID, format); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetPromptFormat(ctx context.Context, projectID string, sectionID string, format prompttemplates.Format) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetPromptFormat(projectID, sectionID, format); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) applyPromptSectionUpdates(sectionID string, updates map[string]any) error {
	trimmedSectionID := strings.TrimSpace(sectionID)
	for fieldName, fieldValue := range updates {
		if err := p.setCurrentSectionField(trimmedSectionID, fieldName, fieldValue); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) resolvePromptSectionMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
	section, variant, impl, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}

	sectionType := payloadStringField(payload, "type")
	if sectionType == "" {
		sectionType = fallbackSectionType(impl)
	}
	if !strings.EqualFold(sectionType, "Prompt") {
		return Section{}, SectionVariant{}, nil, fmt.Errorf("%w: %q", ErrPromptSectionRequired, section.ID)
	}
	return section, variant, payload, nil
}

func normalizePromptFormat(format prompttemplates.Format) (prompttemplates.Format, error) {
	trimmedFormat := strings.TrimSpace(string(format))
	switch prompttemplates.Format(trimmedFormat) {
	case "", prompttemplates.FormatJinja:
		return prompttemplates.FormatJinja, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrPromptFormatInvalid, trimmedFormat)
	}
}

func renderPromptSection(template string, inputs map[string]string, format prompttemplates.Format) promptrender.Result {
	if format == prompttemplates.FormatJinja {
		return promptrender.RenderJinja(template, inputs)
	}
	return promptrender.Result{
		RenderedText:     "",
		MissingVariables: []string{},
		RenderError:      nil,
	}
}

func clonePromptInputs(inputs map[string]string) map[string]string {
	if len(inputs) == 0 {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(inputs))
	for key, value := range inputs {
		cloned[key] = value
	}
	return cloned
}

func clonePromptMissingVariables(missingVariables []string) []string {
	if len(missingVariables) == 0 {
		return []string{}
	}
	cloned := make([]string, len(missingVariables))
	copy(cloned, missingVariables)
	return cloned
}
