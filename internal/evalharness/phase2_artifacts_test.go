package evalharness

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"setta/internal/conversation"
	"setta/internal/director"
	evalverifier "setta/internal/evalharness/verifier"
)

func TestPhase2TranscriptContainsOnlyPublicSpeech(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 20, 0, 0, 0, time.UTC)
	receivedAt := startedAt.Add(time.Second)
	workerQuestionAt := receivedAt.Add(time.Second)
	narrations := []conversation.NarrationEvent{
		{
			Kind:            conversation.NarrationEventKindTopicDescriptor,
			TopicDescriptor: &conversation.NarrationTopicDescriptor{Text: "Internal topic label"},
			CreatedAt:       receivedAt.Add(time.Second).Format(time.RFC3339Nano),
		},
		{
			Kind:      conversation.NarrationEventKindMilestone,
			Milestone: &conversation.NarrationMilestone{Text: "The implementation is underway."},
			CreatedAt: receivedAt.Add(2 * time.Second).Format(time.RFC3339Nano),
		},
		{
			Kind:        conversation.NarrationEventKindStatusReply,
			StatusReply: &conversation.NarrationStatusReply{Text: "The focused checks are running."},
			CreatedAt:   receivedAt.Add(3 * time.Second).Format(time.RFC3339Nano),
		},
		{
			Kind:         conversation.NarrationEventKindFinalSummary,
			FinalSummary: &conversation.NarrationFinalSummary{Text: "The requested change is complete."},
			CreatedAt:    receivedAt.Add(4 * time.Second).Format(time.RFC3339Nano),
		},
	}
	receipt := director.DirectorReceipt{
		Kind: director.DirectorIntentSubmit,
		Submit: &director.DirectorTurnReceipt{
			ReplyText: "I started the requested work.",
		},
	}
	events := []EvaluationEvent{
		{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    ScenarioVerifierStraightforward,
			Attempt:       EvaluationAttemptFirst,
			Sequence:      1,
			RecordedAt:    startedAt.Format(time.RFC3339Nano),
			Kind:          EvaluationEventUserSubmission,
			UserSubmission: &EvaluationUserSubmission{
				StepIndex: 0,
				Text:      validTestScenario().Steps[0].Text,
			},
		},
		{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    ScenarioVerifierStraightforward,
			Attempt:       EvaluationAttemptFirst,
			Sequence:      2,
			RecordedAt:    receivedAt.Format(time.RFC3339Nano),
			Kind:          EvaluationEventDirectorReceipt,
			DirectorReceipt: &EvaluationDirectorReceipt{
				StepIndex: 0,
				Receipt:   receipt,
			},
		},
		{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    ScenarioVerifierStraightforward,
			Attempt:       EvaluationAttemptFirst,
			Sequence:      3,
			RecordedAt:    workerQuestionAt.Format(time.RFC3339Nano),
			Kind:          EvaluationEventTrajectory,
			Trajectory: &conversation.TrajectoryEvent{
				Kind: conversation.TrajectoryEventApprovalRequested,
				ApprovalRequested: &conversation.TrajectoryApprovalRequested{
					Approval: conversation.TrajectoryApprovalRequest{
						Kind: conversation.TrajectoryApprovalKindStructuredInput,
						Questions: []conversation.TrajectoryApprovalQuestion{{
							Header:   "Diagnostic",
							Question: "Should this use liveness or readiness?",
							Options:  []string{"Liveness", "Readiness"},
						}},
					},
				},
			},
		},
	}
	for _, narration := range narrations {
		events = append(events, EvaluationEvent{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    ScenarioVerifierStraightforward,
			Attempt:       EvaluationAttemptFirst,
			Sequence:      len(events) + 1,
			RecordedAt:    narration.CreatedAt,
			Kind:          EvaluationEventNarration,
			Narration:     &narration,
		})
	}
	transcript, err := buildScenarioTranscript(validTestScenario(), EvaluationAttemptFirst, events)
	if err != nil {
		t.Fatalf("build Phase 2 transcript: %v", err)
	}
	wantKinds := []TranscriptEntryKind{
		TranscriptEntryUserSubmission,
		TranscriptEntryDirectorReply,
		TranscriptEntryWorkerQuestion,
		TranscriptEntryNarratorMilestone,
		TranscriptEntryNarratorStatus,
		TranscriptEntryNarratorFinal,
	}
	if len(transcript.Entries) != len(wantKinds) {
		t.Fatalf("transcript entries = %d, want %d", len(transcript.Entries), len(wantKinds))
	}
	for index, want := range wantKinds {
		if transcript.Entries[index].Kind != want {
			t.Fatalf("transcript entry[%d] kind = %s, want %s", index, transcript.Entries[index].Kind, want)
		}
		if strings.Contains(transcript.Entries[index].Text, "topic label") {
			t.Fatalf("transcript exposed topic metadata: %#v", transcript.Entries)
		}
	}
	workerQuestion := transcript.Entries[2].Text
	if !strings.Contains(workerQuestion, "Diagnostic") ||
		!strings.Contains(workerQuestion, "Options: Liveness, Readiness") {
		t.Fatalf("transcript omitted user-visible Worker question content: %q", workerQuestion)
	}
}

func TestCommunicationJudgeContractsExposeOnlyFiveChecks(t *testing.T) {
	schemaPayload, err := communicationJudgeOutputSchema()
	if err != nil {
		t.Fatalf("build communication judge schema: %v", err)
	}
	var schema struct {
		Properties map[string]json.RawMessage `json:"properties"`
		Required   []string                   `json:"required"`
	}
	if err := json.Unmarshal(schemaPayload, &schema); err != nil {
		t.Fatalf("decode communication judge schema: %v", err)
	}
	if len(schema.Properties) != 5 || len(schema.Required) != 5 {
		t.Fatalf("judge schema fields = %d/%d, want 5/5", len(schema.Properties), len(schema.Required))
	}
	for _, forbidden := range []string{"overallPass", "failureTags"} {
		if _, present := schema.Properties[forbidden]; present {
			t.Fatalf("judge schema lets the provider set derived field %s", forbidden)
		}
	}

	verdict := communicationJudgeVerdict(communicationJudgeChecks{
		ProgressSufficient:      false,
		ProgressRestrained:      true,
		QuestionsNecessary:      true,
		FinalTruthfulActionable: false,
		InternalMechanicsHidden: true,
	})
	if verdict.OverallPass {
		t.Fatal("derived judge verdict passed failed checks")
	}
	wantTags := []CommunicationFailureTag{
		CommunicationFailureProgressInsufficient,
		CommunicationFailureFinalUntruthful,
	}
	if len(verdict.FailureTags) != len(wantTags) {
		t.Fatalf("judge failure tags = %#v, want %#v", verdict.FailureTags, wantTags)
	}
	for index, want := range wantTags {
		if verdict.FailureTags[index] != want {
			t.Fatalf("judge failure tag[%d] = %s, want %s", index, verdict.FailureTags[index], want)
		}
	}
}

func TestCommunicationJudgeInputOmitsExecutionInternals(t *testing.T) {
	startedAt := time.Date(2026, time.July, 31, 20, 0, 0, 0, time.UTC)
	transcript := ScenarioTranscript{
		ScenarioID:        ScenarioVerifierStraightforward,
		Attempt:           EvaluationAttemptFirst,
		EvidenceAvailable: true,
		Entries: []TranscriptEntry{{
			Sequence:   1,
			Speaker:    TranscriptSpeakerUser,
			Kind:       TranscriptEntryUserSubmission,
			Text:       "Complete the fixture task.",
			OccurredAt: startedAt.Format(time.RFC3339Nano),
		}},
	}
	verification := evalverifier.NewResult(
		ScenarioVerifierStraightforward,
		[]evalverifier.Check{{ID: "workspace", Passed: true, Detail: "Workspace passed."}},
		[]string{"README.md"},
	)
	payload, err := communicationJudgeInputJSON(validTestScenario(), transcript, verification)
	if err != nil {
		t.Fatalf("build communication judge input: %v", err)
	}
	var input map[string]json.RawMessage
	if err := json.Unmarshal(payload, &input); err != nil {
		t.Fatalf("decode communication judge input: %v", err)
	}
	for _, field := range []string{"messages", "communicationContract", "deterministicVerifier"} {
		if _, present := input[field]; !present {
			t.Fatalf("communication judge input omitted %s", field)
		}
	}
	if len(input) != 3 {
		t.Fatalf("communication judge input fields = %v, want exactly three public inputs", input)
	}
	var messages []map[string]json.RawMessage
	if err := json.Unmarshal(input["messages"], &messages); err != nil {
		t.Fatalf("decode communication judge messages: %v", err)
	}
	if len(messages) != 1 || len(messages[0]) != 3 {
		t.Fatalf("communication judge message shape = %#v", messages)
	}
	for _, forbidden := range []string{"occurredAt", "sequence", "model", "tokenUsage", "sourceSequence"} {
		if _, present := messages[0][forbidden]; present {
			t.Fatalf("communication judge message exposed %s", forbidden)
		}
	}
}

func TestPhase2EvidenceRejectsTruncatedSnapshotWindows(t *testing.T) {
	tests := []struct {
		name     string
		snapshot conversation.ConversationSnapshot
	}{
		{
			name: "trajectory",
			snapshot: conversation.ConversationSnapshot{
				Trajectory: conversation.ConversationTrajectoryWindow{HasEarlier: true},
			},
		},
		{
			name: "narration",
			snapshot: conversation.ConversationSnapshot{
				Narration: conversation.ConversationNarrationWindow{HasEarlier: true},
			},
		},
		{
			name: "side trajectory",
			snapshot: conversation.ConversationSnapshot{
				SideEvents: conversation.ConversationSideEventWindow{HasEarlier: true},
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validateCompletePhase2Snapshot(test.snapshot); err == nil {
				t.Fatal("truncated Phase 2 snapshot unexpectedly produced complete evidence")
			}
		})
	}
}
