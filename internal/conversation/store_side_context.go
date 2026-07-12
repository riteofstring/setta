package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

func (store *Store) readSideInFlightContextFrame(
	ctx context.Context,
	conversationID string,
	turn *ConversationTurn,
	sourceSequence int,
) (SideInFlightContextFrame, error) {
	if err := validateSideContextReadRequest(store, ctx, conversationID, turn, sourceSequence); err != nil {
		return SideInFlightContextFrame{}, err
	}
	var frame SideInFlightContextFrame
	err := store.read(ctx, "read side in-flight context frame", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		conversation, err := readNarratorConversation(ctx, reader, conversationID)
		if err != nil {
			return err
		}
		if sourceSequence > conversation.LastTrajectorySequence {
			return fmt.Errorf(
				"side context source sequence %d exceeds conversation %s latest trajectory %d",
				sourceSequence,
				conversationID,
				conversation.LastTrajectorySequence,
			)
		}
		frame, err = readSideContextFrame(ctx, reader, turn, sourceSequence)
		if err != nil {
			return err
		}
		return reader.Commit()
	})
	if err != nil {
		return SideInFlightContextFrame{}, err
	}
	if err := frame.Validate(); err != nil {
		return SideInFlightContextFrame{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return frame, nil
}

func validateSideContextReadRequest(
	store *Store,
	ctx context.Context,
	conversationID string,
	turn *ConversationTurn,
	sourceSequence int,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("side context read context is required")
	}
	if err := validateIdentifier("side context conversation id", conversationID); err != nil {
		return err
	}
	if sourceSequence < 0 {
		return errors.New("side context source sequence must be non-negative")
	}
	if turn == nil {
		return nil
	}
	if err := turn.Validate(); err != nil {
		return err
	}
	if turn.ConversationID != conversationID {
		return fmt.Errorf(
			"side context turn %s belongs to %s, want %s",
			turn.ID,
			turn.ConversationID,
			conversationID,
		)
	}
	return nil
}

func readSideContextFrame(
	ctx context.Context,
	reader snapshotReader,
	turn *ConversationTurn,
	sourceSequence int,
) (SideInFlightContextFrame, error) {
	frame := SideInFlightContextFrame{
		Type:                     SideInFlightContextFrameType,
		SourceTrajectorySequence: sourceSequence,
		AcceptedSteering:         []NarratorAcceptedSteering{},
		ActiveActivities:         []SideInFlightActivityMetadata{},
		PendingApprovals:         []SideInFlightApprovalState{},
		Artifacts:                []SideInFlightArtifactMetadata{},
	}
	if turn == nil {
		return frame, nil
	}
	projection := NarratorCurrentTurnProjection{
		Turn:             turn,
		AcceptedSteering: []NarratorAcceptedSteering{},
		ActiveActivities: []NarratorActiveActivity{},
		PendingApprovals: []NarratorPendingApproval{},
		ActiveSubagents:  []NarratorActiveSubagent{},
		Artifacts:        []Artifact{},
	}
	if err := foldNarratorTurnTrajectoryThroughSequence(
		ctx,
		reader,
		turn.ID,
		sourceSequence,
		&projection,
	); err != nil {
		return SideInFlightContextFrame{}, err
	}
	artifacts, err := readSideContextArtifacts(
		ctx,
		reader,
		turn.ConversationID,
		turn.ID,
		sourceSequence,
	)
	if err != nil {
		return SideInFlightContextFrame{}, err
	}
	frame.CurrentObjective = &SideInFlightObjective{
		Input:    turn.AuthoredInput,
		Delivery: turn.Delivery,
		Status:   turn.Status,
	}
	frame.AcceptedSteering = projection.AcceptedSteering
	frame.CurrentPlan = projection.Plan
	frame.ActiveActivities = sideContextActivities(projection.ActiveActivities)
	frame.PendingApprovals = sideContextApprovals(projection.PendingApprovals)
	frame.Artifacts = sideContextArtifacts(artifacts)
	return frame, nil
}

func readSideContextArtifacts(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	turnID string,
	sourceSequence int,
) ([]Artifact, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, trajectory_sequence, kind, uri, title,
       media_type, metadata_json, created_at
FROM artifacts
WHERE conversation_id = ? AND turn_id = ?
  AND trajectory_sequence IS NOT NULL AND trajectory_sequence <= ?
ORDER BY created_at ASC, id ASC
`, conversationID, turnID, sourceSequence)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	artifacts := make([]Artifact, 0)
	for rows.Next() {
		artifact, scanErr := scanArtifact(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		artifacts = append(artifacts, artifact)
	}
	return artifacts, rows.Err()
}

func sideContextActivities(values []NarratorActiveActivity) []SideInFlightActivityMetadata {
	result := make([]SideInFlightActivityMetadata, 0, len(values))
	for _, value := range values {
		result = append(result, SideInFlightActivityMetadata{
			StartedAtSequence:     value.StartedAtSequence,
			LastUpdatedAtSequence: value.LastUpdatedAtSequence,
			Kind:                  value.Activity.Kind,
			Title:                 value.Activity.Title,
			Command:               cloneStringPointer(value.Activity.Command),
			CWD:                   cloneStringPointer(value.Activity.CWD),
			Server:                cloneStringPointer(value.Activity.Server),
			Tool:                  cloneStringPointer(value.Activity.Tool),
			Namespace:             cloneStringPointer(value.Activity.Namespace),
			LatestProgress:        value.LatestProgress,
			LatestOutput:          value.LatestOutput,
		})
	}
	return result
}

func sideContextApprovals(values []NarratorPendingApproval) []SideInFlightApprovalState {
	result := make([]SideInFlightApprovalState, 0, len(values))
	for _, value := range values {
		questions := make([]SideInFlightApprovalQuestion, 0, len(value.Approval.Questions))
		for _, question := range value.Approval.Questions {
			questions = append(questions, SideInFlightApprovalQuestion{
				Header:      question.Header,
				Question:    question.Question,
				Options:     append([]string{}, question.Options...),
				AllowsOther: question.AllowsOther,
				Secret:      question.Secret,
			})
		}
		result = append(result, SideInFlightApprovalState{
			RequestedAtSequence:        value.RequestedAtSequence,
			Kind:                       value.Approval.Kind,
			Title:                      value.Approval.Title,
			Body:                       value.Approval.Body,
			Command:                    cloneStringPointer(value.Approval.Command),
			CWD:                        cloneStringPointer(value.Approval.CWD),
			FilePaths:                  append([]string{}, value.Approval.FilePaths...),
			RequestedPermissionProfile: cloneStringPointer(value.Approval.RequestedPermissionProfile),
			Questions:                  questions,
			RequestedAt:                value.Approval.RequestedAt,
		})
	}
	return result
}

func sideContextArtifacts(values []Artifact) []SideInFlightArtifactMetadata {
	result := make([]SideInFlightArtifactMetadata, 0, len(values))
	for _, value := range values {
		result = append(result, SideInFlightArtifactMetadata{
			ID:                 value.ID,
			TrajectorySequence: *value.TrajectorySequence,
			Kind:               value.Kind,
			URI:                value.URI,
			Title:              value.Title,
			MediaType:          value.MediaType,
			CreatedAt:          value.CreatedAt,
		})
	}
	return result
}
