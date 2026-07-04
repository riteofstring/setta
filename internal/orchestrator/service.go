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
	"setta/internal/semanticcontext"
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
	semanticCompiler  semanticcontext.Compiler
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

const WorkflowExecutionAlreadyRunningCode = "workflow_execution_already_running"

type WorkflowExecutionAlreadyRunningError struct {
	ActiveExecution WorkflowExecutionSummary
}

func (err *WorkflowExecutionAlreadyRunningError) Error() string {
	return fmt.Sprintf("workflow execution %s is already running for workflow definition %s", err.ActiveExecution.ID, err.ActiveExecution.DefinitionID)
}

func IsWorkflowExecutionAlreadyRunning(err error) (*WorkflowExecutionAlreadyRunningError, bool) {
	var conflict *WorkflowExecutionAlreadyRunningError
	if errors.As(err, &conflict) {
		return conflict, true
	}
	return nil, false
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
		runner, err := NewCodexActionRunner(service.codexChatService, service.semanticCompiler)
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

func WithSemanticContextCompiler(compiler semanticcontext.Compiler) Option {
	return func(service *Service) {
		service.semanticCompiler = compiler
	}
}

func (service *Service) SetSemanticContextCompiler(compiler semanticcontext.Compiler) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	service.semanticCompiler = compiler
	if service.codexChatService == nil {
		return nil
	}
	runner, err := NewCodexActionRunner(service.codexChatService, compiler)
	if err != nil {
		return err
	}
	service.runnerRegistry = service.runnerRegistry.WithRunner(runner)
	return nil
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
	workspaceSummary, err := service.resolveWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.listWorkspaceDefinitions(workspaceSummary)
}

func (service *Service) CreateDefinition(workspaceID string, name string, description string, graph WorkflowGraph) (WorkflowDefinition, error) {
	workspaceSummary, err := service.resolveWorkspace(workspaceID)
	if err != nil {
		return WorkflowDefinition{}, err
	}
	graph = normalizeWorkflowGraph(graph)
	name = strings.TrimSpace(name)
	if name == "" {
		return WorkflowDefinition{}, errors.New("workflow definition name is required")
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	now := timestamp(service.now())
	definitionID, err := service.newID("workflow_definition")
	if err != nil {
		return WorkflowDefinition{}, fmt.Errorf("create workflow definition id: %w", err)
	}
	definition := WorkflowDefinition{
		SchemaVersion: SchemaVersion,
		ID:            definitionID,
		WorkspaceID:   workspaceID,
		Name:          name,
		Description:   description,
		Graph:         graph,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	return writeWorkflowDefinitionFile(workspaceSummary.RootPath, definition, "")
}

func (service *Service) ReadDefinition(workspaceID string, definitionID string) (WorkflowDefinition, error) {
	workspaceSummary, err := service.resolveWorkspace(workspaceID)
	if err != nil {
		return WorkflowDefinition{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	definition, _, err := service.loadWorkspaceDefinition(workspaceSummary, definitionID)
	return definition, err
}

func (service *Service) UpdateDefinition(workspaceID string, definitionID string, name string, description string, graph WorkflowGraph) (WorkflowDefinition, error) {
	workspaceSummary, err := service.resolveWorkspace(workspaceID)
	if err != nil {
		return WorkflowDefinition{}, err
	}
	graph = normalizeWorkflowGraph(graph)
	name = strings.TrimSpace(name)
	if name == "" {
		return WorkflowDefinition{}, errors.New("workflow definition name is required")
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	current, currentPath, err := service.loadWorkspaceDefinition(workspaceSummary, definitionID)
	if err != nil {
		return WorkflowDefinition{}, err
	}
	now := timestamp(service.now())
	next := current
	next.Name = name
	next.Description = description
	next.Graph = graph
	next.UpdatedAt = now
	return writeWorkflowDefinitionFile(workspaceSummary.RootPath, next, currentPath)
}

func (service *Service) DeleteDefinition(workspaceID string, definitionID string) error {
	workspaceSummary, err := service.resolveWorkspace(workspaceID)
	if err != nil {
		return err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	_, definitionPath, err := service.loadWorkspaceDefinition(workspaceSummary, definitionID)
	if err != nil {
		return err
	}
	executions, err := service.store.ListExecutions(workspaceID)
	if err != nil {
		return err
	}
	for _, execution := range executions {
		if execution.DefinitionID == definitionID {
			return fmt.Errorf("workflow definition %s has execution history and cannot be deleted", definitionID)
		}
	}
	return deleteWorkflowDefinitionFile(definitionPath)
}

func (service *Service) ValidateDefinition(workspaceID string, graph WorkflowGraph) (WorkflowValidationResult, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowValidationResult{}, err
	}
	return ValidateGraph(graph, service.runnerRegistry), nil
}

func (service *Service) StartExecution(workspaceID string, definitionID string, versionID string) (WorkflowExecution, error) {
	workspaceSummary, err := service.resolveWorkspace(workspaceID)
	if err != nil {
		return WorkflowExecution{}, err
	}
	service.mu.Lock()
	executionID, err := service.startExecutionLocked(workspaceSummary, workspaceID, definitionID, versionID)
	service.mu.Unlock()
	if err != nil {
		return WorkflowExecution{}, err
	}
	return service.dispatchReadyActions(workspaceID, executionID)
}

func (service *Service) startExecutionLocked(workspaceSummary workspace.WorkspaceSummary, workspaceID string, definitionID string, versionID string) (string, error) {
	if err := service.rejectActiveExecutionForDefinitionLocked(workspaceID, definitionID); err != nil {
		return "", err
	}
	version, createVersion, err := service.startExecutionVersionLocked(workspaceSummary, workspaceID, definitionID, versionID)
	if err != nil {
		return "", err
	}
	if result := ValidateExecutableGraph(version.Graph, service.runnerRegistry); !result.Valid {
		return "", &ValidationError{Result: result}
	}
	transition, err := StartExecution(version, service.transitionContext())
	if err != nil {
		return "", err
	}
	if createVersion {
		err = service.persistExecutionStart(version, transition)
	} else {
		err = service.persistTransition(transition)
	}
	if err != nil {
		return "", err
	}
	return transition.Execution.ID, nil
}

func (service *Service) rejectActiveExecutionForDefinitionLocked(workspaceID string, definitionID string) error {
	activeExecution, ok, err := service.store.ActiveExecutionForDefinition(workspaceID, definitionID)
	if err != nil {
		return err
	}
	if ok {
		activeSummary, err := service.workflowExecutionSummaryLocked(activeExecution)
		if err != nil {
			return err
		}
		return &WorkflowExecutionAlreadyRunningError{ActiveExecution: activeSummary}
	}
	return nil
}

func (service *Service) startExecutionVersionLocked(workspaceSummary workspace.WorkspaceSummary, workspaceID string, definitionID string, versionID string) (WorkflowDefinitionVersion, bool, error) {
	if versionID == "" {
		definition, _, err := service.loadWorkspaceDefinition(workspaceSummary, definitionID)
		if err != nil {
			return WorkflowDefinitionVersion{}, false, err
		}
		versionID, err = service.newID("workflow_version")
		if err != nil {
			return WorkflowDefinitionVersion{}, false, fmt.Errorf("create workflow version id: %w", err)
		}
		latestVersionNumber, err := service.store.LatestDefinitionVersionNumber(workspaceID, definitionID)
		if err != nil {
			return WorkflowDefinitionVersion{}, false, err
		}
		version := workflowDefinitionVersionFromDefinition(definition, versionID, latestVersionNumber+1, service.now())
		return version, true, nil
	}
	version, err := service.store.LoadDefinitionVersion(workspaceID, definitionID, versionID)
	return version, false, err
}

func (service *Service) workflowExecutionSummaryLocked(execution WorkflowExecution) (WorkflowExecutionSummary, error) {
	version, err := service.store.LoadDefinitionVersion(execution.WorkspaceID, execution.DefinitionID, execution.DefinitionVersionID)
	if err != nil {
		return WorkflowExecutionSummary{}, err
	}
	return WorkflowExecutionSummary{
		ID:                      execution.ID,
		WorkspaceID:             execution.WorkspaceID,
		DefinitionID:            execution.DefinitionID,
		DefinitionVersionID:     execution.DefinitionVersionID,
		DefinitionVersionNumber: version.VersionNumber,
		Status:                  execution.Status,
		TerminalReason:          execution.TerminalReason,
		StartedAt:               execution.StartedAt,
		UpdatedAt:               execution.UpdatedAt,
		CompletedAt:             execution.CompletedAt,
		LastEventOrdinal:        execution.LastEventOrdinal,
	}, nil
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
	if isTerminalExecutionStatus(execution.Status) {
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
	failures := service.cancelActionRunnersCollectFailures(cancelDispatches)
	if len(failures) > 0 {
		// The persisted cancelled execution is the source of truth for a user Stop.
		// Runner cancellation is best-effort and any failures are recorded as
		// nonfatal diagnostics so activity surfaces expose possible live external work.
		if err := service.recordRunnerCancelFailureDiagnostics(workspaceID, transition.Execution, failures); err != nil {
			return transition.Execution, err
		}
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

func (service *Service) ListExecutions(workspaceID string) ([]WorkflowExecution, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return nil, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.store.ListExecutions(workspaceID)
}

func (service *Service) ListExecutionSummariesForDefinition(workspaceID string, definitionID string, limit int) ([]WorkflowExecutionSummary, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return nil, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.store.ListExecutionSummariesForDefinition(workspaceID, definitionID, limit)
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
	workspaceSummary, err := service.resolveWorkspace(workspaceID)
	if err != nil {
		return WorkflowGraphProjection{}, err
	}
	currentDefinition, _, err := service.loadWorkspaceDefinition(workspaceSummary, execution.DefinitionID)
	if err != nil {
		return WorkflowGraphProjection{}, err
	}
	return buildWorkflowGraphProjection(version, &execution, execution.UpdatedAt, &currentDefinition)
}

func (service *Service) readDefinitionGraphProjectionLocked(workspaceID string, definitionID string, versionID string) (WorkflowGraphProjection, bool, error) {
	definition, ok, err := service.resolveProjectionDefinitionLocked(workspaceID, definitionID, versionID)
	if err != nil || !ok {
		return WorkflowGraphProjection{}, ok, err
	}
	if versionID == "" {
		version := workflowDefinitionVersionFromDefinition(definition, "", 0, service.now())
		projection, err := buildWorkflowGraphProjection(version, nil, definition.UpdatedAt, &definition)
		return projection, true, err
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
		projection, err := buildWorkflowGraphProjection(version, execution, definition.UpdatedAt, &definition)
		return projection, true, err
	}
	projection, err := buildWorkflowGraphProjection(version, nil, definition.UpdatedAt, &definition)
	return projection, true, err
}

func (service *Service) resolveProjectionDefinitionLocked(workspaceID string, definitionID string, versionID string) (WorkflowDefinition, bool, error) {
	workspaceSummary, err := service.resolveWorkspace(workspaceID)
	if err != nil {
		return WorkflowDefinition{}, false, err
	}
	if definitionID != "" {
		definition, _, err := service.loadWorkspaceDefinition(workspaceSummary, definitionID)
		return definition, true, err
	}
	if versionID != "" {
		return WorkflowDefinition{}, false, errors.New("workflow definition id is required when version id is provided")
	}
	definitions, err := service.listWorkspaceDefinitions(workspaceSummary)
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
	return service.recoverNonTerminalExecutions()
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

func (service *Service) persistExecutionStart(version WorkflowDefinitionVersion, transition WorkflowTransition) error {
	events, err := service.store.PersistExecutionStart(version, transition)
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

func normalizeWorkflowGraph(graph WorkflowGraph) WorkflowGraph {
	if graph.Nodes == nil {
		graph.Nodes = []WorkflowNode{}
	}
	if graph.Edges == nil {
		graph.Edges = []WorkflowEdge{}
	}
	if graph.Layout.Nodes == nil {
		graph.Layout.Nodes = []WorkflowGraphNodeLayout{}
	}
	return graph
}

func randomID(prefix string) (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(bytes[:]), nil
}
