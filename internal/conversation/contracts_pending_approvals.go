package conversation

import "fmt"

const MaxSnapshotPendingApprovals = 16

type ConversationPendingApproval struct {
	TurnID         string                    `json:"turnId"`
	SourceSequence int                       `json:"sourceSequence"`
	Approval       TrajectoryApprovalRequest `json:"approval"`
}

func validateSnapshotPendingApprovals(
	approvals []ConversationPendingApproval,
	conversationID string,
	lastTrajectorySequence int,
	turns map[string]ConversationTurn,
) error {
	if approvals == nil {
		return fmt.Errorf("conversation snapshot pending approvals must be an array, not null")
	}
	if len(approvals) > MaxSnapshotPendingApprovals {
		return fmt.Errorf("conversation snapshot pending approvals exceed %d records", MaxSnapshotPendingApprovals)
	}
	seen := map[string]bool{}
	previousKey := ""
	for _, pending := range approvals {
		key, err := validateSnapshotPendingApproval(
			pending,
			conversationID,
			lastTrajectorySequence,
			turns,
		)
		if err != nil {
			return err
		}
		if seen[pending.Approval.ID] {
			return fmt.Errorf("conversation snapshot pending approval %s is duplicated", pending.Approval.ID)
		}
		seen[pending.Approval.ID] = true
		if previousKey != "" && key <= previousKey {
			return fmt.Errorf("conversation snapshot pending approvals are not strictly ordered")
		}
		previousKey = key
	}
	return nil
}

func validateSnapshotPendingApproval(
	pending ConversationPendingApproval,
	conversationID string,
	lastTrajectorySequence int,
	turns map[string]ConversationTurn,
) (string, error) {
	if err := validateIdentifier("snapshot pending approval turn id", pending.TurnID); err != nil {
		return "", err
	}
	turn, ok := turns[pending.TurnID]
	if !ok || turn.ConversationID != conversationID || turn.Status != TurnStatusRunning {
		return "", fmt.Errorf("snapshot pending approval %s is not attached to a running turn", pending.Approval.ID)
	}
	if pending.SourceSequence <= 0 || pending.SourceSequence > lastTrajectorySequence {
		return "", fmt.Errorf("snapshot pending approval %s has invalid source sequence %d", pending.Approval.ID, pending.SourceSequence)
	}
	if err := pending.Approval.Validate(); err != nil {
		return "", err
	}
	return fmt.Sprintf("%016d\x00%s", pending.SourceSequence, pending.Approval.ID), nil
}
