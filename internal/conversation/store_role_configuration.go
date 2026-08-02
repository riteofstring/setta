package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

type roleProfileResolution struct {
	BuiltIn         RoleProfile
	Effective       RoleProfile
	EffectiveSource RoleProfileSourceKind
	TargetOverride  *RoleProfileOverride
}

func (store *Store) ReadEffectiveWorkspaceRoleProfile(
	ctx context.Context,
	workspaceID string,
	builtIn RoleProfile,
) (RoleProfile, error) {
	if store == nil {
		return RoleProfile{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return RoleProfile{}, errors.New("workspace role profile read context is required")
	}
	if err := validateIdentifier("role profile workspace id", workspaceID); err != nil {
		return RoleProfile{}, err
	}
	if err := validateConfigurableRoleProfile(builtIn); err != nil {
		return RoleProfile{}, fmt.Errorf("built-in workspace role profile: %w", err)
	}

	effective := builtIn
	err := store.read(ctx, "read effective workspace role profile", func(ctx context.Context, connection *sql.Conn) error {
		rows, err := connection.QueryContext(ctx, `
SELECT scope_kind, scope_id, role, provider, profile_json, updated_at
FROM role_profile_overrides
WHERE role = ?
  AND (
    (scope_kind = 'global' AND scope_id = '')
    OR (scope_kind = 'workspace' AND scope_id = ?)
  )
ORDER BY CASE scope_kind WHEN 'global' THEN 0 WHEN 'workspace' THEN 1 END ASC
`, builtIn.Role, workspaceID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			override, err := scanConfiguredRoleProfileOverride(rows)
			if err != nil {
				return &CorruptStateError{Path: store.dbPath, Err: err}
			}
			if override.Profile.Role != builtIn.Role {
				return &CorruptStateError{
					Path: store.dbPath,
					Err: fmt.Errorf(
						"workspace role profile override role %s does not match requested role %s",
						override.Profile.Role,
						builtIn.Role,
					),
				}
			}
			effective = override.Profile
		}
		return rows.Err()
	})
	if err != nil {
		return RoleProfile{}, err
	}
	return effective, nil
}

func (store *Store) readRoleProfileResolutions(
	ctx context.Context,
	scope RoleConfigurationScope,
	builtIns []RoleProfile,
) ([]roleProfileResolution, error) {
	if err := validateRoleProfileResolutionRead(store, ctx, scope, builtIns); err != nil {
		return nil, err
	}

	var result []roleProfileResolution
	err := store.read(ctx, "read role profile resolutions", func(ctx context.Context, connection *sql.Conn) error {
		var err error
		result, err = store.readRoleProfileResolutionsAtConnection(ctx, connection, scope, builtIns)
		return err
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func validateRoleProfileResolutionRead(
	store *Store,
	ctx context.Context,
	scope RoleConfigurationScope,
	builtIns []RoleProfile,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("role configuration read context is required")
	}
	if err := scope.Validate(); err != nil {
		return err
	}
	if len(builtIns) == 0 {
		return errors.New("role configuration built-in profiles are required")
	}
	for _, profile := range builtIns {
		if err := validateConfigurableRoleProfile(profile); err != nil {
			return fmt.Errorf("built-in %s role profile: %w", profile.Role, err)
		}
	}
	return nil
}

func (store *Store) readRoleProfileResolutionsAtConnection(
	ctx context.Context,
	connection *sql.Conn,
	scope RoleConfigurationScope,
	builtIns []RoleProfile,
) ([]roleProfileResolution, error) {
	reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer func() { _ = reader.Rollback() }()
	if scope.Kind == RoleProfileScopeConversation {
		if err := requireRoleProfileConversation(
			ctx,
			reader,
			scope.WorkspaceID,
			*scope.ConversationID,
		); err != nil {
			return nil, err
		}
	}
	overrides, err := queryRoleConfigurationOverrides(ctx, reader, scope)
	if err != nil {
		return nil, err
	}
	result := make([]roleProfileResolution, 0, len(builtIns))
	for _, builtIn := range builtIns {
		resolution, err := resolveStoredRoleProfile(scope, builtIn, overrides)
		if err != nil {
			return nil, &CorruptStateError{Path: store.dbPath, Err: err}
		}
		result = append(result, resolution)
	}
	if err := reader.Commit(); err != nil {
		return nil, err
	}
	return result, nil
}

func queryRoleConfigurationOverrides(
	ctx context.Context,
	reader snapshotReader,
	scope RoleConfigurationScope,
) ([]RoleProfileOverride, error) {
	var rows *sql.Rows
	var err error
	switch scope.Kind {
	case RoleProfileScopeGlobal:
		rows, err = reader.QueryContext(ctx, `
SELECT scope_kind, scope_id, role, provider, profile_json, updated_at
FROM role_profile_overrides
WHERE scope_kind = 'global' AND scope_id = ''
ORDER BY role ASC
`)
	case RoleProfileScopeWorkspace:
		rows, err = reader.QueryContext(ctx, `
SELECT scope_kind, scope_id, role, provider, profile_json, updated_at
FROM role_profile_overrides
WHERE (scope_kind = 'global' AND scope_id = '')
   OR (scope_kind = 'workspace' AND scope_id = ?)
ORDER BY role ASC, CASE scope_kind
  WHEN 'global' THEN 0
  WHEN 'workspace' THEN 1
END ASC
`, *scope.WorkspaceID)
	case RoleProfileScopeConversation:
		rows, err = reader.QueryContext(ctx, `
SELECT scope_kind, scope_id, role, provider, profile_json, updated_at
FROM role_profile_overrides
WHERE (scope_kind = 'global' AND scope_id = '')
   OR (scope_kind = 'workspace' AND scope_id = ?)
   OR (scope_kind = 'conversation' AND scope_id = ?)
ORDER BY role ASC, CASE scope_kind
  WHEN 'global' THEN 0
  WHEN 'workspace' THEN 1
  WHEN 'conversation' THEN 2
END ASC
`, *scope.WorkspaceID, *scope.ConversationID)
	default:
		return nil, fmt.Errorf("query role configuration overrides at unsupported scope %q", scope.Kind)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	overrides := make([]RoleProfileOverride, 0)
	for rows.Next() {
		override, err := scanConfiguredRoleProfileOverride(rows)
		if err != nil {
			return nil, err
		}
		overrides = append(overrides, override)
	}
	return overrides, rows.Err()
}

func resolveStoredRoleProfile(
	scope RoleConfigurationScope,
	builtIn RoleProfile,
	overrides []RoleProfileOverride,
) (roleProfileResolution, error) {
	resolution := roleProfileResolution{
		BuiltIn:         builtIn,
		Effective:       builtIn,
		EffectiveSource: RoleProfileSourceBuiltIn,
	}
	for index := range overrides {
		override := overrides[index]
		if override.Profile.Role != builtIn.Role {
			continue
		}
		resolution.Effective = override.Profile
		switch override.ScopeKind {
		case RoleProfileScopeGlobal:
			resolution.EffectiveSource = RoleProfileSourceGlobal
		case RoleProfileScopeWorkspace:
			resolution.EffectiveSource = RoleProfileSourceWorkspace
		case RoleProfileScopeConversation:
			resolution.EffectiveSource = RoleProfileSourceConversation
		default:
			return roleProfileResolution{}, fmt.Errorf(
				"stored role profile has unsupported scope %q",
				override.ScopeKind,
			)
		}
		if override.ScopeKind == scope.Kind {
			copy := override
			resolution.TargetOverride = &copy
		}
	}
	return resolution, nil
}

func scanConfiguredRoleProfileOverride(scanner sqlScanner) (RoleProfileOverride, error) {
	var override RoleProfileOverride
	var storedRole Role
	var storedProvider Provider
	var profileJSON string
	if err := scanner.Scan(
		&override.ScopeKind,
		&override.ScopeID,
		&storedRole,
		&storedProvider,
		&profileJSON,
		&override.UpdatedAt,
	); err != nil {
		return RoleProfileOverride{}, err
	}
	if err := json.Unmarshal([]byte(profileJSON), &override.Profile); err != nil {
		return RoleProfileOverride{}, fmt.Errorf("decode %s role profile override: %w", storedRole, err)
	}
	if err := override.Validate(); err != nil {
		return RoleProfileOverride{}, err
	}
	if err := validateConfigurableRoleProfile(override.Profile); err != nil {
		return RoleProfileOverride{}, err
	}
	if override.Profile.Role != storedRole {
		return RoleProfileOverride{}, fmt.Errorf(
			"stored role profile role %s does not match profile role %s",
			storedRole,
			override.Profile.Role,
		)
	}
	if override.Profile.Provider != storedProvider {
		return RoleProfileOverride{}, fmt.Errorf(
			"stored %s role profile provider %s does not match profile provider %s",
			storedRole,
			storedProvider,
			override.Profile.Provider,
		)
	}
	return override, nil
}

func (transaction *WriteTransaction) DeleteRoleProfileOverride(
	scopeKind RoleProfileScopeKind,
	scopeID string,
	role Role,
) (bool, error) {
	if err := transaction.ensureActive(); err != nil {
		return false, err
	}
	if err := transaction.validateRoleProfileOverrideRemoval(scopeKind, scopeID, role); err != nil {
		return false, err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
DELETE FROM role_profile_overrides
WHERE scope_kind = ? AND scope_id = ? AND role = ?
`, scopeKind, scopeID, role)
	if err != nil {
		return false, fmt.Errorf("delete %s role profile override at %s:%s: %w", role, scopeKind, scopeID, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("read deleted %s role profile override result: %w", role, err)
	}
	if rows == 0 {
		return false, nil
	}
	if rows != 1 {
		return false, fmt.Errorf("deleted %d %s role profile overrides", rows, role)
	}
	if err := transaction.recordStateMutation(); err != nil {
		return false, err
	}
	return true, nil
}

func (transaction *WriteTransaction) validateRoleProfileOverrideRemoval(
	scopeKind RoleProfileScopeKind,
	scopeID string,
	role Role,
) error {
	if !containsRole(configurableRoles(scopeKind), role) {
		return fmt.Errorf("role %s cannot be removed at %s scope", role, scopeKind)
	}
	switch scopeKind {
	case RoleProfileScopeGlobal:
		if scopeID != "" {
			return errors.New("global role profile override scope id must be empty")
		}
	case RoleProfileScopeWorkspace:
		if err := validateIdentifier("workspace role profile override scope id", scopeID); err != nil {
			return err
		}
	case RoleProfileScopeConversation:
		if err := validateIdentifier("conversation role profile override scope id", scopeID); err != nil {
			return err
		}
		if err := transaction.requireConversationCoversSequence(
			scopeID,
			0,
			"role profile override",
			string(role),
		); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported removable role profile scope %q", scopeKind)
	}
	return nil
}
