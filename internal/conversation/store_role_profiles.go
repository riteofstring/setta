package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// ReadEffectiveRoleProfile applies the durable configuration precedence for a
// role in one topic conversation:
//
//	built-in -> global -> workspace -> conversation
//
// Overrides are complete role profiles rather than partial patches. The read
// transaction also verifies that the conversation belongs to the requested
// workspace so configuration from another workspace cannot leak across scope.
func (store *Store) ReadEffectiveRoleProfile(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	builtIn RoleProfile,
) (RoleProfile, error) {
	if store == nil {
		return RoleProfile{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return RoleProfile{}, errors.New("role profile read context is required")
	}
	if err := validateIdentifier("role profile workspace id", workspaceID); err != nil {
		return RoleProfile{}, err
	}
	if err := validateIdentifier("role profile conversation id", conversationID); err != nil {
		return RoleProfile{}, err
	}
	if err := builtIn.Validate(); err != nil {
		return RoleProfile{}, fmt.Errorf("built-in role profile: %w", err)
	}

	effective := builtIn
	err := store.read(ctx, "read effective role profile", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		if err := requireRoleProfileConversation(ctx, reader, workspaceID, conversationID); err != nil {
			return err
		}
		effective, err = readEffectiveRoleProfile(
			ctx,
			reader,
			store.dbPath,
			workspaceID,
			conversationID,
			builtIn,
		)
		if err != nil {
			return err
		}
		return reader.Commit()
	})
	if err != nil {
		return RoleProfile{}, err
	}
	return effective, nil
}

func requireRoleProfileConversation(
	ctx context.Context,
	reader snapshotReader,
	workspaceID string,
	conversationID string,
) error {
	var actualWorkspaceID string
	err := reader.QueryRowContext(ctx, `
SELECT workspace_id
FROM conversations
WHERE id = ?
`, conversationID).Scan(&actualWorkspaceID)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && actualWorkspaceID != workspaceID) {
		return fmt.Errorf("%w: %s/%s", ErrConversationNotFound, workspaceID, conversationID)
	}
	return err
}

func readEffectiveRoleProfile(
	ctx context.Context,
	reader snapshotReader,
	dbPath string,
	workspaceID string,
	conversationID string,
	builtIn RoleProfile,
) (RoleProfile, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT scope_kind, scope_id, role, provider, profile_json, updated_at
FROM role_profile_overrides
WHERE role = ?
  AND (
    (scope_kind = 'global' AND scope_id = '')
    OR (scope_kind = 'workspace' AND scope_id = ?)
    OR (scope_kind = 'conversation' AND scope_id = ?)
  )
ORDER BY CASE scope_kind
  WHEN 'global' THEN 0
  WHEN 'workspace' THEN 1
  WHEN 'conversation' THEN 2
END ASC
`, builtIn.Role, workspaceID, conversationID)
	if err != nil {
		return RoleProfile{}, err
	}
	defer rows.Close()

	effective := builtIn
	for rows.Next() {
		override, err := scanEffectiveRoleProfileOverride(rows, builtIn.Role)
		if err != nil {
			return RoleProfile{}, &CorruptStateError{Path: dbPath, Err: err}
		}
		effective = override.Profile
	}
	if err := rows.Err(); err != nil {
		return RoleProfile{}, err
	}
	return effective, nil
}

func scanEffectiveRoleProfileOverride(rows *sql.Rows, requestedRole Role) (RoleProfileOverride, error) {
	var override RoleProfileOverride
	var storedRole Role
	var storedProvider Provider
	var profileJSON string
	if err := rows.Scan(
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
	if storedRole != requestedRole || override.Profile.Role != storedRole {
		return RoleProfileOverride{}, fmt.Errorf(
			"stored role profile override role %s does not match requested/profile role %s/%s",
			storedRole,
			requestedRole,
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
