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
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return err
	}
	if !supportsBaseCodeSectionSemantics(impl, payload) {
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

type codeSectionAttachmentState struct {
	attachedTerminalID string
	childTerminalID    string
}

type codeSectionTerminalAttachTarget struct {
	terminalVariant SectionVariant
	terminalImpl    SectionImpl
	codePayload     map[string]any
	terminalPayload map[string]any
}

func resolveCodeSectionAttachmentState(
	sectionID string,
	impl SectionImpl,
	payload map[string]any,
) (codeSectionAttachmentState, error) {
	attachedTerminalID, currentChildren := baseCodeSectionAttachmentState(impl, payload)
	switch len(currentChildren) {
	case 0:
		return codeSectionAttachmentState{
			attachedTerminalID: attachedTerminalID,
		}, nil
	case 1:
		return codeSectionAttachmentState{
			attachedTerminalID: attachedTerminalID,
			childTerminalID:    currentChildren[0],
		}, nil
	default:
		return codeSectionAttachmentState{}, fmt.Errorf("%w: section=%q", ErrCodeSectionMultipleChildren, sectionID)
	}
}

func (s codeSectionAttachmentState) terminalSectionID() string {
	if s.childTerminalID != "" {
		return s.childTerminalID
	}
	return s.attachedTerminalID
}

func validateCodeSectionTerminalAttachment(
	sectionID string,
	nextTerminalID string,
	state codeSectionAttachmentState,
) error {
	if state.childTerminalID != "" && state.childTerminalID != nextTerminalID {
		return fmt.Errorf(
			"%w: section=%q current=%q next=%q",
			ErrCodeSectionAttachedTerminalConflict,
			sectionID,
			state.childTerminalID,
			nextTerminalID,
		)
	}
	if state.attachedTerminalID != "" &&
		state.attachedTerminalID != nextTerminalID &&
		state.childTerminalID != "" {
		return fmt.Errorf(
			"%w: section=%q current=%q next=%q",
			ErrCodeSectionAttachedTerminalConflict,
			sectionID,
			state.attachedTerminalID,
			nextTerminalID,
		)
	}
	return nil
}

func (p *Project) attachCodeSectionTerminal(
	section Section,
	variant SectionVariant,
	impl SectionImpl,
	terminalSectionID string,
	policy AutoLayoutSectionSizingPolicy,
	terminalDefaultHeight float64,
) error {
	target, err := p.resolveCodeSectionTerminalAttachTarget(
		section,
		variant,
		impl,
		terminalSectionID,
		terminalDefaultHeight,
	)
	if err != nil {
		return err
	}
	if err := p.persistAttachedCodeSection(section.ID, variant, impl, target.codePayload, policy, terminalSectionID); err != nil {
		return err
	}
	return p.persistAttachedTerminalSection(target.terminalVariant, target.terminalImpl, target.terminalPayload)
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
	attachmentState, err := resolveCodeSectionAttachmentState(section.ID, impl, codePayload)
	if err != nil {
		return err
	}
	terminalSectionID := attachmentState.terminalSectionID()

	updatedCodeImpl := impl.Clone()
	setBaseCodeSectionAttachmentState(codePayload, &updatedCodeImpl, nil)
	if err := marshalSectionImplPayload(&updatedCodeImpl, codePayload); err != nil {
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
	return p.restoreDetachedTerminalTopLevel(terminalSectionID, &terminalSection, terminalImpl, policy)
}

func normalizeAttachedTerminalPayloadSize(
	codePayload map[string]any,
	terminalPayload map[string]any,
	terminalPayloadExplicit bool,
	terminalHeight float64,
) error {
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
	if !terminalPayloadExplicit || !present || isAuto || terminalCurrentHeight <= 0 {
		terminalSize["height"] = terminalHeight
	}

	codePayload["size"] = codeSize
	terminalPayload["size"] = terminalSize
	return nil
}

func (p *Project) resolveCodeSectionTerminalAttachTarget(
	section Section,
	variant SectionVariant,
	impl SectionImpl,
	terminalSectionID string,
	terminalDefaultHeight float64,
) (codeSectionTerminalAttachTarget, error) {
	terminalSection, terminalVariant, terminalImpl, err := p.resolveTerminalAttachmentSection(terminalSectionID)
	if err != nil {
		return codeSectionTerminalAttachTarget{}, err
	}

	codePayload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return codeSectionTerminalAttachTarget{}, err
	}
	attachmentState, err := resolveCodeSectionAttachmentState(section.ID, impl, codePayload)
	if err != nil {
		return codeSectionTerminalAttachTarget{}, err
	}
	if err := validateCodeSectionTerminalAttachment(section.ID, terminalSectionID, attachmentState); err != nil {
		return codeSectionTerminalAttachTarget{}, err
	}

	if err := p.reparentTerminalSection(section.ID, &terminalSection); err != nil {
		return codeSectionTerminalAttachTarget{}, err
	}

	terminalPayloadExplicit := len(terminalImpl.Payload) != 0
	terminalPayload, err := effectiveSectionPayload(*p, terminalSection.ID, terminalVariant.ID)
	if err != nil {
		return codeSectionTerminalAttachTarget{}, err
	}
	if err := normalizeAttachedTerminalPayloadSize(
		codePayload,
		terminalPayload,
		terminalPayloadExplicit,
		terminalDefaultHeight,
	); err != nil {
		return codeSectionTerminalAttachTarget{}, err
	}
	return codeSectionTerminalAttachTarget{
		terminalVariant: terminalVariant,
		terminalImpl:    terminalImpl,
		codePayload:     codePayload,
		terminalPayload: terminalPayload,
	}, nil
}

func (p *Project) resolveTerminalAttachmentSection(terminalSectionID string) (Section, SectionVariant, SectionImpl, error) {
	terminalSection, terminalVariant, terminalImpl, err := p.ResolveSection(terminalSectionID)
	if err != nil {
		return Section{}, SectionVariant{}, SectionImpl{}, err
	}
	if !terminalImpl.IsTerminal() {
		return Section{}, SectionVariant{}, SectionImpl{}, ErrTerminalSectionRequired
	}
	return terminalSection, terminalVariant, terminalImpl, nil
}

func (p *Project) persistAttachedCodeSection(
	sectionID string,
	variant SectionVariant,
	impl SectionImpl,
	codePayload map[string]any,
	policy AutoLayoutSectionSizingPolicy,
	terminalSectionID string,
) error {
	updatedCodeImpl := impl.Clone()
	setBaseCodeSectionAttachmentState(codePayload, &updatedCodeImpl, []string{terminalSectionID})
	if err := ensureEmbeddedCodeSectionPayloadSize(sectionID, codePayload, policy); err != nil {
		return err
	}
	if err := marshalSectionImplPayload(&updatedCodeImpl, codePayload); err != nil {
		return err
	}
	p.SectionImpls[variant.ImplID] = updatedCodeImpl
	return nil
}

func (p *Project) persistAttachedTerminalSection(
	variant SectionVariant,
	impl SectionImpl,
	terminalPayload map[string]any,
) error {
	updatedTerminalImpl := impl.Clone()
	if err := marshalSectionImplPayload(&updatedTerminalImpl, terminalPayload); err != nil {
		return err
	}
	p.SectionImpls[variant.ImplID] = updatedTerminalImpl
	return nil
}

func (p *Project) reparentTerminalSection(parentSectionID string, terminalSection *Section) error {
	if terminalSection == nil {
		return nil
	}
	oldParentID := strings.TrimSpace(terminalSection.ParentSectionID)
	if oldParentID != "" && oldParentID != parentSectionID {
		if err := p.removeChildFromParent(oldParentID, terminalSection.ID); err != nil {
			return err
		}
	}
	p.removeTopLevelSectionViewState(terminalSection.ID)
	terminalSection.ParentSectionID = parentSectionID
	p.Sections[terminalSection.ID] = *terminalSection
	return nil
}

func marshalSectionImplPayload(impl *SectionImpl, payload map[string]any) error {
	if impl == nil {
		return nil
	}
	encodedPayload, err := marshalProjectObject(payload)
	if err != nil {
		return err
	}
	impl.Payload = encodedPayload
	return nil
}

func (p *Project) restoreDetachedTerminalTopLevel(
	terminalSectionID string,
	terminalSection *Section,
	terminalImpl SectionImpl,
	policy AutoLayoutSectionSizingPolicy,
) error {
	if terminalSection == nil {
		return nil
	}
	terminalSection.ParentSectionID = ""
	p.Sections[terminalSection.ID] = *terminalSection

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

	updatedParentImpl := parentImpl.Clone()
	if supportsBaseCodeSectionSemantics(updatedParentImpl, parentPayload) {
		setBaseCodeSectionAttachmentState(parentPayload, &updatedParentImpl, nextChildren)
	} else {
		parentPayload["children"] = append([]string(nil), nextChildren...)
	}
	if err := marshalSectionImplPayload(&updatedParentImpl, parentPayload); err != nil {
		return err
	}
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
