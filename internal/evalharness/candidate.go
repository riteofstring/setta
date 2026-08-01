package evalharness

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"reflect"
	"strings"

	"setta/internal/conversation"
	"setta/internal/jsonio"
)

const (
	CandidateConfigurationSchemaVersion = 1
	CandidateMaximumFileBytes           = 32 * 1024
)

type CandidateRoleSettings struct {
	Role            conversation.Role            `json:"role"`
	ModelID         string                       `json:"modelId"`
	ReasoningEffort conversation.ReasoningEffort `json:"reasoningEffort"`
	ServiceTier     *string                      `json:"serviceTier"`
}

type CandidateConfiguration struct {
	SchemaVersion int                     `json:"schemaVersion"`
	ID            string                  `json:"id"`
	Roles         []CandidateRoleSettings `json:"roles"`
}

type loadedCandidateConfiguration struct {
	configuration CandidateConfiguration
	sha256        string
}

func loadCandidateConfiguration(path string) (loadedCandidateConfiguration, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return loadedCandidateConfiguration{}, fmt.Errorf("inspect eval candidate configuration %s: %w", path, err)
	}
	if !info.Mode().IsRegular() {
		return loadedCandidateConfiguration{}, fmt.Errorf("eval candidate configuration %s must be a regular file", path)
	}
	if info.Size() > CandidateMaximumFileBytes {
		return loadedCandidateConfiguration{}, fmt.Errorf(
			"eval candidate configuration %s is %d bytes, maximum is %d",
			path,
			info.Size(),
			CandidateMaximumFileBytes,
		)
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		return loadedCandidateConfiguration{}, fmt.Errorf("read eval candidate configuration %s: %w", path, err)
	}
	var candidate CandidateConfiguration
	if err := jsonio.DecodeSingle(bytes.NewReader(payload), &candidate); err != nil {
		return loadedCandidateConfiguration{}, fmt.Errorf("decode eval candidate configuration %s: %w", path, err)
	}
	if err := candidate.Validate(); err != nil {
		return loadedCandidateConfiguration{}, fmt.Errorf("validate eval candidate configuration %s: %w", path, err)
	}
	digest := sha256.Sum256(payload)
	return loadedCandidateConfiguration{
		configuration: cloneCandidateConfiguration(candidate),
		sha256:        hex.EncodeToString(digest[:]),
	}, nil
}

func (candidate CandidateConfiguration) Validate() error {
	if candidate.SchemaVersion != CandidateConfigurationSchemaVersion {
		return fmt.Errorf(
			"candidate schemaVersion is %d, want %d",
			candidate.SchemaVersion,
			CandidateConfigurationSchemaVersion,
		)
	}
	if err := validateScenarioIdentifier("candidate id", candidate.ID); err != nil {
		return err
	}
	if candidate.Roles == nil {
		return errors.New("candidate roles must be an array, not null")
	}
	if len(candidate.Roles) == 0 || len(candidate.Roles) > len(evaluatedRoleOrder) {
		return fmt.Errorf("candidate roles must contain between 1 and %d entries", len(evaluatedRoleOrder))
	}
	seen := map[conversation.Role]bool{}
	for index, role := range candidate.Roles {
		if err := role.Validate(); err != nil {
			return fmt.Errorf("candidate role[%d]: %w", index, err)
		}
		if seen[role.Role] {
			return fmt.Errorf("candidate repeats role %s", role.Role)
		}
		seen[role.Role] = true
	}
	return nil
}

func (settings CandidateRoleSettings) Validate() error {
	if !evaluatedCandidateRole(settings.Role) {
		return fmt.Errorf("candidate has unsupported role %q", settings.Role)
	}
	if err := validateCandidateSetting("candidate model id", settings.ModelID); err != nil {
		return err
	}
	if err := validateCandidateSetting("candidate reasoning effort", settings.ReasoningEffort); err != nil {
		return err
	}
	if settings.ServiceTier != nil {
		if err := validateCandidateSetting("candidate service tier", *settings.ServiceTier); err != nil {
			return err
		}
	}
	return nil
}

func validateCandidateSetting(label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must not have surrounding whitespace", label)
	}
	if len(value) > 256 {
		return fmt.Errorf("%s is %d bytes, maximum is 256", label, len(value))
	}
	return nil
}

func evaluatedCandidateRole(role conversation.Role) bool {
	for _, candidate := range evaluatedRoleOrder {
		if role == candidate {
			return true
		}
	}
	return false
}

func validateCandidateAgainstCatalog(
	candidate CandidateConfiguration,
	catalog conversation.RoleModelCatalog,
) error {
	if err := candidate.Validate(); err != nil {
		return err
	}
	if err := catalog.Validate(); err != nil {
		return fmt.Errorf("validate live role model catalog: %w", err)
	}
	for _, settings := range candidate.Roles {
		model := candidateCatalogModel(catalog, settings.ModelID)
		if model == nil {
			return fmt.Errorf(
				"candidate %s role %s requested unavailable model %s",
				candidate.ID,
				settings.Role,
				settings.ModelID,
			)
		}
		if !candidateSupportsReasoningEffort(*model, settings.ReasoningEffort) {
			return fmt.Errorf(
				"candidate %s role %s model %s does not support reasoning effort %s",
				candidate.ID,
				settings.Role,
				settings.ModelID,
				settings.ReasoningEffort,
			)
		}
		if settings.ServiceTier != nil && !candidateSupportsServiceTier(*model, *settings.ServiceTier) {
			return fmt.Errorf(
				"candidate %s role %s model %s does not support service tier %s",
				candidate.ID,
				settings.Role,
				settings.ModelID,
				*settings.ServiceTier,
			)
		}
	}
	return nil
}

func candidateCatalogModel(
	catalog conversation.RoleModelCatalog,
	modelID string,
) *conversation.RoleModelOption {
	for index := range catalog.Models {
		if catalog.Models[index].ModelID == modelID {
			return &catalog.Models[index]
		}
	}
	return nil
}

func candidateSupportsReasoningEffort(
	model conversation.RoleModelOption,
	effort conversation.ReasoningEffort,
) bool {
	for _, supported := range model.SupportedReasoningEfforts {
		if supported == effort {
			return true
		}
	}
	return false
}

func candidateSupportsServiceTier(model conversation.RoleModelOption, tier string) bool {
	for _, supported := range model.ServiceTiers {
		if supported == tier {
			return true
		}
	}
	return false
}

func candidateRoleProfileUpdates(
	global conversation.RoleConfiguration,
	workspace conversation.RoleConfiguration,
	candidate CandidateConfiguration,
) ([]conversation.RoleProfileUpdate, []conversation.RoleProfileUpdate, error) {
	if err := global.Validate(); err != nil {
		return nil, nil, fmt.Errorf("validate baseline global role configuration: %w", err)
	}
	if err := workspace.Validate(); err != nil {
		return nil, nil, fmt.Errorf("validate baseline workspace role configuration: %w", err)
	}
	if !reflect.DeepEqual(global.ModelCatalog, workspace.ModelCatalog) {
		return nil, nil, errors.New("global and workspace role configurations returned different live model catalogs")
	}
	if err := validateCandidateAgainstCatalog(candidate, global.ModelCatalog); err != nil {
		return nil, nil, err
	}
	globalProfiles := roleProfileConfigurationsByRole(global.Profiles)
	workspaceProfiles := roleProfileConfigurationsByRole(workspace.Profiles)
	globalUpdates := make([]conversation.RoleProfileUpdate, 0, 1)
	workspaceUpdates := make([]conversation.RoleProfileUpdate, 0, len(candidate.Roles))
	for _, settings := range candidate.Roles {
		profiles := workspaceProfiles
		if settings.Role == conversation.RoleDirector {
			profiles = globalProfiles
		}
		baseline, ok := profiles[settings.Role]
		if !ok {
			return nil, nil, fmt.Errorf("candidate role %s is absent from its production configuration scope", settings.Role)
		}
		profile := cloneRoleProfile(baseline.Effective)
		modelID := settings.ModelID
		profile.ModelSelection = conversation.ModelSelection{
			Mode:    conversation.ModelSelectionExact,
			ModelID: &modelID,
		}
		profile.ReasoningEffort = settings.ReasoningEffort
		profile.ServiceTier = cloneStringPointer(settings.ServiceTier)
		update := conversation.RoleProfileUpdate{Role: settings.Role, Profile: &profile}
		if settings.Role == conversation.RoleDirector {
			globalUpdates = append(globalUpdates, update)
		} else {
			workspaceUpdates = append(workspaceUpdates, update)
		}
	}
	return globalUpdates, workspaceUpdates, nil
}

func validateAppliedCandidate(
	candidate CandidateConfiguration,
	roles []EvaluatedRoleConfiguration,
) error {
	byRole := make(map[conversation.Role]EvaluatedRoleConfiguration, len(roles))
	for _, role := range roles {
		byRole[role.Role] = role
	}
	for _, settings := range candidate.Roles {
		actual, ok := byRole[settings.Role]
		if !ok {
			return fmt.Errorf("applied candidate omitted role %s", settings.Role)
		}
		if err := validateAppliedCandidateRole(settings, actual); err != nil {
			return err
		}
	}
	return nil
}

func validateAppliedCandidateRole(
	settings CandidateRoleSettings,
	actual EvaluatedRoleConfiguration,
) error {
	requested := actual.Requested
	if requested.ModelSelection.Mode != conversation.ModelSelectionExact ||
		requested.ModelSelection.ModelID == nil || *requested.ModelSelection.ModelID != settings.ModelID ||
		requested.ReasoningEffort != settings.ReasoningEffort ||
		!reflect.DeepEqual(requested.ServiceTier, settings.ServiceTier) {
		return fmt.Errorf("applied candidate role %s does not match its requested settings", settings.Role)
	}
	if actual.Resolved.ModelID != settings.ModelID ||
		actual.Resolved.ReasoningEffort != settings.ReasoningEffort ||
		(settings.ServiceTier != nil && !reflect.DeepEqual(actual.Resolved.ServiceTier, settings.ServiceTier)) {
		return fmt.Errorf("applied candidate role %s does not match its resolved settings", settings.Role)
	}
	return nil
}

func cloneCandidateConfiguration(candidate CandidateConfiguration) CandidateConfiguration {
	cloned := candidate
	cloned.Roles = append([]CandidateRoleSettings{}, candidate.Roles...)
	for index := range cloned.Roles {
		cloned.Roles[index].ServiceTier = cloneStringPointer(cloned.Roles[index].ServiceTier)
	}
	return cloned
}
