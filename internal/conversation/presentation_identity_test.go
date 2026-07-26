package conversation

import (
	"context"
	"fmt"
	"testing"
	"time"

	"setta/internal/speech"
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

func TestServiceKeepsAutomaticDirectorDistinctFromExactNarratorDefaultAtCreation(t *testing.T) {
	store, service, _, workspaceID := newConversationServiceTestHarness(t, t.TempDir())
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = service.Shutdown(shutdownCtx)
		_ = store.Close()
	})
	ctx := context.Background()
	director, err := store.UpdateDirectorVoiceSelection(
		ctx,
		speech.VoiceSelectionRequest{Selection: speech.VoiceSelectionAutoDistinct},
		"2026-07-11T20:00:01Z",
	)
	if err != nil {
		t.Fatalf("set automatic director voice: %v", err)
	}
	if director.ResolvedVoiceID == nil || *director.ResolvedVoiceID != speech.SpeechVoiceAlloy {
		t.Fatalf("automatic director selection = %+v", director)
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

	created, err := service.CreateTopic(ctx, workspaceID, "Exact default conflicts with director")
	if err != nil {
		t.Fatalf("create exact-default topic: %v", err)
	}
	assertNarratorVoice(t, created.PresentationProfile, speech.VoiceSelectionExact, alloy, nil)
	director, err = store.ReadDirectorVoiceSelection(ctx)
	if err != nil {
		t.Fatalf("read reassigned automatic director: %v", err)
	}
	if director.Selection != speech.VoiceSelectionAutoDistinct ||
		director.ResolvedVoiceID == nil ||
		*director.ResolvedVoiceID != speech.SpeechVoiceAsh ||
		director.Reuse != nil {
		t.Fatalf("live exact narrator did not reassign automatic director = %+v", director)
	}
}

func TestVisiblePresentationIdentitySurvivesRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, _, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx := context.Background()
	alpha := createPresentationTestTopic(t, ctx, service, workspaceID, "Restart identity alpha")
	beta := createPresentationTestTopic(t, ctx, service, workspaceID, "Restart identity beta")
	alphaBefore := readPresentationTestSnapshot(t, ctx, service, workspaceID, alpha.Conversation.ID)
	betaBefore := readPresentationTestSnapshot(t, ctx, service, workspaceID, beta.Conversation.ID)
	if alphaBefore.PresentationProfile.ResolvedPaletteID == betaBefore.PresentationProfile.ResolvedPaletteID ||
		*alphaBefore.PresentationProfile.ResolvedNarratorVoiceID ==
			*betaBefore.PresentationProfile.ResolvedNarratorVoiceID {
		t.Fatalf("visible identities were not distinct: alpha=%+v beta=%+v", alphaBefore.PresentationProfile, betaBefore.PresentationProfile)
	}

	reopened := restartPresentationTestStore(t, appDataDir, service, store)
	alphaAfter := readPresentationTestSnapshot(t, ctx, reopened, workspaceID, alpha.Conversation.ID)
	betaAfter := readPresentationTestSnapshot(t, ctx, reopened, workspaceID, beta.Conversation.ID)
	assertStablePresentationIdentity(t, alphaBefore.PresentationProfile, alphaAfter.PresentationProfile)
	assertStablePresentationIdentity(t, betaBefore.PresentationProfile, betaAfter.PresentationProfile)
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
		t.Fatalf("exhausted narrator reused reserved director voice: %+v", exhausted.PresentationProfile)
	}
	archivePresentationTopics(t, service, workspaceID, allTopics[0])
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

	archivePresentationTopics(t, service, workspaceID, allTopics[len(allTopics)-1])
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

func TestDirectorVoiceOverrideReassignsConflictingAutomaticNarratorAndPersists(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, _, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx := context.Background()
	alpha, err := service.CreateTopic(ctx, workspaceID, "Alpha director collision")
	if err != nil {
		t.Fatalf("create alpha: %v", err)
	}
	beta, err := service.CreateTopic(ctx, workspaceID, "Beta director collision")
	if err != nil {
		t.Fatalf("create beta: %v", err)
	}
	updated, err := store.UpdateDirectorVoiceSelection(
		ctx,
		speech.VoiceSelectionRequest{
			Selection:        speech.VoiceSelectionExact,
			RequestedVoiceID: voiceIDPointer(speech.SpeechVoiceAlloy),
		},
		"2026-07-11T21:00:00Z",
	)
	if err != nil {
		t.Fatalf("update director voice: %v", err)
	}
	if updated.Selection != speech.VoiceSelectionExact ||
		updated.ResolvedVoiceID == nil || *updated.ResolvedVoiceID != speech.SpeechVoiceAlloy {
		t.Fatalf("updated director selection = %+v", updated)
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
		speech.DirectorVoiceSelectionStreamID,
		0,
		10,
	)
	if err != nil {
		t.Fatalf("read director voice events: %v", err)
	}
	if len(events) != 2 || events[1].Kind != speech.DirectorVoiceSelectionUpdatedEventKind {
		t.Fatalf("director voice events = %+v", events)
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
	restored, err := reopened.ReadDirectorVoiceSelection(ctx)
	if err != nil {
		t.Fatalf("read restored director voice: %v", err)
	}
	if restored.ResolvedVoiceID == nil || *restored.ResolvedVoiceID != speech.SpeechVoiceAlloy {
		t.Fatalf("restored director voice = %+v", restored)
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

func archivePresentationTopics(
	t *testing.T,
	service *Service,
	workspaceID string,
	topics ...ConversationSnapshot,
) {
	t.Helper()
	for _, topic := range topics {
		if _, err := service.ArchiveTopic(
			context.Background(),
			workspaceID,
			topic.Conversation.ID,
		); err != nil {
			t.Fatalf("archive presentation topic %s: %v", topic.Conversation.ID, err)
		}
	}
}
