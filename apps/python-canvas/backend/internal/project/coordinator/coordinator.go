package coordinator

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"

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

// Coordinator serializes candidate construction, derived materialization,
// provider synchronization, persistence, and publication for one project.
type Coordinator struct {
	mu sync.Mutex

	projectPath             string
	idGenerator             aggregate.IDGenerator
	files                   projectfile.Store
	materializer            materializer.Handle
	provider                Provider
	render                  RenderFunc
	snapshot                Snapshot
	providerDocumentVersion int
	cleanup                 []materializer.Replacement
	closed                  bool
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
	projectPath, err := canonicalProjectPath(options.ProjectPath)
	if err != nil {
		return nil, err
	}
	if options.IDGenerator == nil {
		return nil, aggregate.ErrIDGeneratorRequired
	}
	if options.Materializer == nil {
		return nil, ErrMaterializerRequired
	}
	if err := validateMaterializerPath(projectPath, options.Materializer.Path()); err != nil {
		return nil, err
	}
	files := options.Files
	if files == nil {
		files = projectfile.NewAdapter()
	}
	renderCandidate := options.Render
	if renderCandidate == nil {
		renderCandidate = renderer.Render
	}

	state, createProject, err := loadOrPrepareCreate(projectPath, options.Create, options.IDGenerator, files)
	if err != nil {
		return nil, err
	}
	rendered, err := renderCandidate(state)
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
		if err := files.Create(projectPath, state); err != nil {
			return nil, cleanupFailedOpenMaterialization(options.Materializer, err)
		}
	}

	coordinator := &Coordinator{
		projectPath:  projectPath,
		idGenerator:  options.IDGenerator,
		files:        files,
		materializer: options.Materializer,
		provider:     options.Provider,
		render:       renderCandidate,
		snapshot: Snapshot{
			State:          state.Clone(),
			Rendered:       cloneRendered(rendered),
			Diagnostics:    []Diagnostic{},
			ProviderStatus: unavailableProviderStatus(ProviderLifecycleNotStarted),
		},
	}
	coordinator.initializeProvider(ctx)
	return coordinator, nil
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
	return coordinator.mutate(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
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
	return coordinator.mutate(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.DeleteCallable(command)
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
// candidate; the generated body remains renderer-owned.
func (coordinator *Coordinator) SetTarget(ctx context.Context, command aggregate.SetTargetCommand) (Snapshot, error) {
	return coordinator.mutate(ctx, func(state aggregate.State) (aggregate.Candidate, error) {
		return state.SetTarget(command)
	})
}

// CommitCallable resolves a changed expression in a rendered candidate
// context, then replaces its complete parameter list with the provider's
// normalized signature. A canonical recommit never calls the provider or
// allocates IDs.
func (coordinator *Coordinator) CommitCallable(ctx context.Context, command aggregate.CommitCallableCommand) (Snapshot, error) {
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
	state := coordinator.snapshot.State
	expression, changed, err := state.PrepareCallableCommit(command)
	if err != nil {
		return Snapshot{}, err
	}
	if err := coordinator.requireMutableProvider(ctx); err != nil {
		return Snapshot{}, err
	}
	if !changed {
		return coordinator.snapshot.Clone(), nil
	}
	request, err := coordinator.signatureRequest(state, command.CallableID, expression)
	if err != nil {
		return Snapshot{}, err
	}
	signature, err := coordinator.provider.ResolveCallableSignature(ctx, request)
	if err != nil {
		return Snapshot{}, providerFailure("resolve callable signature", err)
	}
	candidate, err := state.CommitCallable(command, signature, coordinator.idGenerator)
	if err != nil {
		if errors.Is(err, aggregate.ErrProviderSignatureInvalid) {
			return Snapshot{}, providerFailure("validate provider signature", err)
		}
		return Snapshot{}, err
	}
	return coordinator.applyCandidate(ctx, candidate)
}

// Close releases the one provider and disposable materialization owned by the
// coordinator. It never touches the authored project file.
func (coordinator *Coordinator) Close() error {
	if coordinator == nil {
		return nil
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
	coordinator.mu.Unlock()

	var failures []error
	for _, replacement := range cleanup {
		if err := replacement.Discard(); err != nil {
			failures = append(failures, fmt.Errorf("discard retained materialization backup: %w", err))
		}
	}
	if provider != nil {
		if err := provider.Close(); err != nil {
			failures = append(failures, fmt.Errorf("close provider: %w", err))
		}
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

func (coordinator *Coordinator) applyCandidate(ctx context.Context, candidate aggregate.Candidate) (Snapshot, error) {
	if !candidate.Changed {
		return coordinator.snapshot.Clone(), nil
	}
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
		State:          candidate.State.Clone(),
		Rendered:       cloneRendered(rendered),
		Diagnostics:    cloneDiagnostics(diagnostics),
		ProviderStatus: providerStatus,
	}
	return coordinator.snapshot.Clone(), nil
}

func (coordinator *Coordinator) rollbackAfterFailure(stage materializer.Replacement, primary error) error {
	if err := stage.Rollback(); err != nil {
		return errors.Join(primary, fmt.Errorf("%w: rollback generated document: %v", ErrMaterializationFailed, err))
	}
	// Rollback is an internal transaction obligation, not a continuation of a
	// canceled request. The prior exact document must be restored even when the
	// caller's deadline expired while the candidate provider work was pending.
	if err := coordinator.restorePublishedProvider(context.Background()); err != nil {
		return errors.Join(primary, err)
	}
	return primary
}

func (coordinator *Coordinator) requireMutableProvider(ctx context.Context) error {
	if err := coordinator.requireOpen(ctx); err != nil {
		return err
	}
	if coordinator.provider == nil || !providerIsReady(coordinator.snapshot.ProviderStatus) {
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
	result, err := coordinator.provider.SynchronizeGeneratedDocument(ctx, GeneratedDocumentRequest{
		Path:     coordinator.materializer.Path(),
		Revision: coordinator.nextProviderDocumentVersion(),
		Code:     rendered.Code,
	})
	if err != nil {
		return nil, ProviderStatus{}, providerFailure("synchronize generated document", err)
	}
	if err := result.ProviderStatus.Validate(); err != nil {
		return nil, ProviderStatus{}, providerFailure("validate provider status", err)
	}
	if !providerIsReady(result.ProviderStatus) {
		return nil, ProviderStatus{}, ErrProviderUnavailable
	}
	diagnostics, err := mapDiagnostics(rendered, result.Diagnostics)
	if err != nil {
		return nil, ProviderStatus{}, providerFailure("map generated diagnostics", err)
	}
	return diagnostics, result.ProviderStatus, nil
}

func (coordinator *Coordinator) restorePublishedProvider(ctx context.Context) error {
	if coordinator.provider == nil {
		return nil
	}
	result, err := coordinator.provider.SynchronizeGeneratedDocument(ctx, GeneratedDocumentRequest{
		Path:     coordinator.materializer.Path(),
		Revision: coordinator.nextProviderDocumentVersion(),
		Code:     coordinator.snapshot.Rendered.Code,
	})
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
	if coordinator.provider == nil {
		return
	}
	result, err := coordinator.provider.SynchronizeGeneratedDocument(ctx, GeneratedDocumentRequest{
		Path:     coordinator.materializer.Path(),
		Revision: coordinator.nextProviderDocumentVersion(),
		Code:     coordinator.snapshot.Rendered.Code,
	})
	if err != nil || result.ProviderStatus.Validate() != nil || !providerIsReady(result.ProviderStatus) {
		coordinator.snapshot.ProviderStatus = unavailableProviderStatus(ProviderLifecycleFailed)
		coordinator.snapshot.Diagnostics = []Diagnostic{}
		return
	}
	coordinator.snapshot.ProviderStatus = result.ProviderStatus
	diagnostics, err := mapDiagnostics(coordinator.snapshot.Rendered, result.Diagnostics)
	if err != nil {
		coordinator.snapshot.ProviderStatus = unavailableProviderStatus(ProviderLifecycleFailed)
		coordinator.snapshot.Diagnostics = []Diagnostic{}
		return
	}
	coordinator.snapshot.Diagnostics = diagnostics
}

func (coordinator *Coordinator) nextProviderDocumentVersion() int {
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
