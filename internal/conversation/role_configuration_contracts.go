package conversation

import (
	"fmt"
)

const (
	RoleConfigurationSchemaVersion = 1
	MaxRoleProfileUpdates          = 4
)

type RoleModelOption struct {
	Provider                  Provider          `json:"provider"`
	ModelID                   string            `json:"modelId"`
	DisplayName               string            `json:"displayName"`
	Description               string            `json:"description"`
	DefaultReasoningEffort    ReasoningEffort   `json:"defaultReasoningEffort"`
	SupportedReasoningEfforts []ReasoningEffort `json:"supportedReasoningEfforts"`
	ServiceTiers              []string          `json:"serviceTiers"`
	DefaultServiceTier        *string           `json:"defaultServiceTier"`
	IsDefault                 bool              `json:"isDefault"`
}

type RoleModelCatalog struct {
	Provider       Provider          `json:"provider"`
	DefaultModelID string            `json:"defaultModelId"`
	Models         []RoleModelOption `json:"models"`
}

type ResolvedRoleProfileSelection struct {
	ModelID         string          `json:"modelId"`
	ReasoningEffort ReasoningEffort `json:"reasoningEffort"`
	ServiceTier     *string         `json:"serviceTier"`
}

type RoleProfileConfiguration struct {
	Role            Role                         `json:"role"`
	BuiltIn         RoleProfile                  `json:"builtIn"`
	Override        *RoleProfileOverride         `json:"override"`
	Effective       RoleProfile                  `json:"effective"`
	EffectiveSource RoleProfileSourceKind        `json:"effectiveSource"`
	Resolved        ResolvedRoleProfileSelection `json:"resolved"`
}

type RoleConfigurationScope struct {
	Kind           RoleProfileScopeKind `json:"kind"`
	WorkspaceID    *string              `json:"workspaceId"`
	ConversationID *string              `json:"conversationId"`
}

type RoleConfiguration struct {
	SchemaVersion int                        `json:"schemaVersion"`
	Scope         RoleConfigurationScope     `json:"scope"`
	Profiles      []RoleProfileConfiguration `json:"profiles"`
	ModelCatalog  RoleModelCatalog           `json:"modelCatalog"`
}

type RoleProfileUpdate struct {
	Role    Role         `json:"role"`
	Profile *RoleProfile `json:"profile"`
}

func (option RoleModelOption) Validate() error {
	if option.Provider != ProviderCodex {
		return fmt.Errorf("role model %s has unsupported provider %q", option.ModelID, option.Provider)
	}
	if err := validateIdentifier("role model id", option.ModelID); err != nil {
		return err
	}
	if err := validateTrimmedText("role model display name", option.DisplayName); err != nil {
		return err
	}
	if option.Description != "" {
		if err := validateTrimmedText("role model description", option.Description); err != nil {
			return err
		}
	}
	if err := option.validateReasoningEfforts(); err != nil {
		return err
	}
	return option.validateServiceTiers()
}

func (option RoleModelOption) validateReasoningEfforts() error {
	if len(option.SupportedReasoningEfforts) == 0 {
		return fmt.Errorf("role model %s must expose supported reasoning efforts", option.ModelID)
	}
	seenEfforts := map[ReasoningEffort]bool{}
	defaultEffortSupported := false
	for _, effort := range option.SupportedReasoningEfforts {
		if effort == "" {
			return fmt.Errorf("role model %s includes an empty reasoning effort", option.ModelID)
		}
		if seenEfforts[effort] {
			return fmt.Errorf("role model %s repeats reasoning effort %s", option.ModelID, effort)
		}
		seenEfforts[effort] = true
		defaultEffortSupported = defaultEffortSupported || effort == option.DefaultReasoningEffort
	}
	if !defaultEffortSupported {
		return fmt.Errorf(
			"role model %s default reasoning effort %s is unsupported",
			option.ModelID,
			option.DefaultReasoningEffort,
		)
	}
	return nil
}

func (option RoleModelOption) validateServiceTiers() error {
	if option.ServiceTiers == nil {
		return fmt.Errorf("role model %s serviceTiers must be an array, not null", option.ModelID)
	}
	seenTiers := map[string]bool{}
	defaultTierSupported := option.DefaultServiceTier == nil
	for _, tier := range option.ServiceTiers {
		if err := validateIdentifier("role model service tier", tier); err != nil {
			return err
		}
		if seenTiers[tier] {
			return fmt.Errorf("role model %s repeats service tier %s", option.ModelID, tier)
		}
		seenTiers[tier] = true
		defaultTierSupported = defaultTierSupported ||
			(option.DefaultServiceTier != nil && tier == *option.DefaultServiceTier)
	}
	if !defaultTierSupported {
		return fmt.Errorf(
			"role model %s default service tier %s is unsupported",
			option.ModelID,
			*option.DefaultServiceTier,
		)
	}
	return nil
}

func (catalog RoleModelCatalog) Validate() error {
	if catalog.Provider != ProviderCodex {
		return fmt.Errorf("role model catalog has unsupported provider %q", catalog.Provider)
	}
	if catalog.Models == nil {
		return fmt.Errorf("role model catalog models must be an array, not null")
	}
	if len(catalog.Models) == 0 {
		return fmt.Errorf("role model catalog is empty")
	}
	seen := map[string]bool{}
	defaultCount := 0
	for _, model := range catalog.Models {
		if err := model.Validate(); err != nil {
			return err
		}
		if seen[model.ModelID] {
			return fmt.Errorf("role model catalog repeats model %s", model.ModelID)
		}
		seen[model.ModelID] = true
		if model.IsDefault {
			defaultCount++
			if catalog.DefaultModelID != model.ModelID {
				return fmt.Errorf(
					"role model catalog default id %s does not match marked default %s",
					catalog.DefaultModelID,
					model.ModelID,
				)
			}
		}
	}
	if defaultCount != 1 {
		return fmt.Errorf("role model catalog must contain exactly one default model, got %d", defaultCount)
	}
	return nil
}

func (selection ResolvedRoleProfileSelection) Validate(catalog RoleModelCatalog) error {
	model := catalog.model(selection.ModelID)
	if model == nil {
		return fmt.Errorf("resolved role model %s is absent from the catalog", selection.ModelID)
	}
	if !containsReasoningEffort(model.SupportedReasoningEfforts, selection.ReasoningEffort) {
		return fmt.Errorf(
			"resolved role model %s does not support reasoning effort %s",
			selection.ModelID,
			selection.ReasoningEffort,
		)
	}
	if selection.ServiceTier != nil && !containsStringValue(model.ServiceTiers, *selection.ServiceTier) {
		return fmt.Errorf(
			"resolved role model %s does not support service tier %s",
			selection.ModelID,
			*selection.ServiceTier,
		)
	}
	return nil
}

func (scope RoleConfigurationScope) Validate() error {
	switch scope.Kind {
	case RoleProfileScopeGlobal:
		if scope.WorkspaceID != nil || scope.ConversationID != nil {
			return fmt.Errorf("global role configuration scope must not include workspace or conversation ids")
		}
	case RoleProfileScopeConversation:
		if err := validateOptionalIdentifier("role configuration workspace id", scope.WorkspaceID); err != nil {
			return err
		}
		if err := validateOptionalIdentifier("role configuration conversation id", scope.ConversationID); err != nil {
			return err
		}
		if scope.WorkspaceID == nil || scope.ConversationID == nil {
			return fmt.Errorf("conversation role configuration scope requires workspace and conversation ids")
		}
	default:
		return fmt.Errorf("unsupported role configuration scope %q", scope.Kind)
	}
	return nil
}

func (configuration RoleProfileConfiguration) Validate(
	scope RoleConfigurationScope,
	catalog RoleModelCatalog,
) error {
	if err := configuration.validateProfiles(); err != nil {
		return err
	}
	if err := configuration.validateOverride(scope); err != nil {
		return err
	}
	if !validRoleProfileSource(configuration.EffectiveSource) {
		return fmt.Errorf(
			"role %s has unsupported effective source %q",
			configuration.Role,
			configuration.EffectiveSource,
		)
	}
	return configuration.Resolved.Validate(catalog)
}

func (configuration RoleProfileConfiguration) validateProfiles() error {
	if configuration.Role != configuration.BuiltIn.Role ||
		configuration.Role != configuration.Effective.Role {
		return fmt.Errorf("role configuration %s profile roles do not match", configuration.Role)
	}
	if err := validateConfigurableRoleProfile(configuration.BuiltIn); err != nil {
		return fmt.Errorf("role %s built-in profile: %w", configuration.Role, err)
	}
	if err := validateConfigurableRoleProfile(configuration.Effective); err != nil {
		return fmt.Errorf("role %s effective profile: %w", configuration.Role, err)
	}
	return nil
}

func (configuration RoleProfileConfiguration) validateOverride(
	scope RoleConfigurationScope,
) error {
	if configuration.Override == nil {
		return nil
	}
	if err := configuration.Override.Validate(); err != nil {
		return fmt.Errorf("role %s override: %w", configuration.Role, err)
	}
	if configuration.Override.ScopeKind != scope.Kind ||
		configuration.Override.Profile.Role != configuration.Role {
		return fmt.Errorf("role %s override does not match requested scope", configuration.Role)
	}
	if scope.Kind == RoleProfileScopeConversation &&
		configuration.Override.ScopeID != *scope.ConversationID {
		return fmt.Errorf("role %s override does not match requested conversation", configuration.Role)
	}
	return nil
}

func (configuration RoleConfiguration) Validate() error {
	if configuration.SchemaVersion != RoleConfigurationSchemaVersion {
		return fmt.Errorf(
			"role configuration schema version must be %d",
			RoleConfigurationSchemaVersion,
		)
	}
	if err := configuration.Scope.Validate(); err != nil {
		return err
	}
	if err := configuration.ModelCatalog.Validate(); err != nil {
		return err
	}
	if configuration.Profiles == nil {
		return fmt.Errorf("role configuration profiles must be an array, not null")
	}
	wantRoles := configurableRoles(configuration.Scope.Kind)
	if len(configuration.Profiles) != len(wantRoles) {
		return fmt.Errorf(
			"role configuration contains %d profiles, want %d",
			len(configuration.Profiles),
			len(wantRoles),
		)
	}
	for index, profile := range configuration.Profiles {
		if profile.Role != wantRoles[index] {
			return fmt.Errorf(
				"role configuration profile %d is %s, want %s",
				index,
				profile.Role,
				wantRoles[index],
			)
		}
		if err := profile.Validate(configuration.Scope, configuration.ModelCatalog); err != nil {
			return err
		}
	}
	return nil
}

func (update RoleProfileUpdate) Validate(scope RoleProfileScopeKind) error {
	if !containsRole(configurableRoles(scope), update.Role) {
		return fmt.Errorf("role %s cannot be configured at %s scope", update.Role, scope)
	}
	if update.Profile == nil {
		return nil
	}
	if update.Profile.Role != update.Role {
		return fmt.Errorf(
			"role profile update role %s does not match profile role %s",
			update.Role,
			update.Profile.Role,
		)
	}
	return validateConfigurableRoleProfile(*update.Profile)
}

func (catalog RoleModelCatalog) model(modelID string) *RoleModelOption {
	for index := range catalog.Models {
		if catalog.Models[index].ModelID == modelID {
			return &catalog.Models[index]
		}
	}
	return nil
}

func configurableRoles(scope RoleProfileScopeKind) []Role {
	if scope == RoleProfileScopeConversation {
		return []Role{RoleAgent, RoleNarrator, RoleSideAgent}
	}
	return []Role{RoleAgent, RoleNarrator, RoleMaster, RoleSideAgent}
}

func containsRole(roles []Role, target Role) bool {
	for _, role := range roles {
		if role == target {
			return true
		}
	}
	return false
}

func containsReasoningEffort(values []ReasoningEffort, target ReasoningEffort) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func containsStringValue(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func validRoleProfileSource(source RoleProfileSourceKind) bool {
	switch source {
	case RoleProfileSourceBuiltIn,
		RoleProfileSourceGlobal,
		RoleProfileSourceWorkspace,
		RoleProfileSourceConversation:
		return true
	default:
		return false
	}
}
