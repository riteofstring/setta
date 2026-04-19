package settajsonrenderappgenbackend

import (
	"context"

	"setta/internal/projectstate"
)

type AppDefinitionService struct {
	runtime *projectstate.Runtime
}

var _ projectstate.AppDefinitionRuntime = (*AppDefinitionService)(nil)

func NewAppDefinitionService(runtime *projectstate.Runtime) projectstate.AppDefinitionRuntime {
	if runtime == nil {
		return nil
	}
	return &AppDefinitionService{runtime: runtime}
}

func (s *AppDefinitionService) GetAppDefinition(
	ctx context.Context,
) (projectstate.AppDefinitionReadResult, error) {
	return s.runtime.GetAppDefinition(ctx)
}

func (s *AppDefinitionService) ValidateAppDefinition(
	ctx context.Context,
	input projectstate.ValidateAppDefinitionInput,
) (projectstate.AppDefinitionValidationResult, error) {
	return s.runtime.ValidateAppDefinition(ctx, input)
}

func (s *AppDefinitionService) SetAppDefinition(
	ctx context.Context,
	input projectstate.SetAppDefinitionInput,
) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return s.runtime.SetAppDefinition(ctx, input)
}

func (s *AppDefinitionService) StreamAppDefinition(
	ctx context.Context,
	input projectstate.StreamAppDefinitionInput,
) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return s.runtime.StreamAppDefinition(ctx, input)
}

func (s *AppDefinitionService) UpdateAppDefinition(
	ctx context.Context,
	patch any,
) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	return s.runtime.UpdateAppDefinition(ctx, patch)
}
