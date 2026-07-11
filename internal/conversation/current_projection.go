package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
)

type ConversationCurrentProjection struct {
	ConversationID         string                     `json:"conversationId"`
	CurrentObjective       string                     `json:"currentObjective"`
	AcceptedSteering       []string                   `json:"acceptedSteering"`
	CurrentPlan            *TrajectoryPlanChanged     `json:"currentPlan"`
	ActiveActivities       []TrajectoryActivity       `json:"activeActivities"`
	PendingApproval        *TrajectoryApprovalRequest `json:"pendingApproval"`
	ActiveSubagents        []Subagent                 `json:"activeSubagents"`
	UpdatedThroughSequence int                        `json:"updatedThroughSequence"`
}

func (projection ConversationCurrentProjection) Validate() error {
	if err := validateIdentifier("current projection conversation id", projection.ConversationID); err != nil {
		return err
	}
	if projection.AcceptedSteering == nil || projection.ActiveActivities == nil || projection.ActiveSubagents == nil {
		return errors.New("current projection arrays must not be null")
	}
	if projection.UpdatedThroughSequence < 0 {
		return errors.New("current projection sequence must be non-negative")
	}
	for _, steering := range projection.AcceptedSteering {
		if err := validateTrimmedText("current projection steering", steering); err != nil {
			return err
		}
	}
	if projection.CurrentPlan != nil {
		if err := projection.CurrentPlan.Validate(); err != nil {
			return err
		}
	}
	for _, activity := range projection.ActiveActivities {
		if err := activity.Validate(); err != nil {
			return err
		}
	}
	if projection.PendingApproval != nil {
		if err := projection.PendingApproval.Validate(); err != nil {
			return err
		}
	}
	for _, subagent := range projection.ActiveSubagents {
		if err := subagent.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func readCurrentProjection(ctx context.Context, reader rowQuerier, conversationID string) (ConversationCurrentProjection, error) {
	var projection ConversationCurrentProjection
	var steeringJSON, activitiesJSON, subagentsJSON string
	var planJSON, approvalJSON sql.NullString
	err := reader.QueryRowContext(ctx, `
SELECT conversation_id, current_objective, accepted_steering_json,
       current_plan_json, active_activities_json, pending_approval_json,
       active_subagents_json, updated_through_sequence
FROM conversation_current_projection WHERE conversation_id = ?
`, conversationID).Scan(
		&projection.ConversationID, &projection.CurrentObjective, &steeringJSON,
		&planJSON, &activitiesJSON, &approvalJSON, &subagentsJSON,
		&projection.UpdatedThroughSequence,
	)
	if err != nil {
		return ConversationCurrentProjection{}, err
	}
	if err := decodeRequiredJSON(steeringJSON, &projection.AcceptedSteering); err != nil {
		return ConversationCurrentProjection{}, err
	}
	if err := decodeOptionalJSON(planJSON, &projection.CurrentPlan); err != nil {
		return ConversationCurrentProjection{}, err
	}
	if err := decodeRequiredJSON(activitiesJSON, &projection.ActiveActivities); err != nil {
		return ConversationCurrentProjection{}, err
	}
	if err := decodeOptionalJSON(approvalJSON, &projection.PendingApproval); err != nil {
		return ConversationCurrentProjection{}, err
	}
	if err := decodeRequiredJSON(subagentsJSON, &projection.ActiveSubagents); err != nil {
		return ConversationCurrentProjection{}, err
	}
	return projection, projection.Validate()
}

func (transaction *WriteTransaction) applyCurrentProjection(event TrajectoryEvent) error {
	projection, err := readCurrentProjection(transaction.ctx, transaction.tx, event.ConversationID)
	if err != nil {
		return err
	}
	if projection.UpdatedThroughSequence != event.Sequence-1 {
		return stateConflict("conversation current projection", event.ConversationID, fmt.Sprintf("expected sequence %d", event.Sequence-1))
	}
	foldTrajectoryEvent(&projection, event)
	projection.UpdatedThroughSequence = event.Sequence
	steeringJSON, err := encodeJSONColumn("current projection steering", projection.AcceptedSteering)
	if err != nil {
		return err
	}
	planJSON, err := encodeOptionalJSONColumn("current projection plan", projection.CurrentPlan)
	if err != nil {
		return err
	}
	activitiesJSON, err := encodeJSONColumn("current projection activities", projection.ActiveActivities)
	if err != nil {
		return err
	}
	approvalJSON, err := encodeOptionalJSONColumn("current projection approval", projection.PendingApproval)
	if err != nil {
		return err
	}
	subagentsJSON, err := encodeJSONColumn("current projection subagents", projection.ActiveSubagents)
	if err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversation_current_projection SET current_objective = ?,
  accepted_steering_json = ?, current_plan_json = ?, active_activities_json = ?,
  pending_approval_json = ?, active_subagents_json = ?, updated_through_sequence = ?
WHERE conversation_id = ? AND updated_through_sequence = ?
`, projection.CurrentObjective, steeringJSON, planJSON, activitiesJSON,
		approvalJSON, subagentsJSON, projection.UpdatedThroughSequence,
		projection.ConversationID, event.Sequence-1)
	if err != nil {
		return err
	}
	return requireOneRow(result, "conversation current projection", event.ConversationID, "sequence expectation did not match")
}

func foldTrajectoryEvent(projection *ConversationCurrentProjection, event TrajectoryEvent) {
	switch event.Kind {
	case TrajectoryEventUserInputAccepted:
		if event.UserInputAccepted.Delivery == TurnDeliveryQueued {
			break
		}
		projection.CurrentObjective = event.UserInputAccepted.Input.Text
		projection.AcceptedSteering = []string{}
		projection.CurrentPlan = nil
		projection.ActiveActivities = []TrajectoryActivity{}
		projection.PendingApproval = nil
		projection.ActiveSubagents = []Subagent{}
	case TrajectoryEventTurnPromoted:
		projection.CurrentObjective = event.TurnPromoted.Input.Text
		projection.AcceptedSteering = []string{}
		projection.CurrentPlan = nil
		projection.ActiveActivities = []TrajectoryActivity{}
		projection.PendingApproval = nil
		projection.ActiveSubagents = []Subagent{}
	case TrajectoryEventTurnSteered:
		projection.AcceptedSteering = append(projection.AcceptedSteering, event.TurnSteered.Input.Text)
	case TrajectoryEventPlanChanged:
		plan := *event.PlanChanged
		plan.Steps = append([]PlanStep{}, plan.Steps...)
		projection.CurrentPlan = &plan
	case TrajectoryEventActivityStarted:
		projection.ActiveActivities = upsertActivity(projection.ActiveActivities, event.ActivityStarted.Activity)
	case TrajectoryEventActivityCompleted:
		projection.ActiveActivities = removeActivity(projection.ActiveActivities, event.ActivityCompleted.Activity.ID)
	case TrajectoryEventActivityFailed:
		projection.ActiveActivities = removeActivity(projection.ActiveActivities, event.ActivityFailed.Activity.ID)
	case TrajectoryEventApprovalRequested:
		approval := event.ApprovalRequested.Approval
		projection.PendingApproval = &approval
	case TrajectoryEventApprovalResolved:
		if projection.PendingApproval != nil && projection.PendingApproval.ID == event.ApprovalResolved.Resolution.ApprovalID {
			projection.PendingApproval = nil
		}
	case TrajectoryEventSubagentStarted:
		projection.ActiveSubagents = upsertSubagent(projection.ActiveSubagents, event.SubagentStarted.Subagent)
	case TrajectoryEventSubagentUpdated:
		projection.ActiveSubagents = upsertSubagent(projection.ActiveSubagents, event.SubagentUpdated.Subagent)
	case TrajectoryEventSubagentCompleted:
		projection.ActiveSubagents = removeSubagent(projection.ActiveSubagents, event.SubagentCompleted.Subagent.ID)
	case TrajectoryEventTurnCompleted, TrajectoryEventTurnFailed, TrajectoryEventTurnInterrupted:
		projection.ActiveActivities = []TrajectoryActivity{}
		projection.PendingApproval = nil
		projection.ActiveSubagents = []Subagent{}
	}
}

func upsertActivity(values []TrajectoryActivity, next TrajectoryActivity) []TrajectoryActivity {
	result := removeActivity(values, next.ID)
	result = append(result, next)
	sort.Slice(result, func(left int, right int) bool { return result[left].ID < result[right].ID })
	return result
}

func removeActivity(values []TrajectoryActivity, id string) []TrajectoryActivity {
	result := make([]TrajectoryActivity, 0, len(values))
	for _, activity := range values {
		if activity.ID != id {
			result = append(result, activity)
		}
	}
	return result
}

func upsertSubagent(values []Subagent, next Subagent) []Subagent {
	result := removeSubagent(values, next.ID)
	result = append(result, next)
	sort.Slice(result, func(left int, right int) bool { return result[left].ID < result[right].ID })
	return result
}

func removeSubagent(values []Subagent, id string) []Subagent {
	result := make([]Subagent, 0, len(values))
	for _, subagent := range values {
		if subagent.ID != id {
			result = append(result, subagent)
		}
	}
	return result
}
