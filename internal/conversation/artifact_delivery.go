package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

const artifactDeliveryUnresolvedFailureCode = "artifact_delivery_unresolved"

type artifactDeliveryAttemptStatus string

const (
	artifactDeliveryNotAttempted    artifactDeliveryAttemptStatus = "not_attempted"
	artifactDeliveryFailedRetryable artifactDeliveryAttemptStatus = "failed_retryable"
	artifactDeliveryEmitted         artifactDeliveryAttemptStatus = "emitted"
	artifactDeliveryFailedTerminal  artifactDeliveryAttemptStatus = "failed_terminal"
)

type artifactDeliveryAttempt struct {
	failure Failure
	status  artifactDeliveryAttemptStatus
}

func (store *Store) readArtifactDeliveryAttempt(
	ctx context.Context,
	conversationID string,
	turnID string,
) (artifactDeliveryAttempt, error) {
	if store == nil {
		return artifactDeliveryAttempt{}, errors.New("conversation store is required")
	}
	if err := validateIdentifier("artifact delivery conversation id", conversationID); err != nil {
		return artifactDeliveryAttempt{}, err
	}
	if err := validateIdentifier("artifact delivery turn id", turnID); err != nil {
		return artifactDeliveryAttempt{}, err
	}
	attempt := artifactDeliveryAttempt{status: artifactDeliveryNotAttempted}
	err := store.read(ctx, "read topic conversation artifact delivery attempt", func(ctx context.Context, connection *sql.Conn) error {
		read, err := readArtifactDeliveryAttempt(ctx, connection, conversationID, turnID)
		if err != nil {
			return err
		}
		attempt = read
		return nil
	})
	return attempt, err
}

func readArtifactDeliveryAttempt(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	turnID string,
) (artifactDeliveryAttempt, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, sequence, emitted_at, kind, actor,
       provider_event_id, provider_thread_id, provider_turn_id, payload_json
FROM trajectory_events
WHERE conversation_id = ?
  AND turn_id = ?
  AND kind IN ('activity_failed', 'artifact_emitted')
ORDER BY sequence ASC
`, conversationID, turnID)
	if err != nil {
		return artifactDeliveryAttempt{}, err
	}
	defer rows.Close()
	attempt := artifactDeliveryAttempt{status: artifactDeliveryNotAttempted}
	for rows.Next() {
		event, scanErr := scanTrajectoryEvent(rows)
		if scanErr != nil {
			return artifactDeliveryAttempt{}, scanErr
		}
		attempt = reduceArtifactDeliveryAttempt(attempt, event)
	}
	if err := rows.Err(); err != nil {
		return artifactDeliveryAttempt{}, err
	}
	return attempt, nil
}

func reduceArtifactDeliveryAttempt(
	attempt artifactDeliveryAttempt,
	event TrajectoryEvent,
) artifactDeliveryAttempt {
	if failure, ok := artifactToolFailureEvent(event); ok {
		status := artifactDeliveryFailedTerminal
		if failure.Retryable {
			status = artifactDeliveryFailedRetryable
		}
		return artifactDeliveryAttempt{failure: failure, status: status}
	}
	if artifactToolEmissionEvent(event) {
		return artifactDeliveryAttempt{status: artifactDeliveryEmitted}
	}
	return attempt
}

func artifactToolFailureEvent(event TrajectoryEvent) (Failure, bool) {
	if event.Kind != TrajectoryEventActivityFailed || event.ActivityFailed == nil {
		return Failure{}, false
	}
	activity := event.ActivityFailed.Activity
	if activity.Kind != TrajectoryActivityDynamicTool ||
		activity.Tool == nil ||
		*activity.Tool != artifactToolName ||
		activity.Namespace == nil ||
		*activity.Namespace != artifactToolNamespace {
		return Failure{}, false
	}
	return event.ActivityFailed.Failure, true
}

func artifactToolEmissionEvent(event TrajectoryEvent) bool {
	return event.Kind == TrajectoryEventArtifactEmitted &&
		event.ArtifactEmitted != nil &&
		event.Actor == TrajectoryActorSystem &&
		event.ProviderEventID != nil &&
		*event.ProviderEventID != ""
}

func unresolvedArtifactDeliveryFailure(attempt artifactDeliveryAttempt) (Failure, bool) {
	switch attempt.status {
	case artifactDeliveryFailedRetryable, artifactDeliveryFailedTerminal:
		return artifactDeliveryFailure(attempt.failure), true
	case artifactDeliveryNotAttempted, artifactDeliveryEmitted:
		return Failure{}, false
	default:
		return Failure{}, false
	}
}

func artifactDeliveryFailure(toolFailure Failure) Failure {
	code := toolFailure.Code
	if code == "" {
		code = "unknown_artifact_tool_failure"
	}
	diagnosticReference := toolFailure.DiagnosticReference
	if diagnosticReference == "" {
		diagnosticReference = "artifact_delivery:" + code
	}
	return Failure{
		Code: artifactDeliveryUnresolvedFailureCode,
		Message: fmt.Sprintf(
			"setta.emit_artifact failed with %s before the turn completed; retry the request so the artifact call can be corrected.",
			code,
		),
		Retryable:           true,
		DiagnosticReference: diagnosticReference,
	}
}
