package evalharness

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/conversation"
)

func TestLoadCandidateConfigurationRequiresCurrentStrictContract(t *testing.T) {
	candidate := validTestCandidateConfiguration()
	payload, err := json.Marshal(candidate)
	if err != nil {
		t.Fatalf("marshal candidate: %v", err)
	}
	path := filepath.Join(t.TempDir(), "candidate.json")
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		t.Fatalf("write candidate: %v", err)
	}
	loaded, err := loadCandidateConfiguration(path)
	if err != nil {
		t.Fatalf("load candidate: %v", err)
	}
	if !reflect.DeepEqual(loaded.configuration, candidate) || len(loaded.sha256) != 64 {
		t.Fatalf("loaded candidate = %#v / %q", loaded.configuration, loaded.sha256)
	}

	unknownField := filepath.Join(t.TempDir(), "unknown.json")
	if err := os.WriteFile(
		unknownField,
		[]byte(`{"schemaVersion":1,"id":"candidate","roles":[],"legacy":true}`),
		0o600,
	); err != nil {
		t.Fatalf("write unknown-field candidate: %v", err)
	}
	if _, err := loadCandidateConfiguration(unknownField); err == nil ||
		!strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("unknown-field error = %v", err)
	}
}

func TestCandidateConfigurationRejectsRepeatedAndUnsupportedRoles(t *testing.T) {
	candidate := validTestCandidateConfiguration()
	candidate.Roles = append(candidate.Roles, candidate.Roles[0])
	if err := candidate.Validate(); err == nil || !strings.Contains(err.Error(), "repeats role") {
		t.Fatalf("repeated-role error = %v", err)
	}

	candidate = validTestCandidateConfiguration()
	candidate.Roles[0].Role = conversation.Role("judge")
	if err := candidate.Validate(); err == nil || !strings.Contains(err.Error(), "unsupported role") {
		t.Fatalf("unsupported-role error = %v", err)
	}
}

func TestCandidateValidationNamesUnavailableModelSettings(t *testing.T) {
	global, _ := validTestRoleConfigurations()
	for _, test := range []struct {
		name       string
		mutate     func(*CandidateConfiguration)
		diagnostic string
	}{
		{
			name: "model",
			mutate: func(candidate *CandidateConfiguration) {
				candidate.Roles[0].ModelID = "gpt-unavailable"
			},
			diagnostic: "unavailable model gpt-unavailable",
		},
		{
			name: "reasoning effort",
			mutate: func(candidate *CandidateConfiguration) {
				candidate.Roles[0].ReasoningEffort = conversation.ReasoningEffortUltra
			},
			diagnostic: "does not support reasoning effort ultra",
		},
		{
			name: "service tier",
			mutate: func(candidate *CandidateConfiguration) {
				tier := "priority"
				candidate.Roles[0].ServiceTier = &tier
			},
			diagnostic: "does not support service tier priority",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			candidate := validTestCandidateConfiguration()
			test.mutate(&candidate)
			err := validateCandidateAgainstCatalog(candidate, global.ModelCatalog)
			if err == nil || !strings.Contains(err.Error(), test.diagnostic) {
				t.Fatalf("candidate validation error = %v", err)
			}
		})
	}
}

func TestCandidateUpdatesOnlyProductionModelSelectionFields(t *testing.T) {
	global, workspace := validTestRoleConfigurations()
	candidate := validTestCandidateConfiguration()
	globalUpdates, workspaceUpdates, err := candidateRoleProfileUpdates(global, workspace, candidate)
	if err != nil {
		t.Fatalf("build candidate updates: %v", err)
	}
	if len(globalUpdates) != 1 || len(workspaceUpdates) != 0 || globalUpdates[0].Profile == nil {
		t.Fatalf("candidate updates = %#v / %#v", globalUpdates, workspaceUpdates)
	}
	baseline := roleProfileConfigurationsByRole(global.Profiles)[conversation.RoleDirector].Effective
	updated := *globalUpdates[0].Profile
	if !reflect.DeepEqual(updated.PermissionProfile, baseline.PermissionProfile) ||
		!reflect.DeepEqual(updated.ContextBudget, baseline.ContextBudget) ||
		updated.Provider != baseline.Provider || updated.Role != baseline.Role {
		t.Fatalf("candidate changed non-model fields: %#v", updated)
	}
	settings := candidate.Roles[0]
	if updated.ModelSelection.Mode != conversation.ModelSelectionExact ||
		updated.ModelSelection.ModelID == nil || *updated.ModelSelection.ModelID != settings.ModelID ||
		updated.ReasoningEffort != settings.ReasoningEffort || updated.ServiceTier != nil {
		t.Fatalf("candidate model fields = %#v", updated)
	}
}

func TestValidateAppliedCandidateAcceptsResolvedProviderDefaultTier(t *testing.T) {
	candidate := validTestCandidateConfiguration()
	roles := validTestEvaluatedRoles()
	settings := candidate.Roles[0]
	for index := range roles {
		if roles[index].Role != settings.Role {
			continue
		}
		modelID := settings.ModelID
		roles[index].Requested.ModelSelection = conversation.ModelSelection{
			Mode:    conversation.ModelSelectionExact,
			ModelID: &modelID,
		}
		roles[index].Requested.ReasoningEffort = settings.ReasoningEffort
		roles[index].Requested.ServiceTier = nil
		roles[index].Resolved.ModelID = settings.ModelID
		roles[index].Resolved.ReasoningEffort = settings.ReasoningEffort
		defaultTier := "default"
		roles[index].Resolved.ServiceTier = &defaultTier
	}
	if err := validateAppliedCandidate(candidate, roles); err != nil {
		t.Fatalf("validate applied candidate: %v", err)
	}
}

func validTestCandidateConfiguration() CandidateConfiguration {
	agentProfile := conversation.DefaultAgentRoleProfile()
	return CandidateConfiguration{
		SchemaVersion: CandidateConfigurationSchemaVersion,
		ID:            "director-alternative",
		Roles: []CandidateRoleSettings{{
			Role:            conversation.RoleDirector,
			ModelID:         *agentProfile.ModelSelection.ModelID,
			ReasoningEffort: agentProfile.ReasoningEffort,
			ServiceTier:     nil,
		}},
	}
}
