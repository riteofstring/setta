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
