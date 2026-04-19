package projectstate

import "context"

// AppDefinitionRuntime is the host-facing seam for the app subsystem's
// compatibility payload. Core may store the payload, but plugin-owned code is
// expected to own the semantics behind these operations.
type AppDefinitionRuntime interface {
	GetAppDefinition(ctx context.Context) (AppDefinitionReadResult, error)
	ValidateAppDefinition(ctx context.Context, input ValidateAppDefinitionInput) (AppDefinitionValidationResult, error)
	SetAppDefinition(ctx context.Context, input SetAppDefinitionInput) (Snapshot, AppDefinitionMutationResult, error)
	StreamAppDefinition(ctx context.Context, input StreamAppDefinitionInput) (Snapshot, AppDefinitionMutationResult, error)
	UpdateAppDefinition(ctx context.Context, patch any) (Snapshot, AppDefinitionMutationResult, error)
}
