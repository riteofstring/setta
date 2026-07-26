package director

import "testing"

func TestDuplicateConversationRecordRegistrationFailsLoudly(t *testing.T) {
	registration := ProjectorEvent{
		Sequence: 1,
		WorkstreamRecord: &WorkstreamRecordProjection{
			ID:             "conversation-01",
			EmittedAt:      "2026-07-24T12:00:01Z",
			WorkstreamID:   fixtureWorkstreamID("conv-solo"),
			ConversationID: "conv-solo",
			Title:          "Solo",
		},
	}
	projector := NewDirectorGraphProjector()
	if err := projector.Apply(registration); err != nil {
		t.Fatalf("registration: %v", err)
	}
	duplicate := registration
	duplicateRecord := *registration.WorkstreamRecord
	duplicateRecord.ID = "conversation-02"
	duplicateRecord.WorkstreamID = fixtureWorkstreamID("conv-other")
	duplicate.WorkstreamRecord = &duplicateRecord
	duplicate.Sequence = 2
	if err := projector.Apply(duplicate); err == nil {
		t.Fatal("expected a second workstream on the same conversation to fail")
	}
}

func TestSourceFactCoverageIncludesEveryNodeKind(t *testing.T) {
	if err := ValidateSourceFactCoverage(); err != nil {
		t.Fatalf("source fact coverage: %v", err)
	}
}
