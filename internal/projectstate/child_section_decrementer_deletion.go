package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrChildSectionDecrementerCalledByRequired    = errors.New("decrementer calledBy is required")
	ErrChildSectionDecrementerCalledByUnsupported = errors.New("decrementer calledBy must resolve to a parent section or a child with a parent")
	ErrChildSectionDecrementerCalledByNotInParent = errors.New("decrementer calledBy was not found in its parent children")
	ErrChildSectionDecrementerCountInvalid        = errors.New("decrementer numChildren must be at least 0")
)

type DeleteChildSectionsViaDecrementerInput struct {
	CalledBy    string `json:"calledBy"`
	NumChildren int    `json:"numChildren"`
}

func (d *Document) DeleteChildSectionsViaDecrementer(
	projectID string,
	input DeleteChildSectionsViaDecrementerInput,
) (DeleteSectionsResult, error) {
	if d == nil {
		return DeleteSectionsResult{}, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return DeleteSectionsResult{}, err
	}
	result, err := project.DeleteChildSectionsViaDecrementer(input)
	if err != nil {
		return DeleteSectionsResult{}, err
	}
	d.Projects[project.ID] = project
	return result, nil
}

func (r *Runtime) DeleteChildSectionsViaDecrementer(
	ctx context.Context,
	projectID string,
	input DeleteChildSectionsViaDecrementerInput,
) (Snapshot, DeleteSectionsResult, error) {
	if r == nil {
		return Snapshot{}, DeleteSectionsResult{}, ErrRuntimeClosed
	}

	var result DeleteSectionsResult
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		var mutationErr error
		result, mutationErr = document.DeleteChildSectionsViaDecrementer(projectID, input)
		if mutationErr != nil {
			return document, mutationErr
		}
		return document, nil
	})
	if err != nil {
		return Snapshot{}, DeleteSectionsResult{}, err
	}
	return snapshot, result, nil
}

func (p *Project) DeleteChildSectionsViaDecrementer(
	input DeleteChildSectionsViaDecrementerInput,
) (DeleteSectionsResult, error) {
	if p == nil {
		return DeleteSectionsResult{}, ErrProjectNotFound
	}

	normalized, err := normalizeDeleteChildSectionsViaDecrementerInput(input)
	if err != nil {
		return DeleteSectionsResult{}, err
	}
	sectionIDs, err := p.resolveDeleteChildSectionsViaDecrementerTargets(normalized.CalledBy, normalized.NumChildren)
	if err != nil {
		return DeleteSectionsResult{}, err
	}
	if len(sectionIDs) == 0 {
		return DeleteSectionsResult{SectionIDs: []string{}}, nil
	}

	return p.DeleteSections(DeleteSectionsInput{SectionIDs: sectionIDs})
}

func normalizeDeleteChildSectionsViaDecrementerInput(input DeleteChildSectionsViaDecrementerInput) (DeleteChildSectionsViaDecrementerInput, error) {
	normalized := DeleteChildSectionsViaDecrementerInput{
		CalledBy:    strings.TrimSpace(input.CalledBy),
		NumChildren: input.NumChildren,
	}
	if normalized.CalledBy == "" {
		return DeleteChildSectionsViaDecrementerInput{}, ErrChildSectionDecrementerCalledByRequired
	}
	if normalized.NumChildren < 0 {
		return DeleteChildSectionsViaDecrementerInput{}, ErrChildSectionDecrementerCountInvalid
	}
	return normalized, nil
}

func (p Project) resolveDeleteChildSectionsViaDecrementerTargets(calledBy string, numChildren int) ([]string, error) {
	callerSection, callerVariant, callerImpl, err := p.ResolveSection(calledBy)
	if err != nil {
		return nil, err
	}
	callerPayload, err := effectiveSectionPayload(p, callerSection.ID, callerVariant.ID)
	if err != nil {
		return nil, err
	}
	callerChildren, callerHasChildren := payloadChildren(callerPayload)
	if callerHasChildren || callerImpl.IsCode() {
		return selectDeletedChildSectionIDs(callerChildren, 0, numChildren), nil
	}

	parentID := strings.TrimSpace(callerSection.ParentSectionID)
	if parentID == "" {
		return nil, fmt.Errorf("%w: calledBy=%q", ErrChildSectionDecrementerCalledByUnsupported, calledBy)
	}
	parentSection, parentVariant, parentImpl, err := p.ResolveSection(parentID)
	if err != nil {
		return nil, err
	}
	parentPayload, err := effectiveSectionPayload(p, parentSection.ID, parentVariant.ID)
	if err != nil {
		return nil, err
	}
	parentChildren, parentHasChildren := payloadChildren(parentPayload)
	if !parentHasChildren && !parentImpl.IsCode() {
		return nil, fmt.Errorf("%w: calledBy=%q", ErrChildSectionDecrementerCalledByUnsupported, calledBy)
	}
	callerIndex := indexOfString(parentChildren, callerSection.ID)
	if callerIndex < 0 {
		return nil, fmt.Errorf("%w: calledBy=%q parent=%q", ErrChildSectionDecrementerCalledByNotInParent, calledBy, parentID)
	}
	return selectDeletedChildSectionIDs(parentChildren, callerIndex+1, numChildren), nil
}

func selectDeletedChildSectionIDs(children []string, startIdx int, count int) []string {
	if count == 0 || startIdx >= len(children) {
		return nil
	}

	endIdx := startIdx + count
	if endIdx > len(children) {
		endIdx = len(children)
	}
	return append([]string(nil), children[startIdx:endIdx]...)
}
