package evalharness

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"setta/internal/conversation"
)

const (
	TranscriptSchemaVersion     = 1
	TranscriptMaximumEntries    = 256
	TranscriptMaximumEntryBytes = 16 * 1024
	TranscriptMaximumTotalBytes = 256 * 1024
)

type TranscriptSpeaker string

const (
	TranscriptSpeakerUser     TranscriptSpeaker = "user"
	TranscriptSpeakerDirector TranscriptSpeaker = "director"
	TranscriptSpeakerNarrator TranscriptSpeaker = "narrator"
)

type TranscriptEntryKind string

const (
	TranscriptEntryUserSubmission    TranscriptEntryKind = "user_submission"
	TranscriptEntryDirectorReply     TranscriptEntryKind = "director_reply"
	TranscriptEntryNarratorMilestone TranscriptEntryKind = "narrator_milestone"
	TranscriptEntryNarratorStatus    TranscriptEntryKind = "narrator_status_reply"
	TranscriptEntryNarratorFinal     TranscriptEntryKind = "narrator_final_summary"
)

type TranscriptEntry struct {
	Sequence   int                 `json:"sequence"`
	Speaker    TranscriptSpeaker   `json:"speaker"`
	Kind       TranscriptEntryKind `json:"kind"`
	Text       string              `json:"text"`
	OccurredAt string              `json:"occurredAt"`
}

type ScenarioTranscript struct {
	ScenarioID        string              `json:"scenarioId"`
	EvidenceAvailable bool                `json:"evidenceAvailable"`
	Entries           []TranscriptEntry   `json:"entries"`
	Diagnostic        *ScenarioDiagnostic `json:"diagnostic"`
}

type TranscriptArtifact struct {
	SchemaVersion int                  `json:"schemaVersion"`
	Scenarios     []ScenarioTranscript `json:"scenarios"`
}

func buildScenarioTranscript(
	scenario Scenario,
	events []EvaluationEvent,
) (ScenarioTranscript, error) {
	if err := scenario.Validate(); err != nil {
		return ScenarioTranscript{}, err
	}
	entries := make([]TranscriptEntry, 0, len(events))
	for index, event := range events {
		if event.ScenarioID != scenario.ID {
			continue
		}
		entry, err := transcriptEntryFromEvaluationEvent(event)
		if err != nil {
			return ScenarioTranscript{}, fmt.Errorf("evaluation event[%d]: %w", index, err)
		}
		if entry == nil {
			continue
		}
		entry.Sequence = len(entries) + 1
		entries = append(entries, *entry)
	}
	transcript := ScenarioTranscript{
		ScenarioID:        scenario.ID,
		EvidenceAvailable: true,
		Entries:           entries,
	}
	if err := transcript.Validate(); err != nil {
		return ScenarioTranscript{}, err
	}
	return transcript, nil
}

func transcriptEntryFromEvaluationEvent(event EvaluationEvent) (*TranscriptEntry, error) {
	switch event.Kind {
	case EvaluationEventUserSubmission:
		return &TranscriptEntry{
			Speaker:    TranscriptSpeakerUser,
			Kind:       TranscriptEntryUserSubmission,
			Text:       event.UserSubmission.Text,
			OccurredAt: event.RecordedAt,
		}, nil
	case EvaluationEventDirectorReceipt:
		if event.DirectorReceipt.Receipt.Submit.ReplyText == "" {
			return nil, nil
		}
		return &TranscriptEntry{
			Speaker:    TranscriptSpeakerDirector,
			Kind:       TranscriptEntryDirectorReply,
			Text:       event.DirectorReceipt.Receipt.Submit.ReplyText,
			OccurredAt: event.RecordedAt,
		}, nil
	case EvaluationEventNarration:
		text, visible := event.Narration.UserVisibleText()
		if !visible {
			return nil, nil
		}
		kind, err := transcriptNarrationKind(event.Narration.Kind)
		if err != nil {
			return nil, err
		}
		return &TranscriptEntry{
			Speaker:    TranscriptSpeakerNarrator,
			Kind:       kind,
			Text:       text,
			OccurredAt: event.RecordedAt,
		}, nil
	default:
		return nil, nil
	}
}

func transcriptNarrationKind(kind conversation.NarrationEventKind) (TranscriptEntryKind, error) {
	switch kind {
	case conversation.NarrationEventKindMilestone:
		return TranscriptEntryNarratorMilestone, nil
	case conversation.NarrationEventKindStatusReply:
		return TranscriptEntryNarratorStatus, nil
	case conversation.NarrationEventKindFinalSummary:
		return TranscriptEntryNarratorFinal, nil
	case conversation.NarrationEventKindTopicDescriptor:
		return "", errors.New("topic descriptor is not user-visible transcript speech")
	default:
		return "", fmt.Errorf("unsupported narration transcript kind %q", kind)
	}
}

func unavailableScenarioTranscript(
	scenarioID string,
	diagnostic *ScenarioDiagnostic,
) (ScenarioTranscript, error) {
	if diagnostic == nil {
		var err error
		diagnostic, err = NewScenarioDiagnostic(
			"transcript_unavailable",
			"The scenario ended before a complete user-visible transcript was collected.",
		)
		if err != nil {
			return ScenarioTranscript{}, err
		}
	}
	transcript := ScenarioTranscript{
		ScenarioID:        scenarioID,
		EvidenceAvailable: false,
		Entries:           []TranscriptEntry{},
		Diagnostic:        cloneScenarioDiagnostic(diagnostic),
	}
	if err := transcript.Validate(); err != nil {
		return ScenarioTranscript{}, err
	}
	return transcript, nil
}

func NewTranscriptArtifact(scenarios []ScenarioTranscript) (TranscriptArtifact, error) {
	artifact := TranscriptArtifact{
		SchemaVersion: TranscriptSchemaVersion,
		Scenarios:     append([]ScenarioTranscript{}, scenarios...),
	}
	if err := artifact.Validate(); err != nil {
		return TranscriptArtifact{}, err
	}
	return artifact, nil
}

func (artifact TranscriptArtifact) Validate() error {
	if artifact.SchemaVersion != TranscriptSchemaVersion {
		return fmt.Errorf("transcript schemaVersion is %d, want %d", artifact.SchemaVersion, TranscriptSchemaVersion)
	}
	if artifact.Scenarios == nil || len(artifact.Scenarios) == 0 || len(artifact.Scenarios) > ResultMaximumScenarios {
		return fmt.Errorf("transcript contains %d scenarios, want 1-%d", len(artifact.Scenarios), ResultMaximumScenarios)
	}
	seen := map[string]bool{}
	for index, scenario := range artifact.Scenarios {
		if err := scenario.Validate(); err != nil {
			return fmt.Errorf("transcript scenario[%d]: %w", index, err)
		}
		if seen[scenario.ScenarioID] {
			return fmt.Errorf("transcript repeats scenario %q", scenario.ScenarioID)
		}
		seen[scenario.ScenarioID] = true
	}
	return nil
}

func (transcript ScenarioTranscript) Validate() error {
	if err := validateScenarioIdentifier("transcript scenario id", transcript.ScenarioID); err != nil {
		return err
	}
	if transcript.Entries == nil {
		return errors.New("transcript entries must be an array, not null")
	}
	if transcript.EvidenceAvailable != (transcript.Diagnostic == nil) {
		return errors.New("transcript availability and diagnostic do not agree")
	}
	if !transcript.EvidenceAvailable {
		return validateUnavailableScenarioTranscript(transcript)
	}
	return validateAvailableScenarioTranscript(transcript)
}

func validateUnavailableScenarioTranscript(transcript ScenarioTranscript) error {
	if len(transcript.Entries) != 0 {
		return errors.New("unavailable transcript must not contain partial entries")
	}
	return transcript.Diagnostic.Validate()
}

func validateAvailableScenarioTranscript(transcript ScenarioTranscript) error {
	if len(transcript.Entries) == 0 || len(transcript.Entries) > TranscriptMaximumEntries {
		return fmt.Errorf("transcript contains %d entries, want 1-%d", len(transcript.Entries), TranscriptMaximumEntries)
	}
	totalBytes := 0
	var previous time.Time
	for index, entry := range transcript.Entries {
		if err := entry.Validate(index + 1); err != nil {
			return fmt.Errorf("transcript entry[%d]: %w", index, err)
		}
		occurredAt, _ := time.Parse(time.RFC3339Nano, entry.OccurredAt)
		if index > 0 && occurredAt.Before(previous) {
			return fmt.Errorf("transcript entry[%d] precedes the prior entry", index)
		}
		previous = occurredAt
		totalBytes += len(entry.Text)
	}
	if totalBytes > TranscriptMaximumTotalBytes {
		return fmt.Errorf("transcript text is %d bytes, maximum is %d", totalBytes, TranscriptMaximumTotalBytes)
	}
	if transcript.Entries[0].Speaker != TranscriptSpeakerUser {
		return errors.New("transcript must begin with a user submission")
	}
	return nil
}

func (entry TranscriptEntry) Validate(wantSequence int) error {
	if err := validateTranscriptEntryContent(entry, wantSequence); err != nil {
		return err
	}
	wantSpeaker, err := transcriptSpeakerForEntryKind(entry.Kind)
	if err != nil {
		return err
	}
	if entry.Speaker != wantSpeaker {
		return fmt.Errorf("%s transcript entry must have %s speaker", entry.Kind, wantSpeaker)
	}
	return nil
}

func validateTranscriptEntryContent(entry TranscriptEntry, wantSequence int) error {
	if entry.Sequence != wantSequence {
		return fmt.Errorf("sequence is %d, want %d", entry.Sequence, wantSequence)
	}
	if !utf8.ValidString(entry.Text) || strings.TrimSpace(entry.Text) == "" || strings.TrimSpace(entry.Text) != entry.Text {
		return errors.New("text must be normalized non-empty UTF-8")
	}
	if len(entry.Text) > TranscriptMaximumEntryBytes {
		return fmt.Errorf("text is %d bytes, maximum is %d", len(entry.Text), TranscriptMaximumEntryBytes)
	}
	if _, err := time.Parse(time.RFC3339Nano, entry.OccurredAt); err != nil {
		return fmt.Errorf("occurredAt is invalid: %w", err)
	}
	return nil
}

func transcriptSpeakerForEntryKind(kind TranscriptEntryKind) (TranscriptSpeaker, error) {
	switch kind {
	case TranscriptEntryUserSubmission:
		return TranscriptSpeakerUser, nil
	case TranscriptEntryDirectorReply:
		return TranscriptSpeakerDirector, nil
	case TranscriptEntryNarratorMilestone, TranscriptEntryNarratorStatus, TranscriptEntryNarratorFinal:
		return TranscriptSpeakerNarrator, nil
	default:
		return "", fmt.Errorf("unsupported transcript entry kind %q", kind)
	}
}
