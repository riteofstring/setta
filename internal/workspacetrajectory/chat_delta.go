package workspacetrajectory

import (
	"encoding/json"
	"fmt"

	"setta/internal/chat"
)

type chatDeltaAdder func(*WorkspaceTrajectoryRuntimeDelta, chat.Event) (bool, error)

func DeltaFromChatEvent(event chat.Event, fromRevision int, toRevision int, generatedAt string) (WorkspaceTrajectoryRuntimeDelta, bool, error) {
	adder := chatDeltaAdderForType(event.Type)
	if adder == nil {
		return WorkspaceTrajectoryRuntimeDelta{}, false, nil
	}
	delta := EmptyRuntimeDelta(event.WorkspaceID, fromRevision, toRevision, generatedAt)
	delta.SchemaVersion = SchemaVersion
	ok, err := adder(&delta, event)
	if err != nil || !ok {
		return WorkspaceTrajectoryRuntimeDelta{}, ok, err
	}
	sortRuntimeDelta(&delta)
	finalizeDelta(&delta, runtimeLimits(DefaultRuntimeLimit))
	return delta, true, nil
}

func chatDeltaAdderForType(eventType string) chatDeltaAdder {
	switch eventType {
	case chat.EventTypeRunItemCreated, chat.EventTypeRunItemUpdated:
		return addRunItemEventDelta
	case chat.EventTypeAssistantTextDelta:
		return addAssistantTextDelta
	case chat.EventTypeMessageUpdated:
		return addMessageUpdatedDelta
	case chat.EventTypeRunUpdated:
		return addRunUpdatedDelta
	default:
		return nil
	}
}

func addRunItemEventDelta(delta *WorkspaceTrajectoryRuntimeDelta, event chat.Event) (bool, error) {
	var payload chat.RunItemUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return false, fmt.Errorf("decode %s payload: %w", event.Type, err)
	}
	sprite, ok := SpriteFromRunItem(payload.Item, workflowBinding{})
	if !ok {
		return false, nil
	}
	delta.ChangedAreas = []WorkspaceTrajectoryChangeArea{ChangeAreaRunItems}
	appendSpriteDelta(delta, sprite)
	return true, nil
}

func addAssistantTextDelta(delta *WorkspaceTrajectoryRuntimeDelta, event chat.Event) (bool, error) {
	var payload chat.AssistantTextDeltaPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return false, fmt.Errorf("decode assistant text delta payload: %w", err)
	}
	sprite := assistantMessageSprite(event.WorkspaceID, event.ConversationID, event.RunID, payload.MessageID, chat.MessageStatusStreaming, payload.UpdatedAt)
	delta.ChangedAreas = []WorkspaceTrajectoryChangeArea{ChangeAreaAssistant}
	appendSpriteDelta(delta, sprite)
	return true, nil
}

func addMessageUpdatedDelta(delta *WorkspaceTrajectoryRuntimeDelta, event chat.Event) (bool, error) {
	var payload chat.MessageUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return false, fmt.Errorf("decode message updated payload: %w", err)
	}
	if payload.Message.Role != chat.RoleAssistant {
		return false, nil
	}
	sprite := assistantMessageSprite(event.WorkspaceID, event.ConversationID, payload.Message.RunID, payload.Message.ID, payload.Message.Status, payload.Message.UpdatedAt)
	delta.ChangedAreas = []WorkspaceTrajectoryChangeArea{ChangeAreaAssistant}
	appendSpriteDelta(delta, sprite)
	return true, nil
}

func addRunUpdatedDelta(delta *WorkspaceTrajectoryRuntimeDelta, event chat.Event) (bool, error) {
	var payload chat.RunUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return false, fmt.Errorf("decode run updated payload: %w", err)
	}
	if payload.Run.PendingApproval == nil {
		return false, nil
	}
	sprite := SpriteFromApproval(event.WorkspaceID, event.ConversationID, *payload.Run.PendingApproval)
	delta.ChangedAreas = []WorkspaceTrajectoryChangeArea{ChangeAreaApprovals}
	appendSpriteDelta(delta, sprite)
	return true, nil
}
