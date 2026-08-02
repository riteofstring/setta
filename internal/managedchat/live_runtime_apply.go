package managedchat

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/realtime"
)

func (r *LiveRuntime) applyChunk(ctx context.Context, params StreamChunkParams) error {
	runID, chatID, err := validateApplyChunkParams(params)
	if err != nil {
		return err
	}
	followBroadcasts, err := r.applyChunkLocked(runID, params)
	if err != nil {
		return err
	}
	return r.broadcastAppliedChunk(ctx, chatID, params, followBroadcasts)
}

func validateApplyChunkParams(params StreamChunkParams) (string, string, error) {
	runID := strings.TrimSpace(params.RunID)
	if runID == "" {
		return "", "", fmt.Errorf("%w: run id is required", ErrLiveRunNotActive)
	}
	chatID := strings.TrimSpace(params.ChatID)
	if chatID == "" {
		return "", "", fmt.Errorf("managed live chat chunk requires chat id")
	}
	return runID, chatID, nil
}

func (r *LiveRuntime) applyChunkLocked(
	runID string,
	params StreamChunkParams,
) ([]realtime.AIFollowToolArgumentsUpdateContent, error) {
	if r == nil {
		return nil, nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	current, err := r.requireActiveRunLocked(runID)
	if err != nil {
		return nil, err
	}
	nextRunState, err := buildNextLiveRunState(current, params)
	if err != nil {
		return nil, err
	}
	followBroadcasts := r.applyManagedAIFollowUpdateLocked(runID, current, nextRunState, params.Chunk)
	r.active[runID] = nextRunState
	return followBroadcasts, nil
}

func (r *LiveRuntime) requireActiveRunLocked(runID string) (*liveRunState, error) {
	if r == nil {
		return nil, nil
	}
	current, ok := r.active[runID]
	if !ok || current == nil || current.ChatState == nil {
		return nil, ErrLiveRunNotActive
	}
	return current, nil
}

func buildNextLiveRunState(current *liveRunState, params StreamChunkParams) (*liveRunState, error) {
	nextChatState, err := applyStreamChunk(*current.ChatState, params.Chunk)
	if err != nil {
		return nil, err
	}
	return &liveRunState{
		ChatState:       nextChatState.Clone(),
		ProjectConfigID: resolveLiveRuntimeProjectConfigID(current, params.ProjectConfigID),
		ChatID:          resolveLiveRuntimeChatID(current, params.ChatID),
	}, nil
}

func resolveLiveRuntimeProjectConfigID(current *liveRunState, override *string) string {
	if override != nil {
		if trimmedProjectID := strings.TrimSpace(*override); trimmedProjectID != "" {
			return trimmedProjectID
		}
	}
	if current == nil {
		return ""
	}
	return strings.TrimSpace(current.ProjectConfigID)
}

func resolveLiveRuntimeChatID(current *liveRunState, chatID string) string {
	if trimmedChatID := strings.TrimSpace(chatID); trimmedChatID != "" {
		return trimmedChatID
	}
	if current == nil {
		return ""
	}
	return strings.TrimSpace(current.ChatID)
}

func (r *LiveRuntime) broadcastAppliedChunk(
	ctx context.Context,
	chatID string,
	params StreamChunkParams,
	followBroadcasts []realtime.AIFollowToolArgumentsUpdateContent,
) error {
	if r == nil || r.broadcaster == nil {
		return nil
	}
	if _, err := r.broadcaster.BroadcastJSON(
		ctx,
		realtime.NewLLMStreamingResponseMessage(realtime.LLMStreamingResponseContent{
			ChatID:          chatID,
			Chunk:           cloneStreamChunk(params.Chunk),
			SectionID:       cloneStringPointer(params.SectionID),
			ProjectConfigID: cloneStringPointer(params.ProjectConfigID),
		}),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	); err != nil {
		return err
	}
	for _, content := range followBroadcasts {
		if _, err := r.broadcaster.BroadcastJSON(
			ctx,
			realtime.NewAIFollowToolArgumentsUpdateMessage(content),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		); err != nil {
			return err
		}
	}
	return nil
}

func (r *LiveRuntime) applyManagedAIFollowUpdateLocked(
	runID string,
	previousState *liveRunState,
	nextState *liveRunState,
	chunk any,
) []realtime.AIFollowToolArgumentsUpdateContent {
	if r == nil || nextState == nil {
		return nil
	}
	broadcasts := r.clearManagedAIFollowEntryLocked(runID, previousState, nextState)
	idsByType, ok := extractManagedAIFollowIDsByType(chunk)
	nextKey, nextOK := nextState.followKey()
	if !ok || !nextOK {
		return broadcasts
	}
	return r.syncManagedAIFollowEntryLocked(runID, nextKey, idsByType, broadcasts)
}

func (r *LiveRuntime) clearManagedAIFollowEntryLocked(
	runID string,
	previousState *liveRunState,
	nextState *liveRunState,
) []realtime.AIFollowToolArgumentsUpdateContent {
	previousKey, previousOK := previousState.followKey()
	nextKey, nextOK := nextState.followKey()
	if !previousOK || (nextOK && nextKey == previousKey) {
		return nil
	}
	entry, exists := r.followByChat[previousKey]
	if !exists || entry.RunID != runID {
		return nil
	}
	delete(r.followByChat, previousKey)
	return []realtime.AIFollowToolArgumentsUpdateContent{
		managedAIFollowClearBroadcast(previousKey),
	}
}

func (r *LiveRuntime) syncManagedAIFollowEntryLocked(
	runID string,
	nextKey managedAIFollowChatKey,
	idsByType map[string][]string,
	broadcasts []realtime.AIFollowToolArgumentsUpdateContent,
) []realtime.AIFollowToolArgumentsUpdateContent {
	current, exists := r.followByChat[nextKey]
	if len(idsByType) == 0 {
		if exists && current.RunID == runID {
			delete(r.followByChat, nextKey)
			return append(broadcasts, managedAIFollowClearBroadcast(nextKey))
		}
		return broadcasts
	}
	if exists && current.RunID == runID && stringSliceMapsEqual(current.IDsByType, idsByType) {
		return broadcasts
	}
	r.followByChat[nextKey] = managedAIFollowEntry{
		RunID:     runID,
		IDsByType: cloneStringSliceMap(idsByType),
	}
	return append(broadcasts, managedAIFollowUpdateBroadcast(nextKey, idsByType))
}

func managedAIFollowClearBroadcast(
	key managedAIFollowChatKey,
) realtime.AIFollowToolArgumentsUpdateContent {
	return realtime.AIFollowToolArgumentsUpdateContent{
		ProjectConfigID: key.ProjectConfigID,
		ChatID:          key.ChatID,
		IDsByType:       map[string][]string{},
	}
}

func managedAIFollowUpdateBroadcast(
	key managedAIFollowChatKey,
	idsByType map[string][]string,
) realtime.AIFollowToolArgumentsUpdateContent {
	return realtime.AIFollowToolArgumentsUpdateContent{
		ProjectConfigID: key.ProjectConfigID,
		ChatID:          key.ChatID,
		IDsByType:       cloneStringSliceMap(idsByType),
	}
}
