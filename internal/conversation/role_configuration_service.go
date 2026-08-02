package conversation

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"time"

	"setta/internal/agent"
)

const roleConfigurationAuditStreamID = "role_configuration"

type RoleModelCatalogSource interface {
	ListModels(context.Context, *string, int, bool) (agent.ModelPage, error)
}

type RoleConfigurationService struct {
	store   *Store
	catalog RoleModelCatalogSource
	newID   func(string) (string, error)
	now     func() time.Time
}

type roleProfileChange struct {
	current   RoleProfileConfiguration
	update    RoleProfileUpdate
	updatedAt string
}

type roleConfigurationAuditPayload struct {
	ScopeKind RoleProfileScopeKind      `json:"scopeKind"`
	ScopeID   string                    `json:"scopeId"`
	Changes   []roleConfigurationChange `json:"changes"`
}

type roleConfigurationChange struct {
	Role    Role         `json:"role"`
	Removed bool         `json:"removed"`
	Profile *RoleProfile `json:"profile"`
}

func NewRoleConfigurationService(
	store *Store,
	catalog RoleModelCatalogSource,
) (*RoleConfigurationService, error) {
	if store == nil || catalog == nil {
		return nil, errors.New("role configuration service requires store and model catalog")
	}
	return &RoleConfigurationService{
		store:   store,
		catalog: catalog,
		newID:   randomServiceID,
		now:     time.Now,
	}, nil
}

func (service *RoleConfigurationService) ReadModelCatalog(
	ctx context.Context,
) (RoleModelCatalog, error) {
	if err := service.validateRequest(ctx); err != nil {
		return RoleModelCatalog{}, err
	}
	return service.readModelCatalog(ctx)
}

func (service *RoleConfigurationService) ReadGlobalConfiguration(
	ctx context.Context,
) (RoleConfiguration, error) {
	if err := service.validateRequest(ctx); err != nil {
		return RoleConfiguration{}, err
	}
	catalog, err := service.readModelCatalog(ctx)
	if err != nil {
		return RoleConfiguration{}, err
	}
	return service.readConfigurationWithCatalog(
		ctx,
		RoleConfigurationScope{Kind: RoleProfileScopeGlobal},
		catalog,
	)
}

func (service *RoleConfigurationService) ReadWorkspaceConfiguration(
	ctx context.Context,
	workspaceID string,
) (RoleConfiguration, error) {
	if err := service.validateRequest(ctx); err != nil {
		return RoleConfiguration{}, err
	}
	scope := workspaceRoleConfigurationScope(workspaceID)
	if err := scope.Validate(); err != nil {
		return RoleConfiguration{}, err
	}
	catalog, err := service.readModelCatalog(ctx)
	if err != nil {
		return RoleConfiguration{}, err
	}
	return service.readConfigurationWithCatalog(ctx, scope, catalog)
}

func (service *RoleConfigurationService) ReadConversationConfiguration(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (RoleConfiguration, error) {
	if err := service.validateRequest(ctx); err != nil {
		return RoleConfiguration{}, err
	}
	scope := conversationRoleConfigurationScope(workspaceID, conversationID)
	if err := scope.Validate(); err != nil {
		return RoleConfiguration{}, err
	}
	catalog, err := service.readModelCatalog(ctx)
	if err != nil {
		return RoleConfiguration{}, err
	}
	return service.readConfigurationWithCatalog(ctx, scope, catalog)
}

func (service *RoleConfigurationService) UpdateGlobalConfiguration(
	ctx context.Context,
	updates []RoleProfileUpdate,
) (RoleConfiguration, error) {
	return service.updateConfiguration(
		ctx,
		RoleConfigurationScope{Kind: RoleProfileScopeGlobal},
		updates,
	)
}

func (service *RoleConfigurationService) UpdateWorkspaceConfiguration(
	ctx context.Context,
	workspaceID string,
	updates []RoleProfileUpdate,
) (RoleConfiguration, error) {
	return service.updateConfiguration(
		ctx,
		workspaceRoleConfigurationScope(workspaceID),
		updates,
	)
}

func (service *RoleConfigurationService) UpdateConversationConfiguration(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	updates []RoleProfileUpdate,
) (RoleConfiguration, error) {
	return service.updateConfiguration(
		ctx,
		conversationRoleConfigurationScope(workspaceID, conversationID),
		updates,
	)
}

func (service *RoleConfigurationService) updateConfiguration(
	ctx context.Context,
	scope RoleConfigurationScope,
	updates []RoleProfileUpdate,
) (RoleConfiguration, error) {
	if err := service.validateRequest(ctx); err != nil {
		return RoleConfiguration{}, err
	}
	if err := scope.Validate(); err != nil {
		return RoleConfiguration{}, err
	}
	if err := validateRoleProfileUpdates(scope.Kind, updates); err != nil {
		return RoleConfiguration{}, err
	}
	catalog, err := service.readModelCatalog(ctx)
	if err != nil {
		return RoleConfiguration{}, err
	}
	current, err := service.readConfigurationWithCatalog(ctx, scope, catalog)
	if err != nil {
		return RoleConfiguration{}, err
	}
	changes, err := validatedRoleProfileChanges(current, updates, catalog)
	if err != nil {
		return RoleConfiguration{}, err
	}
	if len(changes) == 0 {
		return current, nil
	}
	if err := service.commitRoleProfileChanges(ctx, scope, changes); err != nil {
		return RoleConfiguration{}, err
	}
	return service.readConfigurationWithCatalog(ctx, scope, catalog)
}

func (service *RoleConfigurationService) validateRequest(ctx context.Context) error {
	if service == nil || service.store == nil || service.catalog == nil ||
		service.newID == nil || service.now == nil {
		return errors.New("role configuration service is unavailable")
	}
	if ctx == nil {
		return errors.New("role configuration context is required")
	}
	return nil
}

func (service *RoleConfigurationService) readModelCatalog(
	ctx context.Context,
) (RoleModelCatalog, error) {
	models, err := service.readVisibleRoleModels(ctx)
	if err != nil {
		return RoleModelCatalog{}, err
	}
	catalog, err := newRoleModelCatalog(models)
	if err != nil {
		return RoleModelCatalog{}, fmt.Errorf("validate provider role model catalog: %w", err)
	}
	return catalog, nil
}

func (service *RoleConfigurationService) readVisibleRoleModels(
	ctx context.Context,
) ([]RoleModelOption, error) {
	models := make([]RoleModelOption, 0)
	var cursor *string
	seenCursors := map[string]bool{}
	for {
		page, err := service.catalog.ListModels(ctx, cursor, agent.MaxThreadPageSize, false)
		if err != nil {
			return nil, fmt.Errorf("read provider role model catalog: %w", err)
		}
		if page.Data == nil {
			return nil, errors.New("provider role model catalog page data must be an array")
		}
		options, err := visibleRoleModelOptions(page.Data)
		if err != nil {
			return nil, err
		}
		models = append(models, options...)
		next, done, err := nextRoleModelCatalogCursor(page.NextCursor, seenCursors)
		if err != nil {
			return nil, err
		}
		if done {
			return models, nil
		}
		cursor = next
	}
}

func visibleRoleModelOptions(models []agent.Model) ([]RoleModelOption, error) {
	options := make([]RoleModelOption, 0, len(models))
	for _, model := range models {
		if model.Hidden {
			return nil, fmt.Errorf(
				"provider returned hidden model %s when hidden models were excluded",
				model.ID,
			)
		}
		options = append(options, roleModelOption(model))
	}
	return options, nil
}

func nextRoleModelCatalogCursor(
	next *string,
	seen map[string]bool,
) (*string, bool, error) {
	if next == nil {
		return nil, true, nil
	}
	if err := validateIdentifier("provider role model catalog cursor", *next); err != nil {
		return nil, false, err
	}
	if seen[*next] {
		return nil, false, errors.New("provider role model catalog returned a repeated cursor")
	}
	seen[*next] = true
	return cloneStringPointer(next), false, nil
}

func newRoleModelCatalog(models []RoleModelOption) (RoleModelCatalog, error) {
	catalog := RoleModelCatalog{Provider: ProviderCodex, Models: models}
	for _, model := range models {
		if model.IsDefault {
			if catalog.DefaultModelID != "" {
				return RoleModelCatalog{}, errors.New("provider role model catalog contains multiple defaults")
			}
			catalog.DefaultModelID = model.ModelID
		}
	}
	if err := catalog.Validate(); err != nil {
		return RoleModelCatalog{}, err
	}
	return catalog, nil
}

func roleModelOption(model agent.Model) RoleModelOption {
	efforts := make([]ReasoningEffort, len(model.SupportedReasoningEfforts))
	for index, effort := range model.SupportedReasoningEfforts {
		efforts[index] = ReasoningEffort(effort)
	}
	return RoleModelOption{
		Provider:                  ProviderCodex,
		ModelID:                   model.ID,
		DisplayName:               model.DisplayName,
		Description:               model.Description,
		DefaultReasoningEffort:    ReasoningEffort(model.DefaultReasoningEffort),
		SupportedReasoningEfforts: efforts,
		ServiceTiers:              append([]string{}, model.ServiceTiers...),
		DefaultServiceTier:        cloneStringPointer(model.DefaultServiceTier),
		IsDefault:                 model.IsDefault,
	}
}

func (service *RoleConfigurationService) readConfigurationWithCatalog(
	ctx context.Context,
	scope RoleConfigurationScope,
	catalog RoleModelCatalog,
) (RoleConfiguration, error) {
	builtIns := builtInRoleProfiles(scope.Kind)
	resolutions, err := service.store.readRoleProfileResolutions(ctx, scope, builtIns)
	if err != nil {
		return RoleConfiguration{}, err
	}
	profiles := make([]RoleProfileConfiguration, 0, len(resolutions))
	for _, resolution := range resolutions {
		resolved, err := resolveRoleProfileSelection(resolution.Effective, catalog)
		if err != nil {
			return RoleConfiguration{}, fmt.Errorf(
				"configure %s role at %s scope: %w",
				resolution.Effective.Role,
				scope.Kind,
				err,
			)
		}
		profiles = append(profiles, RoleProfileConfiguration{
			Role:            resolution.Effective.Role,
			BuiltIn:         resolution.BuiltIn,
			Override:        resolution.TargetOverride,
			Effective:       resolution.Effective,
			EffectiveSource: resolution.EffectiveSource,
			Resolved:        resolved,
		})
	}
	configuration := RoleConfiguration{
		SchemaVersion: RoleConfigurationSchemaVersion,
		Scope:         scope,
		Profiles:      profiles,
		ModelCatalog:  catalog,
	}
	if err := configuration.Validate(); err != nil {
		return RoleConfiguration{}, fmt.Errorf("validate role configuration: %w", err)
	}
	return configuration, nil
}

func resolveRoleProfileSelection(
	profile RoleProfile,
	catalog RoleModelCatalog,
) (ResolvedRoleProfileSelection, error) {
	if err := validateConfigurableRoleProfile(profile); err != nil {
		return ResolvedRoleProfileSelection{}, err
	}
	if _, err := providerInvocation(profile); err != nil {
		return ResolvedRoleProfileSelection{}, err
	}
	var model *RoleModelOption
	switch profile.ModelSelection.Mode {
	case ModelSelectionExact:
		model = catalog.model(*profile.ModelSelection.ModelID)
		if model == nil {
			return ResolvedRoleProfileSelection{}, fmt.Errorf(
				"configured provider model %s is unavailable",
				*profile.ModelSelection.ModelID,
			)
		}
	case ModelSelectionProviderDefault:
		model = catalog.model(catalog.DefaultModelID)
	default:
		return ResolvedRoleProfileSelection{}, fmt.Errorf(
			"unsupported %s model selection %q",
			profile.Role,
			profile.ModelSelection.Mode,
		)
	}
	if !containsReasoningEffort(model.SupportedReasoningEfforts, profile.ReasoningEffort) {
		return ResolvedRoleProfileSelection{}, fmt.Errorf(
			"provider model %s does not support reasoning effort %s",
			model.ModelID,
			profile.ReasoningEffort,
		)
	}
	serviceTier := cloneStringPointer(profile.ServiceTier)
	if serviceTier == nil {
		serviceTier = cloneStringPointer(model.DefaultServiceTier)
	}
	if serviceTier != nil && !containsStringValue(model.ServiceTiers, *serviceTier) {
		return ResolvedRoleProfileSelection{}, fmt.Errorf(
			"provider model %s does not support service tier %s",
			model.ModelID,
			*serviceTier,
		)
	}
	return ResolvedRoleProfileSelection{
		ModelID:         model.ModelID,
		ReasoningEffort: profile.ReasoningEffort,
		ServiceTier:     serviceTier,
	}, nil
}

func builtInRoleProfiles(scope RoleProfileScopeKind) []RoleProfile {
	profiles := map[Role]RoleProfile{
		RoleAgent:     DefaultAgentRoleProfile(),
		RoleNarrator:  DefaultNarratorRoleProfile(),
		RoleDirector:  DefaultDirectorRoleProfile(),
		RoleSideAgent: DefaultSideAgentRoleProfile(),
	}
	roles := configurableRoles(scope)
	result := make([]RoleProfile, 0, len(roles))
	for _, role := range roles {
		result = append(result, profiles[role])
	}
	return result
}

func validateRoleProfileUpdates(scope RoleProfileScopeKind, updates []RoleProfileUpdate) error {
	if updates == nil {
		return errors.New("role profile updates must be an array, not null")
	}
	if len(updates) == 0 || len(updates) > MaxRoleProfileUpdates {
		return fmt.Errorf("role profile updates must contain between 1 and %d entries", MaxRoleProfileUpdates)
	}
	seen := map[Role]bool{}
	for _, update := range updates {
		if err := update.Validate(scope); err != nil {
			return err
		}
		if seen[update.Role] {
			return fmt.Errorf("role profile updates repeat role %s", update.Role)
		}
		seen[update.Role] = true
	}
	return nil
}

func validatedRoleProfileChanges(
	current RoleConfiguration,
	updates []RoleProfileUpdate,
	catalog RoleModelCatalog,
) ([]roleProfileChange, error) {
	byRole := make(map[Role]RoleProfileConfiguration, len(current.Profiles))
	for _, profile := range current.Profiles {
		byRole[profile.Role] = profile
	}
	changes := make([]roleProfileChange, 0, len(updates))
	for _, update := range updates {
		profile, ok := byRole[update.Role]
		if !ok {
			return nil, fmt.Errorf("role %s is absent from the current configuration", update.Role)
		}
		if update.Profile == nil {
			if profile.Override != nil {
				changes = append(changes, roleProfileChange{current: profile, update: update})
			}
			continue
		}
		if _, err := resolveRoleProfileSelection(*update.Profile, catalog); err != nil {
			return nil, fmt.Errorf("validate %s role profile update: %w", update.Role, err)
		}
		if profile.Override != nil && reflect.DeepEqual(profile.Override.Profile, *update.Profile) {
			continue
		}
		changes = append(changes, roleProfileChange{current: profile, update: update})
	}
	return changes, nil
}

func (service *RoleConfigurationService) commitRoleProfileChanges(
	ctx context.Context,
	scope RoleConfigurationScope,
	changes []roleProfileChange,
) error {
	scopeID, err := roleConfigurationScopeID(scope)
	if err != nil {
		return err
	}
	committedAt := service.now().UTC().Format(time.RFC3339Nano)
	_, err = service.store.Transact(ctx, "update role profile configuration", func(transaction *WriteTransaction) error {
		previousUpdatedAt := committedAt
		for index, change := range changes {
			updatedAt := committedAt
			if index > 0 {
				updatedAt = advanceTimestamp(previousUpdatedAt, updatedAt)
			}
			if change.current.Override != nil {
				updatedAt = advanceTimestamp(change.current.Override.UpdatedAt, updatedAt)
			}
			changes[index].updatedAt = updatedAt
			previousUpdatedAt = updatedAt
			if change.update.Profile == nil {
				removed, err := transaction.DeleteRoleProfileOverride(scope.Kind, scopeID, change.update.Role)
				if err != nil {
					return err
				}
				if !removed {
					return stateConflict("role profile override", string(change.update.Role), "override disappeared before removal")
				}
			} else {
				override := RoleProfileOverride{
					ScopeKind: scope.Kind,
					ScopeID:   scopeID,
					Profile:   *change.update.Profile,
					UpdatedAt: updatedAt,
				}
				if err := transaction.UpsertRoleProfileOverride(override); err != nil {
					return err
				}
			}
		}
		if scope.Kind == RoleProfileScopeConversation {
			return service.appendConversationRoleConfigurationEvents(
				transaction,
				scopeID,
				changes,
				committedAt,
			)
		}
		return service.appendRoleConfigurationAudit(
			transaction,
			scope,
			changes,
			committedAt,
		)
	})
	if err != nil {
		return fmt.Errorf("commit role profile configuration: %w", err)
	}
	return nil
}

func (service *RoleConfigurationService) appendConversationRoleConfigurationEvents(
	transaction *WriteTransaction,
	conversationID string,
	changes []roleProfileChange,
	committedAt string,
) error {
	streamID, err := ConversationStreamID(conversationID)
	if err != nil {
		return err
	}
	for _, change := range changes {
		var payload ConversationEventPayload
		if change.update.Profile == nil {
			payload = ConversationRoleProfileOverrideRemovedEventPayload{
				Type: ConversationEventTypeRoleProfileOverrideRemoved,
				Role: change.update.Role,
			}
		} else {
			payload = ConversationRoleProfileOverrideUpdatedEventPayload{
				Type: ConversationEventTypeRoleProfileOverrideUpdated,
				Override: RoleProfileOverride{
					ScopeKind: RoleProfileScopeConversation,
					ScopeID:   conversationID,
					Profile:   *change.update.Profile,
					UpdatedAt: change.updatedAt,
				},
			}
		}
		eventID, err := service.newID("role_configuration_event")
		if err != nil {
			return err
		}
		if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
			ID:          eventID,
			StreamID:    streamID,
			Kind:        string(payload.conversationEventType()),
			Payload:     payload,
			CommittedAt: committedAt,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (service *RoleConfigurationService) appendRoleConfigurationAudit(
	transaction *WriteTransaction,
	scope RoleConfigurationScope,
	changes []roleProfileChange,
	committedAt string,
) error {
	scopeID, err := roleConfigurationScopeID(scope)
	if err != nil {
		return err
	}
	payloadChanges := make([]roleConfigurationChange, 0, len(changes))
	for _, change := range changes {
		payloadChanges = append(payloadChanges, roleConfigurationChange{
			Role:    change.update.Role,
			Removed: change.update.Profile == nil,
			Profile: change.update.Profile,
		})
	}
	eventID, err := service.newID("role_configuration_audit")
	if err != nil {
		return err
	}
	_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:       eventID,
		StreamID: roleConfigurationAuditStreamID,
		Kind:     "role_profile_configuration.updated",
		Payload: roleConfigurationAuditPayload{
			ScopeKind: scope.Kind,
			ScopeID:   scopeID,
			Changes:   payloadChanges,
		},
		CommittedAt: committedAt,
	})
	return err
}

func workspaceRoleConfigurationScope(workspaceID string) RoleConfigurationScope {
	return RoleConfigurationScope{
		Kind:        RoleProfileScopeWorkspace,
		WorkspaceID: cloneStringPointer(&workspaceID),
	}
}

func conversationRoleConfigurationScope(
	workspaceID string,
	conversationID string,
) RoleConfigurationScope {
	return RoleConfigurationScope{
		Kind:           RoleProfileScopeConversation,
		WorkspaceID:    cloneStringPointer(&workspaceID),
		ConversationID: cloneStringPointer(&conversationID),
	}
}

func roleConfigurationScopeID(scope RoleConfigurationScope) (string, error) {
	switch scope.Kind {
	case RoleProfileScopeGlobal:
		return "", nil
	case RoleProfileScopeWorkspace:
		return *scope.WorkspaceID, nil
	case RoleProfileScopeConversation:
		return *scope.ConversationID, nil
	default:
		return "", fmt.Errorf("unsupported role configuration scope %q", scope.Kind)
	}
}
