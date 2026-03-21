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
	normalized := MoveSectionsInput{
		SectionIDs: make([]string, 0, len(input.SectionIDs)),
	}

	seenSectionIDs := make(map[string]struct{}, len(input.SectionIDs))
	for _, rawSectionID := range input.SectionIDs {
		sectionID := strings.TrimSpace(rawSectionID)
		if sectionID == "" {
			return MoveSectionsInput{}, ErrMoveSectionsSectionIDBlank
		}
		if _, ok := seenSectionIDs[sectionID]; ok {
			continue
		}
		seenSectionIDs[sectionID] = struct{}{}
		normalized.SectionIDs = append(normalized.SectionIDs, sectionID)
	}

	if input.NewParentID != nil {
		newParentID := strings.TrimSpace(*input.NewParentID)
		if newParentID == "" {
			return MoveSectionsInput{}, ErrChildSectionParentIDRequired
		}
		normalized.NewParentID = &newParentID
	}

	if input.NewIndex != nil {
		newIndex := *input.NewIndex
		normalized.NewIndex = &newIndex
	}

	if input.PositionsByID != nil {
		normalized.PositionsByID = make(map[string]Position, len(input.PositionsByID))
		for rawSectionID, position := range input.PositionsByID {
			sectionID := strings.TrimSpace(rawSectionID)
			if sectionID == "" {
				return MoveSectionsInput{}, ErrMoveSectionsPositionMissing
			}
			normalized.PositionsByID[sectionID] = position
		}
	}

	if normalized.NewParentID == nil {
		return normalized, nil
	}
	if normalized.NewIndex == nil {
		return MoveSectionsInput{}, ErrMoveSectionsNewIndexRequired
	}
	if *normalized.NewIndex < 0 {
		return MoveSectionsInput{}, ErrMoveSectionsNewIndexNegative
	}
	return normalized, nil
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
		position, ok := positionsByID[sectionID]
		if !ok {
			return fmt.Errorf("%w: section=%q", ErrMoveSectionsPositionMissing, sectionID)
		}
		if !isFinitePosition(position) {
			return fmt.Errorf("%w: section=%q", ErrMoveSectionsPositionInvalid, sectionID)
		}

		section, _, _, err := p.ResolveSection(sectionID)
		if err != nil {
			return err
		}

		wasTopLevel := strings.TrimSpace(section.ParentSectionID) == ""
		if !wasTopLevel {
			if err := p.removeChildFromParent(section.ParentSectionID, sectionID); err != nil {
				return err
			}
		}
		if err := p.setSectionParent(sectionID, ""); err != nil {
			return err
		}

		layout, ok := p.existingTopLevelSectionLayout(sectionID)
		if !ok {
			layout = TopLevelSectionLayout{ZIndex: nextZIndex}
			nextZIndex += 1
		} else if !wasTopLevel {
			layout.ZIndex = nextZIndex
			nextZIndex += 1
		}
		layout.X = position.X
		layout.Y = position.Y
		p.addTopLevelSectionViewState(sectionID, layout)
	}
	return nil
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

	newParentSection, newParentVariant, newParentImpl, err := p.ResolveSection(newParentID)
	if err != nil {
		return err
	}
	newParentPayload, err := effectiveSectionPayload(*p, newParentSection.ID, newParentVariant.ID)
	if err != nil {
		return err
	}
	currentChildren, err := p.sectionChildIDs(newParentSection.ID)
	if err != nil {
		return err
	}

	selectedSet := stringSetFromSlice(sectionIDs)
	if _, ok := selectedSet[newParentSection.ID]; ok {
		return ErrMoveSectionsNewParentSelected
	}
	ancestorID := newParentSection.ID
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

	remainingChildren := filterStringSlice(currentChildren, selectedSet)
	if newIndex > len(remainingChildren) {
		return ErrMoveSectionsNewIndexOutOfRange
	}

	if supportsBaseCodeSectionSemantics(newParentImpl, newParentPayload) {
		if err := p.validateMoveSectionsCodeParent(newParentSection.ID, newParentImpl, newParentPayload, currentChildren, sectionIDs); err != nil {
			return err
		}
		terminalSectionID := sectionIDs[0]
		return p.attachCodeSectionTerminal(
			newParentSection,
			newParentVariant,
			newParentImpl,
			terminalSectionID,
			policy,
			terminalDefaultHeight,
		)
	}

	for _, sectionID := range sectionIDs {
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
		if err := p.setSectionParent(sectionID, newParentSection.ID); err != nil {
			return err
		}
	}

	return p.setSectionChildren(
		newParentSection.ID,
		insertStringSlice(remainingChildren, newIndex, sectionIDs),
	)
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
