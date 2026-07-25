package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"testing"
)

func TestReadEffectiveRoleProfileAppliesEveryScopeInPrecedenceOrder(t *testing.T) {
	store := newTestStore(t)
	conversation := transactionTestConversation("conversation-role-profile")
	persistRoleProfileTestMutation(t, store, "create-role-profile-conversation", func(transaction *WriteTransaction) error {
		return transaction.InsertConversation(conversation)
	})

	builtIn := DefaultNarratorRoleProfile()
	assertEffectiveRoleProfileModel(t, store, conversation, builtIn, "gpt-5.4-mini")

	global := narratorOverride(RoleProfileScopeGlobal, "", "gpt-narrator-global", ReasoningEffortMedium)
	persistRoleProfileTestMutation(t, store, "set-global-narrator-profile", func(transaction *WriteTransaction) error {
		return transaction.UpsertRoleProfileOverride(global)
	})
	assertEffectiveRoleProfileModel(t, store, conversation, builtIn, "gpt-narrator-global")

	workspace := narratorOverride(
		RoleProfileScopeWorkspace,
		conversation.WorkspaceID,
		"gpt-narrator-workspace",
		ReasoningEffortLow,
	)
	persistRoleProfileTestMutation(t, store, "set-workspace-narrator-profile", func(transaction *WriteTransaction) error {
		return transaction.UpsertRoleProfileOverride(workspace)
	})
	assertEffectiveRoleProfileModel(t, store, conversation, builtIn, "gpt-narrator-workspace")

	conversationOverride := narratorOverride(
		RoleProfileScopeConversation,
		conversation.ID,
		"gpt-narrator-conversation",
		ReasoningEffortNone,
	)
	persistRoleProfileTestMutation(t, store, "set-conversation-narrator-profile", func(transaction *WriteTransaction) error {
		return transaction.UpsertRoleProfileOverride(conversationOverride)
	})
	effective := assertEffectiveRoleProfileModel(
		t,
		store,
		conversation,
		builtIn,
		"gpt-narrator-conversation",
	)
	if effective.ReasoningEffort != ReasoningEffortNone {
		t.Fatalf("effective narrator effort = %s, want none", effective.ReasoningEffort)
	}
}

func TestReadEffectiveRoleProfileRejectsWorkspaceMismatch(t *testing.T) {
	store := newTestStore(t)
	conversation := transactionTestConversation("conversation-role-profile-workspace")
	persistRoleProfileTestMutation(t, store, "create-workspace-bound-conversation", func(transaction *WriteTransaction) error {
		return transaction.InsertConversation(conversation)
	})

	_, err := store.ReadEffectiveRoleProfile(
		context.Background(),
		"workspace-other",
		conversation.ID,
		DefaultNarratorRoleProfile(),
	)
	if !IsConversationNotFound(err) {
		t.Fatalf("workspace mismatch error = %T %v, want conversation not found", err, err)
	}
}

func TestReadEffectiveRoleProfileReportsCorruptStoredProfile(t *testing.T) {
	store := newTestStore(t)
	conversation := transactionTestConversation("conversation-corrupt-role-profile")
	override := narratorOverride(
		RoleProfileScopeConversation,
		conversation.ID,
		"gpt-narrator-before-corruption",
		ReasoningEffortLow,
	)
	persistRoleProfileTestMutation(t, store, "seed-corruptible-role-profile", func(transaction *WriteTransaction) error {
		if err := transaction.InsertConversation(conversation); err != nil {
			return err
		}
		return transaction.UpsertRoleProfileOverride(override)
	})

	wrongRoleJSON, err := json.Marshal(DefaultAgentRoleProfile())
	if err != nil {
		t.Fatalf("encode wrong-role profile: %v", err)
	}
	err = store.write(context.Background(), "corrupt stored role profile", func(ctx context.Context, transaction *sql.Tx) error {
		_, err := transaction.ExecContext(ctx, `
UPDATE role_profile_overrides
SET profile_json = ?
WHERE scope_kind = 'conversation' AND scope_id = ? AND role = 'narrator'
`, string(wrongRoleJSON), conversation.ID)
		return err
	})
	if err != nil {
		t.Fatalf("corrupt stored role profile: %v", err)
	}

	_, err = store.ReadEffectiveRoleProfile(
		context.Background(),
		conversation.WorkspaceID,
		conversation.ID,
		DefaultNarratorRoleProfile(),
	)
	if !IsCorruptStateError(err) {
		t.Fatalf("corrupt role profile error = %T %v, want CorruptStateError", err, err)
	}
}

func TestReadEffectiveRoleProfileValidatesRequestAndBuiltInProfile(t *testing.T) {
	store := newTestStore(t)
	invalid := DefaultNarratorRoleProfile()
	invalid.ModelSelection.ModelID = nil

	_, err := store.ReadEffectiveRoleProfile(context.Background(), "workspace-1", "conversation-1", invalid)
	if err == nil || errors.Is(err, ErrConversationNotFound) {
		t.Fatalf("invalid built-in error = %v, want direct validation failure", err)
	}
	if _, err := store.ReadEffectiveRoleProfile(nil, "workspace-1", "conversation-1", DefaultNarratorRoleProfile()); err == nil {
		t.Fatal("nil role profile read context succeeded")
	}
}

func assertEffectiveRoleProfileModel(
	t *testing.T,
	store *Store,
	topic TopicConversation,
	builtIn RoleProfile,
	wantModel string,
) RoleProfile {
	t.Helper()
	profile, err := store.ReadEffectiveRoleProfile(
		context.Background(),
		topic.WorkspaceID,
		topic.ID,
		builtIn,
	)
	if err != nil {
		t.Fatalf("ReadEffectiveRoleProfile: %v", err)
	}
	if profile.ModelSelection.ModelID == nil || *profile.ModelSelection.ModelID != wantModel {
		t.Fatalf("effective role profile model = %v, want %s", profile.ModelSelection.ModelID, wantModel)
	}
	return profile
}

func narratorOverride(
	scope RoleProfileScopeKind,
	scopeID string,
	modelID string,
	effort ReasoningEffort,
) RoleProfileOverride {
	profile := DefaultNarratorRoleProfile()
	profile.ModelSelection = ModelSelection{Mode: ModelSelectionExact, ModelID: &modelID}
	profile.ReasoningEffort = effort
	return RoleProfileOverride{
		ScopeKind: scope,
		ScopeID:   scopeID,
		Profile:   profile,
		UpdatedAt: testTimeStarted,
	}
}

func persistRoleProfileTestMutation(
	t *testing.T,
	store *Store,
	eventID string,
	mutation func(*WriteTransaction) error,
) {
	t.Helper()
	_, err := store.Transact(context.Background(), eventID, func(transaction *WriteTransaction) error {
		if err := mutation(transaction); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			eventID,
			"role-profile-tests",
			map[string]string{"mutation": eventID},
		))
		return err
	})
	if err != nil {
		t.Fatalf("%s: %v", eventID, err)
	}
}
