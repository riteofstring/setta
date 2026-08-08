package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrMoveSectionsSectionIDBlank      = errors.New("move sections sectionIds must not contain blank ids")
	ErrMoveSectionsAncestorSelection   = errors.New("section selection includes both ancestor and descendant")
	ErrMoveSectionsPositionsRequired   = errors.New("positionsById is required when moving sections to the pane")
	ErrMoveSectionsPositionMissing     = errors.New("positionsById is missing an entry for a selected section")
	ErrMoveSectionsPositionInvalid     = errors.New("positionsById contains an invalid position")
	ErrMoveSectionsNewIndexRequired    = errors.New("newIndex is required when moving sections into a parent")
	ErrMoveSectionsNewIndexNegative    = errors.New("expected non-negative new index")
	ErrMoveSectionsNewIndexOutOfRange  = errors.New("new index exceeds available sibling range")
	ErrMoveSectionsNewParentSelected   = errors.New("cannot reparent into a selected section")
	ErrMoveSectionsNewParentDescendant = errors.New("cannot reparent into a descendant of selection")
)

type MoveSectionsInput struct {
	SectionIDs    []string            `json:"sectionIds"`
	NewParentID   *string             `json:"newParentId,omitempty"`
	NewIndex      *int                `json:"newIndex,omitempty"`
	PositionsByID map[string]Position `json:"positionsById,omitempty"`
}

type moveSectionsParentTarget struct {
	section         Section
	variant         SectionVariant
	impl            SectionImpl
	payload         map[string]any
	currentChildren []string
}

func (d *Document) MoveSections(
	projectID string,
	input MoveSectionsInput,
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
	if err := project.MoveSections(
		input,
		normalizedSettings.SectionSizingPolicy,
		normalizedSettings.TerminalDefaultHeight,
	); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) MoveSections(
	ctx context.Context,
	projectID string,
	input MoveSectionsInput,
	settings StructuralMutationSettings,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.MoveSections(projectID, input, settings); err != nil {
			return document, err
		}
		if err := r.reconcileProjectPythonGeneratedSectionsAfterStructuralMutation(ctx, &document, projectID); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) MoveSections(
	input MoveSectionsInput,
	policy AutoLayoutSectionSizingPolicy,
	terminalDefaultHeight float64,
) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := normalizeMoveSectionsInput(input)
	if err != nil {
		return err
	}
	if len(normalized.SectionIDs) == 0 {
		return nil
	}

	p.pruneTopLevelCreationViewState()

	if err := p.validateMoveSectionsSelection(normalized.SectionIDs); err != nil {
		return err
	}

	if normalized.NewParentID == nil {
		return p.moveSectionsToPane(normalized.SectionIDs, normalized.PositionsByID)
	}
	return p.moveSectionsToParent(
		normalized.SectionIDs,
		*normalized.NewParentID,
		*normalized.NewIndex,
		policy,
		terminalDefaultHeight,
	)
}

func normalizeMoveSectionsInput(input MoveSectionsInput) (MoveSectionsInput, error) {
	sectionIDs, err := normalizeMoveSectionsSectionIDs(input.SectionIDs)
	if err != nil {
		return MoveSectionsInput{}, err
	}
	newParentID, err := normalizeMoveSectionsParentID(input.NewParentID)
	if err != nil {
		return MoveSectionsInput{}, err
	}
	positionsByID, err := normalizeMoveSectionsPositions(input.PositionsByID)
	if err != nil {
		return MoveSectionsInput{}, err
	}

	normalized := MoveSectionsInput{
		SectionIDs:    sectionIDs,
		NewParentID:   newParentID,
		PositionsByID: positionsByID,
	}
	if input.NewIndex != nil {
		newIndex := *input.NewIndex
		normalized.NewIndex = &newIndex
	}
	if err := validateMoveSectionsParentInput(normalized.NewParentID, normalized.NewIndex); err != nil {
		return MoveSectionsInput{}, err
	}
	return normalized, nil
}

func normalizeMoveSectionsSectionIDs(sectionIDs []string) ([]string, error) {
	normalized := make([]string, 0, len(sectionIDs))
	seenSectionIDs := make(map[string]struct{}, len(sectionIDs))
	for _, rawSectionID := range sectionIDs {
		sectionID := strings.TrimSpace(rawSectionID)
		if sectionID == "" {
			return nil, ErrMoveSectionsSectionIDBlank
		}
		if _, ok := seenSectionIDs[sectionID]; ok {
			continue
		}
		seenSectionIDs[sectionID] = struct{}{}
		normalized = append(normalized, sectionID)
	}
	return normalized, nil
}

func normalizeMoveSectionsParentID(parentID *string) (*string, error) {
	if parentID == nil {
		return nil, nil
	}
	normalized := strings.TrimSpace(*parentID)
	if normalized == "" {
		return nil, ErrChildSectionParentIDRequired
	}
	return &normalized, nil
}

func normalizeMoveSectionsPositions(
	positionsByID map[string]Position,
) (map[string]Position, error) {
	if positionsByID == nil {
		return nil, nil
	}
	normalized := make(map[string]Position, len(positionsByID))
	for rawSectionID, position := range positionsByID {
		sectionID := strings.TrimSpace(rawSectionID)
		if sectionID == "" {
			return nil, ErrMoveSectionsPositionMissing
		}
		normalized[sectionID] = position
	}
	return normalized, nil
}

func validateMoveSectionsParentInput(newParentID *string, newIndex *int) error {
	if newParentID == nil {
		return nil
	}
	if newIndex == nil {
		return ErrMoveSectionsNewIndexRequired
	}
	if *newIndex < 0 {
		return ErrMoveSectionsNewIndexNegative
	}
	return nil
}

func (p *Project) validateMoveSectionsSelection(sectionIDs []string) error {
	if p == nil {
		return ErrProjectNotFound
	}
	if len(sectionIDs) == 0 {
		return nil
	}

	selectedSet := stringSetFromSlice(sectionIDs)
	for _, sectionID := range sectionIDs {
		section, ok := p.Sections[sectionID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
		}
		ancestorID := strings.TrimSpace(section.ParentSectionID)
		for ancestorID != "" {
			if _, ok := selectedSet[ancestorID]; ok {
				return ErrMoveSectionsAncestorSelection
			}
			ancestor, ok := p.Sections[ancestorID]
			if !ok {
				return fmt.Errorf("%w: %q", ErrSectionNotFound, ancestorID)
			}
			ancestorID = strings.TrimSpace(ancestor.ParentSectionID)
		}
	}
	return nil
}

func (p *Project) moveSectionsToPane(sectionIDs []string, positionsByID map[string]Position) error {
	if p == nil {
		return ErrProjectNotFound
	}
	if positionsByID == nil {
		return ErrMoveSectionsPositionsRequired
	}

	nextZIndex := p.nextCreateTopLevelSectionZIndex()
	for _, sectionID := range sectionIDs {
		position, err := validateMoveSectionsPanePosition(sectionID, positionsByID)
		if err != nil {
			return err
		}
		nextZIndex, err = p.moveSectionToPane(sectionID, position, nextZIndex)
		if err != nil {
			return err
		}
	}
	return nil
}

func validateMoveSectionsPanePosition(sectionID string, positionsByID map[string]Position) (Position, error) {
	position, ok := positionsByID[sectionID]
	if !ok {
		return Position{}, fmt.Errorf("%w: section=%q", ErrMoveSectionsPositionMissing, sectionID)
	}
	if !isFinitePosition(position) {
		return Position{}, fmt.Errorf("%w: section=%q", ErrMoveSectionsPositionInvalid, sectionID)
	}
	return position, nil
}

func (p *Project) moveSectionToPane(sectionID string, position Position, nextZIndex int) (int, error) {
	section, _, _, err := p.ResolveSection(sectionID)
	if err != nil {
		return nextZIndex, err
	}

	wasTopLevel, err := p.detachSectionForPaneMove(section)
	if err != nil {
		return nextZIndex, err
	}

	layout, nextZIndex := p.layoutForPaneMove(sectionID, position, wasTopLevel, nextZIndex)
	p.addTopLevelSectionViewState(sectionID, layout)
	return nextZIndex, nil
}

func (p *Project) detachSectionForPaneMove(section Section) (bool, error) {
	wasTopLevel := strings.TrimSpace(section.ParentSectionID) == ""
	if !wasTopLevel {
		if err := p.removeChildFromParent(section.ParentSectionID, section.ID); err != nil {
			return false, err
		}
	}
	if err := p.setSectionParent(section.ID, ""); err != nil {
		return false, err
	}
	return wasTopLevel, nil
}

func (p *Project) layoutForPaneMove(
	sectionID string,
	position Position,
	wasTopLevel bool,
	nextZIndex int,
) (TopLevelSectionLayout, int) {
	layout, ok := p.existingTopLevelSectionLayout(sectionID)
	switch {
	case !ok:
		layout = TopLevelSectionLayout{ZIndex: nextZIndex}
		nextZIndex += 1
	case !wasTopLevel:
		layout.ZIndex = nextZIndex
		nextZIndex += 1
	}
	layout.X = position.X
	layout.Y = position.Y
	return layout, nextZIndex
}

func (p *Project) moveSectionsToParent(
	sectionIDs []string,
	newParentID string,
	newIndex int,
	policy AutoLayoutSectionSizingPolicy,
	terminalDefaultHeight float64,
) error {
	if p == nil {
		return ErrProjectNotFound
	}

	target, err := p.resolveMoveSectionsParentTarget(newParentID)
	if err != nil {
		return err
	}
	selectedSet := stringSetFromSlice(sectionIDs)
	if err := p.validateMoveSectionsParentSelection(target.section.ID, selectedSet); err != nil {
		return err
	}
	remainingChildren, err := validateMoveSectionsParentIndex(target.currentChildren, selectedSet, newIndex)
	if err != nil {
		return err
	}

	if supportsBaseCodeSectionSemantics(target.impl, target.payload) {
		return p.attachMoveSectionsCodeParent(target, sectionIDs, policy, terminalDefaultHeight)
	}
	if err := p.reparentSections(sectionIDs, target.section.ID); err != nil {
		return err
	}
	return p.setSectionChildren(
		target.section.ID,
		insertStringSlice(remainingChildren, newIndex, sectionIDs),
	)
}

func (p *Project) resolveMoveSectionsParentTarget(
	newParentID string,
) (moveSectionsParentTarget, error) {
	newParentSection, newParentVariant, newParentImpl, err := p.ResolveSection(newParentID)
	if err != nil {
		return moveSectionsParentTarget{}, err
	}
	newParentPayload, err := effectiveSectionPayload(*p, newParentSection.ID, newParentVariant.ID)
	if err != nil {
		return moveSectionsParentTarget{}, err
	}
	currentChildren, err := p.sectionChildIDs(newParentSection.ID)
	if err != nil {
		return moveSectionsParentTarget{}, err
	}
	return moveSectionsParentTarget{
		section:         newParentSection,
		variant:         newParentVariant,
		impl:            newParentImpl,
		payload:         newParentPayload,
		currentChildren: currentChildren,
	}, nil
}

func (p *Project) validateMoveSectionsParentSelection(
	newParentID string,
	selectedSet map[string]struct{},
) error {
	if _, ok := selectedSet[newParentID]; ok {
		return ErrMoveSectionsNewParentSelected
	}
	ancestorID := newParentID
	for ancestorID != "" {
		if _, ok := selectedSet[ancestorID]; ok {
			return ErrMoveSectionsNewParentDescendant
		}
		ancestor, ok := p.Sections[ancestorID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrSectionNotFound, ancestorID)
		}
		ancestorID = strings.TrimSpace(ancestor.ParentSectionID)
	}
	return nil
}

func validateMoveSectionsParentIndex(
	currentChildren []string,
	selectedSet map[string]struct{},
	newIndex int,
) ([]string, error) {
	remainingChildren := filterStringSlice(currentChildren, selectedSet)
	if newIndex > len(remainingChildren) {
		return nil, ErrMoveSectionsNewIndexOutOfRange
	}
	return remainingChildren, nil
}

func (p *Project) attachMoveSectionsCodeParent(
	target moveSectionsParentTarget,
	sectionIDs []string,
	policy AutoLayoutSectionSizingPolicy,
	terminalDefaultHeight float64,
) error {
	if err := p.validateMoveSectionsCodeParent(
		target.section.ID,
		target.impl,
		target.payload,
		target.currentChildren,
		sectionIDs,
	); err != nil {
		return err
	}
	return p.attachCodeSectionTerminal(
		target.section,
		target.variant,
		target.impl,
		sectionIDs[0],
		policy,
		terminalDefaultHeight,
	)
}

func (p *Project) reparentSections(sectionIDs []string, newParentID string) error {
	for _, sectionID := range sectionIDs {
		if err := p.reparentSection(sectionID, newParentID); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) reparentSection(sectionID string, newParentID string) error {
	section, _, _, err := p.ResolveSection(sectionID)
	if err != nil {
		return err
	}
	currentParentID := strings.TrimSpace(section.ParentSectionID)
	if currentParentID == "" {
		p.removeTopLevelSectionViewState(sectionID)
	} else {
		if err := p.removeChildFromParent(currentParentID, sectionID); err != nil {
			return err
		}
	}
	return p.setSectionParent(sectionID, newParentID)
}

func (p *Project) validateMoveSectionsCodeParent(
	parentID string,
	parentImpl SectionImpl,
	parentPayload map[string]any,
	currentChildren []string,
	sectionIDs []string,
) error {
	if len(sectionIDs) != 1 {
		return fmt.Errorf("%w: parent=%q childCount=%d", ErrCodeSectionChildCountInvalid, parentID, len(sectionIDs))
	}

	_, _, childImpl, err := p.ResolveSection(sectionIDs[0])
	if err != nil {
		return err
	}
	if !childImpl.IsTerminal() {
		return fmt.Errorf("%w: parent=%q section=%q", ErrCodeSectionChildTypeInvalid, parentID, sectionIDs[0])
	}

	selectedSet := stringSetFromSlice(sectionIDs)
	if len(filterStringSlice(currentChildren, selectedSet)) != 0 {
		return fmt.Errorf("%w: parent=%q", ErrCodeSectionAlreadyHasChild, parentID)
	}
	currentAttachedTerminalID, _ := baseCodeSectionAttachmentState(parentImpl, parentPayload)
	if currentAttachedTerminalID != "" && currentAttachedTerminalID != sectionIDs[0] {
		return fmt.Errorf("%w: parent=%q", ErrCodeSectionAlreadyHasChild, parentID)
	}
	return nil
}
