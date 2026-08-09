package managedllm

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"setta/internal/mcpx"
	"setta/internal/realtime"
	"setta/internal/tools"
)

type ResultFollowBroadcaster interface {
	BroadcastJSON(ctx context.Context, message any, selection realtime.Selection) (int, error)
}

type ToolResultFollowEmitterOptions struct {
	Broadcaster  ResultFollowBroadcaster
	TemporaryIDs *mcpx.TemporaryIDStore
}

type ToolResultFollowEmitter struct {
	broadcaster  ResultFollowBroadcaster
	temporaryIDs *mcpx.TemporaryIDStore
}

func NewToolResultFollowEmitter(options ToolResultFollowEmitterOptions) *ToolResultFollowEmitter {
	return &ToolResultFollowEmitter{
		broadcaster:  options.Broadcaster,
		temporaryIDs: options.TemporaryIDs,
	}
}

func (e *ToolResultFollowEmitter) Emit(
	ctx context.Context,
	projectConfigID string,
	chatID string,
	descriptor mcpx.ToolDescriptor,
	result mcpx.ToolCallResult,
) error {
	if e == nil {
		return nil
	}
	content, err := buildToolResultFollowContent(projectConfigID, chatID, descriptor, result, e.temporaryIDs)
	if err != nil || content == nil || e.broadcaster == nil {
		return err
	}
	_, err = e.broadcaster.BroadcastJSON(
		ctx,
		realtime.NewAIFollowToolResultUpdateMessage(*content),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	if err != nil {
		return fmt.Errorf("broadcast managed ai follow tool result update: %w", err)
	}
	return nil
}

func buildToolResultFollowContent(
	projectConfigID string,
	chatID string,
	descriptor mcpx.ToolDescriptor,
	result mcpx.ToolCallResult,
	temporaryIDs *mcpx.TemporaryIDStore,
) (*realtime.AIFollowToolResultUpdateContent, error) {
	trimmedProjectID := strings.TrimSpace(projectConfigID)
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedProjectID == "" || trimmedChatID == "" {
		return nil, nil
	}
	if result.IsError || descriptor.Metadata == nil || len(descriptor.Metadata.ResultIDPathsByType) == 0 {
		return nil, nil
	}

	payload, err := buildToolResultFollowPayload(result, descriptor.Metadata.ResultIDPathsByType)
	if err != nil || payload == nil {
		return nil, err
	}
	idsByType, err := extractToolResultFollowIDs(payload, descriptor.Metadata.ResultIDPathsByType, temporaryIDs)
	if err != nil || len(idsByType) == 0 {
		return nil, err
	}
	return &realtime.AIFollowToolResultUpdateContent{
		ProjectConfigID: trimmedProjectID,
		ChatID:          trimmedChatID,
		IDsByType:       idsByType,
	}, nil
}

func buildToolResultFollowPayload(
	result mcpx.ToolCallResult,
	resultIDPathsByType map[tools.IDType][]string,
) (any, error) {
	if result.StructuredContent != nil {
		return cloneJSONValue(result.StructuredContent), nil
	}
	trimmedText := strings.TrimSpace(result.Text)
	if trimmedText == "" {
		return nil, nil
	}
	if usesOnlyRootFollowPaths(resultIDPathsByType) {
		return trimmedText, nil
	}
	var payload any
	if err := json.Unmarshal([]byte(trimmedText), &payload); err != nil {
		return nil, fmt.Errorf("decode managed tool result follow payload: %w", err)
	}
	return payload, nil
}

func usesOnlyRootFollowPaths(resultIDPathsByType map[tools.IDType][]string) bool {
	foundPath := false
	for _, paths := range resultIDPathsByType {
		for _, rawPath := range paths {
			path := strings.TrimSpace(rawPath)
			if path == "" {
				continue
			}
			foundPath = true
			if path != "$" {
				return false
			}
		}
	}
	return foundPath
}

func extractToolResultFollowIDs(
	payload any,
	resultIDPathsByType map[tools.IDType][]string,
	temporaryIDs *mcpx.TemporaryIDStore,
) (map[string][]string, error) {
	combined := map[string]map[string]struct{}{}
	for idType, ids := range mcpx.ExtractIDsByType(payload, resultIDPathsByType, false) {
		for id := range ids {
			resolved, err := resolveToolResultFollowID(id, temporaryIDs)
			if err != nil {
				return nil, err
			}
			if resolved == "" {
				continue
			}
			targets := combined[string(idType)]
			if targets == nil {
				targets = map[string]struct{}{}
				combined[string(idType)] = targets
			}
			targets[resolved] = struct{}{}
		}
	}
	return normalizeToolResultFollowIDs(combined), nil
}

func resolveToolResultFollowID(raw string, temporaryIDs *mcpx.TemporaryIDStore) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	if temporaryIDs == nil {
		return trimmed, nil
	}
	resolved, err := temporaryIDs.ResolveClientID(trimmed)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(resolved), nil
}

func normalizeToolResultFollowIDs(raw map[string]map[string]struct{}) map[string][]string {
	if len(raw) == 0 {
		return nil
	}
	normalized := make(map[string][]string, len(raw))
	for idType, ids := range raw {
		if len(ids) == 0 {
			continue
		}
		values := make([]string, 0, len(ids))
		for id := range ids {
			values = append(values, id)
		}
		sort.Strings(values)
		normalized[idType] = values
	}
	if len(normalized) == 0 {
		return nil
	}
	return normalized
}
