package orchestrator

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"setta/internal/chat"
	"setta/internal/workspace"
)

const defaultEventPageLimit = 100

type WorkspaceResolver interface {
	ResolveWorkspace(id string) (workspace.WorkspaceSummary, error)
}

type Service struct {
	store             WorkflowStore
	workspaceResolver WorkspaceResolver
	events            *EventHub
	runnerRegistry    RunnerRegistry
	codexChatService  CodexChatService
	chatSubscription  *chat.EventSubscription
	newID             IDGenerator
	now               func() time.Time
	mu                sync.Mutex
}

type Option func(*Service)

type ValidationError struct {
	Result WorkflowValidationResult
}

func (err *ValidationError) Error() string {
	if len(err.Result.Diagnostics) == 0 {
		return "workflow definition is invalid"
	}
	return err.Result.Diagnostics[0].Message
}

func NewService(store WorkflowStore, workspaceResolver WorkspaceResolver, options ...Option) (*Service, error) {
	if store == nil {
		return nil, errors.New("workflow store is required")
	}
	if workspaceResolver == nil {
		return nil, errors.New("workspace resolver is required")
	}
	service := &Service{
		store:             store,
		workspaceResolver: workspaceResolver,
		events:            NewEventHub(),
		runnerRegistry:    DefaultRunnerRegistry(),
		newID:             randomID,
		now:               time.Now,
	}
	for _, option := range options {
		option(service)
	}
	if service.codexChatService != nil {
		runner, err := NewCodexActionRunner(service.codexChatService)
		if err != nil {
			return nil, err
		}
		service.runnerRegistry = service.runnerRegistry.WithRunner(runner)
		if err := service.startChatEventReconciler(); err != nil {
			return nil, err
		}
	}
	if err := service.recoverInterruptedExecutions(); err != nil {
		return nil, err
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

func WithRunnerRegistry(registry RunnerRegistry) Option {
	return func(service *Service) {
		service.runnerRegistry = registry
	}
}

func WithEventHub(events *EventHub) Option {
	return func(service *Service) {
		service.events = events
	}
}

func WithCodexChatService(chatService *chat.Service) Option {
	return WithCodexChatClient(chatService)
}

func WithCodexChatClient(chatService CodexChatService) Option {
	return func(service *Service) {
		service.codexChatService = chatService
	}
}

func (service *Service) SubscribeEvents(cursor WorkflowEventCursor) (*EventSubscription, error) {
	if err := validateWorkflowEventCursor(cursor); err != nil {
		return nil, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	replay := []WorkflowEventEnvelope{}
	if cursor.StreamID != "" {
		var err error
		replay, err = service.store.LoadWorkflowEventStreamAfter(cursor)
		if err != nil {
			return nil, err
		}
	}
	return service.events.Subscribe(replay), nil
}

func (service *Service) CloseEvents() {
	if service.chatSubscription != nil {
		service.chatSubscription.Unsubscribe()
	}
	service.events.Close()
}

func (service *Service) ListDefinitions(workspaceID string) ([]WorkflowDefinition, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return nil, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.store.ListDefinitions(workspaceID)
}

func (service *Service) CreateDefinition(workspaceID string, name string, description string, graph WorkflowGraph) (WorkflowDefinition, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowDefinition{}, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return WorkflowDefinition{}, errors.New("workflow definition name is required")
	}
	if result := ValidateGraph(graph, service.runnerRegistry); !result.Valid {
		return WorkflowDefinition{}, &ValidationError{Result: result}
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	now := timestamp(service.now())
	definitionID, err := service.newID("workflow_definition")
	if err != nil {
		return WorkflowDefinition{}, fmt.Errorf("create workflow definition id: %w", err)
	}
	versionID, err := service.newID("workflow_version")
	if err != nil {
		return WorkflowDefinition{}, fmt.Errorf("create workflow version id: %w", err)
	}
	version := WorkflowDefinitionVersion{
		SchemaVersion: SchemaVersion,
		ID:            versionID,
		WorkspaceID:   workspaceID,
		DefinitionID:  definitionID,
		VersionNumber: 1,
		Name:          name,
		Description:   description,
		Graph:         graph,
		CreatedAt:     now,
	}
	definition := WorkflowDefinition{
		SchemaVersion:        SchemaVersion,
		ID:                   definitionID,
		WorkspaceID:          workspaceID,
		Name:                 name,
		Description:          description,
		CurrentVersionID:     versionID,
		CurrentVersionNumber: 1,
		Graph:                graph,
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	if err := service.store.SaveDefinitionRevision(definition, version); err != nil {
		return WorkflowDefinition{}, err
	}
	return definition, nil
}

func (service *Service) ReadDefinition(workspaceID string, definitionID string) (WorkflowDefinition, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowDefinition{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.store.LoadDefinition(workspaceID, definitionID)
}

func (service *Service) UpdateDefinition(workspaceID string, definitionID string, name string, description string, graph WorkflowGraph) (WorkflowDefinition, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowDefinition{}, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return WorkflowDefinition{}, errors.New("workflow definition name is required")
	}
	if result := ValidateGraph(graph, service.runnerRegistry); !result.Valid {
		return WorkflowDefinition{}, &ValidationError{Result: result}
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	current, err := service.store.LoadDefinition(workspaceID, definitionID)
	if err != nil {
		return WorkflowDefinition{}, err
	}
	now := timestamp(service.now())
	versionID, err := service.newID("workflow_version")
	if err != nil {
		return WorkflowDefinition{}, fmt.Errorf("create workflow version id: %w", err)
	}
	nextVersionNumber := current.CurrentVersionNumber + 1
	version := WorkflowDefinitionVersion{
		SchemaVersion: SchemaVersion,
		ID:            versionID,
		WorkspaceID:   workspaceID,
		DefinitionID:  definitionID,
		VersionNumber: nextVersionNumber,
		Name:          name,
		Description:   description,
		Graph:         graph,
		CreatedAt:     now,
	}
	next := current
	next.Name = name
	next.Description = description
	next.CurrentVersionID = versionID
	next.CurrentVersionNumber = nextVersionNumber
	next.Graph = graph
	next.UpdatedAt = now
	if err := service.store.SaveDefinitionRevision(next, version); err != nil {
		return WorkflowDefinition{}, err
	}
	return next, nil
}

func (service *Service) DeleteDefinition(workspaceID string, definitionID string) error {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	executions, err := service.store.ListExecutions(workspaceID)
	if err != nil {
		return err
	}
	for _, execution := range executions {
		if execution.DefinitionID == definitionID {
			return fmt.Errorf("workflow definition %s has execution history and cannot be deleted", definitionID)
		}
	}
	return service.store.DeleteDefinition(workspaceID, definitionID)
}

func (service *Service) ValidateDefinition(workspaceID string, graph WorkflowGraph) (WorkflowValidationResult, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowValidationResult{}, err
	}
	return ValidateGraph(graph, service.runnerRegistry), nil
}

func (service *Service) StartExecution(workspaceID string, definitionID string, versionID string) (WorkflowExecution, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowExecution{}, err
	}
	service.mu.Lock()

	definition, err := service.store.LoadDefinition(workspaceID, definitionID)
	if err != nil {
		service.mu.Unlock()
		return WorkflowExecution{}, err
	}
	if versionID == "" {
		versionID = definition.CurrentVersionID
	}
	version, err := service.store.LoadDefinitionVersion(workspaceID, definitionID, versionID)
	if err != nil {
		service.mu.Unlock()
		return WorkflowExecution{}, err
	}
	if result := ValidateGraph(version.Graph, service.runnerRegistry); !result.Valid {
		service.mu.Unlock()
		return WorkflowExecution{}, &ValidationError{Result: result}
	}
	transition, err := StartExecution(version, service.transitionContext())
	if err != nil {
		service.mu.Unlock()
		return WorkflowExecution{}, err
	}
	if err := service.persistTransition(transition); err != nil {
		service.mu.Unlock()
		return WorkflowExecution{}, err
	}
	executionID := transition.Execution.ID
	service.mu.Unlock()
	return service.dispatchReadyActions(workspaceID, executionID)
}

func (service *Service) CompleteAction(workspaceID string, executionID string, nodeExecutionID string, result WorkflowActionResult) (WorkflowExecution, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowExecution{}, err
	}
	execution, err := service.completeActionWithoutDispatch(workspaceID, executionID, nodeExecutionID, result)
	if err != nil {
		return WorkflowExecution{}, err
	}
	if execution.Status != ExecutionStatusRunning {
		return execution, nil
	}
	return service.dispatchReadyActions(workspaceID, executionID)
}

func (service *Service) CancelExecution(workspaceID string, executionID string) (WorkflowExecution, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowExecution{}, err
	}
	service.mu.Lock()
	execution, err := service.store.LoadExecution(workspaceID, executionID)
	if err != nil {
		service.mu.Unlock()
		return WorkflowExecution{}, err
	}
	if execution.Status == ExecutionStatusCancelled {
		service.mu.Unlock()
		return execution, nil
	}
	cancelDispatches := service.activeActionCancelRequestsLocked(workspaceID, execution, "")
	transition, err := CancelExecution(execution, service.transitionContext())
	if err != nil {
		service.mu.Unlock()
		return WorkflowExecution{}, err
	}
	if err := service.persistTransition(transition); err != nil {
		service.mu.Unlock()
		return WorkflowExecution{}, err
	}
	service.mu.Unlock()
	if err := service.cancelActionRunners(cancelDispatches); err != nil {
		return transition.Execution, err
	}
	return transition.Execution, nil
}

func (service *Service) ReadExecution(workspaceID string, executionID string) (WorkflowExecution, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowExecution{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.store.LoadExecution(workspaceID, executionID)
}

func (service *Service) ReadGraphProjection(workspaceID string, definitionID string, versionID string, executionID string) (WorkflowGraphProjection, bool, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowGraphProjection{}, false, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	if executionID != "" {
		projection, err := service.readExecutionGraphProjectionLocked(workspaceID, definitionID, versionID, executionID)
		return projection, true, err
	}
	projection, ok, err := service.readDefinitionGraphProjectionLocked(workspaceID, definitionID, versionID)
	return projection, ok, err
}

func (service *Service) ReadExecutionEventPage(workspaceID string, executionID string, beforeOrdinal int, limit int) (WorkflowExecutionEventPage, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowExecutionEventPage{}, err
	}
	if limit == 0 {
		limit = defaultEventPageLimit
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	if _, err := service.store.LoadExecution(workspaceID, executionID); err != nil {
		return WorkflowExecutionEventPage{}, err
	}
	return service.store.LoadExecutionEventPage(workspaceID, executionID, beforeOrdinal, limit)
}

func (service *Service) readExecutionGraphProjectionLocked(workspaceID string, definitionID string, versionID string, executionID string) (WorkflowGraphProjection, error) {
	execution, err := service.store.LoadExecution(workspaceID, executionID)
	if err != nil {
		return WorkflowGraphProjection{}, err
	}
	if definitionID != "" && definitionID != execution.DefinitionID {
		return WorkflowGraphProjection{}, fmt.Errorf("workflow execution %s belongs to definition %s, not %s", executionID, execution.DefinitionID, definitionID)
	}
	if versionID != "" && versionID != execution.DefinitionVersionID {
		return WorkflowGraphProjection{}, fmt.Errorf("workflow execution %s uses version %s, not %s", executionID, execution.DefinitionVersionID, versionID)
	}
	version, err := service.store.LoadDefinitionVersion(workspaceID, execution.DefinitionID, execution.DefinitionVersionID)
	if err != nil {
		return WorkflowGraphProjection{}, err
	}
	return buildWorkflowGraphProjection(version, &execution, execution.UpdatedAt)
}

func (service *Service) readDefinitionGraphProjectionLocked(workspaceID string, definitionID string, versionID string) (WorkflowGraphProjection, bool, error) {
	definition, ok, err := service.resolveProjectionDefinitionLocked(workspaceID, definitionID, versionID)
	if err != nil || !ok {
		return WorkflowGraphProjection{}, ok, err
	}
	if versionID == "" {
		versionID = definition.CurrentVersionID
	}
	version, err := service.store.LoadDefinitionVersion(workspaceID, definition.ID, versionID)
	if err != nil {
		return WorkflowGraphProjection{}, false, err
	}
	execution, err := service.latestExecutionForDefinitionVersionLocked(workspaceID, definition.ID, version.ID)
	if err != nil {
		return WorkflowGraphProjection{}, false, err
	}
	if execution != nil {
		projection, err := buildWorkflowGraphProjection(version, execution, definition.UpdatedAt)
		return projection, true, err
	}
	projection, err := buildWorkflowGraphProjection(version, nil, definition.UpdatedAt)
	return projection, true, err
}

func (service *Service) resolveProjectionDefinitionLocked(workspaceID string, definitionID string, versionID string) (WorkflowDefinition, bool, error) {
	if definitionID != "" {
		definition, err := service.store.LoadDefinition(workspaceID, definitionID)
		return definition, true, err
	}
	if versionID != "" {
		return WorkflowDefinition{}, false, errors.New("workflow definition id is required when version id is provided")
	}
	definitions, err := service.store.ListDefinitions(workspaceID)
	if err != nil {
		return WorkflowDefinition{}, false, err
	}
	if len(definitions) == 0 {
		return WorkflowDefinition{}, false, nil
	}
	return definitions[0], true, nil
}

func (service *Service) latestExecutionForDefinitionVersionLocked(workspaceID string, definitionID string, versionID string) (*WorkflowExecution, error) {
	executions, err := service.store.ListExecutions(workspaceID)
	if err != nil {
		return nil, err
	}
	for _, execution := range executions {
		if execution.DefinitionID == definitionID && execution.DefinitionVersionID == versionID {
			matched := execution
			return &matched, nil
		}
	}
	return nil, nil
}

func (service *Service) recoverInterruptedExecutions() error {
	service.mu.Lock()
	defer service.mu.Unlock()
	workspaceIDs, err := service.store.WorkspaceIDs()
	if err != nil {
		return err
	}
	for _, workspaceID := range workspaceIDs {
		executions, err := service.store.ListExecutions(workspaceID)
		if err != nil {
			return err
		}
		for _, execution := range executions {
			if execution.Status != ExecutionStatusRunning {
				continue
			}
			transition, err := InterruptExecution(execution, service.transitionContext(), "workflow execution was interrupted before backend startup")
			if err != nil {
				return err
			}
			if err := service.persistTransition(transition); err != nil {
				return err
			}
		}
	}
	return nil
}

func (service *Service) loadExecutionAndVersion(workspaceID string, executionID string) (WorkflowExecution, WorkflowDefinitionVersion, error) {
	execution, err := service.store.LoadExecution(workspaceID, executionID)
	if err != nil {
		return WorkflowExecution{}, WorkflowDefinitionVersion{}, err
	}
	version, err := service.store.LoadDefinitionVersion(workspaceID, execution.DefinitionID, execution.DefinitionVersionID)
	if err != nil {
		return WorkflowExecution{}, WorkflowDefinitionVersion{}, err
	}
	return execution, version, nil
}

func (service *Service) persistTransition(transition WorkflowTransition) error {
	events, err := service.store.PersistTransition(transition)
	if err != nil {
		return err
	}
	service.events.Publish(events)
	return nil
}

func (service *Service) transitionContext() TransitionContext {
	return TransitionContext{
		Now:   timestamp(service.now()),
		NewID: service.newID,
	}
}

func (service *Service) resolveWorkspace(workspaceID string) (workspace.WorkspaceSummary, error) {
	if err := validateStorageID("workspace id", workspaceID); err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return service.workspaceResolver.ResolveWorkspace(workspaceID)
}

func timestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func randomID(prefix string) (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(bytes[:]), nil
}
