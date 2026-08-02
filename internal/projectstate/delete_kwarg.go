package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrDeleteKwargUnsupported       = errors.New("section does not support delete_kwarg")
	ErrDeleteKwargCallableUnset     = errors.New("callable section must have an active callable before delete_kwarg")
	ErrDeleteKwargNoParams          = errors.New("section has no kwargs to delete")
	ErrDeleteKwargRootMissing       = errors.New("delete_kwarg root container is missing from the active section code object map")
	ErrDeleteKwargParentUnsupported = errors.New("delete_kwarg parent code object type is not supported")
)

type DeleteKwargResult struct {
	CodeObjID string `json:"codeObjId"`
}

type deleteKwargContext struct {
	sectionID     string
	sectionType   string
	rootCodeObjID string
}

func (d *Document) DeleteKwarg(projectID string, sectionID string) (DeleteKwargResult, error) {
	if d == nil {
		return DeleteKwargResult{}, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return DeleteKwargResult{}, err
	}
	result, err := project.DeleteKwarg(sectionID)
	if err != nil {
		return DeleteKwargResult{}, err
	}
	d.Projects[project.ID] = project
	return result, nil
}

func (r *Runtime) DeleteKwarg(ctx context.Context, projectID string, sectionID string) (Snapshot, DeleteKwargResult, error) {
	if r == nil {
		return Snapshot{}, DeleteKwargResult{}, ErrRuntimeClosed
	}

	var result DeleteKwargResult
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		var mutationErr error
		result, mutationErr = document.DeleteKwarg(projectID, sectionID)
		if mutationErr != nil {
			return document, mutationErr
		}
		return document, nil
	})
	if err != nil {
		return Snapshot{}, DeleteKwargResult{}, err
	}
	return snapshot, result, nil
}

func (p *Project) DeleteKwarg(sectionID string) (DeleteKwargResult, error) {
	if p == nil {
		return DeleteKwargResult{}, ErrProjectNotFound
	}

	ctx, err := p.resolveDeleteKwargContext(sectionID)
	if err != nil {
		return DeleteKwargResult{}, err
	}

	removedCodeObjID, err := p.deleteLastKwargFromRoot(ctx.sectionID, ctx.rootCodeObjID)
	if err != nil {
		return DeleteKwargResult{}, err
	}
	removedSet := map[string]struct{}{removedCodeObjID: {}}
	if err := p.cleanupDeletedParamSectionState(ctx.sectionID, removedSet); err != nil {
		return DeleteKwargResult{}, err
	}
	if err := p.removeDeletedParamsFromSectionVariantMaps(ctx.sectionType, ctx.sectionID, ctx.rootCodeObjID, removedSet); err != nil {
		return DeleteKwargResult{}, err
	}
	if err := p.pruneUnusedCodeObjects(); err != nil {
		return DeleteKwargResult{}, err
	}

	return DeleteKwargResult{CodeObjID: removedCodeObjID}, nil
}

func (p *Project) resolveDeleteKwargContext(sectionID string) (deleteKwargContext, error) {
	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return deleteKwargContext{}, ErrSectionIDRequired
	}

	sectionType, sectionPayload, err := p.resolveDeleteKwargSectionContext(trimmedSectionID)
	if err != nil {
		return deleteKwargContext{}, err
	}
	rootCodeObjID, err := resolveDeleteKwargRootCodeObjID(trimmedSectionID, sectionType, sectionPayload)
	if err != nil {
		return deleteKwargContext{}, err
	}
	if err := validateDeleteKwargRootPresent(trimmedSectionID, rootCodeObjID, sectionPayload); err != nil {
		return deleteKwargContext{}, err
	}

	return deleteKwargContext{
		sectionID:     trimmedSectionID,
		sectionType:   sectionType,
		rootCodeObjID: rootCodeObjID,
	}, nil
}

func (p Project) resolveDeleteKwargSectionContext(sectionID string) (string, map[string]any, error) {
	sectionType, sectionPayload, err := p.resolveAddKwargSectionContext(sectionID)
	if err != nil {
		if errors.Is(err, ErrAddKwargUnsupported) {
			return "", nil, fmt.Errorf("%w: section=%q", ErrDeleteKwargUnsupported, sectionID)
		}
		return "", nil, err
	}
	return sectionType, sectionPayload, nil
}

func resolveDeleteKwargRootCodeObjID(sectionID string, sectionType string, sectionPayload map[string]any) (string, error) {
	if sectionType == "Callable" {
		rootCodeObjID := payloadStringField(sectionPayload, "callable")
		if rootCodeObjID == "" {
			return "", fmt.Errorf("%w: section=%q", ErrDeleteKwargCallableUnset, sectionID)
		}
		return rootCodeObjID, nil
	}
	if isKwargDictLikeSectionType(sectionType) {
		rootCodeObjID := payloadStringField(sectionPayload, "topLevelParamId")
		if rootCodeObjID == "" {
			return "", fmt.Errorf("%w: section=%q", ErrDeleteKwargNoParams, sectionID)
		}
		return rootCodeObjID, nil
	}
	return "", fmt.Errorf("%w: section=%q type=%q", ErrDeleteKwargUnsupported, sectionID, sectionType)
}

func validateDeleteKwargRootPresent(sectionID string, rootCodeObjID string, sectionPayload map[string]any) error {
	if _, ok := payloadStringMapField(sectionPayload, "codeObjVariantMap")[rootCodeObjID]; ok {
		return nil
	}
	return fmt.Errorf("%w: section=%q root=%q", ErrDeleteKwargRootMissing, sectionID, rootCodeObjID)
}

func (p *Project) deleteLastKwargFromRoot(sectionID string, rootCodeObjID string) (string, error) {
	rootPayload, _, _, rootImpl, err := p.ResolveSectionCodeObject(sectionID, rootCodeObjID)
	if err != nil {
		return "", err
	}
	if _, ok := rootPayload["children"]; !ok {
		return "", fmt.Errorf(
			"%w: codeObj=%q type=%q",
			ErrDeleteKwargParentUnsupported,
			rootCodeObjID,
			effectiveCodeObjType(rootPayload, rootImpl),
		)
	}

	currentChildren := payloadStringArrayField(rootPayload, "children")
	if len(currentChildren) == 0 {
		return "", fmt.Errorf("%w: section=%q", ErrDeleteKwargNoParams, sectionID)
	}
	removedCodeObjID := currentChildren[len(currentChildren)-1]
	nextChildren := append([]string(nil), currentChildren[:len(currentChildren)-1]...)
	if err := p.setCurrentCodeObjectField(sectionID, rootCodeObjID, "children", nextChildren); err != nil {
		return "", err
	}
	return removedCodeObjID, nil
}
