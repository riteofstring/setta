package transcriptionprofiles

import (
	"os"
	"strings"
	"testing"
)

func TestStoreListReturnsEmptyWhenFileMissing(t *testing.T) {
	t.Parallel()

	store := newTranscriptionProfileTestStore(t)

	// Missing transcription profile files stay empty on first run; Go does not
	// auto-seed the old Python example profile set.
	profiles, err := store.List()
	if err != nil {
		t.Fatalf("list profiles: %v", err)
	}
	if len(profiles) != 0 {
		t.Fatalf("expected no profiles, got %#v", profiles)
	}
}

func TestStoreWriteListAndGetRoundTrip(t *testing.T) {
	t.Parallel()

	store := newTranscriptionProfileTestStore(t)
	language := " en "
	if err := store.Write([]Profile{
		{
			ID:                       "profile-1",
			Name:                     "OpenAI File",
			TranscriptionLLMConfigID: "openai-whisper-1",
			TransportMode:            TransportModeFile,
			ChunkMs:                  1200,
			Language:                 &language,
		},
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}

	profiles, err := store.List()
	if err != nil {
		t.Fatalf("list profiles: %v", err)
	}
	if len(profiles) != 1 {
		t.Fatalf("expected one profile, got %#v", profiles)
	}
	if profiles[0].Language == nil || *profiles[0].Language != "en" {
		t.Fatalf("expected trimmed language, got %#v", profiles[0])
	}

	profile, err := store.Get("profile-1")
	if err != nil {
		t.Fatalf("get profile: %v", err)
	}
	if profile.ID != "profile-1" {
		t.Fatalf("expected profile-1, got %#v", profile)
	}
}

func TestStoreRejectsInvalidPayload(t *testing.T) {
	t.Parallel()

	store := newTranscriptionProfileTestStore(t)
	if err := os.WriteFile(store.Path(), []byte(`{"id":"bad"}`), 0o644); err != nil {
		t.Fatalf("write invalid payload: %v", err)
	}

	_, err := store.List()
	if err == nil {
		t.Fatal("expected invalid payload error")
	}
	if !strings.Contains(err.Error(), "JSON array") {
		t.Fatalf("expected array error, got %v", err)
	}
}

func newTranscriptionProfileTestStore(t *testing.T) *Store {
	t.Helper()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return store
}
