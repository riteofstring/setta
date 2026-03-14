package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrSectionVariantDictSectionRequired = errors.New("section variant must resolve to a dict section")
	ErrJSONSourceKeyEditsDisabled        = errors.New("json source key edits are disabled for this project")
)

func (d *Document) SetSectionVariantName(projectID string, variantID string, name string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionVariantName(variantID, name); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionVariantName(ctx context.Context, projectID string, variantID string, name string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionVariantName(projectID, variantID, name); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionVariantName(variantID string, name string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedVariantID := strings.TrimSpace(variantID)
	if trimmedVariantID == "" {
		return ErrSectionVariantIDRequired
	}
	variant, ok := p.SectionVariants[trimmedVariantID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrSectionVariantNotFound, trimmedVariantID)
	}
	variant.Name = name
	p.SectionVariants[variant.ID] = variant
	return nil
}

func (d *Document) ToggleVariantFrozen(projectID string, variantID string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.ToggleVariantFrozen(variantID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) ToggleVariantFrozen(ctx context.Context, projectID string, variantID string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.ToggleVariantFrozen(projectID, variantID); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) ToggleVariantFrozen(variantID string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedVariantID := strings.TrimSpace(variantID)
	if trimmedVariantID == "" {
		return ErrSectionVariantIDRequired
	}
	variant, ok := p.SectionVariants[trimmedVariantID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrSectionVariantNotFound, trimmedVariantID)
	}
	variant.IsFrozen = !variant.IsFrozen
	p.SectionVariants[variant.ID] = variant
	return nil
}

func (d *Document) ToggleVariantJSONSource(projectID string, sectionID string, variantID string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.ToggleVariantJSONSource(sectionID, variantID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) ToggleVariantJSONSource(ctx context.Context, projectID string, sectionID string, variantID string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.ToggleVariantJSONSource(projectID, sectionID, variantID); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) ToggleVariantJSONSource(sectionID string, variantID string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	section, variant, _, payload, err := p.resolveVariantDictSectionMutationState(sectionID, variantID)
	if err != nil {
		return err
	}
	nextIsJSONSource := !payloadBoolField(payload, "isJsonSource")
	nextConfigLanguage := "python"
	if nextIsJSONSource {
		nextConfigLanguage = "json"
	}
	return p.setVariantSectionFields(section.ID, variant.ID, map[string]any{
		"isJsonSource":   nextIsJSONSource,
		"configLanguage": nextConfigLanguage,
	})
}

func (d *Document) SetVariantJSONSourceKeys(projectID string, sectionID string, variantID string, jsonSourceKeys []string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetVariantJSONSourceKeys(sectionID, variantID, jsonSourceKeys); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetVariantJSONSourceKeys(ctx context.Context, projectID string, sectionID string, variantID string, jsonSourceKeys []string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetVariantJSONSourceKeys(projectID, sectionID, variantID, jsonSourceKeys); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) SetVariantJSONSourceKeys(sectionID string, variantID string, jsonSourceKeys []string) error {
	if p == nil {
		return ErrProjectNotFound
	}
	if !p.AllowJSONSourceKeyEdits {
		return ErrJSONSourceKeyEditsDisabled
	}

	section, variant, _, _, err := p.resolveVariantDictSectionMutationState(sectionID, variantID)
	if err != nil {
		return err
	}

	normalized := make([]string, 0, len(jsonSourceKeys))
	for _, key := range jsonSourceKeys {
		trimmed := strings.TrimSpace(key)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}

	return p.setVariantSectionFields(section.ID, variant.ID, map[string]any{
		"jsonSourceKeys": normalized,
	})
}

func (p *Project) resolveVariantDictSectionMutationState(sectionID string, variantID string) (Section, SectionVariant, SectionImpl, map[string]any, error) {
	section, variant, impl, err := p.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, err
	}
	if canonicalSectionType(payloadStringField(payload, "type"), impl) != "Dict" {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, fmt.Errorf(
			"%w: section=%q variant=%q",
			ErrSectionVariantDictSectionRequired,
			section.ID,
			variant.ID,
		)
	}
	return section, variant, impl, payload, nil
}

func (p *Project) setVariantSectionFields(sectionID string, variantID string, fields map[string]any) error {
	section, variant, impl, err := p.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return err
	}

	switch {
	case hasAnyUnsharedKey(section.UnsharedKeys, fields):
		modifier, err := rawObjectFromProjectPayload(variant.Modifier)
		if err != nil {
			return err
		}
		for fieldName, fieldValue := range fields {
			modifier[fieldName] = cloneProjectValue(fieldValue)
		}
		raw, err := marshalProjectObject(modifier)
		if err != nil {
			return err
		}
		variant.Modifier = raw
		p.SectionVariants[variant.ID] = variant
	case !sectionImplIsPreset(impl):
		payload, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(impl))
		if err != nil {
			return err
		}
		for fieldName, fieldValue := range fields {
			payload[fieldName] = cloneProjectValue(fieldValue)
		}
		raw, err := marshalProjectObject(payload)
		if err != nil {
			return err
		}
		impl.Payload = raw
		p.SectionImpls[impl.ID] = impl
	default:
		modifier, err := rawObjectFromProjectPayload(variant.Modifier)
		if err != nil {
			return err
		}
		for fieldName, fieldValue := range fields {
			modifier[fieldName] = cloneProjectValue(fieldValue)
		}
		raw, err := marshalProjectObject(modifier)
		if err != nil {
			return err
		}
		variant.Modifier = raw
		p.SectionVariants[variant.ID] = variant
	}

	return nil
}

func hasAnyUnsharedKey(unsharedKeys []string, fields map[string]any) bool {
	if len(unsharedKeys) == 0 {
		return false
	}
	for fieldName := range fields {
		if containsString(unsharedKeys, fieldName) {
			return true
		}
	}
	return false
}
