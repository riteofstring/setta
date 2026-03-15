package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrChildSectionIncrementerCalledByRequired    = errors.New("incrementer calledBy is required")
	ErrChildSectionIncrementerCalledByUnsupported = errors.New("incrementer calledBy must resolve to a parent section or a child with a parent")
	ErrChildSectionIncrementerCalledByNotInParent = errors.New("incrementer calledBy was not found in its parent children")
)

type CreateChildSectionsViaIncrementerInput struct {
	CalledBy    string `json:"calledBy"`
	ImplType    string `json:"implType"`
	NumChildren int    `json:"numChildren"`
}

func (d *Document) CreateChildSectionsViaIncrementer(
	projectID string,
	input CreateChildSectionsViaIncrementerInput,
	settings StructuralMutationSettings,
) (CreateChildSectionsResult, error) {
	if d == nil {
		return CreateChildSectionsResult{}, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}
	result, err := project.CreateChildSectionsViaIncrementer(input, settings)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}
	d.Projects[project.ID] = project
	return result, nil
}

func (r *Runtime) CreateChildSectionsViaIncrementer(
	ctx context.Context,
	projectID string,
	input CreateChildSectionsViaIncrementerInput,
	settings StructuralMutationSettings,
) (Snapshot, CreateChildSectionsResult, error) {
	if r == nil {
		return Snapshot{}, CreateChildSectionsResult{}, ErrRuntimeClosed
	}

	var result CreateChildSectionsResult
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		var mutationErr error
		result, mutationErr = document.CreateChildSectionsViaIncrementer(projectID, input, settings)
		if mutationErr != nil {
			return document, mutationErr
		}
		return document, nil
	})
	if err != nil {
		return Snapshot{}, CreateChildSectionsResult{}, err
	}
	return snapshot, result, nil
}

func (p *Project) CreateChildSectionsViaIncrementer(
	input CreateChildSectionsViaIncrementerInput,
	settings StructuralMutationSettings,
) (CreateChildSectionsResult, error) {
	if p == nil {
		return CreateChildSectionsResult{}, ErrProjectNotFound
	}

	normalized, err := normalizeCreateChildSectionsViaIncrementerInput(input)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}
	parentID, startIdx, err := p.resolveCreateChildSectionsViaIncrementerTarget(normalized.CalledBy)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}

	return p.CreateChildSections(CreateChildSectionsInput{
		ParentID:    parentID,
		ImplType:    normalized.ImplType,
		NumChildren: normalized.NumChildren,
		StartIdx:    &startIdx,
	}, settings)
}

func normalizeCreateChildSectionsViaIncrementerInput(input CreateChildSectionsViaIncrementerInput) (CreateChildSectionsViaIncrementerInput, error) {
	normalized := CreateChildSectionsViaIncrementerInput{
		CalledBy:    strings.TrimSpace(input.CalledBy),
		ImplType:    strings.TrimSpace(input.ImplType),
		NumChildren: input.NumChildren,
	}
	if normalized.CalledBy == "" {
		return CreateChildSectionsViaIncrementerInput{}, ErrChildSectionIncrementerCalledByRequired
	}
	if normalized.ImplType == "" {
		return CreateChildSectionsViaIncrementerInput{}, ErrChildSectionImplTypeRequired
	}
	if !isSupportedChildSectionImplType(normalized.ImplType) {
		return CreateChildSectionsViaIncrementerInput{}, fmt.Errorf("%w: %q", ErrChildSectionImplTypeUnsupported, normalized.ImplType)
	}
	if normalized.NumChildren < 1 {
		return CreateChildSectionsViaIncrementerInput{}, ErrChildSectionCountInvalid
	}
	return normalized, nil
}

func (p Project) resolveCreateChildSectionsViaIncrementerTarget(calledBy string) (string, int, error) {
	callerSection, callerVariant, callerImpl, err := p.ResolveSection(calledBy)
	if err != nil {
		return "", 0, err
	}
	callerPayload, err := effectiveSectionPayload(p, callerSection.ID, callerVariant.ID)
	if err != nil {
		return "", 0, err
	}
	_, callerHasChildren := payloadChildren(callerPayload)
	if callerHasChildren || callerImpl.IsCode() {
		return callerSection.ID, 0, nil
	}

	parentID := strings.TrimSpace(callerSection.ParentSectionID)
	if parentID == "" {
		return "", 0, fmt.Errorf("%w: calledBy=%q", ErrChildSectionIncrementerCalledByUnsupported, calledBy)
	}
	parentSection, parentVariant, parentImpl, err := p.ResolveSection(parentID)
	if err != nil {
		return "", 0, err
	}
	parentPayload, err := effectiveSectionPayload(p, parentSection.ID, parentVariant.ID)
	if err != nil {
		return "", 0, err
	}
	parentChildren, parentHasChildren := payloadChildren(parentPayload)
	if !parentHasChildren && !parentImpl.IsCode() {
		return "", 0, fmt.Errorf("%w: calledBy=%q", ErrChildSectionIncrementerCalledByUnsupported, calledBy)
	}
	callerIndex := indexOfString(parentChildren, callerSection.ID)
	if callerIndex < 0 {
		return "", 0, fmt.Errorf("%w: calledBy=%q parent=%q", ErrChildSectionIncrementerCalledByNotInParent, calledBy, parentID)
	}
	return parentID, callerIndex + 1, nil
}
