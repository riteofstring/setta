package conversation

import (
	"database/sql"
	"errors"
	"fmt"

	"setta/internal/speech"
)

type SideConversationExpectation struct {
	Status    SideConversationStatus
	UpdatedAt string
}

func (transaction *WriteTransaction) InsertConversationBranch(branch ConversationBranch) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := branch.Validate(); err != nil {
		return err
	}
	if err := transaction.requireForkWorkspaceMatch(branch); err != nil {
		return err
	}
	if err := transaction.requireCompletedTurnBelongs(
		branch.ForkedAtTurnID,
		branch.ParentConversationID,
		"conversation branch",
		branch.ChildConversationID,
	); err != nil {
		return err
	}
	if err := transaction.requireConversationCoversSequence(
		branch.ParentConversationID,
		branch.SourceTrajectorySequence,
		"conversation branch",
		branch.ChildConversationID,
	); err != nil {
		return err
	}
	providerMetadataJSON, err := encodeJSONColumn("conversation branch provider metadata", branch.ProviderMetadata)
	if err != nil {
		return err
	}
	_, err = transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO conversation_branches (
  child_conversation_id, parent_conversation_id, branch_kind,
  forked_at_turn_id, source_trajectory_sequence, provider_metadata_json,
  created_at
) VALUES (?, ?, ?, ?, ?, ?, ?)
`,
		branch.ChildConversationID,
		branch.ParentConversationID,
		branch.Kind,
		branch.ForkedAtTurnID,
		branch.SourceTrajectorySequence,
		providerMetadataJSON,
		branch.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert conversation branch %s: %w", branch.ChildConversationID, err)
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) InsertSideConversation(side SideConversation) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := side.Validate(); err != nil {
		return err
	}
	if err := transaction.requireConversationCoversSequence(
		side.ParentConversationID,
		side.SourceTrajectorySequence,
		"side conversation",
		side.ID,
	); err != nil {
		return err
	}
	invocationJSON, err := encodeJSONColumn("side conversation invocation", side.ResolvedSideAgentInvocation)
	if err != nil {
		return err
	}
	failureJSON, err := encodeOptionalJSONColumn("side conversation failure", side.Failure)
	if err != nil {
		return err
	}
	_, err = transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO side_conversations (
  id, parent_conversation_id, parent_pane_id, provider_thread_id,
  source_provider_turn_id, source_trajectory_sequence, status,
  resolved_side_agent_invocation_json, created_at, updated_at, disposed_at,
  failure_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		side.ID,
		side.ParentConversationID,
		side.ParentPaneID,
		nullableString(side.ProviderThreadID),
		nullableString(side.SourceProviderTurnID),
		side.SourceTrajectorySequence,
		side.Status,
		invocationJSON,
		side.CreatedAt,
		side.UpdatedAt,
		nullableString(side.DisposedAt),
		failureJSON,
	)
	if err != nil {
		return fmt.Errorf("insert side conversation %s: %w", side.ID, err)
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) UpdateSideConversation(
	expected SideConversationExpectation,
	side SideConversation,
) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := validateSideConversationUpdate(expected, side); err != nil {
		return err
	}
	invocationJSON, err := encodeJSONColumn("side conversation invocation", side.ResolvedSideAgentInvocation)
	if err != nil {
		return err
	}
	failureJSON, err := encodeOptionalJSONColumn("side conversation failure", side.Failure)
	if err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE side_conversations
SET provider_thread_id = ?, source_provider_turn_id = ?, status = ?,
    resolved_side_agent_invocation_json = ?, updated_at = ?, disposed_at = ?,
    failure_json = ?
WHERE id = ?
  AND parent_conversation_id = ?
  AND parent_pane_id = ?
  AND source_trajectory_sequence = ?
  AND created_at = ?
  AND status = ?
  AND updated_at = ?
`,
		nullableString(side.ProviderThreadID),
		nullableString(side.SourceProviderTurnID),
		side.Status,
		invocationJSON,
		side.UpdatedAt,
		nullableString(side.DisposedAt),
		failureJSON,
		side.ID,
		side.ParentConversationID,
		side.ParentPaneID,
		side.SourceTrajectorySequence,
		side.CreatedAt,
		expected.Status,
		expected.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("update side conversation %s: %w", side.ID, err)
	}
	if err := requireOneRow(result, "side conversation", side.ID, "lifecycle expectation did not match"); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}

func validateSideConversationUpdate(expected SideConversationExpectation, side SideConversation) error {
	if !validSideConversationStatus(expected.Status) {
		return fmt.Errorf("side conversation %s has unsupported expected status %q", side.ID, expected.Status)
	}
	expectedUpdatedAt, err := validateTimestamp("side conversation expected updatedAt", expected.UpdatedAt)
	if err != nil {
		return err
	}
	if err := side.Validate(); err != nil {
		return err
	}
	if err := validateSideConversationStatusTransition(expected.Status, side.Status, side.ID); err != nil {
		return err
	}
	updatedAt, err := validateTimestamp("side conversation updatedAt", side.UpdatedAt)
	if err != nil {
		return err
	}
	if !updatedAt.After(expectedUpdatedAt) {
		return fmt.Errorf("side conversation %s updatedAt must advance beyond its expected version", side.ID)
	}
	return nil
}

func (transaction *WriteTransaction) UpsertRoleProfileOverride(override RoleProfileOverride) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := override.Validate(); err != nil {
		return err
	}
	if override.ScopeKind == RoleProfileScopeConversation {
		if err := transaction.requireConversationCoversSequence(
			override.ScopeID,
			0,
			"role profile override",
			string(override.Profile.Role),
		); err != nil {
			return err
		}
	}
	profileJSON, err := encodeJSONColumn("role profile override", override.Profile)
	if err != nil {
		return err
	}
	_, err = transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO role_profile_overrides (
  scope_kind, scope_id, role, provider, profile_json, updated_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(scope_kind, scope_id, role) DO UPDATE SET
  provider = excluded.provider,
  profile_json = excluded.profile_json,
  updated_at = excluded.updated_at
`,
		override.ScopeKind,
		override.ScopeID,
		override.Profile.Role,
		override.Profile.Provider,
		profileJSON,
		override.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert %s role profile override at %s:%s: %w", override.Profile.Role, override.ScopeKind, override.ScopeID, err)
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) requireCompletedTurnBelongs(
	turnID string,
	conversationID string,
	entity string,
	entityID string,
) error {
	var completed bool
	err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT EXISTS(
  SELECT 1
  FROM conversation_turns
  WHERE id = ? AND conversation_id = ? AND status = 'completed'
)
`, turnID, conversationID).Scan(&completed)
	if err != nil {
		return fmt.Errorf("verify %s %s completed turn ownership: %w", entity, entityID, err)
	}
	if !completed {
		return stateConflict(entity, entityID, "fork source is not a completed turn of the parent conversation")
	}
	return nil
}

func (transaction *WriteTransaction) requireForkWorkspaceMatch(branch ConversationBranch) error {
	var parentWorkspaceID string
	var childWorkspaceID string
	err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT parent.workspace_id, child.workspace_id
FROM conversations AS parent
JOIN conversations AS child ON child.id = ?
WHERE parent.id = ?
`, branch.ChildConversationID, branch.ParentConversationID).Scan(&parentWorkspaceID, &childWorkspaceID)
	if errors.Is(err, sql.ErrNoRows) {
		return stateConflict(
			"conversation branch",
			branch.ChildConversationID,
			"parent or child conversation does not exist",
		)
	}
	if err != nil {
		return fmt.Errorf("read conversation branch workspaces: %w", err)
	}
	if parentWorkspaceID != childWorkspaceID {
		return stateConflict(
			"conversation branch",
			branch.ChildConversationID,
			"fork parent and child must belong to the same workspace",
		)
	}
	return nil
}

func validateSideConversationStatusTransition(
	expected SideConversationStatus,
	next SideConversationStatus,
	sideConversationID string,
) error {
	if expected == next {
		return nil
	}
	allowed := false
	switch expected {
	case SideConversationStatusPreparing:
		allowed = next == SideConversationStatusActive ||
			next == SideConversationStatusDisposing ||
			next == SideConversationStatusFailed
	case SideConversationStatusActive:
		allowed = next == SideConversationStatusDisposing || next == SideConversationStatusFailed
	case SideConversationStatusDisposing:
		allowed = next == SideConversationStatusFailed
	case SideConversationStatusFailed:
		allowed = false
	default:
		return fmt.Errorf(
			"side conversation %s has unsupported expected status %q",
			sideConversationID,
			expected,
		)
	}
	if !allowed {
		return stateConflict(
			"side conversation",
			sideConversationID,
			fmt.Sprintf("status cannot transition from %s to %s", expected, next),
		)
	}
	return nil
}

func (transaction *WriteTransaction) UpsertConversationPresentationProfile(
	profile ConversationPresentationProfile,
) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := profile.Validate(); err != nil {
		return err
	}
	paletteReuseJSON, err := encodeOptionalJSONColumn("presentation palette reuse", profile.PaletteReuse)
	if err != nil {
		return err
	}
	voiceReuseJSON, err := encodeOptionalJSONColumn("presentation narrator voice reuse", profile.NarratorVoiceReuse)
	if err != nil {
		return err
	}
	_, err = transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO conversation_presentation_profiles (
  conversation_id, palette_selection, requested_palette_id,
  resolved_palette_id, palette_reuse_json, narrator_voice_selection,
  requested_narrator_voice_id, resolved_narrator_voice_id,
  narrator_voice_reuse_json, narrator_speech_enabled, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(conversation_id) DO UPDATE SET
  palette_selection = excluded.palette_selection,
  requested_palette_id = excluded.requested_palette_id,
  resolved_palette_id = excluded.resolved_palette_id,
  palette_reuse_json = excluded.palette_reuse_json,
  narrator_voice_selection = excluded.narrator_voice_selection,
  requested_narrator_voice_id = excluded.requested_narrator_voice_id,
  resolved_narrator_voice_id = excluded.resolved_narrator_voice_id,
  narrator_voice_reuse_json = excluded.narrator_voice_reuse_json,
  narrator_speech_enabled = excluded.narrator_speech_enabled,
  updated_at = excluded.updated_at
`,
		profile.ConversationID,
		profile.PaletteSelection,
		nullableString(paletteIDPointerString(profile.RequestedPaletteID)),
		profile.ResolvedPaletteID,
		paletteReuseJSON,
		profile.NarratorVoiceSelection,
		nullableString(voiceIDPointerString(profile.RequestedNarratorVoiceID)),
		nullableString(voiceIDPointerString(profile.ResolvedNarratorVoiceID)),
		voiceReuseJSON,
		sqliteBool(profile.NarratorSpeechEnabled),
		profile.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert presentation profile for %s: %w", profile.ConversationID, err)
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) UpdateMasterVoiceSelection(
	expectedUpdatedAt string,
	selection speech.MasterVoiceSelection,
) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := selection.Validate(); err != nil {
		return err
	}
	reuseJSON, err := encodeOptionalJSONColumn("master voice reuse", selection.Reuse)
	if err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE master_voice_selection
SET selection = ?, requested_voice_id = ?, resolved_voice_id = ?,
    reuse_json = ?, updated_at = ?
WHERE singleton = 1 AND updated_at = ?
`,
		selection.Selection,
		nullableString(voiceIDPointerString(selection.RequestedVoiceID)),
		nullableString(voiceIDPointerString(selection.ResolvedVoiceID)),
		reuseJSON,
		selection.UpdatedAt,
		expectedUpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("update master voice selection: %w", err)
	}
	if err := requireOneRow(result, "master voice selection", "singleton", "configuration changed concurrently"); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}
