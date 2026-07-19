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
		speech.SpeechVoiceAlloy,
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
		speech.SpeechVoiceAlloy,
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
		*master.ResolvedVoiceID != speech.SpeechVoiceAlloy ||
		master.Reuse != nil {
		t.Fatalf("dormant exact narrator changed automatic master selection = %+v", master)
	}
	bindPresentationTopics(t, store, workspaceID, created)
	master, err = store.ReadMasterVoiceSelection(ctx)
	if err != nil {
		t.Fatalf("read active narrator master selection: %v", err)
	}
	if master.ResolvedVoiceID == nil || *master.ResolvedVoiceID != speech.SpeechVoiceAsh ||
		master.Reuse != nil {
		t.Fatalf("active exact narrator did not reassign automatic master = %+v", master)
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

func TestVisiblePresentationIdentitySurvivesPaneBindingsAndRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, _, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx := context.Background()
	alpha := createPresentationTestTopic(t, ctx, service, workspaceID, "Restart identity alpha")
	beta := createPresentationTestTopic(t, ctx, service, workspaceID, "Restart identity beta")
	bindings := []WorkspacePaneBinding{
		{PaneID: "pane-alpha-primary", ConversationID: alpha.Conversation.ID},
		{PaneID: "pane-beta", ConversationID: beta.Conversation.ID},
	}
	if err := store.ReplaceWorkspacePaneBindings(
		ctx,
		workspaceID,
		bindings,
		"2026-07-11T21:00:00Z",
	); err != nil {
		t.Fatalf("bind visible restart topics: %v", err)
	}
	alphaBefore := readPresentationTestSnapshot(t, ctx, service, workspaceID, alpha.Conversation.ID)
	betaBefore := readPresentationTestSnapshot(t, ctx, service, workspaceID, beta.Conversation.ID)
	if alphaBefore.PresentationProfile.ResolvedPaletteID == betaBefore.PresentationProfile.ResolvedPaletteID ||
		*alphaBefore.PresentationProfile.ResolvedNarratorVoiceID ==
			*betaBefore.PresentationProfile.ResolvedNarratorVoiceID {
		t.Fatalf("visible identities were not distinct: alpha=%+v beta=%+v", alphaBefore.PresentationProfile, betaBefore.PresentationProfile)
	}

	reopened := restartPresentationTestStore(t, appDataDir, service, store)
	if err := reopened.ReplaceWorkspacePaneBindings(
		ctx,
		workspaceID,
		bindings,
		"2026-07-11T22:00:00Z",
	); err != nil {
		t.Fatalf("restore pane bindings: %v", err)
	}
	alphaAfter := readPresentationTestSnapshot(t, ctx, reopened, workspaceID, alpha.Conversation.ID)
	betaAfter := readPresentationTestSnapshot(t, ctx, reopened, workspaceID, beta.Conversation.ID)
	assertStablePresentationIdentity(t, alphaBefore.PresentationProfile, alphaAfter.PresentationProfile)
	assertStablePresentationIdentity(t, betaBefore.PresentationProfile, betaAfter.PresentationProfile)
}

func TestDormantExactPresentationOverridesDoNotConsumeActiveIdentityCapacity(t *testing.T) {
	store, service, _, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownCtx)
		_ = store.Close()
	})
	ctx := context.Background()
	alpha := createPresentationTestTopic(t, ctx, service, workspaceID, "Active automatic alpha")
	beta := createPresentationTestTopic(t, ctx, service, workspaceID, "Active automatic beta")
	gamma := createPresentationTestTopic(t, ctx, service, workspaceID, "Dormant exact gamma")
	bindPresentationTopics(t, store, workspaceID, alpha, beta)
	alpha = readPresentationTestSnapshot(t, ctx, service, workspaceID, alpha.Conversation.ID)
	beta = readPresentationTestSnapshot(t, ctx, service, workspaceID, beta.Conversation.ID)
	alphaBefore := alpha.PresentationProfile
	betaBefore := beta.PresentationProfile

	settings := PresentationSettingsForProfile(gamma.PresentationProfile)
	settings.PaletteSelection = PresentationSelectionRequest{
		Selection:          PresentationSelectionExact,
		RequestedPaletteID: paletteIDPointer(alphaBefore.ResolvedPaletteID),
	}
	settings.NarratorVoiceSelection = speech.VoiceSelectionRequest{
		Selection:        speech.VoiceSelectionExact,
		RequestedVoiceID: cloneVoiceID(alphaBefore.ResolvedNarratorVoiceID),
	}
	gammaProfile := updatePresentationForTest(
		t,
		ctx,
		service,
		workspaceID,
		gamma.Conversation.ID,
		settings,
	)
	alphaAfterDormantOverride := readPresentationTestSnapshot(
		t,
		ctx,
		service,
		workspaceID,
		alpha.Conversation.ID,
	)
	betaAfterDormantOverride := readPresentationTestSnapshot(
		t,
		ctx,
		service,
		workspaceID,
		beta.Conversation.ID,
	)
	assertStablePresentationIdentity(t, alphaBefore, alphaAfterDormantOverride.PresentationProfile)
	assertStablePresentationIdentity(t, betaBefore, betaAfterDormantOverride.PresentationProfile)
	if gammaProfile.PaletteSelection != PresentationSelectionExact ||
		gammaProfile.ResolvedPaletteID != alphaBefore.ResolvedPaletteID ||
		gammaProfile.NarratorVoiceSelection != speech.VoiceSelectionExact ||
		gammaProfile.ResolvedNarratorVoiceID == nil ||
		*gammaProfile.ResolvedNarratorVoiceID != *alphaBefore.ResolvedNarratorVoiceID {
		t.Fatalf("dormant exact identity = %+v", gammaProfile)
	}

	bindPresentationTopics(t, store, workspaceID, alpha, beta, gamma)
	alphaAfterActivation := readPresentationTestSnapshot(
		t,
		ctx,
		service,
		workspaceID,
		alpha.Conversation.ID,
	)
	betaAfterActivation := readPresentationTestSnapshot(
		t,
		ctx,
		service,
		workspaceID,
		beta.Conversation.ID,
	)
	gammaAfterActivation := readPresentationTestSnapshot(
		t,
		ctx,
		service,
		workspaceID,
		gamma.Conversation.ID,
	)
	assertStablePresentationIdentity(t, betaBefore, betaAfterActivation.PresentationProfile)
	if gammaAfterActivation.PresentationProfile.ResolvedPaletteID != alphaBefore.ResolvedPaletteID ||
		gammaAfterActivation.PresentationProfile.ResolvedNarratorVoiceID == nil ||
		*gammaAfterActivation.PresentationProfile.ResolvedNarratorVoiceID !=
			*alphaBefore.ResolvedNarratorVoiceID {
		t.Fatalf("active exact identity moved = %+v", gammaAfterActivation.PresentationProfile)
	}
	if alphaAfterActivation.PresentationProfile.ResolvedPaletteID ==
		gammaAfterActivation.PresentationProfile.ResolvedPaletteID ||
		alphaAfterActivation.PresentationProfile.ResolvedPaletteID ==
			betaAfterActivation.PresentationProfile.ResolvedPaletteID ||
		alphaAfterActivation.PresentationProfile.ResolvedNarratorVoiceID == nil ||
		*alphaAfterActivation.PresentationProfile.ResolvedNarratorVoiceID ==
			*gammaAfterActivation.PresentationProfile.ResolvedNarratorVoiceID ||
		*alphaAfterActivation.PresentationProfile.ResolvedNarratorVoiceID ==
			*betaAfterActivation.PresentationProfile.ResolvedNarratorVoiceID {
		t.Fatalf(
			"automatic identity did not resolve exact activation deterministically: alpha=%+v beta=%+v gamma=%+v",
			alphaAfterActivation.PresentationProfile,
			betaAfterActivation.PresentationProfile,
			gammaAfterActivation.PresentationProfile,
		)
	}
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

func assertStablePresentationIdentity(
	t *testing.T,
	before ConversationPresentationProfile,
	after ConversationPresentationProfile,
) {
	t.Helper()
	if before.ResolvedPaletteID != after.ResolvedPaletteID ||
		!presentationReuseEqual(before.PaletteReuse, after.PaletteReuse) ||
		before.ResolvedNarratorVoiceID == nil || after.ResolvedNarratorVoiceID == nil ||
		*before.ResolvedNarratorVoiceID != *after.ResolvedNarratorVoiceID ||
		!presentationReuseEqual(before.NarratorVoiceReuse, after.NarratorVoiceReuse) ||
		before.UpdatedAt != after.UpdatedAt {
		t.Fatalf("presentation identity changed across restart: before=%+v after=%+v", before, after)
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
	assertNarratorVoice(t, beta.PresentationProfile, speech.VoiceSelectionAutoDistinct, speech.SpeechVoiceAlloy, nil)
	bindPresentationTopics(t, store, workspaceID, alpha, beta)
	alpha = readPresentationTestSnapshot(t, ctx, service, workspaceID, alpha.Conversation.ID)
	beta = readPresentationTestSnapshot(t, ctx, service, workspaceID, beta.Conversation.ID)
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
	allTopics := make([]ConversationSnapshot, 0, len(speech.SynthesisVoiceCatalog().VoiceIDs))
	for index := 0; index < len(speech.SynthesisVoiceCatalog().VoiceIDs); index++ {
		created, err := service.CreateTopic(ctx, workspaceID, fmt.Sprintf("Voice topic %02d", index+1))
		if err != nil {
			t.Fatalf("create topic %d: %v", index+1, err)
		}
		if index == 0 {
			first = created
		}
		allTopics = append(allTopics, created)
		exhausted = created
	}
	if exhausted.PresentationProfile.NarratorVoiceReuse != nil {
		t.Fatalf("dormant narrator reported false catalog exhaustion: %+v", exhausted.PresentationProfile)
	}
	bindPresentationTopics(t, store, workspaceID, allTopics...)
	exhausted = readPresentationTestSnapshot(t, ctx, service, workspaceID, exhausted.Conversation.ID)
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
	bindPresentationTopics(t, store, workspaceID, allTopics[1:]...)
	relieved := readPresentationTestSnapshot(t, ctx, service, workspaceID, exhausted.Conversation.ID)
	assertNarratorVoice(
		t,
		relieved.PresentationProfile,
		speech.VoiceSelectionAutoDistinct,
		speech.SpeechVoiceAlloy,
		nil,
	)
}

func TestServiceReleasesDormantNarratorVoiceReuseWithUnobservedTerminalBacklog(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownCtx)
		_ = store.Close()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	catalog := speech.SynthesisVoiceCatalog().VoiceIDs
	allTopics := make([]ConversationSnapshot, 0, len(catalog))
	for index := range catalog {
		allTopics = append(
			allTopics,
			createPresentationTestTopic(
				t,
				ctx,
				service,
				workspaceID,
				fmt.Sprintf("Dormant backlog voice pressure %02d", index+1),
			),
		)
	}
	exhausted := allTopics[len(allTopics)-1]
	bindPresentationTopics(t, store, workspaceID, allTopics...)
	exhausted = readPresentationTestSnapshot(t, ctx, service, workspaceID, exhausted.Conversation.ID)
	if exhausted.PresentationProfile.NarratorVoiceReuse == nil {
		t.Fatalf("active narrator catalog pressure did not create reuse: %+v", exhausted.PresentationProfile)
	}

	const input = "hold"
	if _, err := service.sendTestTurn(ctx, workspaceID, exhausted.Conversation.ID, input); err != nil {
		t.Fatalf("start exhausted narrator backlog turn: %v", err)
	}
	runtime.waitForStart(t, input)
	if _, err := service.StopTurn(ctx, workspaceID, exhausted.Conversation.ID); err != nil {
		t.Fatalf("stop exhausted narrator backlog turn: %v", err)
	}
	stopped := assertServiceSnapshot(
		t,
		service,
		workspaceID,
		exhausted.Conversation.ID,
		func(snapshot ConversationSnapshot) bool {
			return snapshot.Conversation.Status == ConversationStatusIdle
		},
	)
	if stopped.NarratorState.ObservedThroughSequence >= stopped.Conversation.LastTrajectorySequence {
		t.Fatalf(
			"test did not create unobserved terminal backlog: narrator=%+v conversation=%+v",
			stopped.NarratorState,
			stopped.Conversation,
		)
	}

	bindPresentationTopics(t, store, workspaceID, allTopics[:len(allTopics)-1]...)
	relieved := readPresentationTestSnapshot(t, ctx, service, workspaceID, exhausted.Conversation.ID)
	if relieved.NarratorState.ObservedThroughSequence >= relieved.Conversation.LastTrajectorySequence {
		t.Fatalf(
			"test unexpectedly consumed narrator backlog: narrator=%+v conversation=%+v",
			relieved.NarratorState,
			relieved.Conversation,
		)
	}
	assertNarratorVoice(
		t,
		relieved.PresentationProfile,
		speech.VoiceSelectionAutoDistinct,
		speech.SpeechVoiceAlloy,
		nil,
	)
}

func TestServiceAllocatesVoicesOnlyToActivePaneFreeNarrators(t *testing.T) {
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownCtx)
		_ = store.Close()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	alpha := createPresentationTestTopic(t, ctx, service, workspaceID, "Pane-free active alpha")
	beta := createPresentationTestTopic(t, ctx, service, workspaceID, "Pane-free active beta")
	for index := 0; index < len(speech.SynthesisVoiceCatalog().VoiceIDs)+2; index++ {
		created := createPresentationTestTopic(
			t,
			ctx,
			service,
			workspaceID,
			fmt.Sprintf("Dormant voice pressure %02d", index+1),
		)
		assertNarratorVoice(
			t,
			created.PresentationProfile,
			speech.VoiceSelectionAutoDistinct,
			speech.SpeechVoiceAlloy,
			nil,
		)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, alpha.Conversation.ID, "hold"); err != nil {
		t.Fatalf("start pane-free alpha: %v", err)
	}
	runtime.waitForStart(t, "hold")
	if _, err := service.sendTestTurn(ctx, workspaceID, beta.Conversation.ID, "hold"); err != nil {
		t.Fatalf("start pane-free beta: %v", err)
	}
	runtime.waitForStart(t, "hold")
	alpha = readPresentationTestSnapshot(t, ctx, service, workspaceID, alpha.Conversation.ID)
	beta = readPresentationTestSnapshot(t, ctx, service, workspaceID, beta.Conversation.ID)
	assertNarratorVoice(
		t,
		alpha.PresentationProfile,
		speech.VoiceSelectionAutoDistinct,
		speech.SpeechVoiceAlloy,
		nil,
	)
	assertNarratorVoice(
		t,
		beta.PresentationProfile,
		speech.VoiceSelectionAutoDistinct,
		speech.SpeechVoiceAsh,
		nil,
	)
	if _, err := service.StopTurn(ctx, workspaceID, alpha.Conversation.ID); err != nil {
		t.Fatalf("stop pane-free alpha: %v", err)
	}
	assertServiceSnapshot(t, service, workspaceID, alpha.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusIdle
	})
	beta = readPresentationTestSnapshot(t, ctx, service, workspaceID, beta.Conversation.ID)
	assertNarratorVoice(
		t,
		beta.PresentationProfile,
		speech.VoiceSelectionAutoDistinct,
		speech.SpeechVoiceAsh,
		nil,
	)
	if _, err := service.StopTurn(ctx, workspaceID, beta.Conversation.ID); err != nil {
		t.Fatalf("stop pane-free beta: %v", err)
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
	bindPresentationTopics(t, store, workspaceID, alpha, beta)
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
	beta, err := service.CreateTopic(ctx, workspaceID, "Beta keeps narrator voice")
	if err != nil {
		t.Fatalf("create beta: %v", err)
	}
	bindPresentationTopics(t, store, workspaceID, alpha, beta)
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
	bindPresentationTopics(t, store, workspaceID, conversations...)
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

func bindPresentationTopics(
	t *testing.T,
	store *Store,
	workspaceID string,
	topics ...ConversationSnapshot,
) {
	t.Helper()
	bindings := make([]WorkspacePaneBinding, 0, len(topics))
	for index, topic := range topics {
		bindings = append(bindings, WorkspacePaneBinding{
			PaneID:         fmt.Sprintf("pane-presentation-%02d", index+1),
			ConversationID: topic.Conversation.ID,
		})
	}
	if err := store.ReplaceWorkspacePaneBindings(
		context.Background(),
		workspaceID,
		bindings,
		"2026-07-11T23:00:00Z",
	); err != nil {
		t.Fatalf("bind presentation topics: %v", err)
	}
}

func paletteIDPointer(
	value conversationpalette.ConversationPaletteID,
) *conversationpalette.ConversationPaletteID {
	return &value
}
