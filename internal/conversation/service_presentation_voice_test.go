package conversation

import (
	"context"
	"fmt"
	"testing"
	"time"

	"setta/internal/speech"
)

func TestServiceAllocatesStableDistinctNarratorVoicesAndAppliesExactOverrides(t *testing.T) {
	store, service, _, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownCtx)
		_ = store.Close()
	})
	ctx := context.Background()
	alpha, err := service.CreateTopic(ctx, workspaceID, "Alpha voice")
	if err != nil {
		t.Fatalf("create alpha: %v", err)
	}
	beta, err := service.CreateTopic(ctx, workspaceID, "Beta voice")
	if err != nil {
		t.Fatalf("create beta: %v", err)
	}
	assertNarratorVoice(t, alpha.PresentationProfile, speech.VoiceSelectionAutoDistinct, speech.SpeechVoiceAlloy, nil)
	assertNarratorVoice(t, beta.PresentationProfile, speech.VoiceSelectionAutoDistinct, speech.SpeechVoiceAsh, nil)

	updated, err := service.UpdateNarratorVoiceSelection(
		ctx,
		workspaceID,
		alpha.Conversation.ID,
		speech.VoiceSelectionRequest{
			Selection:        speech.VoiceSelectionExact,
			RequestedVoiceID: voiceIDPointer(speech.SpeechVoiceAsh),
		},
	)
	if err != nil {
		t.Fatalf("set exact alpha voice: %v", err)
	}
	assertNarratorVoice(t, updated, speech.VoiceSelectionExact, speech.SpeechVoiceAsh, nil)
	betaAfter, err := service.ReadSnapshot(ctx, workspaceID, beta.Conversation.ID)
	if err != nil {
		t.Fatalf("read reassigned beta: %v", err)
	}
	assertNarratorVoice(t, betaAfter.PresentationProfile, speech.VoiceSelectionAutoDistinct, speech.SpeechVoiceAlloy, nil)

	missing := speech.SpeechVoiceID("retired")
	_, err = service.UpdateNarratorVoiceSelection(
		ctx,
		workspaceID,
		alpha.Conversation.ID,
		speech.VoiceSelectionRequest{
			Selection:        speech.VoiceSelectionExact,
			RequestedVoiceID: &missing,
		},
	)
	if speechError, ok := speech.AsError(err); !ok || speechError.Code != speech.ErrorVoiceUnavailable {
		t.Fatalf("unavailable exact override error = %T %v", err, err)
	}
	stable, err := service.ReadSnapshot(ctx, workspaceID, alpha.Conversation.ID)
	if err != nil {
		t.Fatalf("read stable alpha: %v", err)
	}
	assertNarratorVoice(t, stable.PresentationProfile, speech.VoiceSelectionExact, speech.SpeechVoiceAsh, nil)

	automatic, err := service.UpdateNarratorVoiceSelection(
		ctx,
		workspaceID,
		alpha.Conversation.ID,
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionAutoDistinct},
	)
	if err != nil {
		t.Fatalf("restore automatic alpha voice: %v", err)
	}
	assertNarratorVoice(t, automatic, speech.VoiceSelectionAutoDistinct, speech.SpeechVoiceAsh, nil)
	repeated, err := service.UpdateNarratorVoiceSelection(
		ctx,
		workspaceID,
		alpha.Conversation.ID,
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionAutoDistinct},
	)
	if err != nil {
		t.Fatalf("repeat automatic alpha voice: %v", err)
	}
	if repeated.UpdatedAt != automatic.UpdatedAt ||
		repeated.ResolvedNarratorVoiceID == nil ||
		*repeated.ResolvedNarratorVoiceID != *automatic.ResolvedNarratorVoiceID {
		t.Fatalf("automatic narrator assignment was not stable: before=%+v after=%+v", automatic, repeated)
	}
}

func TestServiceRecordsFiniteNarratorVoiceCatalogReuse(t *testing.T) {
	store, service, _, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownCtx)
		_ = store.Close()
	})
	ctx := context.Background()
	var first ConversationSnapshot
	var exhausted ConversationSnapshot
	for index := 0; index < len(speech.SynthesisVoiceCatalog().VoiceIDs); index++ {
		created, err := service.CreateTopic(ctx, workspaceID, fmt.Sprintf("Voice topic %02d", index+1))
		if err != nil {
			t.Fatalf("create topic %d: %v", index+1, err)
		}
		if index == 0 {
			first = created
		}
		exhausted = created
	}
	assertNarratorVoice(
		t,
		exhausted.PresentationProfile,
		speech.VoiceSelectionAutoDistinct,
		speech.SpeechVoiceAlloy,
		[]string{first.Conversation.ID},
	)
	if exhausted.PresentationProfile.ResolvedNarratorVoiceID == nil ||
		*exhausted.PresentationProfile.ResolvedNarratorVoiceID == speech.SpeechVoiceMarin {
		t.Fatalf("exhausted narrator reused reserved master voice: %+v", exhausted.PresentationProfile)
	}
}

func TestMasterVoiceOverrideReassignsConflictingAutomaticNarratorAndPersists(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, _, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx := context.Background()
	alpha, err := service.CreateTopic(ctx, workspaceID, "Alpha master collision")
	if err != nil {
		t.Fatalf("create alpha: %v", err)
	}
	beta, err := service.CreateTopic(ctx, workspaceID, "Beta master collision")
	if err != nil {
		t.Fatalf("create beta: %v", err)
	}
	updated, err := store.UpdateMasterVoiceSelection(
		ctx,
		speech.VoiceSelectionRequest{
			Selection:        speech.VoiceSelectionExact,
			RequestedVoiceID: voiceIDPointer(speech.SpeechVoiceAlloy),
		},
		"2026-07-11T21:00:00Z",
	)
	if err != nil {
		t.Fatalf("update master voice: %v", err)
	}
	if updated.Selection != speech.VoiceSelectionExact ||
		updated.ResolvedVoiceID == nil || *updated.ResolvedVoiceID != speech.SpeechVoiceAlloy {
		t.Fatalf("updated master selection = %+v", updated)
	}
	alphaAfter, err := service.ReadSnapshot(ctx, workspaceID, alpha.Conversation.ID)
	if err != nil {
		t.Fatalf("read reassigned alpha: %v", err)
	}
	betaAfter, err := service.ReadSnapshot(ctx, workspaceID, beta.Conversation.ID)
	if err != nil {
		t.Fatalf("read stable beta: %v", err)
	}
	assertNarratorVoice(t, alphaAfter.PresentationProfile, speech.VoiceSelectionAutoDistinct, speech.SpeechVoiceBallad, nil)
	assertNarratorVoice(t, betaAfter.PresentationProfile, speech.VoiceSelectionAutoDistinct, speech.SpeechVoiceAsh, nil)
	events, err := store.ReadCommittedStreamEvents(
		ctx,
		speech.MasterVoiceSelectionStreamID,
		0,
		10,
	)
	if err != nil {
		t.Fatalf("read master voice events: %v", err)
	}
	if len(events) != 2 || events[1].Kind != speech.MasterVoiceSelectionUpdatedEventKind {
		t.Fatalf("master voice events = %+v", events)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := service.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("shutdown service: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}
	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	restored, err := reopened.ReadMasterVoiceSelection(ctx)
	if err != nil {
		t.Fatalf("read restored master voice: %v", err)
	}
	if restored.ResolvedVoiceID == nil || *restored.ResolvedVoiceID != speech.SpeechVoiceAlloy {
		t.Fatalf("restored master voice = %+v", restored)
	}
}

func assertNarratorVoice(
	t *testing.T,
	profile ConversationPresentationProfile,
	selection speech.VoiceSelectionMode,
	voiceID speech.SpeechVoiceID,
	conflicts []string,
) {
	t.Helper()
	if profile.NarratorVoiceSelection != selection ||
		profile.ResolvedNarratorVoiceID == nil ||
		*profile.ResolvedNarratorVoiceID != voiceID {
		t.Fatalf("narrator voice profile = %+v, want %s %s", profile, selection, voiceID)
	}
	if len(conflicts) == 0 {
		if profile.NarratorVoiceReuse != nil {
			t.Fatalf("unexpected narrator voice reuse = %+v", profile.NarratorVoiceReuse)
		}
		return
	}
	if profile.NarratorVoiceReuse == nil ||
		profile.NarratorVoiceReuse.Reason != PresentationReuseCatalogExhausted ||
		profile.NarratorVoiceReuse.ResolvedChoiceID != string(voiceID) ||
		fmt.Sprint(profile.NarratorVoiceReuse.ConflictingConversationIDs) != fmt.Sprint(conflicts) {
		t.Fatalf("narrator voice reuse = %+v, want conflicts %v", profile.NarratorVoiceReuse, conflicts)
	}
}
