package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrCodeSectionAttachedTerminalConflict = errors.New("code section already has a different terminal child")
	ErrCodeSectionMultipleChildren         = errors.New("code section has multiple children")
)

func (d *Document) SetCodeSectionAttachedTerminal(
	projectID string,
	sectionID string,
	terminalSectionID *string,
	settings StructuralMutationSettings,
) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	normalizedSettings := normalizeStructuralMutationSettings(settings)
	if err := project.SetCodeSectionAttachedTerminal(
		sectionID,
		terminalSectionID,
		normalizedSettings.SectionSizingPolicy,
		normalizedSettings.TerminalDefaultHeight,
	); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetCodeSectionAttachedTerminal(
	ctx context.Context,
	projectID string,
	sectionID string,
	terminalSectionID *string,
	settings StructuralMutationSettings,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetCodeSectionAttachedTerminal(projectID, sectionID, terminalSectionID, settings); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) SetCodeSectionAttachedTerminal(
	sectionID string,
	terminalSectionID *string,
	policy AutoLayoutSectionSizingPolicy,
	terminalDefaultHeight float64,
) error {
	if p == nil {
		return ErrProjectNotFound
	}

	p.pruneTopLevelCreationViewState()

	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return err
	}
	if !impl.IsCode() {
		return ErrCodeSectionRequired
	}

	trimmedTerminalID := normalizeOptionalSectionID(terminalSectionID)
	if trimmedTerminalID == "" {
		return p.detachCodeSectionAttachedTerminal(section, variant, impl, policy)
	}
	return p.attachCodeSectionTerminal(section, variant, impl, trimmedTerminalID, policy, terminalDefaultHeight)
}

func normalizeOptionalSectionID(sectionID *string) string {
	if sectionID == nil {
		return ""
	}
	return strings.TrimSpace(*sectionID)
}

func (p *Project) attachCodeSectionTerminal(
	section Section,
	variant SectionVariant,
	impl SectionImpl,
	terminalSectionID string,
	policy AutoLayoutSectionSizingPolicy,
	terminalDefaultHeight float64,
) error {
	terminalSection, terminalVariant, terminalImpl, err := p.ResolveSection(terminalSectionID)
	if err != nil {
		return err
	}
	if !terminalImpl.IsTerminal() {
		return ErrTerminalSectionRequired
	}

	codePayload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return err
	}
	currentChildren := payloadStringArrayField(codePayload, "children")
	if len(currentChildren) > 1 {
		return fmt.Errorf("%w: section=%q", ErrCodeSectionMultipleChildren, section.ID)
	}
	if len(currentChildren) == 1 && currentChildren[0] != terminalSectionID {
		return fmt.Errorf("%w: section=%q current=%q next=%q", ErrCodeSectionAttachedTerminalConflict, section.ID, currentChildren[0], terminalSectionID)
	}

	currentAttachedTerminalID := strings.TrimSpace(payloadStringField(codePayload, "attachedTerminalSectionId"))
	if currentAttachedTerminalID == "" {
		currentAttachedTerminalID = strings.TrimSpace(impl.Code.AttachedTerminalSectionID)
	}
	if currentAttachedTerminalID != "" && currentAttachedTerminalID != terminalSectionID && len(currentChildren) != 0 {
		return fmt.Errorf("%w: section=%q current=%q next=%q", ErrCodeSectionAttachedTerminalConflict, section.ID, currentAttachedTerminalID, terminalSectionID)
	}

	oldParentID := strings.TrimSpace(terminalSection.ParentSectionID)
	if oldParentID != "" && oldParentID != section.ID {
		if err := p.removeChildFromParent(oldParentID, terminalSectionID); err != nil {
			return err
		}
	}
	p.removeTopLevelSectionViewState(terminalSectionID)

	terminalSection.ParentSectionID = section.ID
	p.Sections[terminalSection.ID] = terminalSection

	terminalPayload, err := effectiveSectionPayload(*p, terminalSection.ID, terminalVariant.ID)
	if err != nil {
		return err
	}
	if err := normalizeAttachedTerminalPayloadSize(codePayload, terminalPayload, terminalDefaultHeight); err != nil {
		return err
	}

	codePayload["children"] = []string{terminalSectionID}
	codePayload["attachedTerminalSectionId"] = terminalSectionID
	if err := ensureEmbeddedCodeSectionPayloadSize(section.ID, codePayload, policy); err != nil {
		return err
	}

	updatedCodeImpl := impl.Clone()
	updatedCodeImpl.Code.Children = []string{terminalSectionID}
	updatedCodeImpl.Code.AttachedTerminalSectionID = terminalSectionID
	updatedCodeImpl.Payload, err = marshalProjectObject(codePayload)
	if err != nil {
		return err
	}
	p.SectionImpls[variant.ImplID] = updatedCodeImpl

	updatedTerminalImpl := terminalImpl.Clone()
	updatedTerminalImpl.Payload, err = marshalProjectObject(terminalPayload)
	if err != nil {
		return err
	}
	p.SectionImpls[terminalVariant.ImplID] = updatedTerminalImpl
	return nil
}

func (p *Project) detachCodeSectionAttachedTerminal(
	section Section,
	variant SectionVariant,
	impl SectionImpl,
	policy AutoLayoutSectionSizingPolicy,
) error {
	codePayload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return err
	}
	currentChildren := payloadStringArrayField(codePayload, "children")
	if len(currentChildren) > 1 {
		return fmt.Errorf("%w: section=%q", ErrCodeSectionMultipleChildren, section.ID)
	}

	terminalSectionID := strings.TrimSpace(impl.Code.AttachedTerminalSectionID)
	if len(currentChildren) == 1 {
		terminalSectionID = currentChildren[0]
	}

	delete(codePayload, "attachedTerminalSectionId")
	codePayload["children"] = []string{}

	updatedCodeImpl := impl.Clone()
	updatedCodeImpl.Code.AttachedTerminalSectionID = ""
	updatedCodeImpl.Code.Children = []string{}
	updatedCodeImpl.Payload, err = marshalProjectObject(codePayload)
	if err != nil {
		return err
	}
	p.SectionImpls[variant.ImplID] = updatedCodeImpl

	if terminalSectionID == "" {
		return nil
	}
	terminalSection, _, terminalImpl, err := p.ResolveSection(terminalSectionID)
	if err != nil {
		if errors.Is(err, ErrSectionNotFound) {
			return nil
		}
		return err
	}
	if !terminalImpl.IsTerminal() {
		return ErrTerminalSectionRequired
	}

	terminalSection.ParentSectionID = ""
	p.Sections[terminalSection.ID] = terminalSection

	if layout, ok := p.existingTopLevelSectionLayout(terminalSectionID); ok {
		p.addTopLevelSectionViewState(terminalSectionID, layout)
		return nil
	}

	position, err := p.resolveDeterministicCreateTopLevelSectionPosition(policy, "Terminal", terminalImpl.Payload)
	if err != nil {
		return err
	}
	p.addTopLevelSectionViewState(terminalSectionID, TopLevelSectionLayout{
		X:      position.X,
		Y:      position.Y,
		ZIndex: p.nextCreateTopLevelSectionZIndex(),
	})
	return nil
}

func normalizeAttachedTerminalPayloadSize(codePayload map[string]any, terminalPayload map[string]any, terminalHeight float64) error {
	codeSize, ok := payloadObjectField(codePayload, "size")
	if !ok {
		codeSize = map[string]any{}
	}
	terminalSize, ok := payloadObjectField(terminalPayload, "size")
	if !ok {
		terminalSize = map[string]any{}
	}

	codeWidth, isAuto, present, err := payloadAutoLayoutSizeValue(codeSize, "width")
	if err != nil {
		return err
	}
	if present && !isAuto {
		terminalSize["width"] = codeWidth
	}

	terminalCurrentHeight, isAuto, present, err := payloadAutoLayoutSizeValue(terminalSize, "height")
	if err != nil {
		return err
	}
	if !present || isAuto || terminalCurrentHeight <= 0 {
		terminalSize["height"] = terminalHeight
	}

	codePayload["size"] = codeSize
	terminalPayload["size"] = terminalSize
	return nil
}

func (p *Project) removeChildFromParent(parentID string, childID string) error {
	parentSection, parentVariant, parentImpl, err := p.ResolveSection(parentID)
	if err != nil {
		return err
	}
	parentPayload, err := effectiveSectionPayload(*p, parentSection.ID, parentVariant.ID)
	if err != nil {
		return err
	}

	currentChildren := payloadStringArrayField(parentPayload, "children")
	nextChildren := make([]string, 0, len(currentChildren))
	for _, currentChildID := range currentChildren {
		if currentChildID == childID {
			continue
		}
		nextChildren = append(nextChildren, currentChildID)
	}
	parentPayload["children"] = append([]string(nil), nextChildren...)

	updatedParentImpl := parentImpl.Clone()
	if updatedParentImpl.IsCode() {
		updatedParentImpl.Code.Children = append([]string(nil), nextChildren...)
		if strings.TrimSpace(updatedParentImpl.Code.AttachedTerminalSectionID) == childID || payloadStringField(parentPayload, "attachedTerminalSectionId") == childID {
			delete(parentPayload, "attachedTerminalSectionId")
			updatedParentImpl.Code.AttachedTerminalSectionID = ""
		}
	}

	updatedPayload, err := marshalProjectObject(parentPayload)
	if err != nil {
		return err
	}
	updatedParentImpl.Payload = updatedPayload
	p.SectionImpls[parentVariant.ImplID] = updatedParentImpl
	return nil
}

func (p *Project) removeTopLevelSectionViewState(sectionID string) {
	if p == nil {
		return
	}

	removed := map[string]struct{}{sectionID: {}}
	p.TopLevelSectionIDs = filterStringSlice(p.TopLevelSectionIDs, removed)
	delete(p.TopLevelSections, sectionID)
	for viewModeID, viewMode := range p.ViewModes {
		delete(viewMode.TopLevelSections, sectionID)
		p.ViewModes[viewModeID] = viewMode
	}
}

func (p *Project) addTopLevelSectionViewState(sectionID string, layout TopLevelSectionLayout) {
	if p == nil {
		return
	}

	if !containsString(p.TopLevelSectionIDs, sectionID) {
		p.TopLevelSectionIDs = append(p.TopLevelSectionIDs, sectionID)
	}
	if p.TopLevelSections == nil {
		p.TopLevelSections = map[string]TopLevelSectionLayout{}
	}
	p.TopLevelSections[sectionID] = layout.Clone()

	for viewModeID, viewMode := range p.ViewModes {
		if viewMode.VisibilityBySectionID == nil {
			viewMode.VisibilityBySectionID = map[string]bool{}
		}
		viewMode.VisibilityBySectionID[sectionID] = true
		if viewMode.TopLevelSections == nil {
			viewMode.TopLevelSections = map[string]TopLevelSectionLayout{}
		}
		viewMode.TopLevelSections[sectionID] = layout.Clone()
		p.ViewModes[viewModeID] = viewMode
	}
}

func (p Project) existingTopLevelSectionLayout(sectionID string) (TopLevelSectionLayout, bool) {
	if layout, ok := p.TopLevelSections[sectionID]; ok {
		return layout.Clone(), true
	}
	for _, viewMode := range p.ViewModes {
		if layout, ok := viewMode.TopLevelSections[sectionID]; ok {
			return layout.Clone(), true
		}
	}
	return TopLevelSectionLayout{}, false
}
