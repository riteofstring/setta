package projectstate

import "context"

// AppDefinitionRuntime is the host-facing seam for app-definition operations.
// Core may store the opaque payload, but plugin-owned code owns the semantics
// behind these operations.
type AppDefinitionRuntime interface {
	GetAppDefinition(ctx context.Context) (AppDefinitionReadResult, error)
	GetEffectiveAppDefinition(ctx context.Context) (AppDefinition, error)
	GetEffectiveAppSpecPath(ctx context.Context) (string, error)
	GetEffectiveAppThemeMode(ctx context.Context) (string, error)
	ValidateAppDefinition(ctx context.Context, input ValidateAppDefinitionInput) (AppDefinitionValidationResult, error)
	SetAppDefinition(ctx context.Context, input SetAppDefinitionInput) (Snapshot, AppDefinitionMutationResult, error)
	StreamAppDefinition(ctx context.Context, input StreamAppDefinitionInput) (Snapshot, AppDefinitionMutationResult, error)
	UpdateAppDefinition(ctx context.Context, patch any) (Snapshot, AppDefinitionMutationResult, error)
	CompareAndSetAppDefinitionCatalogID(ctx context.Context, catalogID string, expectedOldValue *string) (Snapshot, CompareAndSetResult[string], error)
	CompareAndSetAppDefinitionSpecVersion(ctx context.Context, appSpecVersion string, expectedOldValue *string) (Snapshot, CompareAndSetResult[string], error)
	CompareAndSetAppDefinitionSpecPath(ctx context.Context, appSpecPath string, expectedOldValue *string) (Snapshot, CompareAndSetResult[string], error)
	CompareAndSetAppDefinitionThemeMode(ctx context.Context, themeMode string, expectedOldValue *string) (Snapshot, CompareAndSetResult[string], error)
}
