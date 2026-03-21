package externalagents

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"

	"setta/internal/agentruns"
	"setta/internal/mcpx"
	"setta/internal/realtime"
	"setta/internal/tools"
)

var (
	ErrFollowToolProviderRequired = errors.New("external agent follow tool provider is required")
)

type FollowToolProvider interface {
	ToolDescriptorsForServers(serverIDs map[string]struct{}) map[string]mcpx.ToolDescriptor
}

type FollowBroadcaster interface {
	BroadcastJSON(ctx context.Context, message any, selection realtime.Selection) (int, error)
}

type FollowServiceOptions struct {
	Tools        FollowToolProvider
	TemporaryIDs *mcpx.TemporaryIDStore
	Broadcaster  FollowBroadcaster
}

type FollowService struct {
	tools        FollowToolProvider
	temporaryIDs *mcpx.TemporaryIDStore
	broadcaster  FollowBroadcaster

	mu           sync.Mutex
	nextSequence uint64
	entriesByRun map[string]followRunEntry
}

type followRunEntry struct {
	ProjectConfigID string
	ChatID          string
	IDsByType       map[string][]string
	Sequence        uint64
}

type followChatKey struct {
	ProjectConfigID string
	ChatID          string
}

func NewFollowService(options FollowServiceOptions) (*FollowService, error) {
	if options.Tools == nil {
		return nil, ErrFollowToolProviderRequired
	}
	return &FollowService{
		tools:        options.Tools,
		temporaryIDs: options.TemporaryIDs,
		broadcaster:  options.Broadcaster,
		entriesByRun: map[string]followRunEntry{},
	}, nil
}

func (s *FollowService) SyncRun(ctx context.Context, run agentruns.Run, state ChatState) error {
	if s == nil {
		return nil
	}
	projectConfigID := resolveRunInputString(run, "projectConfigId")
	chatID := resolveRunInputString(run, "chatId")
	if projectConfigID == "" || chatID == "" {
		return nil
	}
	toolMetadata := s.toolMetadata()
	if len(toolMetadata) == 0 {
		return nil
	}
	idsByType, err := s.extractIDsByType(state, toolMetadata)
	if err != nil {
		return err
	}
	key := followChatKey{
		ProjectConfigID: projectConfigID,
		ChatID:          chatID,
	}

	s.mu.Lock()
	before := s.effectiveEntryLocked(key)
	if len(idsByType) == 0 {
		delete(s.entriesByRun, strings.TrimSpace(run.ID))
	} else {
		s.nextSequence++
		s.entriesByRun[strings.TrimSpace(run.ID)] = followRunEntry{
			ProjectConfigID: projectConfigID,
			ChatID:          chatID,
			IDsByType:       cloneFollowIDsByType(idsByType),
			Sequence:        s.nextSequence,
		}
	}
	after := s.effectiveEntryLocked(key)
	s.mu.Unlock()

	if followEntriesEqual(before, after) {
		return nil
	}
	return s.broadcast(ctx, key, after)
}

func (s *FollowService) ClearRun(ctx context.Context, runID string) error {
	if s == nil {
		return nil
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return nil
	}

	s.mu.Lock()
	current, ok := s.entriesByRun[trimmedRunID]
	if !ok {
		s.mu.Unlock()
		return nil
	}
	key := followChatKey{
		ProjectConfigID: current.ProjectConfigID,
		ChatID:          current.ChatID,
	}
	before := s.effectiveEntryLocked(key)
	delete(s.entriesByRun, trimmedRunID)
	after := s.effectiveEntryLocked(key)
	s.mu.Unlock()

	if followEntriesEqual(before, after) {
		return nil
	}
	return s.broadcast(ctx, key, after)
}

func (s *FollowService) Snapshot(projectConfigID string) []realtime.AIFollowToolArgumentsUpdateContent {
	if s == nil {
		return []realtime.AIFollowToolArgumentsUpdateContent{}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	byChat := make(map[followChatKey]followRunEntry)
	for _, entry := range s.entriesByRun {
		if entry.ProjectConfigID != projectConfigID {
			continue
		}
		key := followChatKey{
			ProjectConfigID: entry.ProjectConfigID,
			ChatID:          entry.ChatID,
		}
		current, ok := byChat[key]
		if !ok || entry.Sequence > current.Sequence {
			byChat[key] = entry
		}
	}

	keys := make([]followChatKey, 0, len(byChat))
	for key := range byChat {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i int, j int) bool {
		return keys[i].ChatID < keys[j].ChatID
	})

	snapshot := make([]realtime.AIFollowToolArgumentsUpdateContent, 0, len(keys))
	for _, key := range keys {
		entry := byChat[key]
		if len(entry.IDsByType) == 0 {
			continue
		}
		snapshot = append(snapshot, realtime.AIFollowToolArgumentsUpdateContent{
			ProjectConfigID: entry.ProjectConfigID,
			ChatID:          entry.ChatID,
			IDsByType:       cloneFollowIDsByType(entry.IDsByType),
		})
	}
	return snapshot
}

func (s *FollowService) toolMetadata() map[string]tools.Metadata {
	serverIDs := map[string]struct{}{mcpx.DefaultServerID: {}}
	descriptors := s.tools.ToolDescriptorsForServers(serverIDs)
	if len(descriptors) == 0 {
		return nil
	}
	metadata := make(map[string]tools.Metadata, len(descriptors))
	for _, descriptor := range descriptors {
		if descriptor.Metadata == nil || len(descriptor.Metadata.IDPathsByType) == 0 {
			continue
		}
		metadata[mcpx.NormalizeToolName(descriptor.NamespacedName)] = *descriptor.Metadata
	}
	return metadata
}

func (s *FollowService) extractIDsByType(state ChatState, toolMetadata map[string]tools.Metadata) (map[string][]string, error) {
	combined := map[string]map[string]struct{}{}
	for toolCallID := range state.ToolCallArguments {
		toolName, arguments := lookupToolCallContext(&state, toolCallID)
		normalizedToolName := mcpx.NormalizeToolName(toolName)
		metadata, ok := toolMetadata[normalizedToolName]
		if !ok || len(arguments) == 0 {
			continue
		}
		idsByType := mcpx.ExtractIDsByType(arguments, metadata.IDPathsByType, true)
		for idType, ids := range idsByType {
			for id := range ids {
				resolvedID, keep, err := s.resolveFollowID(id)
				if err != nil {
					return nil, err
				}
				if !keep {
					continue
				}
				targets := combined[string(idType)]
				if targets == nil {
					targets = map[string]struct{}{}
					combined[string(idType)] = targets
				}
				targets[resolvedID] = struct{}{}
			}
		}
	}
	return normalizeFollowIDsByType(combined), nil
}

func (s *FollowService) resolveFollowID(raw string) (string, bool, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false, nil
	}
	if s.temporaryIDs == nil {
		return trimmed, true, nil
	}
	resolved, err := s.temporaryIDs.ResolveClientID(trimmed)
	if err != nil {
		var unknown *mcpx.UnknownTemporaryIDError
		if errors.As(err, &unknown) {
			return "", false, nil
		}
		return "", false, err
	}
	resolved = strings.TrimSpace(resolved)
	if resolved == "" {
		return "", false, nil
	}
	return resolved, true, nil
}

func (s *FollowService) effectiveEntryLocked(key followChatKey) followRunEntry {
	current := followRunEntry{}
	for _, entry := range s.entriesByRun {
		if entry.ProjectConfigID != key.ProjectConfigID || entry.ChatID != key.ChatID {
			continue
		}
		if entry.Sequence > current.Sequence {
			current = followRunEntry{
				ProjectConfigID: entry.ProjectConfigID,
				ChatID:          entry.ChatID,
				IDsByType:       cloneFollowIDsByType(entry.IDsByType),
				Sequence:        entry.Sequence,
			}
		}
	}
	return current
}

func (s *FollowService) broadcast(ctx context.Context, key followChatKey, entry followRunEntry) error {
	if s == nil || s.broadcaster == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	idsByType := cloneFollowIDsByType(entry.IDsByType)
	if idsByType == nil {
		idsByType = map[string][]string{}
	}
	_, err := s.broadcaster.BroadcastJSON(ctx, realtime.NewAIFollowToolArgumentsUpdateMessage(realtime.AIFollowToolArgumentsUpdateContent{
		ProjectConfigID: key.ProjectConfigID,
		ChatID:          key.ChatID,
		IDsByType:       idsByType,
	}), realtime.Selection{Type: realtime.ConnectionTypeFrontend})
	if err != nil {
		return fmt.Errorf("broadcast external agent ai follow update: %w", err)
	}
	return nil
}

func normalizeFollowIDsByType(raw map[string]map[string]struct{}) map[string][]string {
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

func cloneFollowIDsByType(raw map[string][]string) map[string][]string {
	if len(raw) == 0 {
		return nil
	}
	cloned := make(map[string][]string, len(raw))
	for idType, ids := range raw {
		cloned[idType] = append([]string(nil), ids...)
	}
	return cloned
}

func followEntriesEqual(left followRunEntry, right followRunEntry) bool {
	if left.ProjectConfigID != right.ProjectConfigID || left.ChatID != right.ChatID {
		return false
	}
	if len(left.IDsByType) != len(right.IDsByType) {
		return false
	}
	for idType, leftIDs := range left.IDsByType {
		rightIDs, ok := right.IDsByType[idType]
		if !ok || len(leftIDs) != len(rightIDs) {
			return false
		}
		for index := range leftIDs {
			if leftIDs[index] != rightIDs[index] {
				return false
			}
		}
	}
	return true
}
