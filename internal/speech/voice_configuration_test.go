package speech

import (
	"fmt"
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
	exact := DefaultDirectorVoiceSelection("2026-07-12T18:00:00Z")
	if err := exact.Validate(); err != nil {
		t.Fatalf("validate default director selection: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*DirectorVoiceSelection)
		want   string
	}{
		{name: "mode", mutate: func(value *DirectorVoiceSelection) { value.Selection = "unknown" }, want: "unsupported"},
		{name: "requested missing", mutate: func(value *DirectorVoiceSelection) { value.RequestedVoiceID = nil }, want: "requires requested"},
		{name: "requested unavailable", mutate: func(value *DirectorVoiceSelection) { value.RequestedVoiceID = voiceIDPointer("missing") }, want: "not available"},
		{name: "resolved missing", mutate: func(value *DirectorVoiceSelection) { value.ResolvedVoiceID = nil }, want: "requires resolved"},
		{name: "resolved mismatch", mutate: func(value *DirectorVoiceSelection) { value.ResolvedVoiceID = voiceIDPointer(SpeechVoiceCedar) }, want: "want requested"},
		{name: "exact reuse", mutate: func(value *DirectorVoiceSelection) {
			value.Reuse = VoiceReuseForAssignments(SpeechVoiceMarin, []NarratorVoiceAssignment{{ConversationID: "conversation-a", VoiceID: SpeechVoiceMarin}})
		}, want: "must not contain"},
		{name: "timestamp", mutate: func(value *DirectorVoiceSelection) { value.UpdatedAt = "2026-07-12T11:00:00-07:00" }, want: "canonical UTC"},
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

	auto := DirectorVoiceSelection{
		Selection: VoiceSelectionAutoDistinct,
		UpdatedAt: "2026-07-12T18:00:00Z",
	}
	if err := auto.Validate(); err == nil || !strings.Contains(err.Error(), "requires resolved") {
		t.Fatalf("unresolved automatic selection error = %v", err)
	}
	auto.RequestedVoiceID = voiceIDPointer(SpeechVoiceAlloy)
	if err := auto.Validate(); err == nil || !strings.Contains(err.Error(), "must not contain requested") {
		t.Fatalf("automatic requested voice error = %v", err)
	}
}

func TestNarratorVoiceDefaultIsExplicitValidatedAndCloneSafe(t *testing.T) {
	value := DefaultNarratorVoiceSelection("2026-07-12T18:00:00Z")
	if value.Selection != VoiceSelectionAutoDistinct || value.RequestedVoiceID != nil {
		t.Fatalf("default narrator voice = %+v", value)
	}
	if err := value.Validate(); err != nil {
		t.Fatalf("validate default narrator voice: %v", err)
	}
	cedar := SpeechVoiceCedar
	value.Selection = VoiceSelectionExact
	value.RequestedVoiceID = &cedar
	if err := value.Validate(); err != nil {
		t.Fatalf("validate exact narrator default: %v", err)
	}
	cloned := CloneNarratorVoiceDefault(value)
	*cloned.RequestedVoiceID = SpeechVoiceAsh
	if *value.RequestedVoiceID != SpeechVoiceCedar {
		t.Fatalf("narrator voice default clone mutated source: %+v", value)
	}
	update := NewNarratorVoiceDefaultUpdate(value, NarratorVoiceDefault{
		Selection: VoiceSelectionAutoDistinct,
		UpdatedAt: "2026-07-12T18:00:01Z",
	})
	if err := update.Validate(); err != nil {
		t.Fatalf("validate narrator default update: %v", err)
	}
}

func TestNarratorVoiceAllocationIsDistinctStableAndExplicitOnExhaustion(t *testing.T) {
	catalog := []SpeechVoiceID{SpeechVoiceAlloy, SpeechVoiceAsh, SpeechVoiceMarin}
	first, err := allocateNarratorVoice(catalog, SpeechVoiceMarin, nil, nil)
	if err != nil || first.VoiceID != SpeechVoiceAlloy || first.Reuse != nil {
		t.Fatalf("first allocation = %+v, err=%v", first, err)
	}
	second, err := allocateNarratorVoice(catalog, SpeechVoiceMarin, []NarratorVoiceAssignment{{
		ConversationID: "conversation-a",
		VoiceID:        first.VoiceID,
	}}, nil)
	if err != nil || second.VoiceID != SpeechVoiceAsh || second.Reuse != nil {
		t.Fatalf("second allocation = %+v, err=%v", second, err)
	}
	exhausted, err := allocateNarratorVoice(catalog, SpeechVoiceMarin, []NarratorVoiceAssignment{
		{ConversationID: "conversation-b", VoiceID: second.VoiceID},
		{ConversationID: "conversation-a", VoiceID: first.VoiceID},
	}, nil)
	if err != nil || exhausted.VoiceID != SpeechVoiceAlloy || exhausted.Reuse == nil {
		t.Fatalf("exhausted allocation = %+v, err=%v", exhausted, err)
	}
	if got := strings.Join(exhausted.Reuse.ConflictingConversationIDs, ","); got != "conversation-a" {
		t.Fatalf("reuse conflicts = %q, want conversation-a", got)
	}
	if exhausted.Reuse.Reason != VoiceReuseCatalogExhausted {
		t.Fatalf("reuse reason = %q", exhausted.Reuse.Reason)
	}
}

func TestVoiceSelectionRequestsFailSpecificallyForUnavailableExactVoices(t *testing.T) {
	missing := SpeechVoiceID("retired")
	err := (VoiceSelectionRequest{
		Selection:        VoiceSelectionExact,
		RequestedVoiceID: &missing,
	}).Validate()
	speechError, ok := AsError(err)
	if !ok || speechError.Code != ErrorVoiceUnavailable || !strings.Contains(err.Error(), "retired") {
		t.Fatalf("unavailable exact voice error = %T %v", err, err)
	}

	resolved, err := ResolveDirectorVoiceSelection(
		VoiceSelectionRequest{Selection: VoiceSelectionAutoDistinct},
		[]NarratorVoiceAssignment{{ConversationID: "conversation-a", VoiceID: SpeechVoiceAlloy}},
		"2026-07-12T18:00:00Z",
	)
	if err != nil || resolved.ResolvedVoiceID == nil || *resolved.ResolvedVoiceID != SpeechVoiceAsh {
		t.Fatalf("automatic director selection = %+v, err=%v", resolved, err)
	}
	assignments := make([]NarratorVoiceAssignment, 0, len(SynthesisVoiceCatalog().VoiceIDs))
	for index, voiceID := range SynthesisVoiceCatalog().VoiceIDs {
		assignments = append(assignments, NarratorVoiceAssignment{
			ConversationID: fmt.Sprintf("conversation-%02d", index),
			VoiceID:        voiceID,
		})
	}
	exhausted, err := ResolveDirectorVoiceSelection(
		VoiceSelectionRequest{Selection: VoiceSelectionAutoDistinct},
		assignments,
		"2026-07-12T18:00:00Z",
	)
	if err != nil || exhausted.ResolvedVoiceID == nil || *exhausted.ResolvedVoiceID != SpeechVoiceAlloy ||
		exhausted.Reuse == nil || len(exhausted.Reuse.ConflictingConversationIDs) != 1 ||
		exhausted.Reuse.ConflictingConversationIDs[0] != "conversation-00" {
		t.Fatalf("exhausted automatic director selection = %+v, err=%v", exhausted, err)
	}
}

func TestAutomaticDirectorRefreshPrefersStabilityUntilDistinctnessRequiresChange(t *testing.T) {
	previous, err := ResolveDirectorVoiceSelection(
		VoiceSelectionRequest{Selection: VoiceSelectionAutoDistinct},
		[]NarratorVoiceAssignment{{ConversationID: "conversation-a", VoiceID: SpeechVoiceAlloy}},
		"2026-07-12T18:00:00Z",
	)
	if err != nil || previous.ResolvedVoiceID == nil || *previous.ResolvedVoiceID != SpeechVoiceAsh {
		t.Fatalf("initial automatic director = %+v, err=%v", previous, err)
	}
	stable, changed, err := RefreshAutomaticDirectorVoiceSelection(
		previous,
		[]NarratorVoiceAssignment{{ConversationID: "conversation-a", VoiceID: SpeechVoiceAlloy}},
		"2026-07-12T18:01:00Z",
	)
	if err != nil || changed || stable.UpdatedAt != previous.UpdatedAt ||
		stable.ResolvedVoiceID == nil || *stable.ResolvedVoiceID != SpeechVoiceAsh {
		t.Fatalf("stable automatic director = %+v, changed=%v, err=%v", stable, changed, err)
	}
	refreshed, changed, err := RefreshAutomaticDirectorVoiceSelection(
		previous,
		[]NarratorVoiceAssignment{
			{ConversationID: "conversation-a", VoiceID: SpeechVoiceAlloy},
			{ConversationID: "conversation-b", VoiceID: SpeechVoiceAsh},
		},
		"2026-07-12T18:01:00Z",
	)
	if err != nil || !changed || refreshed.ResolvedVoiceID == nil ||
		*refreshed.ResolvedVoiceID != SpeechVoiceBallad || refreshed.Reuse != nil {
		t.Fatalf("refreshed automatic director = %+v, changed=%v, err=%v", refreshed, changed, err)
	}
}

func TestDirectorVoiceInitializationValidatesAgainstItsHistoricalCatalog(t *testing.T) {
	initialization := NewDirectorVoiceSelectionInitialization(
		DefaultDirectorVoiceSelection("2026-07-12T18:00:00Z"),
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
