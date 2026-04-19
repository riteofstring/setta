package projectstate

import (
	"context"
	"path/filepath"
	"strings"

	"setta/internal/appspec"
)

type AppDefinitionReadResult struct {
	AppSpec       any            `json:"appSpec"`
	AppDefinition *AppDefinition `json:"appDefinition,omitempty"`
}

type ValidateAppDefinitionInput struct {
	AppSpec        any
	AppSpecVersion *string
	CatalogID      *string
	Routes         *[]AppRoute
	DataBindings   *map[string]any
	Actions        *map[string]any
	Theme          *map[string]any
	Assets         *[]any
}

type AppDefinitionValidationResult struct {
	Errors       []appspec.AppValidationIssue `json:"errors"`
	Warnings     []appspec.AppValidationIssue `json:"warnings"`
	Capabilities appspec.AppCapabilities      `json:"capabilities"`
}

func (d *Document) ValidateAppDefinition(input ValidateAppDefinitionInput) (AppDefinitionValidationResult, error) {
	if d == nil {
		return AppDefinitionValidationResult{}, ErrProjectNotFound
	}

	updated, err := applyValidateAppDefinitionInput(effectiveAppDefinition(*d), input)
	if err != nil {
		return AppDefinitionValidationResult{}, err
	}

	validationDefinition, err := appspecDefinition(updated)
	if err != nil {
		return AppDefinitionValidationResult{}, err
	}
	errors, warnings := appspec.ValidateDefinitionPayload(input.AppSpec, validationDefinition)
	if errors == nil {
		errors = []appspec.AppValidationIssue{}
	}
	if warnings == nil {
		warnings = []appspec.AppValidationIssue{}
	}

	return AppDefinitionValidationResult{
		Errors:       errors,
		Warnings:     warnings,
		Capabilities: appspec.BuildCapabilities(validationDefinition),
	}, nil
}

func (r *Runtime) GetAppDefinition(ctx context.Context) (AppDefinitionReadResult, error) {
	if r == nil {
		return AppDefinitionReadResult{}, ErrRuntimeClosed
	}

	var result AppDefinitionReadResult
	_, err := r.submit(operation{
		frontendOpID: frontendOpIDFromContext(ctx),
		run: func(state *runtimeState) (Snapshot, error) {
			result = AppDefinitionReadResult{
				AppDefinition: cloneAppDefinitionPointer(state.current.AppDefinition),
			}
			if result.AppDefinition == nil || strings.TrimSpace(result.AppDefinition.AppSpecPath) == "" {
				return snapshotFromState(*state), nil
			}
			if r.store == nil {
				return snapshotFromState(*state), ErrAppSpecStoreUnsupported
			}

			projectRoot := filepath.Dir(r.store.Path())
			appSpec, err := appspec.Read(projectRoot, result.AppDefinition.AppSpecPath)
			if err != nil {
				return snapshotFromState(*state), err
			}
			result.AppSpec = cloneJSONValue(appSpec)
			return snapshotFromState(*state), nil
		},
	})
	if err != nil {
		return AppDefinitionReadResult{}, err
	}
	return result, nil
}

func (r *Runtime) ValidateAppDefinition(ctx context.Context, input ValidateAppDefinitionInput) (AppDefinitionValidationResult, error) {
	if r == nil {
		return AppDefinitionValidationResult{}, ErrRuntimeClosed
	}

	var result AppDefinitionValidationResult
	_, err := r.submit(operation{
		frontendOpID: frontendOpIDFromContext(ctx),
		run: func(state *runtimeState) (Snapshot, error) {
			validationResult, err := state.current.ValidateAppDefinition(input)
			if err != nil {
				return snapshotFromState(*state), err
			}
			result = validationResult
			return snapshotFromState(*state), nil
		},
	})
	if err != nil {
		return AppDefinitionValidationResult{}, err
	}
	return result, nil
}

func applyValidateAppDefinitionInput(current AppDefinition, input ValidateAppDefinitionInput) (AppDefinition, error) {
	updated := current.Clone()
	applyOptionalAppDefinitionMetadata(&updated, appDefinitionOptionalMetadata{
		AppSpecVersion: input.AppSpecVersion,
		CatalogID:      input.CatalogID,
		Routes:         input.Routes,
	})
	if err := applyOptionalAppDefinitionJSONField(&updated.DataBindings, input.DataBindings, "appDefinition.dataBindings"); err != nil {
		return AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Actions, input.Actions, "appDefinition.actions"); err != nil {
		return AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Theme, input.Theme, "appDefinition.theme"); err != nil {
		return AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Assets, input.Assets, "appDefinition.assets"); err != nil {
		return AppDefinition{}, err
	}

	return updated.Normalized()
}
