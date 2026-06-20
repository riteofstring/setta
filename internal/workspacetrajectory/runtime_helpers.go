package workspacetrajectory

import (
	"path/filepath"
	"sort"
	"time"

	"setta/internal/orchestrator"
)

func spriteStatusFromSemanticStatus(status string) WorkspaceTrajectorySpriteStatus {
	switch status {
	case "queued", "observing", "window_open":
		return SpriteStatusPending
	case "running", "proposing", "applying":
		return SpriteStatusRunning
	case "applied", "noop":
		return SpriteStatusCompleted
	case "failed", "rejected":
		return SpriteStatusFailed
	case "superseded":
		return SpriteStatusCancelled
	case "pending_review":
		return SpriteStatusApprovalRequired
	default:
		return SpriteStatusUnknown
	}
}

func severityForStatus(status WorkspaceTrajectorySpriteStatus, err string) WorkspaceTrajectorySpriteSeverity {
	if err != "" {
		return SpriteSeverityError
	}
	switch status {
	case SpriteStatusFailed:
		return SpriteSeverityError
	case SpriteStatusCancelled:
		return SpriteSeverityWarning
	case SpriteStatusApprovalRequired:
		return SpriteSeverityBlocking
	case SpriteStatusCompleted:
		return SpriteSeveritySuccess
	default:
		return SpriteSeverityInfo
	}
}

func severityRank(severity WorkspaceTrajectorySpriteSeverity) int {
	switch severity {
	case SpriteSeverityBlocking:
		return 4
	case SpriteSeverityError:
		return 3
	case SpriteSeverityWarning:
		return 2
	case SpriteSeveritySuccess:
		return 1
	default:
		return 0
	}
}

func ttlForStatus(status WorkspaceTrajectorySpriteStatus) int {
	switch status {
	case SpriteStatusFailed:
		return FailedSpriteTTLMS
	case SpriteStatusApprovalRequired:
		return ApprovalSpriteTTLMS
	default:
		return DefaultSpriteTTLMS
	}
}

func expiresAt(updatedAt string, ttlMS int) string {
	if updatedAt == "" || ttlMS <= 0 {
		return ""
	}
	parsed, err := time.Parse(time.RFC3339Nano, updatedAt)
	if err != nil {
		return ""
	}
	return timestamp(parsed.Add(time.Duration(ttlMS) * time.Millisecond))
}

func workflowEventTitle(event orchestrator.WorkflowEvent) string {
	switch event.Type {
	case orchestrator.EventExecutionStarted:
		return "Workflow started"
	case orchestrator.EventExecutionCompleted:
		return "Workflow completed"
	case orchestrator.EventExecutionFailed:
		return "Workflow failed"
	case orchestrator.EventActionStarted:
		return "Workflow node started"
	case orchestrator.EventActionCompleted:
		return "Workflow node completed"
	case orchestrator.EventActionFailed:
		return "Workflow node failed"
	case orchestrator.EventActionApprovalWait:
		return "Workflow approval requested"
	default:
		return string(event.Type)
	}
}

func workflowErrorFromEvent(event orchestrator.WorkflowEvent) string {
	if event.Type == orchestrator.EventActionFailed ||
		event.Type == orchestrator.EventExecutionFailed ||
		event.Type == orchestrator.EventRunnerAttemptFailed ||
		event.Type == orchestrator.EventActionRecoveryRequired ||
		event.Type == orchestrator.EventRunnerAttemptRecoveryRequired {
		return event.Message
	}
	return ""
}

func timelineSummary(sprite WorkspaceTrajectorySprite) string {
	if sprite.Subtitle != "" {
		return sprite.Title + ": " + sprite.Subtitle
	}
	if sprite.ResultSummary != "" {
		return sprite.Title + ": " + sprite.ResultSummary
	}
	if sprite.ErrorSummary != "" {
		return sprite.Title + ": " + sprite.ErrorSummary
	}
	return sprite.Title
}

func aggregateID(sprite WorkspaceTrajectorySprite) string {
	if sprite.WorkflowNodeExecutionID != "" {
		return "workflow-node-execution:" + sprite.WorkflowNodeExecutionID
	}
	return "workflow-node:" + sprite.WorkflowNodeID
}

func displayPath(value string) string {
	if value == "" {
		return ""
	}
	cleaned := filepath.Clean(value)
	if len(cleaned) <= MaxFileRefDisplayBytes {
		return cleaned
	}
	base := filepath.Base(cleaned)
	if base != "." && base != string(filepath.Separator) {
		return base
	}
	return cleaned
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func uniqueSortedStrings(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func sortRuntimeSnapshot(snapshot *WorkspaceTrajectoryRuntimeSnapshot) {
	sort.Slice(snapshot.Sprites, func(left int, right int) bool {
		return spriteLess(snapshot.Sprites[left], snapshot.Sprites[right])
	})
	sort.Slice(snapshot.Timeline, func(left int, right int) bool {
		if snapshot.Timeline[left].OccurredAt != snapshot.Timeline[right].OccurredAt {
			return snapshot.Timeline[left].OccurredAt > snapshot.Timeline[right].OccurredAt
		}
		return snapshot.Timeline[left].ID < snapshot.Timeline[right].ID
	})
	sort.Slice(snapshot.DetailRefs, func(left int, right int) bool {
		return snapshot.DetailRefs[left].ID < snapshot.DetailRefs[right].ID
	})
}

func sortRuntimeDelta(delta *WorkspaceTrajectoryRuntimeDelta) {
	delta.ChangedAreas = uniqueChangeAreas(delta.ChangedAreas)
	sort.Slice(delta.SpriteUpdates, func(left int, right int) bool {
		return spriteLess(delta.SpriteUpdates[left], delta.SpriteUpdates[right])
	})
	sort.Slice(delta.TimelineUpdates, func(left int, right int) bool {
		if delta.TimelineUpdates[left].OccurredAt != delta.TimelineUpdates[right].OccurredAt {
			return delta.TimelineUpdates[left].OccurredAt > delta.TimelineUpdates[right].OccurredAt
		}
		return delta.TimelineUpdates[left].ID < delta.TimelineUpdates[right].ID
	})
	sort.Slice(delta.DetailRefs, func(left int, right int) bool {
		return delta.DetailRefs[left].ID < delta.DetailRefs[right].ID
	})
}

func uniqueChangeAreas(values []WorkspaceTrajectoryChangeArea) []WorkspaceTrajectoryChangeArea {
	seen := map[WorkspaceTrajectoryChangeArea]bool{}
	result := []WorkspaceTrajectoryChangeArea{}
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	sort.Slice(result, func(left int, right int) bool {
		return result[left] < result[right]
	})
	return result
}

func spriteLess(left WorkspaceTrajectorySprite, right WorkspaceTrajectorySprite) bool {
	leftTime := firstNonEmpty(left.UpdatedAt, left.CreatedAt)
	rightTime := firstNonEmpty(right.UpdatedAt, right.CreatedAt)
	if leftTime != rightTime {
		return leftTime > rightTime
	}
	if left.Kind != right.Kind {
		return left.Kind < right.Kind
	}
	return left.ID < right.ID
}

func timestamp(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339Nano)
}
