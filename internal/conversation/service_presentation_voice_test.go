package conversation

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"setta/internal/speech"
	"setta/internal/workspaceui/conversationpalette"
)

func TestServiceAppliesPersistedNarratorVoiceDefaultToNewConversations(t *testing.T) {
	store, service, _, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownCtx)
		_ = store.Close()
	})
	existing, err := service.CreateTopic(context.Background(), workspaceID, "Existing automatic voice")
	if err != nil {
		t.Fatalf("create existing automatic topic: %v", err)
	}
	assertNarratorVoice(
		t,
		existing.PresentationProfile,
		speech.VoiceSelectionAutoDistinct,
		speech.SpeechVoiceAlloy,
		nil,
	)
	alloy := speech.SpeechVoiceAlloy
	if _, err := store.UpdateNarratorVoiceDefault(
		context.Background(),
		speech.VoiceSelectionRequest{
			Selection:        speech.VoiceSelectionExact,
			RequestedVoiceID: &alloy,
		},
		"2026-07-11T20:00:01Z",
	); err != nil {
		t.Fatalf("update narrator voice default: %v", err)
	}
	exact, err := service.CreateTopic(context.Background(), workspaceID, "Exact default voice")
	if err != nil {
		t.Fatalf("create exact-default topic: %v", err)
	}
	assertNarratorVoice(t, exact.PresentationProfile, speech.VoiceSelectionExact, alloy, nil)
	if exact.PresentationProfile.RequestedNarratorVoiceID == nil ||
		*exact.PresentationProfile.RequestedNarratorVoiceID != alloy {
		t.Fatalf("exact default profile = %+v", exact.PresentationProfile)
	}
	existingAfter, err := service.ReadSnapshot(
		context.Background(),
		workspaceID,
		existing.Conversation.ID,
	)
	if err != nil {
		t.Fatalf("read reassigned existing topic: %v", err)
	}
	assertNarratorVoice(
		t,
		existingAfter.PresentationProfile,
		speech.VoiceSelectionAutoDistinct,
		speech.SpeechVoiceAsh,
		nil,
	)
	if _, err := store.UpdateNarratorVoiceDefault(
		context.Background(),
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionAutoDistinct},
		"2026-07-11T20:00:02Z",
	); err != nil {
		t.Fatalf("restore automatic narrator default: %v", err)
	}
	automatic, err := service.CreateTopic(context.Background(), workspaceID, "Automatic default voice")
	if err != nil {
		t.Fatalf("create automatic-default topic: %v", err)
	}
	assertNarratorVoice(
		t,
		automatic.PresentationProfile,
		speech.VoiceSelectionAutoDistinct,
		speech.SpeechVoiceBallad,
		nil,
	)
}

func TestServiceKeepsAutomaticMasterDistinctFromExactNarratorDefaultAtCreation(t *testing.T) {
	store, service, _, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownCtx)
		_ = store.Close()
	})
	ctx := context.Background()
	master, err := store.UpdateMasterVoiceSelection(
		ctx,
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionAutoDistinct},
		"2026-07-11T20:00:01Z",
	)
	if err != nil {
		t.Fatalf("set automatic master voice: %v", err)
	}
	if master.ResolvedVoiceID == nil || *master.ResolvedVoiceID != speech.SpeechVoiceAlloy {
		t.Fatalf("automatic master selection = %+v", master)
	}
	alloy := speech.SpeechVoiceAlloy
	if _, err := store.UpdateNarratorVoiceDefault(
		ctx,
		speech.VoiceSelectionRequest{
			Selection:        speech.VoiceSelectionExact,
			RequestedVoiceID: &alloy,
		},
		"2026-07-11T20:00:02Z",
	); err != nil {
		t.Fatalf("set exact narrator default: %v", err)
	}

	created, err := service.CreateTopic(ctx, workspaceID, "Exact default conflicts with master")
	if err != nil {
		t.Fatalf("create exact-default topic: %v", err)
	}
	assertNarratorVoice(t, created.PresentationProfile, speech.VoiceSelectionExact, alloy, nil)
	master, err = store.ReadMasterVoiceSelection(ctx)
	if err != nil {
		t.Fatalf("read reassigned automatic master: %v", err)
	}
	if master.Selection != speech.VoiceSelectionAutoDistinct ||
		master.ResolvedVoiceID == nil ||
		*master.ResolvedVoiceID != speech.SpeechVoiceAsh ||
		master.Reuse != nil {
		t.Fatalf("reassigned automatic master selection = %+v", master)
	}
}

func TestServiceUpdatesPaletteAndNarratorSpeechAsOnePersistedPresentation(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, _, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx := context.Background()
	alpha := createPresentationTestTopic(t, ctx, service, workspaceID, "Alpha presentation")
	beta := createPresentationTestTopic(t, ctx, service, workspaceID, "Beta presentation")
	settings := PresentationSettingsForProfile(alpha.PresentationProfile)
	settings.PaletteSelection = PresentationSelectionRequest{
		Selection:          PresentationSelectionExact,
		RequestedPaletteID: paletteIDPointer(conversationpalette.ConversationPaletteBlue),
	}
	settings.NarratorSpeechEnabled = false
	updated := updatePresentationForTest(t, ctx, service, workspaceID, alpha.Conversation.ID, settings)
	assertExactBluePresentation(t, updated)
	betaAfter := readPresentationTestSnapshot(t, ctx, service, workspaceID, beta.Conversation.ID)
	assertAutomaticSkyPresentation(t, betaAfter.PresentationProfile)
	repeated := updatePresentationForTest(t, ctx, service, workspaceID, alpha.Conversation.ID, settings)
	if repeated.UpdatedAt != updated.UpdatedAt {
		t.Fatalf("idempotent presentation update = %+v", repeated)
	}

	reopened := restartPresentationTestStore(t, appDataDir, service, store)
	restored := readPresentationTestSnapshot(t, ctx, reopened, workspaceID, alpha.Conversation.ID)
	assertExactBluePresentation(t, restored.PresentationProfile)
}

type presentationSnapshotReader interface {
	ReadSnapshot(context.Context, string, string) (ConversationSnapshot, error)
}

func createPresentationTestTopic(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	title string,
) ConversationSnapshot {
	t.Helper()
	created, err := service.CreateTopic(ctx, workspaceID, title)
	if err != nil {
		t.Fatalf("create %q: %v", title, err)
	}
	return created
}

func updatePresentationForTest(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	conversationID string,
	settings ConversationPresentationSettings,
) ConversationPresentationProfile {
	t.Helper()
	updated, err := service.UpdatePresentationProfile(ctx, workspaceID, conversationID, settings)
	if err != nil {
		t.Fatalf("update presentation: %v", err)
	}
	return updated
}

func readPresentationTestSnapshot(
	t *testing.T,
	ctx context.Context,
	reader presentationSnapshotReader,
	workspaceID string,
	conversationID string,
) ConversationSnapshot {
	t.Helper()
	snapshot, err := reader.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil {
		t.Fatalf("read presentation snapshot: %v", err)
	}
	return snapshot
}

func assertExactBluePresentation(t *testing.T, profile ConversationPresentationProfile) {
	t.Helper()
	if profile.PaletteSelection != PresentationSelectionExact ||
		profile.RequestedPaletteID == nil ||
		*profile.RequestedPaletteID != conversationpalette.ConversationPaletteBlue ||
		profile.ResolvedPaletteID != conversationpalette.ConversationPaletteBlue ||
		profile.PaletteReuse != nil || profile.NarratorSpeechEnabled {
		t.Fatalf("exact blue presentation = %+v", profile)
	}
}

func assertAutomaticSkyPresentation(t *testing.T, profile ConversationPresentationProfile) {
	t.Helper()
	if profile.PaletteSelection != PresentationSelectionAutoDistinct ||
		profile.ResolvedPaletteID != conversationpalette.ConversationPaletteSky ||
		profile.PaletteReuse != nil {
		t.Fatalf("automatic sky presentation = %+v", profile)
	}
}

func restartPresentationTestStore(
	t *testing.T,
	appDataDir string,
	service *Service,
	store *Store,
) *Store {
	t.Helper()
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
	return reopened
}

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

	updated, err := updateTestNarratorVoiceSelection(
		t,
		ctx,
		service,
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
	_, err = updateTestNarratorVoiceSelection(
		t,
		ctx,
		service,
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

	automatic, err := updateTestNarratorVoiceSelection(
		t,
		ctx,
		service,
		workspaceID,
		alpha.Conversation.ID,
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionAutoDistinct},
	)
	if err != nil {
		t.Fatalf("restore automatic alpha voice: %v", err)
	}
	assertNarratorVoice(t, automatic, speech.VoiceSelectionAutoDistinct, speech.SpeechVoiceAsh, nil)
	repeated, err := updateTestNarratorVoiceSelection(
		t,
		ctx,
		service,
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

func TestExactNarratorOverrideReassignsAutomaticMasterAndPersists(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, _, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx := context.Background()
	alpha, err := service.CreateTopic(ctx, workspaceID, "Alpha claims master voice")
	if err != nil {
		t.Fatalf("create alpha: %v", err)
	}
	if _, err := service.CreateTopic(ctx, workspaceID, "Beta keeps narrator voice"); err != nil {
		t.Fatalf("create beta: %v", err)
	}
	automaticMaster, err := store.UpdateMasterVoiceSelection(
		ctx,
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionAutoDistinct},
		"2026-07-11T21:00:00Z",
	)
	if err != nil {
		t.Fatalf("make master automatic: %v", err)
	}
	if automaticMaster.ResolvedVoiceID == nil || *automaticMaster.ResolvedVoiceID != speech.SpeechVoiceBallad {
		t.Fatalf("automatic master selection = %+v", automaticMaster)
	}

	updated, err := updateTestNarratorVoiceSelection(
		t,
		ctx,
		service,
		workspaceID,
		alpha.Conversation.ID,
		speech.VoiceSelectionRequest{
			Selection:        speech.VoiceSelectionExact,
			RequestedVoiceID: voiceIDPointer(*automaticMaster.ResolvedVoiceID),
		},
	)
	if err != nil {
		t.Fatalf("set exact narrator to automatic master voice: %v", err)
	}
	assertNarratorVoice(
		t,
		updated,
		speech.VoiceSelectionExact,
		speech.SpeechVoiceBallad,
		nil,
	)
	reassignedMaster, err := store.ReadMasterVoiceSelection(ctx)
	if err != nil {
		t.Fatalf("read reassigned automatic master: %v", err)
	}
	if reassignedMaster.Selection != speech.VoiceSelectionAutoDistinct ||
		reassignedMaster.ResolvedVoiceID == nil ||
		*reassignedMaster.ResolvedVoiceID != speech.SpeechVoiceAlloy ||
		reassignedMaster.Reuse != nil {
		t.Fatalf("reassigned automatic master = %+v", reassignedMaster)
	}
	assertMasterVoiceUpdateReason(
		t,
		store,
		3,
		speech.MasterVoiceSelectionUpdateNarratorOverride,
	)

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
		t.Fatalf("read restored automatic master: %v", err)
	}
	if restored.ResolvedVoiceID == nil || *restored.ResolvedVoiceID != speech.SpeechVoiceAlloy {
		t.Fatalf("restored automatic master = %+v", restored)
	}
}

func assertMasterVoiceUpdateReason(
	t *testing.T,
	store *Store,
	wantEventCount int,
	wantReason speech.MasterVoiceSelectionUpdateReason,
) {
	t.Helper()
	events, err := store.ReadCommittedStreamEvents(
		context.Background(),
		speech.MasterVoiceSelectionStreamID,
		0,
		10,
	)
	if err != nil {
		t.Fatalf("read master voice events: %v", err)
	}
	if len(events) != wantEventCount {
		t.Fatalf("master voice events = %+v", events)
	}
	var update speech.MasterVoiceSelectionUpdate
	if err := json.Unmarshal(events[len(events)-1].Payload, &update); err != nil {
		t.Fatalf("decode master voice update: %v", err)
	}
	if update.Reason != wantReason {
		t.Fatalf("master voice update reason = %q, want %q", update.Reason, wantReason)
	}
}

func TestAutomaticMasterVoiceRecordsAndPersistsFiniteCatalogReuse(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, _, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx := context.Background()
	catalog := speech.SynthesisVoiceCatalog().VoiceIDs
	conversations := make([]ConversationSnapshot, 0, len(catalog))
	for index := range catalog {
		created, err := service.CreateTopic(ctx, workspaceID, fmt.Sprintf("Exact voice %02d", index+1))
		if err != nil {
			t.Fatalf("create exact voice topic %d: %v", index+1, err)
		}
		conversations = append(conversations, created)
	}
	for index, voiceID := range catalog {
		if _, err := updateTestNarratorVoiceSelection(
			t,
			ctx,
			service,
			workspaceID,
			conversations[index].Conversation.ID,
			speech.VoiceSelectionRequest{
				Selection:        speech.VoiceSelectionExact,
				RequestedVoiceID: voiceIDPointer(voiceID),
			},
		); err != nil {
			t.Fatalf("set exact narrator voice %s: %v", voiceID, err)
		}
	}
	updated, err := store.UpdateMasterVoiceSelection(
		ctx,
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionAutoDistinct},
		"2026-07-11T22:00:00Z",
	)
	if err != nil {
		t.Fatalf("update automatic master voice: %v", err)
	}
	if updated.ResolvedVoiceID == nil || *updated.ResolvedVoiceID != speech.SpeechVoiceAlloy ||
		updated.Reuse == nil || updated.Reuse.ResolvedVoiceID != speech.SpeechVoiceAlloy ||
		fmt.Sprint(updated.Reuse.ConflictingConversationIDs) != fmt.Sprint([]string{conversations[0].Conversation.ID}) {
		t.Fatalf("automatic master reuse = %+v", updated)
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
		t.Fatalf("read restored automatic master voice: %v", err)
	}
	if restored.Reuse == nil ||
		fmt.Sprint(restored.Reuse.ConflictingConversationIDs) != fmt.Sprint(updated.Reuse.ConflictingConversationIDs) {
		t.Fatalf("restored automatic master reuse = %+v, want %+v", restored, updated)
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

func updateTestNarratorVoiceSelection(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
	conversationID string,
	request speech.VoiceSelectionRequest,
) (ConversationPresentationProfile, error) {
	t.Helper()
	snapshot, err := service.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	settings := PresentationSettingsForProfile(snapshot.PresentationProfile)
	settings.NarratorVoiceSelection = request
	return service.UpdatePresentationProfile(ctx, workspaceID, conversationID, settings)
}

func paletteIDPointer(
	value conversationpalette.ConversationPaletteID,
) *conversationpalette.ConversationPaletteID {
	return &value
}
