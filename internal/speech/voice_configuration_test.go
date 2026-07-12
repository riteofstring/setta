package speech

import (
	"strings"
	"testing"
)

func TestSynthesisVoiceCatalogPreservesApprovedProviderOrder(t *testing.T) {
	want := []SpeechVoiceID{
		SpeechVoiceAlloy,
		SpeechVoiceAsh,
		SpeechVoiceBallad,
		SpeechVoiceCoral,
		SpeechVoiceEcho,
		SpeechVoiceFable,
		SpeechVoiceOnyx,
		SpeechVoiceNova,
		SpeechVoiceSage,
		SpeechVoiceShimmer,
		SpeechVoiceVerse,
		SpeechVoiceMarin,
		SpeechVoiceCedar,
	}
	catalog := SynthesisVoiceCatalog()
	if catalog.Provider != SpeechProviderOpenAI || catalog.Version != openAIContractSourceCommit {
		t.Fatalf("catalog identity = %+v", catalog)
	}
	if len(catalog.VoiceIDs) != len(want) {
		t.Fatalf("catalog voice count = %d, want %d", len(catalog.VoiceIDs), len(want))
	}
	for index, voiceID := range want {
		if catalog.VoiceIDs[index] != voiceID || !LookupVoice(voiceID) {
			t.Errorf("catalog[%d] = %q, want available %q", index, catalog.VoiceIDs[index], voiceID)
		}
	}
	catalog.VoiceIDs[0] = "mutated"
	if SynthesisVoiceCatalog().VoiceIDs[0] != SpeechVoiceAlloy {
		t.Fatal("catalog mutation escaped its returned copy")
	}
	if LookupVoice("missing") {
		t.Fatal("missing voice unexpectedly resolved")
	}
}

func TestVoiceSelectionsRequireTypedAvailableExactValues(t *testing.T) {
	exact := DefaultMasterVoiceSelection("2026-07-12T18:00:00Z")
	if err := exact.Validate(); err != nil {
		t.Fatalf("validate default master selection: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*MasterVoiceSelection)
		want   string
	}{
		{name: "mode", mutate: func(value *MasterVoiceSelection) { value.Selection = "unknown" }, want: "unsupported"},
		{name: "requested missing", mutate: func(value *MasterVoiceSelection) { value.RequestedVoiceID = nil }, want: "requires requested"},
		{name: "requested unavailable", mutate: func(value *MasterVoiceSelection) { value.RequestedVoiceID = voiceIDPointer("missing") }, want: "unavailable"},
		{name: "resolved missing", mutate: func(value *MasterVoiceSelection) { value.ResolvedVoiceID = nil }, want: "requires resolved"},
		{name: "resolved mismatch", mutate: func(value *MasterVoiceSelection) { value.ResolvedVoiceID = voiceIDPointer(SpeechVoiceCedar) }, want: "want requested"},
		{name: "timestamp", mutate: func(value *MasterVoiceSelection) { value.UpdatedAt = "2026-07-12T11:00:00-07:00" }, want: "canonical UTC"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value := exact
			test.mutate(&value)
			if err := value.Validate(); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want containing %q", err, test.want)
			}
		})
	}

	auto := MasterVoiceSelection{
		Selection: VoiceSelectionAutoDistinct,
		UpdatedAt: "2026-07-12T18:00:00Z",
	}
	if err := auto.Validate(); err != nil {
		t.Fatalf("validate unresolved automatic selection: %v", err)
	}
	auto.RequestedVoiceID = voiceIDPointer(SpeechVoiceAlloy)
	if err := auto.Validate(); err == nil || !strings.Contains(err.Error(), "must not contain requested") {
		t.Fatalf("automatic requested voice error = %v", err)
	}
}

func TestMasterVoiceInitializationValidatesAgainstItsHistoricalCatalog(t *testing.T) {
	initialization := NewMasterVoiceSelectionInitialization(
		DefaultMasterVoiceSelection("2026-07-12T18:00:00Z"),
	)
	if err := initialization.Validate(); err != nil {
		t.Fatalf("validate initialization: %v", err)
	}

	requested := SpeechVoiceID("retired")
	resolved := requested
	initialization.Catalog.Version = "historical-catalog"
	initialization.Catalog.VoiceIDs = []SpeechVoiceID{requested}
	initialization.Selection.RequestedVoiceID = &requested
	initialization.Selection.ResolvedVoiceID = &resolved
	if err := initialization.Validate(); err != nil {
		t.Fatalf("validate historical voice no longer in current catalog: %v", err)
	}

	initialization.Catalog.VoiceIDs = append(initialization.Catalog.VoiceIDs, requested)
	if err := initialization.Validate(); err == nil || !strings.Contains(err.Error(), "repeats") {
		t.Fatalf("duplicate historical voice error = %v", err)
	}
}

func voiceIDPointer(value SpeechVoiceID) *SpeechVoiceID {
	result := value
	return &result
}
