package evalharness

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"setta/internal/conversation"
	"setta/internal/director"
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

type phase2TranscriptCandidate struct {
	entry   TranscriptEntry
	when    time.Time
	ordinal int
}

func buildScenarioTranscript(
	scenario Scenario,
	submittedAt time.Time,
	receivedAt time.Time,
	receipt director.DirectorReceipt,
	snapshot conversation.ConversationSnapshot,
) (ScenarioTranscript, error) {
	if err := validateScenarioTranscriptInputs(scenario, submittedAt, receivedAt, receipt); err != nil {
		return ScenarioTranscript{}, err
	}
	candidates := initialScenarioTranscriptCandidates(scenario, submittedAt)
	candidates = appendDirectorTranscriptCandidate(candidates, receipt.Submit.ReplyText, receivedAt)
	candidates, err := appendNarrationTranscriptCandidates(candidates, snapshot.Narration.Events)
	if err != nil {
		return ScenarioTranscript{}, err
	}
	return finalizeScenarioTranscript(scenario.ID, candidates)
}

func validateScenarioTranscriptInputs(
	scenario Scenario,
	submittedAt time.Time,
	receivedAt time.Time,
	receipt director.DirectorReceipt,
) error {
	if err := scenario.Validate(); err != nil {
		return err
	}
	if receipt.Submit == nil {
		return errors.New("completed transcript requires a Director submit receipt")
	}
	if submittedAt.IsZero() || receivedAt.IsZero() || receivedAt.Before(submittedAt) {
		return errors.New("completed transcript requires an ordered submission timeline")
	}
	return nil
}

func initialScenarioTranscriptCandidates(
	scenario Scenario,
	submittedAt time.Time,
) []phase2TranscriptCandidate {
	return []phase2TranscriptCandidate{{
		entry: TranscriptEntry{
			Speaker:    TranscriptSpeakerUser,
			Kind:       TranscriptEntryUserSubmission,
			Text:       scenario.Steps[0].Text,
			OccurredAt: submittedAt.UTC().Format(time.RFC3339Nano),
		},
		when: submittedAt.UTC(),
	}}
}

func appendDirectorTranscriptCandidate(
	candidates []phase2TranscriptCandidate,
	replyText string,
	receivedAt time.Time,
) []phase2TranscriptCandidate {
	if replyText == "" {
		return candidates
	}
	return append(candidates, phase2TranscriptCandidate{
		entry: TranscriptEntry{
			Speaker:    TranscriptSpeakerDirector,
			Kind:       TranscriptEntryDirectorReply,
			Text:       replyText,
			OccurredAt: receivedAt.UTC().Format(time.RFC3339Nano),
		},
		when:    receivedAt.UTC(),
		ordinal: 1,
	})
}

func appendNarrationTranscriptCandidates(
	candidates []phase2TranscriptCandidate,
	narrations []conversation.NarrationEvent,
) ([]phase2TranscriptCandidate, error) {
	for index, narration := range narrations {
		text, visible := narration.UserVisibleText()
		if !visible {
			continue
		}
		occurredAt, err := time.Parse(time.RFC3339Nano, narration.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("parse narration event %s timestamp: %w", narration.ID, err)
		}
		kind, err := transcriptNarrationKind(narration.Kind)
		if err != nil {
			return nil, err
		}
		candidates = append(candidates, phase2TranscriptCandidate{
			entry: TranscriptEntry{
				Speaker:    TranscriptSpeakerNarrator,
				Kind:       kind,
				Text:       text,
				OccurredAt: occurredAt.UTC().Format(time.RFC3339Nano),
			},
			when:    occurredAt.UTC(),
			ordinal: index + 2,
		})
	}
	return candidates, nil
}

func finalizeScenarioTranscript(
	scenarioID string,
	candidates []phase2TranscriptCandidate,
) (ScenarioTranscript, error) {
	sort.SliceStable(candidates, func(left int, right int) bool {
		if candidates[left].when.Equal(candidates[right].when) {
			return candidates[left].ordinal < candidates[right].ordinal
		}
		return candidates[left].when.Before(candidates[right].when)
	})
	entries := make([]TranscriptEntry, len(candidates))
	for index, candidate := range candidates {
		entries[index] = candidate.entry
		entries[index].Sequence = index + 1
	}
	transcript := ScenarioTranscript{
		ScenarioID:        scenarioID,
		EvidenceAvailable: true,
		Entries:           entries,
	}
	if err := transcript.Validate(); err != nil {
		return ScenarioTranscript{}, err
	}
	return transcript, nil
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
