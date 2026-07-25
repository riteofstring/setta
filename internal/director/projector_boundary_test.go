package director

import "testing"

func TestUnregisteredDirectorFactAndDuplicateRegistrationFailLoudly(t *testing.T) {
	registration := ProjectorEvent{
		Sequence: 1,
		Director: &DirectorFactEvent{
			ID:           "director-01",
			EmittedAt:    "2026-07-24T12:00:01Z",
			Kind:         DirectorFactWorkstreamRegistered,
			WorkstreamID: stringPointer("ws-solo"),
			Actor:        SemanticActorSystem,
			WorkstreamRegistered: &DirectorWorkstreamRegistered{
				Title:          "Solo",
				ConversationID: "conv-solo",
				ResourceScope:  folderlessScope(),
			},
		},
	}
	projector := NewDirectorGraphProjector()
	if err := projector.Apply(registration); err != nil {
		t.Fatalf("registration: %v", err)
	}
	duplicate := registration
	duplicateFact := *registration.Director
	duplicateFact.ID = "director-02"
	duplicate.Director = &duplicateFact
	duplicate.Sequence = 2
	if err := projector.Apply(duplicate); err == nil {
		t.Fatal("expected a duplicate workstream registration to fail")
	}
}

func TestSourceFactCoverageIncludesEveryNodeKind(t *testing.T) {
	if err := ValidateSourceFactCoverage(); err != nil {
		t.Fatalf("source fact coverage: %v", err)
	}
}
