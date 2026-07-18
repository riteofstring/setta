package master

import (
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/agent"
)

func TestSessionValidatesDurableRestrictedLifecycle(t *testing.T) {
	session := validTestSession()
	if err := session.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*Session)
		want   string
	}{
		{name: "provider", mutate: func(value *Session) { value.Provider = "other" }, want: "provider"},
		{name: "privileged", mutate: func(value *Session) {
			value.Configuration.ResolvedInvocation.PermissionMode = agent.PermissionModeWorkspaceWrite
		}, want: "read-only"},
		{name: "noncanonical profile", mutate: func(value *Session) {
			value.Configuration.RequestedProfile = json.RawMessage(`{ "role": "master" }`)
		}, want: "canonical"},
		{name: "ready without thread", mutate: func(value *Session) { value.ProviderThreadID = nil }, want: "provider thread"},
		{name: "degraded without details", mutate: func(value *Session) {
			value.Status = SessionStatusDegraded
			value.Degradation = nil
		}, want: "degradation"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value := CloneSession(session)
			test.mutate(&value)
			if err := value.Validate(); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("validation error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestCloneSessionOwnsNestedProviderConfiguration(t *testing.T) {
	session := validTestSession()
	serviceTier := "priority"
	session.Configuration.ResolvedInvocation.Requested.ServiceTier = &serviceTier
	session.Configuration.ResolvedInvocation.ServiceTier = &serviceTier
	cloned := CloneSession(session)
	*session.ProviderThreadID = "mutated-thread"
	*session.Configuration.ResolvedInvocation.ServiceTier = "mutated-tier"
	session.Configuration.RequestedProfile[0] = '['
	session.DurableContext[0] = '['
	if *cloned.ProviderThreadID != "provider-thread" ||
		*cloned.Configuration.ResolvedInvocation.ServiceTier != "priority" ||
		string(cloned.Configuration.RequestedProfile) != `{"role":"master"}` ||
		string(cloned.DurableContext) != `{}` {
		t.Fatalf("cloned session aliases source: %+v", cloned)
	}
}

func validTestRoleConfiguration() RoleConfiguration {
	requested := agent.Invocation{
		Model:           "gpt-master-test",
		ReasoningEffort: "medium",
		PermissionMode:  agent.PermissionModeReadOnly,
		ApprovalMode:    agent.ApprovalModeNever,
	}
	return RoleConfiguration{
		RequestedProfile: json.RawMessage(`{"role":"master"}`),
		MaxInputBytes:    128 * 1024,
		ResolvedInvocation: agent.ResolvedInvocation{
			Requested:       requested,
			Model:           requested.Model,
			ReasoningEffort: requested.ReasoningEffort,
			PermissionMode:  requested.PermissionMode,
			ApprovalMode:    requested.ApprovalMode,
		},
	}
}

func validTestSession() Session {
	threadID := "provider-thread"
	return Session{
		ID:               "master-session",
		Provider:         "codex",
		ProviderThreadID: &threadID,
		Status:           SessionStatusReady,
		Configuration:    validTestRoleConfiguration(),
		DurableContext:   json.RawMessage(`{}`),
		CreatedAt:        "2026-07-13T18:00:00Z",
		UpdatedAt:        "2026-07-13T18:00:01Z",
	}
}
