package projectstate

import "errors"

var (
	ErrAppSpecStoreUnsupported = errors.New("app spec persistence requires a persisted project store")
	ErrAppSpecPathUnconfigured = errors.New("app spec path is not configured for this project")
	ErrAppSpecNotFound         = errors.New("app spec not found for this project")
)

type SetAppDefinitionInput struct {
	AppSpec        any
	AppSpecPath    *string
	AppSpecVersion *string
	CatalogID      *string
	Routes         *[]AppRoute
	DataBindings   *map[string]any
	Actions        *map[string]any
	Theme          *map[string]any
	Assets         *[]any
}

// setta-go-type-discovery: skip
type AppDefinitionMutationResult struct {
	AppSpec       any            `json:"appSpec"`
	AppDefinition *AppDefinition `json:"appDefinition,omitempty"`
}
