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

	deletedCodeObjectVariants, err := p.deletedSectionVariantCodeObjectVariants(section.ID, variant.ID)
	if err != nil {
		return err
	}
	if err := p.removeSectionVariantEdges(section.ID, variant.ID); err != nil {
		return err
	}
	p.removeSectionVariantState(section, variant)

	if err := p.removeUnusedDeletedSectionVariantCodeObjectVariants(deletedCodeObjectVariants); err != nil {
		return err
	}
	p.removeUnusedDeletedSectionVariantImpls(variant)
	if err := p.pruneUnusedCodeObjects(); err != nil {
		return err
	}
	return p.syncWatchCodeRegistrySectionMembership(nil, section.ID)
}

func (p *Project) deletedSectionVariantCodeObjectVariants(sectionID string, variantID string) (map[string]string, error) {
	payload, err := effectiveSectionPayload(*p, sectionID, variantID)
	if err != nil {
		return nil, err
	}
	return payloadStringMapField(payload, "codeObjVariantMap"), nil
}

func (p *Project) removeSectionVariantEdges(sectionID string, variantID string) error {
	remainingEdges := make([]Edge, 0, len(p.Edges))
	removedEdges := make([]Edge, 0, len(p.Edges))
	for _, edge := range p.Edges {
		if sectionVariantMatchesEdge(edge, sectionID, variantID) {
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
	return nil
}

func sectionVariantMatchesEdge(edge Edge, sectionID string, variantID string) bool {
	return (edge.SourceSectionID == sectionID && edge.SourceVariantID == variantID) ||
		(edge.TargetSectionID == sectionID && edge.TargetVariantID == variantID)
}

func (p *Project) removeSectionVariantState(section Section, variant SectionVariant) {
	nextVariantIDs := filterStringSlice(section.VariantIDs, map[string]struct{}{variant.ID: {}})
	section.VariantIDs = nextVariantIDs
	section.DefaultVariantID = defaultVariantIDAfterRemoval(section.DefaultVariantID, nextVariantIDs, variant.ID)
	p.Sections[section.ID] = section

	if p.SectionVariantMap[section.ID] == variant.ID {
		p.SectionVariantMap[section.ID] = nextVariantIDs[0]
	}
	delete(p.SectionVariants, variant.ID)
}

func defaultVariantIDAfterRemoval(currentDefault string, remainingVariantIDs []string, removedVariantID string) string {
	if currentDefault != removedVariantID {
		return currentDefault
	}
	if len(remainingVariantIDs) == 0 {
		return ""
	}
	return remainingVariantIDs[0]
}

func (p *Project) removeUnusedDeletedSectionVariantCodeObjectVariants(deleted map[string]string) error {
	if p == nil || len(deleted) == 0 {
		return nil
	}

	usedVariantIDs, err := p.usedSectionCodeObjectVariantIDs()
	if err != nil {
		return err
	}
	removedImplIDs, err := p.removeDeletedSectionCodeObjectVariants(deleted, usedVariantIDs)
	if err != nil {
		return err
	}
	return p.removeUnreferencedCodeObjectImpls(removedImplIDs)
}

func (p *Project) usedSectionCodeObjectVariantIDs() (map[string]struct{}, error) {
	usedVariantIDs := make(map[string]struct{}, len(p.CodeObjVariants))
	for sectionID, section := range p.Sections {
		for _, variantID := range collectSectionVariantIDs(*p, section) {
			if _, ok := p.SectionVariants[variantID]; !ok {
				continue
			}
			payload, err := effectiveSectionPayload(*p, sectionID, variantID)
			if err != nil {
				return nil, err
			}
			for _, codeObjVariantID := range payloadStringMapField(payload, "codeObjVariantMap") {
				usedVariantIDs[codeObjVariantID] = struct{}{}
			}
		}
	}
	return usedVariantIDs, nil
}

func (p *Project) removeDeletedSectionCodeObjectVariants(
	deleted map[string]string,
	usedVariantIDs map[string]struct{},
) (map[string]struct{}, error) {
	removedImplIDs := map[string]struct{}{}
	for codeObjID, codeObjVariantID := range deleted {
		if _, ok := usedVariantIDs[codeObjVariantID]; ok {
			continue
		}

		removedImplID, err := p.removeCodeObjectVariant(codeObjID, codeObjVariantID)
		if err != nil {
			return nil, err
		}
		if removedImplID != "" {
			removedImplIDs[removedImplID] = struct{}{}
		}
	}
	return removedImplIDs, nil
}

func (p *Project) removeCodeObjectVariant(codeObjID string, codeObjVariantID string) (string, error) {
	codeObj, ok := p.CodeObjs[codeObjID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
	}
	codeObjVariant, ok := p.CodeObjVariants[codeObjVariantID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, codeObjVariantID)
	}

	codeObj.VariantIDs = filterStringSlice(codeObj.VariantIDs, map[string]struct{}{codeObjVariantID: {}})
	codeObj.DefaultVariantID = defaultVariantIDAfterRemoval(codeObj.DefaultVariantID, codeObj.VariantIDs, codeObjVariantID)
	if len(codeObj.VariantIDs) == 0 {
		delete(p.CodeObjs, codeObjID)
	} else {
		p.CodeObjs[codeObjID] = codeObj
	}

	delete(p.CodeObjVariants, codeObjVariantID)
	return strings.TrimSpace(codeObjVariant.ImplID), nil
}

func (p *Project) removeUnreferencedCodeObjectImpls(removedImplIDs map[string]struct{}) error {
	if len(removedImplIDs) == 0 {
		return nil
	}

	stillReferencedImplIDs := p.codeObjectImplIDsInUse()
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

func (p *Project) codeObjectImplIDsInUse() map[string]struct{} {
	stillReferencedImplIDs := map[string]struct{}{}
	for _, variant := range p.CodeObjVariants {
		implID := strings.TrimSpace(variant.ImplID)
		if implID == "" {
			continue
		}
		stillReferencedImplIDs[implID] = struct{}{}
	}
	return stillReferencedImplIDs
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
