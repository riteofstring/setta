package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type EffectiveRoleProfiles struct {
	Master    RoleProfile `json:"master"`
	Agent     RoleProfile `json:"agent"`
	Narrator  RoleProfile `json:"narrator"`
	SideAgent RoleProfile `json:"sideAgent"`
}

func (store *Store) ResolveRoleProfile(ctx context.Context, role Role, workspaceID string, conversationID string) (RoleProfile, error) {
	profile, err := DefaultRoleProfile(role)
	if err != nil {
		return RoleProfile{}, err
	}
	err = store.read(ctx, "resolve effective role profile", func(ctx context.Context, reader *sql.Conn) error {
		resolved, err := resolveRoleProfile(ctx, reader, profile, workspaceID, conversationID)
		if err == nil {
			profile = resolved
		}
		return err
	})
	return profile, err
}

func (store *Store) ReadEffectiveRoleProfiles(ctx context.Context, workspaceID string, conversationID string) (EffectiveRoleProfiles, error) {
	master, err := store.ResolveRoleProfile(ctx, RoleMaster, "", "")
	if err != nil {
		return EffectiveRoleProfiles{}, err
	}
	agentProfile, err := store.ResolveRoleProfile(ctx, RoleAgent, workspaceID, conversationID)
	if err != nil {
		return EffectiveRoleProfiles{}, err
	}
	narrator, err := store.ResolveRoleProfile(ctx, RoleNarrator, workspaceID, conversationID)
	if err != nil {
		return EffectiveRoleProfiles{}, err
	}
	side, err := store.ResolveRoleProfile(ctx, RoleSideAgent, workspaceID, conversationID)
	if err != nil {
		return EffectiveRoleProfiles{}, err
	}
	return EffectiveRoleProfiles{Master: master, Agent: agentProfile, Narrator: narrator, SideAgent: side}, nil
}

func resolveRoleProfile(ctx context.Context, reader *sql.Conn, profile RoleProfile, workspaceID string, conversationID string) (RoleProfile, error) {
	scopes := []struct {
		kind RoleProfileScopeKind
		id   string
	}{
		{kind: RoleProfileScopeGlobal, id: ""},
	}
	if workspaceID != "" && profile.Role != RoleMaster {
		scopes = append(scopes, struct {
			kind RoleProfileScopeKind
			id   string
		}{kind: RoleProfileScopeWorkspace, id: workspaceID})
	}
	if conversationID != "" && profile.Role != RoleMaster {
		scopes = append(scopes, struct {
			kind RoleProfileScopeKind
			id   string
		}{kind: RoleProfileScopeConversation, id: conversationID})
	}
	for _, scope := range scopes {
		override, err := readRoleProfileOverride(ctx, reader, scope.kind, scope.id, profile.Role)
		if err != nil {
			return RoleProfile{}, err
		}
		if override != nil {
			profile = override.Profile
		}
	}
	return profile, profile.Validate()
}

func readRoleProfileOverride(ctx context.Context, reader *sql.Conn, scopeKind RoleProfileScopeKind, scopeID string, role Role) (*RoleProfileOverride, error) {
	var override RoleProfileOverride
	var profileJSON string
	err := reader.QueryRowContext(ctx, `
SELECT scope_kind, scope_id, profile_json, updated_at
FROM role_profile_overrides
WHERE scope_kind = ? AND scope_id = ? AND role = ?
`, scopeKind, scopeID, role).Scan(&override.ScopeKind, &override.ScopeID, &profileJSON, &override.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := decodeRequiredJSON(profileJSON, &override.Profile); err != nil {
		return nil, fmt.Errorf("decode %s role override: %w", role, err)
	}
	return &override, override.Validate()
}
