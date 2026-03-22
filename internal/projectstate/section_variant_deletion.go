package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var ErrSectionVariantDeletePromptPathRequired = errors.New("section variant delete prompt path is required")

func (d Document) DeleteSectionVariantPromptPath(projectID string, sectionID string, variantID string) (string, bool, error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return "", false, err
	}
	return project.DeleteSectionVariantPromptPath(sectionID, variantID)
}

func (r *Runtime) DeleteSectionVariantPromptPath(ctx context.Context, projectID string, sectionID string, variantID string) (string, bool, error) {
	if r == nil {
		return "", false, ErrRuntimeClosed
	}

	var promptPath string
	var requiresPrompt bool
	_, err := r.submit(operation{
		frontendOpID: frontendOpIDFromContext(ctx),
		run: func(state *runtimeState) (Snapshot, error) {
			nextPromptPath, nextRequiresPrompt, err := state.current.DeleteSectionVariantPromptPath(projectID, sectionID, variantID)
			if err != nil {
				return snapshotFromState(*state), err
			}
			promptPath = nextPromptPath
			requiresPrompt = nextRequiresPrompt
			return snapshotFromState(*state), nil
		},
	})
	if err != nil {
		return "", false, err
	}
	return promptPath, requiresPrompt, nil
}

func (p Project) DeleteSectionVariantPromptPath(sectionID string, variantID string) (string, bool, error) {
	section, variant, impl, err := p.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return "", false, err
	}

	payload, err := effectiveSectionPayload(p, section.ID, variant.ID)
	if err != nil {
		return "", false, err
	}
	if canonicalSectionType(payloadStringField(payload, "type"), impl) != "Dict" || !payloadBoolField(payload, "isJsonSource") {
		return "", false, nil
	}

	promptPath := strings.TrimSpace(variant.Name)
	if promptPath == "" {
		return "", false, ErrSectionVariantDeletePromptPathRequired
	}
	return promptPath, true, nil
}

func (d *Document) DeleteSectionVariant(projectID string, sectionID string, variantID string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.DeleteSectionVariant(sectionID, variantID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) DeleteSectionVariant(ctx context.Context, projectID string, sectionID string, variantID string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.DeleteSectionVariant(projectID, sectionID, variantID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) DeleteSectionVariant(sectionID string, variantID string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	section, variant, _, err := p.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return err
	}
	if len(section.VariantIDs) < 2 {
		return nil
	}

	deletedPayload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return err
	}
	deletedCodeObjectVariants := payloadStringMapField(deletedPayload, "codeObjVariantMap")

	remainingEdges := make([]Edge, 0, len(p.Edges))
	removedEdges := make([]Edge, 0, len(p.Edges))
	for _, edge := range p.Edges {
		if edge.SourceSectionID == section.ID && edge.SourceVariantID == variant.ID {
			removedEdges = append(removedEdges, edge)
			continue
		}
		if edge.TargetSectionID == section.ID && edge.TargetVariantID == variant.ID {
			removedEdges = append(removedEdges, edge)
			continue
		}
		remainingEdges = append(remainingEdges, edge)
	}
	p.Edges = remainingEdges

	for _, edge := range removedEdges {
		if err := p.maybeClearEdgeTargetValue(edge); err != nil {
			return err
		}
	}

	removedVariantIDs := map[string]struct{}{variant.ID: {}}
	section.VariantIDs = filterStringSlice(section.VariantIDs, removedVariantIDs)
	if section.DefaultVariantID == variant.ID && len(section.VariantIDs) > 0 {
		section.DefaultVariantID = section.VariantIDs[0]
	}
	p.Sections[section.ID] = section

	if p.SectionVariantMap[section.ID] == variant.ID && len(section.VariantIDs) > 0 {
		p.SectionVariantMap[section.ID] = section.VariantIDs[0]
	}
	delete(p.SectionVariants, variant.ID)

	if err := p.removeUnusedDeletedSectionVariantCodeObjectVariants(deletedCodeObjectVariants); err != nil {
		return err
	}
	p.removeUnusedDeletedSectionVariantImpls(variant)
	if err := p.pruneUnusedCodeObjects(); err != nil {
		return err
	}
	return p.syncWatchCodeRegistrySectionMembership(section.ID)
}

func (p *Project) removeUnusedDeletedSectionVariantCodeObjectVariants(deleted map[string]string) error {
	if p == nil || len(deleted) == 0 {
		return nil
	}

	usedVariantIDs := make(map[string]struct{}, len(deleted))
	for sectionID, section := range p.Sections {
		for _, variantID := range collectSectionVariantIDs(*p, section) {
			if _, ok := p.SectionVariants[variantID]; !ok {
				continue
			}
			payload, err := effectiveSectionPayload(*p, sectionID, variantID)
			if err != nil {
				return err
			}
			for _, codeObjVariantID := range payloadStringMapField(payload, "codeObjVariantMap") {
				usedVariantIDs[codeObjVariantID] = struct{}{}
			}
		}
	}

	removedImplIDs := map[string]struct{}{}
	for codeObjID, codeObjVariantID := range deleted {
		if _, ok := usedVariantIDs[codeObjVariantID]; ok {
			continue
		}

		codeObj, ok := p.CodeObjs[codeObjID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
		}
		codeObjVariant, ok := p.CodeObjVariants[codeObjVariantID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, codeObjVariantID)
		}

		removedVariantIDs := map[string]struct{}{codeObjVariantID: {}}
		codeObj.VariantIDs = filterStringSlice(codeObj.VariantIDs, removedVariantIDs)
		if codeObj.DefaultVariantID == codeObjVariantID {
			if len(codeObj.VariantIDs) > 0 {
				codeObj.DefaultVariantID = codeObj.VariantIDs[0]
			} else {
				codeObj.DefaultVariantID = ""
			}
		}
		if len(codeObj.VariantIDs) == 0 {
			delete(p.CodeObjs, codeObjID)
		} else {
			p.CodeObjs[codeObjID] = codeObj
		}

		removedImplIDs[codeObjVariant.ImplID] = struct{}{}
		delete(p.CodeObjVariants, codeObjVariantID)
	}

	stillReferencedImplIDs := map[string]struct{}{}
	for _, variant := range p.CodeObjVariants {
		stillReferencedImplIDs[strings.TrimSpace(variant.ImplID)] = struct{}{}
	}
	for implID := range removedImplIDs {
		if _, ok := stillReferencedImplIDs[implID]; ok {
			continue
		}
		if err := p.clearPasswordSecretForImpl(implID); err != nil {
			return err
		}
		delete(p.CodeObjImpls, implID)
	}

	return nil
}

func (p *Project) removeUnusedDeletedSectionVariantImpls(variant SectionVariant) {
	if p == nil {
		return
	}

	removedImplIDs := map[string]struct{}{}
	trimmedImplID := strings.TrimSpace(variant.ImplID)
	if trimmedImplID != "" {
		removedImplIDs[trimmedImplID] = struct{}{}
	}
	for _, implID := range variant.NonPresetImplIDs {
		trimmed := strings.TrimSpace(implID)
		if trimmed == "" {
			continue
		}
		removedImplIDs[trimmed] = struct{}{}
	}
	if len(removedImplIDs) == 0 {
		return
	}

	stillReferencedImplIDs := make(map[string]struct{}, len(p.SectionVariants))
	for _, existing := range p.SectionVariants {
		trimmed := strings.TrimSpace(existing.ImplID)
		if trimmed == "" {
			continue
		}
		stillReferencedImplIDs[trimmed] = struct{}{}
	}
	for implID := range removedImplIDs {
		if _, ok := stillReferencedImplIDs[implID]; ok {
			continue
		}
		delete(p.SectionImpls, implID)
	}
}
