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

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return DeleteKwargResult{}, ErrSectionIDRequired
	}

	sectionType, sectionPayload, err := p.resolveAddKwargSectionContext(trimmedSectionID)
	if err != nil {
		if errors.Is(err, ErrAddKwargUnsupported) {
			return DeleteKwargResult{}, fmt.Errorf("%w: section=%q", ErrDeleteKwargUnsupported, trimmedSectionID)
		}
		return DeleteKwargResult{}, err
	}

	var rootCodeObjID string
	switch sectionType {
	case "Callable":
		rootCodeObjID = payloadStringField(sectionPayload, "callable")
		if rootCodeObjID == "" {
			return DeleteKwargResult{}, fmt.Errorf("%w: section=%q", ErrDeleteKwargCallableUnset, trimmedSectionID)
		}
	case "Dict":
		rootCodeObjID = payloadStringField(sectionPayload, "topLevelParamId")
		if rootCodeObjID == "" {
			return DeleteKwargResult{}, fmt.Errorf("%w: section=%q", ErrDeleteKwargNoParams, trimmedSectionID)
		}
	default:
		return DeleteKwargResult{}, fmt.Errorf("%w: section=%q type=%q", ErrDeleteKwargUnsupported, trimmedSectionID, sectionType)
	}

	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	if _, ok := codeObjVariantMap[rootCodeObjID]; !ok {
		return DeleteKwargResult{}, fmt.Errorf(
			"%w: section=%q root=%q",
			ErrDeleteKwargRootMissing,
			trimmedSectionID,
			rootCodeObjID,
		)
	}

	removedCodeObjID, err := p.deleteLastKwargFromRoot(trimmedSectionID, rootCodeObjID)
	if err != nil {
		return DeleteKwargResult{}, err
	}
	removedSet := map[string]struct{}{removedCodeObjID: {}}
	if err := p.cleanupDeletedParamSectionState(trimmedSectionID, removedSet); err != nil {
		return DeleteKwargResult{}, err
	}
	if err := p.removeDeletedParamsFromSectionVariantMaps(sectionType, trimmedSectionID, rootCodeObjID, removedSet); err != nil {
		return DeleteKwargResult{}, err
	}
	if err := p.pruneUnusedCodeObjects(); err != nil {
		return DeleteKwargResult{}, err
	}

	return DeleteKwargResult{CodeObjID: removedCodeObjID}, nil
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
