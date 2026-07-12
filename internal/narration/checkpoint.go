package narration

import (
	"fmt"
	"strings"

	"setta/internal/conversation"
)

type CheckpointOutput struct {
	CoveredThroughSequence int    `json:"coveredThroughSequence"`
	HistoricalSummary      string `json:"historicalSummary"`
}

func (output CheckpointOutput) Validate(context CheckpointContextBundle) error {
	if err := validateCheckpointBundle(context); err != nil {
		return err
	}
	if output.CoveredThroughSequence != context.RequestedRange.End {
		return fmt.Errorf(
			"checkpoint output coverage %d must equal requested range end %d",
			output.CoveredThroughSequence,
			context.RequestedRange.End,
		)
	}
	if output.HistoricalSummary == "" || strings.TrimSpace(output.HistoricalSummary) != output.HistoricalSummary {
		return fmt.Errorf("checkpoint historical summary must be non-empty without surrounding whitespace")
	}
	if len(output.HistoricalSummary) > context.MaxHistoricalSummaryBytes {
		return fmt.Errorf(
			"checkpoint historical summary exceeds %d bytes",
			context.MaxHistoricalSummaryBytes,
		)
	}
	return nil
}

func validateCheckpointBundle(bundle CheckpointContextBundle) error {
	if bundle.Kind != ContextKindCheckpoint {
		return fmt.Errorf("checkpoint bundle has context kind %q", bundle.Kind)
	}
	if bundle.Trigger != conversation.NarrationTriggerCheckpointWindowExceeded {
		return fmt.Errorf("checkpoint bundle has trigger %q", bundle.Trigger)
	}
	if err := validateCheckpointBundleRange(bundle); err != nil {
		return err
	}
	if err := validateCheckpointBundleTrajectory(bundle); err != nil {
		return err
	}
	return validateCheckpointBundleHistory(bundle)
}

func validateCheckpointBundleRange(bundle CheckpointContextBundle) error {
	if err := bundle.RequestedRange.Validate(); err != nil {
		return err
	}
	if bundle.RequestedRange.Start != bundle.PreCallCursor.CheckpointThroughSequence+1 {
		return fmt.Errorf("checkpoint requested range does not begin after the durable checkpoint")
	}
	if bundle.RequestedRange.End > bundle.PreCallCursor.ObservedThroughSequence {
		return fmt.Errorf("checkpoint requested range crosses the observed cursor")
	}
	if bundle.MaxHistoricalSummaryBytes <= 0 {
		return fmt.Errorf("checkpoint bundle summary byte limit must be positive")
	}
	return nil
}

func validateCheckpointBundleTrajectory(bundle CheckpointContextBundle) error {
	if len(bundle.Trajectory) != bundle.RequestedRange.End-bundle.RequestedRange.Start+1 {
		return fmt.Errorf("checkpoint bundle trajectory does not completely cover its requested range")
	}
	conversationID := bundle.Authoritative.Conversation.ConversationID
	if err := validateIdentifier("checkpoint bundle conversation id", conversationID); err != nil {
		return err
	}
	for index, event := range bundle.Trajectory {
		if err := event.Validate(); err != nil {
			return err
		}
		if event.ConversationID != conversationID {
			return fmt.Errorf("checkpoint bundle trajectory belongs to conversation %s", event.ConversationID)
		}
		if event.Sequence != bundle.RequestedRange.Start+index {
			return fmt.Errorf("checkpoint bundle trajectory is not contiguous")
		}
	}
	return nil
}

func validateCheckpointBundleHistory(bundle CheckpointContextBundle) error {
	if bundle.PreCallCursor.CheckpointThroughSequence == 0 {
		if bundle.HistoricalCheckpoint != nil {
			return fmt.Errorf("checkpoint bundle has historical text at cursor zero")
		}
	} else if bundle.HistoricalCheckpoint == nil ||
		bundle.HistoricalCheckpoint.CoveredThroughSequence != bundle.PreCallCursor.CheckpointThroughSequence ||
		bundle.HistoricalCheckpoint.Authority != ContextAuthorityHistorical {
		return fmt.Errorf("checkpoint bundle historical context does not match its durable cursor")
	}
	return nil
}
