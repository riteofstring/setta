package projectstate

import (
	"context"
	"errors"
	"strings"

	"setta/internal/appspec"
)

var ErrAppSpecPatchInvalid = errors.New("app spec patch stream is invalid")

type StreamAppDefinitionInput struct {
	Patches     string
	AppSpecPath *string
	BaseAppSpec *map[string]any
}

type appSpecPatchInvalidError struct {
	cause error
}

func (e *appSpecPatchInvalidError) Error() string {
	if e == nil || e.cause == nil {
		return ErrAppSpecPatchInvalid.Error()
	}
	return e.cause.Error()
}

func (e *appSpecPatchInvalidError) Unwrap() error {
	return ErrAppSpecPatchInvalid
}

func newAppSpecPatchInvalidError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, ErrAppSpecPatchInvalid) {
		return err
	}
	return &appSpecPatchInvalidError{cause: err}
}

func (r *Runtime) StreamAppDefinition(ctx context.Context, input StreamAppDefinitionInput) (Snapshot, AppDefinitionMutationResult, error) {
	if r == nil {
		return Snapshot{}, AppDefinitionMutationResult{}, ErrRuntimeClosed
	}
	if strings.TrimSpace(input.Patches) == "" {
		return Snapshot{}, AppDefinitionMutationResult{}, newAppSpecPatchInvalidError(errors.New("patches must be non-empty."))
	}

	projectRoot, err := r.projectRoot()
	if err != nil {
		return Snapshot{}, AppDefinitionMutationResult{}, err
	}

	ops, err := appspec.ParsePatchLines(input.Patches)
	if err != nil {
		return Snapshot{}, AppDefinitionMutationResult{}, newAppSpecPatchInvalidError(err)
	}

	return mutateAppDefinitionAndSave(
		r,
		ctx,
		projectRoot,
		func(document Document) (Document, AppDefinitionMutationResult, string, error) {
			initialSpec, err := resolveStreamAppDefinitionBaseSpec(projectRoot, effectiveAppDefinition(document), input.BaseAppSpec)
			if err != nil {
				return Document{}, AppDefinitionMutationResult{}, "", err
			}

			appSpec, err := appspec.ApplyPatchOps(ops, initialSpec)
			if err != nil {
				return Document{}, AppDefinitionMutationResult{}, "", newAppSpecPatchInvalidError(err)
			}

			targetPath := appspec.DefaultPath()
			current := effectiveAppDefinition(document)
			if trimmed := strings.TrimSpace(current.AppSpecPath); trimmed != "" {
				targetPath = current.AppSpecPath
			}
			if input.AppSpecPath != nil && strings.TrimSpace(*input.AppSpecPath) != "" {
				targetPath = *input.AppSpecPath
			}

			normalizedPath, err := appspec.NormalizePath(projectRoot, targetPath)
			if err != nil {
				return Document{}, AppDefinitionMutationResult{}, "", err
			}

			result, err := document.SetAppDefinition(SetAppDefinitionInput{
				AppSpec:     appSpec,
				AppSpecPath: input.AppSpecPath,
			}, normalizedPath)
			if err != nil {
				return Document{}, AppDefinitionMutationResult{}, "", err
			}
			return document, result, normalizedPath, nil
		},
	)
}

func resolveStreamAppDefinitionBaseSpec(projectRoot string, current AppDefinition, baseAppSpec *map[string]any) (map[string]any, error) {
	if baseAppSpec != nil {
		cloned, ok := cloneJSONValue(*baseAppSpec).(map[string]any)
		if !ok {
			return nil, errors.New("baseAppSpec must be an object")
		}
		return cloned, nil
	}
	if strings.TrimSpace(current.AppSpecPath) == "" {
		return nil, nil
	}

	stored, err := appspec.Read(projectRoot, current.AppSpecPath)
	if err != nil {
		return nil, err
	}
	if stored == nil {
		return nil, nil
	}
	storedObject, ok := stored.(map[string]any)
	if !ok {
		return nil, nil
	}
	cloned, ok := cloneJSONValue(storedObject).(map[string]any)
	if !ok {
		return nil, nil
	}
	return cloned, nil
}
