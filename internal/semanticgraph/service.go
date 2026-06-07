package semanticgraph

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"setta/internal/workspace"
)

type WorkspaceResolver interface {
	ResolveWorkspace(id string) (workspace.WorkspaceSummary, error)
}

type IDGenerator func(prefix string) (string, error)

type Service struct {
	store             *Store
	workspaceResolver WorkspaceResolver
	workflowResolver  WorkflowSourceResolver
	chatResolver      ChatSourceResolver
	newID             IDGenerator
	now               func() time.Time
}

type Option func(*Service)

func NewService(store *Store, workspaceResolver WorkspaceResolver, options ...Option) (*Service, error) {
	if store == nil {
		return nil, errors.New("semantic graph store is required")
	}
	if workspaceResolver == nil {
		return nil, errors.New("workspace resolver is required")
	}
	service := &Service{
		store:             store,
		workspaceResolver: workspaceResolver,
		newID:             randomID,
		now:               time.Now,
	}
	for _, option := range options {
		option(service)
	}
	return service, nil
}

func WithIDGenerator(newID IDGenerator) Option {
	return func(service *Service) {
		service.newID = newID
	}
}

func WithClock(now func() time.Time) Option {
	return func(service *Service) {
		service.now = now
	}
}

func WithWorkflowSourceResolver(resolver WorkflowSourceResolver) Option {
	return func(service *Service) {
		service.workflowResolver = resolver
	}
}

func WithChatSourceResolver(resolver ChatSourceResolver) Option {
	return func(service *Service) {
		service.chatResolver = resolver
	}
}

func (service *Service) AppendEvent(ctx context.Context, event SemanticEvent) (SemanticEvent, error) {
	if ctx == nil {
		return SemanticEvent{}, errors.New("context is required")
	}
	if _, err := service.resolveWorkspace(event.WorkspaceID); err != nil {
		return SemanticEvent{}, err
	}
	if event.EventID == "" {
		id, err := service.newID("semantic_event")
		if err != nil {
			return SemanticEvent{}, fmt.Errorf("create semantic event id: %w", err)
		}
		event.EventID = id
	}
	if event.ObservedAt == "" {
		event.ObservedAt = timestamp(service.now())
	}
	if event.ModelInfo == nil {
		event.ModelInfo = map[string]string{}
	}
	return service.store.AppendEvent(ctx, event)
}

func (service *Service) appendEvents(ctx context.Context, events []SemanticEvent) ([]SemanticEvent, error) {
	if ctx == nil {
		return nil, errors.New("context is required")
	}
	if len(events) == 0 {
		return nil, errors.New("semantic events are required")
	}
	workspaceID := events[0].WorkspaceID
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return nil, err
	}
	for index := range events {
		if events[index].WorkspaceID != workspaceID {
			return nil, fmt.Errorf("semantic events must belong to one workspace")
		}
		if events[index].EventID == "" {
			id, err := service.newID("semantic_event")
			if err != nil {
				return nil, fmt.Errorf("create semantic event id: %w", err)
			}
			events[index].EventID = id
		}
		if events[index].ObservedAt == "" {
			events[index].ObservedAt = timestamp(service.now())
		}
		if events[index].ModelInfo == nil {
			events[index].ModelInfo = map[string]string{}
		}
	}
	return service.store.AppendEvents(ctx, events)
}

func (service *Service) RebuildProjections(ctx context.Context) error {
	return service.store.RebuildProjections(ctx)
}

func (service *Service) ReadGraph(ctx context.Context, workspaceID string) (SemanticGraph, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return SemanticGraph{}, err
	}
	return service.store.ReadGraph(ctx, workspaceID)
}

func (service *Service) ReadNodeDetail(ctx context.Context, workspaceID string, nodeID string) (SemanticNodeDetail, bool, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return SemanticNodeDetail{}, false, err
	}
	return service.store.ReadNodeDetail(ctx, workspaceID, nodeID)
}

func (service *Service) ListEvidence(ctx context.Context, workspaceID string, targetEntityID string) (SemanticEvidenceList, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return SemanticEvidenceList{}, err
	}
	return service.store.ListEvidence(ctx, workspaceID, targetEntityID)
}

func (service *Service) ListActivity(ctx context.Context, workspaceID string, targetEntityID string, limit int) (SemanticActivityList, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return SemanticActivityList{}, err
	}
	return service.store.ListActivity(ctx, workspaceID, targetEntityID, limit)
}

func (service *Service) ListActivityPage(ctx context.Context, filter SemanticActivityFilter) (SemanticActivityPage, error) {
	if _, err := service.resolveWorkspace(filter.WorkspaceID); err != nil {
		return SemanticActivityPage{}, err
	}
	return service.store.ListActivityPage(ctx, filter)
}

func (service *Service) ReadActivitySummary(ctx context.Context, workspaceID string, recentLimit int) (SemanticActivitySummary, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return SemanticActivitySummary{}, err
	}
	return service.store.ReadActivitySummary(ctx, workspaceID, recentLimit)
}

func (service *Service) ReadSteeringState(ctx context.Context, workspaceID string, targetEntityID string) (SemanticSteeringState, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return SemanticSteeringState{}, err
	}
	return service.store.ReadSteeringState(ctx, workspaceID, targetEntityID)
}

func (service *Service) ReadEventHistory(ctx context.Context, workspaceID string, targetEntityID string, beforeLogicalClock int, limit int) (SemanticEventHistory, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return SemanticEventHistory{}, err
	}
	return service.store.ReadEventHistory(ctx, workspaceID, targetEntityID, beforeLogicalClock, limit)
}

func (service *Service) ReadContextPack(ctx context.Context, workspaceID string, packID string) (SemanticContextPackRecord, bool, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return SemanticContextPackRecord{}, false, err
	}
	return service.store.ReadContextPack(ctx, workspaceID, packID)
}

func (service *Service) ListContextPacks(ctx context.Context, filter SemanticContextPackFilter) (SemanticContextPackList, error) {
	if _, err := service.resolveWorkspace(filter.WorkspaceID); err != nil {
		return SemanticContextPackList{}, err
	}
	return service.store.ListContextPacks(ctx, filter)
}

func (service *Service) UpdateLayoutPositions(ctx context.Context, workspaceID string, positions []SemanticLayoutPositionInput) (SemanticLayoutPositionList, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return SemanticLayoutPositionList{}, err
	}
	return service.store.UpdateLayoutPositions(ctx, workspaceID, positions, timestamp(service.now()))
}

func (service *Service) SaveCartographerRun(ctx context.Context, run CartographerRun) (CartographerRun, error) {
	if _, err := service.resolveWorkspace(run.WorkspaceID); err != nil {
		return CartographerRun{}, err
	}
	return service.store.SaveCartographerRun(ctx, run)
}

func (service *Service) ReadCartographerRun(ctx context.Context, workspaceID string, runID string) (CartographerRun, bool, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return CartographerRun{}, false, err
	}
	return service.store.ReadCartographerRun(ctx, workspaceID, runID)
}

func (service *Service) SaveCartographerWindow(ctx context.Context, window CartographerWindow) (CartographerWindow, error) {
	if _, err := service.resolveWorkspace(window.WorkspaceID); err != nil {
		return CartographerWindow{}, err
	}
	return service.store.SaveCartographerWindow(ctx, window)
}

func (service *Service) ReadCartographerWindow(ctx context.Context, workspaceID string, windowID string) (CartographerWindow, bool, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return CartographerWindow{}, false, err
	}
	return service.store.ReadCartographerWindow(ctx, workspaceID, windowID)
}

func (service *Service) SaveCartographerCursor(ctx context.Context, cursor CartographerCursor) (CartographerCursor, error) {
	if _, err := service.resolveWorkspace(cursor.WorkspaceID); err != nil {
		return CartographerCursor{}, err
	}
	return service.store.SaveCartographerCursor(ctx, cursor)
}

func (service *Service) ReadCartographerCursor(ctx context.Context, workspaceID string, sourceKind CartographerSourceKind, sourceID string) (CartographerCursor, bool, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return CartographerCursor{}, false, err
	}
	return service.store.ReadCartographerCursor(ctx, workspaceID, sourceKind, sourceID)
}

func (service *Service) SaveCartographerTrajectorySummary(ctx context.Context, summary CartographerTrajectorySummary) (CartographerTrajectorySummary, error) {
	if _, err := service.resolveWorkspace(summary.WorkspaceID); err != nil {
		return CartographerTrajectorySummary{}, err
	}
	return service.store.SaveCartographerTrajectorySummary(ctx, summary)
}

func (service *Service) ReadCartographerTrajectorySummary(ctx context.Context, workspaceID string, summaryID string) (CartographerTrajectorySummary, bool, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return CartographerTrajectorySummary{}, false, err
	}
	return service.store.ReadCartographerTrajectorySummary(ctx, workspaceID, summaryID)
}

func (service *Service) SaveCartographerPatch(ctx context.Context, patch CartographerPatchRecord) (CartographerPatchRecord, error) {
	if _, err := service.resolveWorkspace(patch.WorkspaceID); err != nil {
		return CartographerPatchRecord{}, err
	}
	return service.store.SaveCartographerPatch(ctx, patch)
}

func (service *Service) ReadCartographerPatch(ctx context.Context, workspaceID string, patchID string) (CartographerPatchRecord, bool, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return CartographerPatchRecord{}, false, err
	}
	return service.store.ReadCartographerPatch(ctx, workspaceID, patchID)
}

func (service *Service) resolveWorkspace(workspaceID string) (workspace.WorkspaceSummary, error) {
	if err := validateStoreIDs("workspace id", workspaceID); err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return service.workspaceResolver.ResolveWorkspace(workspaceID)
}

func randomID(prefix string) (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(data[:]), nil
}
