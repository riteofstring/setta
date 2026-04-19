package projectstate

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

type AppDefinitionValidationIssue struct {
	Message     string `json:"message"`
	ElementKey  string `json:"elementKey,omitempty"`
	ElementType string `json:"elementType,omitempty"`
}

type AppDefinitionCapabilities struct {
	CatalogID          string          `json:"catalogId"`
	CatalogVersion     string          `json:"catalogVersion"`
	AppSpecVersion     string          `json:"appSpecVersion"`
	ThemeSchemaVersion string          `json:"themeSchemaVersion"`
	Features           map[string]bool `json:"features"`
}

type AppDefinitionValidationResult struct {
	Errors       []AppDefinitionValidationIssue `json:"errors"`
	Warnings     []AppDefinitionValidationIssue `json:"warnings"`
	Capabilities AppDefinitionCapabilities      `json:"capabilities"`
}
