package coordinator

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/materializer"
	"github.com/setta/python-canvas/backend/internal/project/renderer"
	"github.com/setta/python-canvas/backend/internal/projectfile"
)

// Options supplies the narrow adapters around one explicit project path.
// Command and HTTP wiring remain outside this private package until the public
// V2 cutover.
type Options struct {
	ProjectPath  string
	Create       bool
	IDGenerator  aggregate.IDGenerator
	Files        projectfile.Store
	Materializer materializer.Handle
	Provider     Provider
	Render       RenderFunc
}

type openInputs struct {
	projectPath string
	files       projectfile.Store
	render      RenderFunc
}

// Coordinator serializes durable candidate construction, materialization,
// persistence, and publication with mu. providerMu separately serializes every
// provider operation so background diagnostics never invert that lock order.
type Coordinator struct {
	mu         sync.Mutex
	providerMu sync.Mutex

	projectPath             string
	idGenerator             aggregate.IDGenerator
	files                   projectfile.Store
	materializer            materializer.Handle
	provider                Provider
	render                  RenderFunc
	snapshot                Snapshot
	providerDocumentVersion int
	// providerTargetRevision is the latest authored revision a queued
	// diagnostics operation may synchronize. It is separate from the monotonic
	// transport document version and is atomic so a worker never takes
	// coordinator.mu while waiting for providerMu.
	providerTargetRevision atomic.Int64
	cleanup                []materializer.Replacement
	closed                 bool
	analysisCancel         context.CancelFunc
	analysisDone           chan struct{}
	analysisWake           chan struct{}
	pendingAnalysis        *diagnosticsWork
}

// Open strictly loads one existing authored project or prepares one blank
// project for exclusive creation. A new authored file is created only after
// its exact derived module has rendered and materialized, so a failed startup
// leaves that path retryable. Provider startup failures are represented
// explicitly in the published snapshot rather than as an empty success.
func Open(ctx context.Context, options Options) (*Coordinator, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	inputs, err := prepareOpenInputs(options)
	if err != nil {
		return nil, err
	}
	state, createProject, err := loadOrPrepareCreate(
		inputs.projectPath,
		options.Create,
		options.IDGenerator,
		inputs.files,
	)
	if err != nil {
		return nil, err
	}
	rendered, err := inputs.render(state)
	if err != nil {
		return nil, cleanupFailedOpenMaterialization(
			options.Materializer,
			fmt.Errorf("%w: initial project: %v", ErrRenderFailed, err),
		)
	}
	if err := options.Materializer.Initialize(rendered.Code); err != nil {
		return nil, cleanupFailedOpenMaterialization(
			options.Materializer,
			fmt.Errorf("%w: initialize generated document: %v", ErrMaterializationFailed, err),
		)
	}
	if createProject {
		if err := inputs.files.Create(inputs.projectPath, state); err != nil {
			return nil, cleanupFailedOpenMaterialization(options.Materializer, err)
		}
	}

	analysisContext, cancelAnalysis := context.WithCancel(context.Background())
	coordinator := &Coordinator{
		projectPath:  inputs.projectPath,
		idGenerator:  options.IDGenerator,
		files:        inputs.files,
		materializer: options.Materializer,
		provider:     options.Provider,
		render:       inputs.render,
		snapshot: Snapshot{
			State:               state.Clone(),
			Rendered:            cloneRendered(rendered),
			Diagnostics:         compilerDiagnostics(rendered),
			DiagnosticsRevision: state.Project.Revision,
			ProviderStatus:      unavailableProviderStatus(ProviderLifecycleNotStarted),
		},
		analysisCancel: cancelAnalysis,
		analysisDone:   make(chan struct{}),
		analysisWake:   make(chan struct{}, 1),
	}
	coordinator.setProviderTargetRevision(state.Project.Revision)
	coordinator.initializeProvider(ctx)
	go coordinator.runDiagnostics(analysisContext)
	return coordinator, nil
}

func prepareOpenInputs(options Options) (openInputs, error) {
	projectPath, err := canonicalProjectPath(options.ProjectPath)
	if err != nil {
		return openInputs{}, err
	}
	if options.IDGenerator == nil {
		return openInputs{}, aggregate.ErrIDGeneratorRequired
	}
	if options.Materializer == nil {
		return openInputs{}, ErrMaterializerRequired
	}
	if err := validateMaterializerPath(projectPath, options.Materializer.Path()); err != nil {
		return openInputs{}, err
	}
	files := options.Files
	if files == nil {
		files = projectfile.NewAdapter()
	}
	renderCandidate := options.Render
	if renderCandidate == nil {
		renderCandidate = renderer.Render
	}
	return openInputs{
		projectPath: projectPath,
		files:       files,
		render:      renderCandidate,
	}, nil
}

// Snapshot returns the complete currently published private state.
func (coordinator *Coordinator) Snapshot() Snapshot {
	if coordinator == nil {
		return Snapshot{}
	}
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	return coordinator.snapshot.Clone()
}

// RenameProject validates and durably publishes one expected-revision project
// name candidate.
func (coordinator *Coordinator) RenameProject(ctx context.Context, command aggregate.RenameProjectCommand) (Snapshot, error) {
	return coordinator.mutate(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.RenameProject(command)
	})
}

// CreateCallable appends one empty dynamic callable through the shared durable
// transaction.
func (coordinator *Coordinator) CreateCallable(ctx context.Context, command aggregate.CreateCallableCommand) (Snapshot, error) {
	return coordinator.mutateStructural(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.CreateCallable(command, coordinator.idGenerator)
	})
}

// RenameCallable preserves a callable's ID and nested records while applying
// its new display name through the shared durable transaction.
func (coordinator *Coordinator) RenameCallable(ctx context.Context, command aggregate.RenameCallableCommand) (Snapshot, error) {
	return coordinator.mutate(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.RenameCallable(command)
	})
}

// DeleteCallable removes exactly one dynamic callable through the shared
// durable transaction.
func (coordinator *Coordinator) DeleteCallable(ctx context.Context, command aggregate.DeleteCallableCommand) (Snapshot, error) {
	return coordinator.mutateStructural(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.DeleteCallable(command)
	})
}

// CreateParameterDictionary appends one empty Parameter Dictionary through the
// same durable transaction as every other authored section mutation.
func (coordinator *Coordinator) CreateParameterDictionary(ctx context.Context, command aggregate.CreateParameterDictionaryCommand) (Snapshot, error) {
	return coordinator.mutateStructural(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.CreateParameterDictionary(command, coordinator.idGenerator)
	})
}

// RenameParameterDictionary changes one dictionary display name.
func (coordinator *Coordinator) RenameParameterDictionary(ctx context.Context, command aggregate.RenameParameterDictionaryCommand) (Snapshot, error) {
	return coordinator.mutate(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.RenameParameterDictionary(command)
	})
}

// DeleteParameterDictionary removes one dictionary section.
func (coordinator *Coordinator) DeleteParameterDictionary(ctx context.Context, command aggregate.DeleteParameterDictionaryCommand) (Snapshot, error) {
	return coordinator.mutateStructural(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.DeleteParameterDictionary(command)
	})
}

// SetParameterDictionaryEntries replaces one complete recursive entry tree.
func (coordinator *Coordinator) SetParameterDictionaryEntries(ctx context.Context, command aggregate.SetParameterDictionaryEntriesCommand) (Snapshot, error) {
	return coordinator.mutate(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.SetParameterDictionaryEntries(command)
	})
}

// CreateList appends one empty List of Objects to the forest.
func (coordinator *Coordinator) CreateList(ctx context.Context, command aggregate.CreateListCommand) (Snapshot, error) {
	return coordinator.mutateStructural(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.CreateList(command, coordinator.idGenerator)
	})
}

// RenameList changes one List of Objects display name.
func (coordinator *Coordinator) RenameList(ctx context.Context, command aggregate.RenameListCommand) (Snapshot, error) {
	return coordinator.mutate(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.RenameList(command)
	})
}

// DeleteList removes one List of Objects and its whole subtree.
func (coordinator *Coordinator) DeleteList(ctx context.Context, command aggregate.DeleteListCommand) (Snapshot, error) {
	return coordinator.mutateStructural(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.DeleteList(command)
	})
}

// IncrementListChildren appends the requested number of empty Callable
// sections atomically.
func (coordinator *Coordinator) IncrementListChildren(ctx context.Context, command aggregate.IncrementListChildrenCommand) (Snapshot, error) {
	return coordinator.mutateStructural(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.IncrementListChildren(command, coordinator.idGenerator)
	})
}

// DecrementListChildren removes trailing child subtrees atomically.
func (coordinator *Coordinator) DecrementListChildren(ctx context.Context, command aggregate.DecrementListChildrenCommand) (Snapshot, error) {
	return coordinator.mutateStructural(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.DecrementListChildren(command)
	})
}

// ReplaceSectionForest moves and reorders existing sections without allowing a
// typed section payload change in the same mutation.
func (coordinator *Coordinator) ReplaceSectionForest(ctx context.Context, command aggregate.ReplaceSectionForestCommand) (Snapshot, error) {
	return coordinator.mutate(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.ReplaceSectionForest(command)
	})
}

// SetParameters applies one complete parameter-list proposal through the
// aggregate's metadata-preserving candidate boundary.
func (coordinator *Coordinator) SetParameters(ctx context.Context, command aggregate.SetParametersCommand) (Snapshot, error) {
	return coordinator.mutate(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.SetParameters(command)
	})
}

// SetTarget updates both editable outer Python regions as one durable
// candidate; the generated body remains renderer-owned. When a target edit
// resolves a callable's prior undefined-symbol diagnostic, it also performs one
// best-effort signature refresh after the target itself is durable.
func (coordinator *Coordinator) SetTarget(ctx context.Context, command aggregate.SetTargetCommand) (Snapshot, error) {
	if coordinator == nil {
		return Snapshot{}, ErrCoordinatorClosed
	}
	if ctx == nil {
		ctx = context.Background()
	}
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if err := coordinator.requireOpen(ctx); err != nil {
		return Snapshot{}, err
	}

	before := coordinator.snapshot.Clone()
	candidate, err := before.State.SetTarget(command)
	if err != nil {
		return Snapshot{}, err
	}
	if err := coordinator.requireMutableProvider(ctx); err != nil {
		return Snapshot{}, err
	}
	if !candidate.Changed {
		return coordinator.snapshot.Clone(), nil
	}
	updated, err := coordinator.applyCandidate(ctx, candidate)
	if err != nil {
		return Snapshot{}, err
	}
	for _, callableID := range resolvedUndefinedCallableIDs(before, updated) {
		_, refreshErr := coordinator.refreshCallableParametersLocked(ctx, aggregate.RefreshCallableParametersCommand{
			ProjectID:        coordinator.snapshot.State.Project.ID,
			CallableID:       callableID,
			ExpectedRevision: coordinator.snapshot.State.Project.Revision,
		})
		if refreshErr != nil {
			// The accepted Python target is already durable; automatic provider
			// retrieval must not turn it into a failed mutation.
			continue
		}
	}
	return coordinator.snapshot.Clone(), nil
}

// CommitCallable persists one callable expression and publishes the resulting
// generated-document diagnostics. Signature resolution is an explicit,
// separate mutation.
func (coordinator *Coordinator) CommitCallable(ctx context.Context, command aggregate.CommitCallableCommand) (Snapshot, error) {
	return coordinator.mutate(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.CommitCallable(command)
	})
}

// RefreshCallableParameters resolves the signature of the callable's current
// persisted expression and atomically replaces its provider-owned rows.
func (coordinator *Coordinator) RefreshCallableParameters(ctx context.Context, command aggregate.RefreshCallableParametersCommand) (Snapshot, error) {
	if coordinator == nil {
		return Snapshot{}, ErrCoordinatorClosed
	}
	if ctx == nil {
		ctx = context.Background()
	}
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	return coordinator.refreshCallableParametersLocked(ctx, command)
}

// refreshCallableParametersLocked applies an explicit or automatic signature
// refresh while the coordinator's mutation lock is held.
func (coordinator *Coordinator) refreshCallableParametersLocked(ctx context.Context, command aggregate.RefreshCallableParametersCommand) (Snapshot, error) {
	if err := coordinator.requireOpen(ctx); err != nil {
		return Snapshot{}, err
	}
	state := coordinator.snapshot.State
	expression, err := state.PrepareCallableParameterRefresh(command)
	if err != nil {
		return Snapshot{}, err
	}
	if err := coordinator.requireMutableProvider(ctx); err != nil {
		return Snapshot{}, err
	}
	request, err := coordinator.signatureRequest(state, command.CallableID, expression)
	if err != nil {
		return Snapshot{}, err
	}
	signature, err := coordinator.resolveCallableSignature(ctx, request)
	if err != nil {
		return Snapshot{}, providerFailure("resolve callable signature", err)
	}
	candidate, err := state.RefreshCallableParameters(command, signature, coordinator.idGenerator)
	if err != nil {
		if errors.Is(err, aggregate.ErrProviderSignatureInvalid) {
			return Snapshot{}, providerFailure("validate provider signature", err)
		}
		return Snapshot{}, err
	}
	return coordinator.applyCandidate(ctx, candidate)
}

func resolvedUndefinedCallableIDs(before Snapshot, updated Snapshot) []string {
	previousUndefined := callableUndefinedDiagnosticIDs(before)
	if len(previousUndefined) == 0 {
		return nil
	}
	currentUndefined := callableUndefinedDiagnosticIDs(updated)
	resolved := make([]string, 0, len(previousUndefined))
	for callableID := range previousUndefined {
		if _, remainsUndefined := currentUndefined[callableID]; remainsUndefined {
			continue
		}
		resolved = append(resolved, callableID)
	}
	sort.Strings(resolved)
	return resolved
}

func callableUndefinedDiagnosticIDs(snapshot Snapshot) map[string]struct{} {
	callableIDs := snapshotCallableIDs(snapshot)
	undefined := make(map[string]struct{})
	for _, diagnostic := range snapshot.Diagnostics {
		if diagnostic.Code != "reportUndefinedVariable" || diagnostic.TargetID == nil {
			continue
		}
		if _, isCallable := callableIDs[*diagnostic.TargetID]; isCallable {
			undefined[*diagnostic.TargetID] = struct{}{}
		}
	}
	return undefined
}

func snapshotCallableIDs(snapshot Snapshot) map[string]struct{} {
	callableIDs := make(map[string]struct{}, len(snapshot.State.Callables))
	for _, callable := range snapshot.State.Callables {
		callableIDs[callable.ID] = struct{}{}
	}
	return callableIDs
}

// Close releases the one provider and disposable materialization owned by the
// coordinator. It never touches the authored project file.
func (coordinator *Coordinator) Close() error {
	if coordinator == nil {
		return nil
	}
	// analysisCancel is initialized once by Open and is safe to invoke before
	// waiting for mu. A synchronous provider-dependent mutation can hold mu
	// while waiting for providerMu, while diagnostics owns providerMu in a
	// cancellable call. Cancelling first breaks that wait cycle.
	if coordinator.analysisCancel != nil {
		coordinator.analysisCancel()
	}
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		return nil
	}
	coordinator.closed = true
	provider := coordinator.provider
	document := coordinator.materializer
	cleanup := append([]materializer.Replacement{}, coordinator.cleanup...)
	coordinator.cleanup = nil
	analysisDone := coordinator.analysisDone
	coordinator.mu.Unlock()

	var failures []error
	if analysisDone != nil {
		<-analysisDone
	}
	for _, replacement := range cleanup {
		if err := replacement.Discard(); err != nil {
			failures = append(failures, fmt.Errorf("discard retained materialization backup: %w", err))
		}
	}
	if provider != nil {
		coordinator.providerMu.Lock()
		if err := provider.Close(); err != nil {
			failures = append(failures, fmt.Errorf("close provider: %w", err))
		}
		coordinator.providerMu.Unlock()
	}
	if document != nil {
		if err := document.Close(); err != nil {
			failures = append(failures, fmt.Errorf("close materialization: %w", err))
		}
	}
	return errors.Join(failures...)
}

type candidateBuilder func(aggregate.State) (aggregate.Candidate, error)

func (coordinator *Coordinator) mutate(ctx context.Context, build candidateBuilder) (Snapshot, error) {
	if coordinator == nil {
		return Snapshot{}, ErrCoordinatorClosed
	}
	if ctx == nil {
		ctx = context.Background()
	}
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if err := coordinator.requireOpen(ctx); err != nil {
		return Snapshot{}, err
	}
	candidate, err := build(coordinator.snapshot.State)
	if err != nil {
		return Snapshot{}, err
	}
	if err := coordinator.requireMutableProvider(ctx); err != nil {
		return Snapshot{}, err
	}
	if !candidate.Changed {
		return coordinator.snapshot.Clone(), nil
	}
	return coordinator.applyCandidate(ctx, candidate)
}

// mutateStructural publishes one durable section-cardinality candidate before
// its derived diagnostics settle. The structural boundary intentionally does
// not require a ready provider: diagnostics are scheduled after the authored
// project and generated document have committed.
func (coordinator *Coordinator) mutateStructural(ctx context.Context, build candidateBuilder) (Snapshot, error) {
	if coordinator == nil {
		return Snapshot{}, ErrCoordinatorClosed
	}
	if ctx == nil {
		ctx = context.Background()
	}
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if err := coordinator.requireOpen(ctx); err != nil {
		return Snapshot{}, err
	}
	candidate, err := build(coordinator.snapshot.State)
	if err != nil {
		return Snapshot{}, err
	}
	if !candidate.Changed {
		return coordinator.snapshot.Clone(), nil
	}
	return coordinator.applyStructuralCandidate(candidate)
}

func (coordinator *Coordinator) applyCandidate(ctx context.Context, candidate aggregate.Candidate) (Snapshot, error) {
	if !candidate.Changed {
		return coordinator.snapshot.Clone(), nil
	}
	prepared, err := coordinator.prepareCandidate(candidate)
	if err != nil {
		return Snapshot{}, fmt.Errorf("%w: prepare candidate references: %v", ErrRenderFailed, err)
	}
	candidate = prepared
	rendered, err := coordinator.render(candidate.State)
	if err != nil {
		return Snapshot{}, fmt.Errorf("%w: candidate: %v", ErrRenderFailed, err)
	}
	projectStage, err := coordinator.files.StageReplacement(coordinator.projectPath, candidate.State)
	if err != nil {
		return Snapshot{}, fmt.Errorf("%w: stage authored project: %v", ErrPersistenceFailed, err)
	}
	defer func() { _ = projectStage.Discard() }()
	materializationStage, err := coordinator.materializer.Stage(rendered.Code)
	if err != nil {
		return Snapshot{}, fmt.Errorf("%w: stage generated document: %v", ErrMaterializationFailed, err)
	}
	defer func() { _ = materializationStage.Discard() }()
	if err := materializationStage.Install(); err != nil {
		return Snapshot{}, fmt.Errorf("%w: install generated document: %v", ErrMaterializationFailed, err)
	}

	coordinator.setProviderTargetRevision(candidate.State.Project.Revision)
	diagnostics, providerStatus, err := coordinator.synchronizeCandidate(ctx, candidate.State, rendered)
	if err != nil {
		return Snapshot{}, coordinator.rollbackAfterFailure(materializationStage, err)
	}
	if err := projectStage.Commit(); err != nil {
		primary := fmt.Errorf("%w: replace authored project: %v", ErrPersistenceFailed, err)
		return Snapshot{}, coordinator.rollbackAfterFailure(materializationStage, primary)
	}

	// Cleanup is no longer part of the transaction after the authored file is
	// durable. Preserve a failed backup cleanup for Close rather than reporting
	// a false failed mutation after publication.
	if err := materializationStage.Finalize(); err != nil {
		coordinator.cleanup = append(coordinator.cleanup, materializationStage)
	}
	coordinator.snapshot = Snapshot{
		State:               candidate.State.Clone(),
		Rendered:            cloneRendered(rendered),
		Diagnostics:         cloneDiagnostics(diagnostics),
		DiagnosticsRevision: candidate.State.Project.Revision,
		ProviderStatus:      providerStatus,
	}
	return coordinator.snapshot.Clone(), nil
}

func (coordinator *Coordinator) applyStructuralCandidate(candidate aggregate.Candidate) (Snapshot, error) {
	prepared, err := coordinator.prepareCandidate(candidate)
	if err != nil {
		return Snapshot{}, fmt.Errorf("%w: prepare structural candidate references: %v", ErrRenderFailed, err)
	}
	candidate = prepared
	rendered, err := coordinator.render(candidate.State)
	if err != nil {
		return Snapshot{}, fmt.Errorf("%w: candidate: %v", ErrRenderFailed, err)
	}
	projectStage, err := coordinator.files.StageReplacement(coordinator.projectPath, candidate.State)
	if err != nil {
		return Snapshot{}, fmt.Errorf("%w: stage authored project: %v", ErrPersistenceFailed, err)
	}
	defer func() { _ = projectStage.Discard() }()
	materializationStage, err := coordinator.materializer.Stage(rendered.Code)
	if err != nil {
		return Snapshot{}, fmt.Errorf("%w: stage generated document: %v", ErrMaterializationFailed, err)
	}
	defer func() { _ = materializationStage.Discard() }()
	if err := materializationStage.Install(); err != nil {
		return Snapshot{}, fmt.Errorf("%w: install generated document: %v", ErrMaterializationFailed, err)
	}
	if err := projectStage.Commit(); err != nil {
		primary := fmt.Errorf("%w: replace authored project: %v", ErrPersistenceFailed, err)
		return Snapshot{}, coordinator.rollbackMaterialization(materializationStage, primary)
	}

	if err := materializationStage.Finalize(); err != nil {
		coordinator.cleanup = append(coordinator.cleanup, materializationStage)
	}
	next := Snapshot{
		State:               candidate.State.Clone(),
		Rendered:            cloneRendered(rendered),
		Diagnostics:         []Diagnostic{},
		DiagnosticsRevision: coordinator.snapshot.DiagnosticsRevision,
		ProviderStatus:      pendingProviderStatus(),
	}
	if coordinator.provider == nil {
		next.DiagnosticsRevision = candidate.State.Project.Revision
		next.ProviderStatus = unavailableProviderStatus(ProviderLifecycleFailed)
		next.Diagnostics = compilerDiagnostics(rendered)
	}
	coordinator.snapshot = next
	coordinator.setProviderTargetRevision(candidate.State.Project.Revision)
	if coordinator.provider != nil {
		coordinator.scheduleDiagnosticsLocked(candidate.State, rendered)
	}
	return coordinator.snapshot.Clone(), nil
}

func (coordinator *Coordinator) rollbackAfterFailure(stage materializer.Replacement, primary error) error {
	coordinator.setProviderTargetRevision(coordinator.snapshot.State.Project.Revision)
	if err := stage.Rollback(); err != nil {
		return errors.Join(primary, fmt.Errorf("%w: rollback generated document: %v", ErrMaterializationFailed, err))
	}
	// Rollback is an internal transaction obligation, not a continuation of a
	// canceled request. The prior exact document must be restored even when the
	// caller's deadline expired while the candidate provider work was pending.
	if err := coordinator.restorePublishedProvider(context.Background()); err != nil {
		coordinator.reschedulePendingDiagnosticsLocked()
		return errors.Join(primary, err)
	}
	coordinator.reschedulePendingDiagnosticsLocked()
	return primary
}

func (coordinator *Coordinator) rollbackMaterialization(stage materializer.Replacement, primary error) error {
	if err := stage.Rollback(); err != nil {
		return errors.Join(primary, fmt.Errorf("%w: rollback generated document: %v", ErrMaterializationFailed, err))
	}
	return primary
}

func (coordinator *Coordinator) requireMutableProvider(ctx context.Context) error {
	if err := coordinator.requireOpen(ctx); err != nil {
		return err
	}
	if coordinator.provider == nil || !providerCanSynchronize(coordinator.snapshot.ProviderStatus) {
		return ErrProviderUnavailable
	}
	return nil
}

func (coordinator *Coordinator) requireOpen(ctx context.Context) error {
	if coordinator.closed {
		return ErrCoordinatorClosed
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return nil
}

func (coordinator *Coordinator) synchronizeCandidate(
	ctx context.Context,
	state aggregate.State,
	rendered renderer.Result,
) ([]Diagnostic, ProviderStatus, error) {
	if coordinator.provider == nil {
		return nil, ProviderStatus{}, ErrProviderUnavailable
	}
	result, err := coordinator.synchronizeGeneratedDocument(ctx, rendered)
	if err != nil {
		return nil, ProviderStatus{}, providerFailure("synchronize generated document", err)
	}
	if err := result.ProviderStatus.Validate(); err != nil {
		return nil, ProviderStatus{}, providerFailure("validate provider status", err)
	}
	if !providerIsReady(result.ProviderStatus) {
		return nil, ProviderStatus{}, ErrProviderUnavailable
	}
	diagnostics, err := mapDiagnostics(state, rendered, result.Diagnostics)
	if err != nil {
		return nil, ProviderStatus{}, providerFailure("map generated diagnostics", err)
	}
	return mergeDiagnostics(compilerDiagnostics(rendered), diagnostics), result.ProviderStatus, nil
}

func (coordinator *Coordinator) restorePublishedProvider(ctx context.Context) error {
	if coordinator.provider == nil {
		return nil
	}
	result, err := coordinator.synchronizeGeneratedDocument(ctx, coordinator.snapshot.Rendered)
	if err != nil {
		return providerFailure("restore published generated document", err)
	}
	if err := result.ProviderStatus.Validate(); err != nil {
		return providerFailure("validate restored provider status", err)
	}
	if !providerIsReady(result.ProviderStatus) {
		return ErrProviderUnavailable
	}
	return nil
}

func (coordinator *Coordinator) initializeProvider(ctx context.Context) {
	coordinator.snapshot.Diagnostics = compilerDiagnostics(coordinator.snapshot.Rendered)
	coordinator.snapshot.DiagnosticsRevision = coordinator.snapshot.State.Project.Revision
	if coordinator.provider == nil {
		return
	}
	result, err := coordinator.synchronizeGeneratedDocument(ctx, coordinator.snapshot.Rendered)
	if err != nil || result.ProviderStatus.Validate() != nil || !providerIsReady(result.ProviderStatus) {
		coordinator.snapshot.ProviderStatus = unavailableProviderStatus(ProviderLifecycleFailed)
		coordinator.snapshot.Diagnostics = compilerDiagnostics(coordinator.snapshot.Rendered)
		return
	}
	coordinator.snapshot.ProviderStatus = result.ProviderStatus
	diagnostics, err := mapDiagnostics(coordinator.snapshot.State, coordinator.snapshot.Rendered, result.Diagnostics)
	if err != nil {
		coordinator.snapshot.ProviderStatus = unavailableProviderStatus(ProviderLifecycleFailed)
		coordinator.snapshot.Diagnostics = compilerDiagnostics(coordinator.snapshot.Rendered)
		return
	}
	coordinator.snapshot.Diagnostics = mergeDiagnostics(compilerDiagnostics(coordinator.snapshot.Rendered), diagnostics)
}

func (coordinator *Coordinator) synchronizeGeneratedDocument(ctx context.Context, rendered renderer.Result) (GeneratedDocumentResult, error) {
	coordinator.providerMu.Lock()
	defer coordinator.providerMu.Unlock()
	return coordinator.synchronizeGeneratedDocumentLocked(ctx, rendered)
}

func (coordinator *Coordinator) synchronizeScheduledGeneratedDocument(ctx context.Context, revision int, rendered renderer.Result) (GeneratedDocumentResult, bool, error) {
	coordinator.providerMu.Lock()
	defer coordinator.providerMu.Unlock()
	if coordinator.providerTargetRevision.Load() != int64(revision) {
		return GeneratedDocumentResult{}, false, nil
	}
	result, err := coordinator.synchronizeGeneratedDocumentLocked(ctx, rendered)
	return result, true, err
}

func (coordinator *Coordinator) synchronizeGeneratedDocumentLocked(ctx context.Context, rendered renderer.Result) (GeneratedDocumentResult, error) {
	if coordinator.provider == nil {
		return GeneratedDocumentResult{}, ErrProviderUnavailable
	}
	if err := ctx.Err(); err != nil {
		return GeneratedDocumentResult{}, err
	}
	return coordinator.provider.SynchronizeGeneratedDocument(ctx, GeneratedDocumentRequest{
		Path:     coordinator.materializer.Path(),
		Revision: coordinator.nextProviderDocumentVersionLocked(),
		Code:     rendered.Code,
	})
}

func (coordinator *Coordinator) setProviderTargetRevision(revision int) {
	coordinator.providerTargetRevision.Store(int64(revision))
}

func (coordinator *Coordinator) reschedulePendingDiagnosticsLocked() {
	if coordinator.provider == nil || coordinator.snapshot.DiagnosticsRevision >= coordinator.snapshot.State.Project.Revision {
		return
	}
	coordinator.scheduleDiagnosticsLocked(coordinator.snapshot.State, coordinator.snapshot.Rendered)
}

func (coordinator *Coordinator) resolveCallableSignature(ctx context.Context, request SignatureRequest) ([]aggregate.ProviderParameter, error) {
	coordinator.providerMu.Lock()
	defer coordinator.providerMu.Unlock()
	if coordinator.provider == nil {
		return nil, ErrProviderUnavailable
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return coordinator.provider.ResolveCallableSignature(ctx, request)
}

func (coordinator *Coordinator) completeCallable(ctx context.Context, provider CompletionProvider, request CallableCompletionRequest) ([]CompletionItem, error) {
	coordinator.providerMu.Lock()
	defer coordinator.providerMu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return provider.CompleteCallable(ctx, request)
}

func (coordinator *Coordinator) completePythonTarget(ctx context.Context, provider CompletionProvider, request PythonTargetCompletionRequest) ([]CompletionItem, error) {
	coordinator.providerMu.Lock()
	defer coordinator.providerMu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return provider.CompletePythonTarget(ctx, request)
}

func (coordinator *Coordinator) nextProviderDocumentVersionLocked() int {
	coordinator.providerDocumentVersion++
	return coordinator.providerDocumentVersion
}

func (coordinator *Coordinator) signatureRequest(
	state aggregate.State,
	callableID string,
	expression string,
) (SignatureRequest, error) {
	candidate := state.Clone()
	found := false
	for index := range candidate.Callables {
		if candidate.Callables[index].ID != callableID {
			continue
		}
		candidate.Callables[index].AuthoredExpression = expression
		candidate.Callables[index].Parameters = []aggregate.Parameter{}
		found = true
		break
	}
	if !found {
		return SignatureRequest{}, fmt.Errorf("%w: %q", aggregate.ErrCallableNotFound, callableID)
	}
	rendered, err := coordinator.render(candidate)
	if err != nil {
		return SignatureRequest{}, fmt.Errorf("%w: signature candidate: %v", ErrRenderFailed, err)
	}
	position, found := rendered.CallableCallPositionsByID[callableID]
	if !found {
		return SignatureRequest{}, fmt.Errorf("%w: signature candidate call position for %q", ErrRenderFailed, callableID)
	}
	return SignatureRequest{
		ProjectID:          state.Project.ID,
		CallableID:         callableID,
		AuthoredExpression: expression,
		Code:               rendered.Code,
		CallOffset:         position.Offset,
	}, nil
}

func loadOrPrepareCreate(
	projectPath string,
	create bool,
	nextID aggregate.IDGenerator,
	files projectfile.Store,
) (aggregate.State, bool, error) {
	if !create {
		state, err := files.Load(projectPath)
		return state, false, err
	}
	state, err := aggregate.NewBlank(nextID)
	if err != nil {
		return aggregate.State{}, false, err
	}
	return state, true, nil
}

func cleanupFailedOpenMaterialization(document materializer.Handle, primary error) error {
	if err := document.Close(); err != nil {
		return errors.Join(primary, fmt.Errorf("%w: clean up generated document after failed startup: %v", ErrMaterializationFailed, err))
	}
	return primary
}

func canonicalProjectPath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", ErrProjectPathRequired
	}
	resolved, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve project path: %w", err)
	}
	return resolved, nil
}

func validateMaterializerPath(projectPath string, materializationPath string) error {
	if strings.TrimSpace(materializationPath) == "" {
		return ErrMaterializerRequired
	}
	resolvedMaterialization, err := filepath.Abs(materializationPath)
	if err != nil {
		return fmt.Errorf("resolve generated materialization path: %w", err)
	}
	if filepath.Dir(projectPath) != filepath.Dir(resolvedMaterialization) {
		return fmt.Errorf("%w: generated materialization must be in the project directory", ErrMaterializerRequired)
	}
	return nil
}

func providerFailure(operation string, cause error) error {
	if cause == nil {
		return ErrProviderFailed
	}
	return errors.Join(ErrProviderFailed, fmt.Errorf("%s: %w", operation, cause))
}
