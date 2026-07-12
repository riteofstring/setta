package master

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/agent"
)

const (
	GlobalSessionStreamID = "master:session"

	SessionCreatedEventKind  = "master.session.created"
	SessionUpdatedEventKind  = "master.session.updated"
	MaxSessionIDBytes        = 512
	MaxProviderThreadIDBytes = 512
	MaxDiagnosticIDBytes     = 512
)

type SessionStatus string

const (
	SessionStatusInitializing SessionStatus = "initializing"
	SessionStatusReady        SessionStatus = "ready"
	SessionStatusRunning      SessionStatus = "running"
	SessionStatusDegraded     SessionStatus = "degraded"
)

// RoleConfiguration freezes the exact provider resolution used to create the
// durable master thread while preserving the Go-owned requested role profile
// as canonical JSON. The conversation configuration owner validates that JSON
// against the shared RoleProfile contract when it persists or reloads a
// session.
type RoleConfiguration struct {
	RequestedProfile   json.RawMessage          `json:"requestedProfile"`
	ResolvedInvocation agent.ResolvedInvocation `json:"resolvedInvocation"`
}

type SessionDegradation struct {
	Code                string `json:"code"`
	DiagnosticReference string `json:"diagnosticReference"`
	OccurredAt          string `json:"occurredAt"`
}

type Session struct {
	ID               string              `json:"id"`
	Provider         string              `json:"provider"`
	ProviderThreadID *string             `json:"providerThreadId"`
	Status           SessionStatus       `json:"status"`
	Configuration    RoleConfiguration   `json:"configuration"`
	DurableContext   json.RawMessage     `json:"durableContext"`
	CreatedAt        string              `json:"createdAt"`
	UpdatedAt        string              `json:"updatedAt"`
	Degradation      *SessionDegradation `json:"degradation"`
}

type SessionConflictError struct {
	SessionID string
	Reason    string
}

func (err *SessionConflictError) Error() string {
	return fmt.Sprintf("master session %s changed: %s", err.SessionID, err.Reason)
}

func IsSessionConflict(err error) bool {
	var conflict *SessionConflictError
	return errors.As(err, &conflict)
}

func (configuration RoleConfiguration) Validate() error {
	profile, err := canonicalJSONObject(configuration.RequestedProfile, "master requested role profile")
	if err != nil {
		return err
	}
	if !bytes.Equal(profile, configuration.RequestedProfile) {
		return errors.New("master requested role profile must be canonical JSON")
	}
	return validateResolvedRoleConfiguration(configuration.ResolvedInvocation)
}

func validateResolvedRoleConfiguration(resolved agent.ResolvedInvocation) error {
	if err := resolved.Requested.Validate(); err != nil {
		return fmt.Errorf("master requested provider invocation: %w", err)
	}
	if err := validateResolvedRoleSelection(resolved); err != nil {
		return err
	}
	return validateResolvedRolePermissions(resolved)
}

func validateResolvedRoleSelection(resolved agent.ResolvedInvocation) error {
	if strings.TrimSpace(resolved.Model) == "" {
		return errors.New("master resolved provider model is required")
	}
	if strings.TrimSpace(resolved.ReasoningEffort) == "" {
		return errors.New("master resolved provider reasoning effort is required")
	}
	if !resolved.Requested.ModelSelectionProviderDefault && resolved.Model != resolved.Requested.Model {
		return fmt.Errorf("master exact provider model resolved as %s, want %s", resolved.Model, resolved.Requested.Model)
	}
	if resolved.Requested.ReasoningEffort != "" &&
		resolved.ReasoningEffort != resolved.Requested.ReasoningEffort {
		return fmt.Errorf("master provider reasoning effort resolved as %s, want %s", resolved.ReasoningEffort, resolved.Requested.ReasoningEffort)
	}
	if resolved.Requested.ServiceTier != nil &&
		!equalOptionalString(resolved.Requested.ServiceTier, resolved.ServiceTier) {
		return errors.New("master provider service tier changed during resolution")
	}
	return nil
}

func validateResolvedRolePermissions(resolved agent.ResolvedInvocation) error {
	if resolved.Requested.PermissionMode != agent.PermissionModeReadOnly ||
		resolved.Requested.ApprovalMode != agent.ApprovalModeNever ||
		resolved.PermissionMode != agent.PermissionModeReadOnly ||
		resolved.ApprovalMode != agent.ApprovalModeNever {
		return errors.New("master provider invocation must remain read-only with approvals disabled")
	}
	return nil
}

func (configuration RoleConfiguration) PinnedInvocation() (agent.Invocation, error) {
	if err := configuration.Validate(); err != nil {
		return agent.Invocation{}, err
	}
	resolved := configuration.ResolvedInvocation
	return agent.Invocation{
		Model:           resolved.Model,
		ReasoningEffort: resolved.ReasoningEffort,
		ServiceTier:     cloneString(resolved.ServiceTier),
		PermissionMode:  agent.PermissionModeReadOnly,
		ApprovalMode:    agent.ApprovalModeNever,
	}, nil
}

func (degradation SessionDegradation) Validate() error {
	if err := validateBoundedIdentifier("master session degradation code", degradation.Code, MaxDiagnosticIDBytes); err != nil {
		return err
	}
	if err := validateBoundedIdentifier("master session diagnostic reference", degradation.DiagnosticReference, MaxDiagnosticIDBytes); err != nil {
		return err
	}
	occurredAt, err := normalizeTimestamp("master session degradation occurredAt", degradation.OccurredAt)
	if err != nil {
		return err
	}
	if occurredAt != degradation.OccurredAt {
		return errors.New("master session degradation occurredAt is not normalized")
	}
	return nil
}

func (session Session) Validate() error {
	if err := validateSessionIdentity(session); err != nil {
		return err
	}
	if err := validateDurableContext(session.DurableContext); err != nil {
		return err
	}
	created, updated, err := validateSessionTimestamps(session.CreatedAt, session.UpdatedAt)
	if err != nil {
		return err
	}
	return validateSessionLifecycle(session, created, updated)
}

func validateSessionIdentity(session Session) error {
	if err := validateBoundedIdentifier("master session id", session.ID, MaxSessionIDBytes); err != nil {
		return err
	}
	if session.Provider != "codex" {
		return fmt.Errorf("master session has unsupported provider %q", session.Provider)
	}
	if session.ProviderThreadID != nil {
		if err := validateBoundedIdentifier("master provider thread id", *session.ProviderThreadID, MaxProviderThreadIDBytes); err != nil {
			return err
		}
	}
	if err := session.Configuration.Validate(); err != nil {
		return fmt.Errorf("master session configuration: %w", err)
	}
	return nil
}

func validateDurableContext(durableContext json.RawMessage) error {
	contextJSON, err := canonicalJSONObject(durableContext, "master durable context")
	if err != nil {
		return err
	}
	if !bytes.Equal(contextJSON, durableContext) {
		return errors.New("master durable context must be canonical JSON")
	}
	return nil
}

func validateSessionTimestamps(createdValue string, updatedValue string) (time.Time, time.Time, error) {
	createdAt, err := normalizeTimestamp("master session createdAt", createdValue)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	updatedAt, err := normalizeTimestamp("master session updatedAt", updatedValue)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	if createdAt != createdValue || updatedAt != updatedValue {
		return time.Time{}, time.Time{}, errors.New("master session timestamps must be normalized")
	}
	created, _ := time.Parse(time.RFC3339Nano, createdAt)
	updated, _ := time.Parse(time.RFC3339Nano, updatedAt)
	if updated.Before(created) {
		return time.Time{}, time.Time{}, errors.New("master session updatedAt precedes createdAt")
	}
	return created, updated, nil
}

func validateSessionLifecycle(session Session, created time.Time, updated time.Time) error {
	switch session.Status {
	case SessionStatusInitializing:
		return validateInitializingSession(session)
	case SessionStatusReady, SessionStatusRunning:
		return validateBoundMasterSession(session)
	case SessionStatusDegraded:
		return validateDegradedSession(session, created, updated)
	default:
		return fmt.Errorf("unsupported master session status %q", session.Status)
	}
}

func validateInitializingSession(session Session) error {
	if session.ProviderThreadID != nil || session.Degradation != nil {
		return errors.New("initializing master session contains provider or degradation state")
	}
	return nil
}

func validateBoundMasterSession(session Session) error {
	if session.ProviderThreadID == nil || session.Degradation != nil {
		return fmt.Errorf("%s master session requires a provider thread and no degradation", session.Status)
	}
	return nil
}

func validateDegradedSession(session Session, created time.Time, updated time.Time) error {
	if session.Degradation == nil {
		return errors.New("degraded master session requires degradation details")
	}
	if err := session.Degradation.Validate(); err != nil {
		return err
	}
	occurred, _ := time.Parse(time.RFC3339Nano, session.Degradation.OccurredAt)
	if occurred.Before(created) || occurred.After(updated) {
		return errors.New("master session degradation time is outside the session timeline")
	}
	return nil
}

func CloneSession(session Session) Session {
	session.ProviderThreadID = cloneString(session.ProviderThreadID)
	session.Configuration.RequestedProfile = append(json.RawMessage{}, session.Configuration.RequestedProfile...)
	session.Configuration.ResolvedInvocation.Requested.ServiceTier = cloneString(
		session.Configuration.ResolvedInvocation.Requested.ServiceTier,
	)
	session.Configuration.ResolvedInvocation.ServiceTier = cloneString(
		session.Configuration.ResolvedInvocation.ServiceTier,
	)
	session.DurableContext = append(json.RawMessage{}, session.DurableContext...)
	if session.Degradation != nil {
		cloned := *session.Degradation
		session.Degradation = &cloned
	}
	return session
}

func SessionCreatedEventID(sessionID string) string {
	return "master-session-created:" + sessionID
}

func SessionUpdatedEventID(session Session) string {
	return "master-session-updated:" + session.ID + ":" + session.UpdatedAt
}

func canonicalJSONObject(raw json.RawMessage, label string) (json.RawMessage, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, fmt.Errorf("%s is required", label)
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &object); err != nil {
		return nil, fmt.Errorf("%s must be a JSON object: %w", label, err)
	}
	if object == nil {
		return nil, fmt.Errorf("%s must be a JSON object", label)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, trimmed); err != nil {
		return nil, fmt.Errorf("compact %s: %w", label, err)
	}
	return append(json.RawMessage{}, compact.Bytes()...), nil
}
