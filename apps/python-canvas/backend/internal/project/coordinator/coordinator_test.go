package coordinator

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/materializer"
	"github.com/setta/python-canvas/backend/internal/project/renderer"
	"github.com/setta/python-canvas/backend/internal/projectfile"
)

func TestOpenStrictlyCreatesReloadsAndRefusesOverwrite(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "project.json")
	requireMissingProjectFails(t, path)
	project := createAndRenameProject(t, path)
	requireReloadedProject(t, path, project)
	requireCreateRefusesExistingProject(t, path)
}

func TestOpenCreatePersistsOnlyAfterInitialRenderAndMaterialization(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name            string
		render          RenderFunc
		materialization func(t *testing.T, path string) materializer.Handle
		assertCleaned   func(t *testing.T, document materializer.Handle)
		wantError       error
	}{
		{
			name: "render failure",
			render: func(aggregate.State) (renderer.Result, error) {
				return renderer.Result{}, errors.New("injected initial render failure")
			},
			materialization: func(t *testing.T, path string) materializer.Handle {
				return newMaterialization(t, path)
			},
			assertCleaned: func(t *testing.T, document materializer.Handle) {
				t.Helper()
				if _, err := os.Stat(document.Path()); !errors.Is(err, os.ErrNotExist) {
					t.Fatalf("generated materialization after failed startup stat error = %v, want not exist", err)
				}
			},
			wantError: ErrRenderFailed,
		},
		{
			name: "materialization initialization failure",
			materialization: func(_ *testing.T, path string) materializer.Handle {
				return &memoryMaterialization{
					path:            filepath.Join(filepath.Dir(path), ".initial-failure.py"),
					initializeError: errors.New("injected initial materialization failure"),
				}
			},
			assertCleaned: func(t *testing.T, document materializer.Handle) {
				t.Helper()
				memory, ok := document.(*memoryMaterialization)
				if !ok || !memory.closed {
					t.Fatalf("materialization after failed startup = %#v, want closed", document)
				}
			},
			wantError: ErrMaterializationFailed,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "project.json")
			initialMaterialization := test.materialization(t, path)
			_, err := Open(context.Background(), Options{
				ProjectPath:  path,
				Create:       true,
				IDGenerator:  sequenceIDs("project-failed"),
				Materializer: initialMaterialization,
				Provider:     readyProvider(),
				Render:       test.render,
			})
			if !errors.Is(err, test.wantError) {
				t.Fatalf("Open() error = %v, want %v", err, test.wantError)
			}
			if _, statErr := os.Stat(path); !errors.Is(statErr, os.ErrNotExist) {
				t.Fatalf("project path after failed startup stat error = %v, want not exist", statErr)
			}
			test.assertCleaned(t, initialMaterialization)

			retry, err := Open(context.Background(), Options{
				ProjectPath:  path,
				Create:       true,
				IDGenerator:  sequenceIDs("project-retried"),
				Materializer: newMaterialization(t, path),
				Provider:     readyProvider(),
			})
			if err != nil {
				t.Fatalf("Open(retry --create) error = %v, want successful exclusive creation", err)
			}
			if err := retry.Close(); err != nil {
				t.Fatalf("close retried coordinator: %v", err)
			}
		})
	}
}

func requireMissingProjectFails(t *testing.T, path string) {
	t.Helper()
	missingMaterialization := newMaterialization(t, path)
	_, err := Open(context.Background(), Options{
		ProjectPath: path, IDGenerator: sequenceIDs("project-missing"), Materializer: missingMaterialization,
		Provider: readyProvider(),
	})
	if !errors.Is(err, projectfile.ErrProjectFileMissing) {
		t.Fatalf("Open(missing) error = %v, want strict missing project failure", err)
	}
	if err := missingMaterialization.Close(); err != nil {
		t.Fatalf("close missing materialization: %v", err)
	}
}

func createAndRenameProject(t *testing.T, path string) aggregate.Project {
	t.Helper()
	materialization := newMaterialization(t, path)
	provider := readyProvider()
	coordinator, err := Open(context.Background(), Options{
		ProjectPath: path, Create: true, IDGenerator: sequenceIDs("project-dynamic"), Materializer: materialization, Provider: provider,
	})
	if err != nil {
		t.Fatalf("Open(create) error = %v", err)
	}
	initial := coordinator.Snapshot()
	if initial.State.Project.ID != "project-dynamic" || initial.State.Project.Name != aggregate.DefaultProjectName || initial.State.Project.Revision != 1 || len(initial.State.Callables) != 0 {
		t.Fatalf("created snapshot = %#v", initial)
	}
	if initial.ProviderStatus.Availability != ProviderAvailabilityAvailable {
		t.Fatalf("created provider status = %#v", initial.ProviderStatus)
	}
	renamed, err := coordinator.RenameProject(context.Background(), aggregate.RenameProjectCommand{
		ProjectID: initial.State.Project.ID, ExpectedRevision: initial.State.Project.Revision, Name: "Persisted project",
	})
	if err != nil {
		t.Fatalf("RenameProject() error = %v", err)
	}
	if renamed.State.Project.Name != "Persisted project" || renamed.State.Project.Revision != 2 {
		t.Fatalf("renamed snapshot = %#v", renamed.State.Project)
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	return renamed.State.Project
}

func requireReloadedProject(t *testing.T, path string, initial aggregate.Project) {
	t.Helper()
	reloadedMaterialization := newMaterialization(t, path)
	reloaded, err := Open(context.Background(), Options{
		ProjectPath: path, IDGenerator: sequenceIDs("unused-after-load"), Materializer: reloadedMaterialization, Provider: readyProvider(),
	})
	if err != nil {
		t.Fatalf("Open(reload) error = %v", err)
	}
	if got := reloaded.Snapshot().State.Project; got != initial {
		t.Fatalf("reloaded project = %#v", got)
	}
	if err := reloaded.Close(); err != nil {
		t.Fatalf("close reloaded coordinator: %v", err)
	}
}

func requireCreateRefusesExistingProject(t *testing.T, path string) {
	t.Helper()
	overwriteMaterialization := newMaterialization(t, path)
	_, err := Open(context.Background(), Options{
		ProjectPath: path, Create: true, IDGenerator: sequenceIDs("project-refused"), Materializer: overwriteMaterialization, Provider: readyProvider(),
	})
	if !errors.Is(err, projectfile.ErrProjectFileExists) {
		t.Fatalf("Open(existing --create) error = %v, want exclusive-create refusal", err)
	}
	if _, statErr := os.Stat(overwriteMaterialization.Path()); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("generated materialization after exclusive-create refusal stat error = %v, want not exist", statErr)
	}
}

func TestOpenRejectsMissingPathAndInvalidPersistedDocument(t *testing.T) {
	t.Parallel()

	directory := t.TempDir()
	validPath := filepath.Join(directory, "project.json")
	materialization := newMaterialization(t, validPath)
	_, err := Open(context.Background(), Options{
		ProjectPath: " ", IDGenerator: sequenceIDs("unused"), Materializer: materialization, Provider: readyProvider(),
	})
	if !errors.Is(err, ErrProjectPathRequired) {
		t.Fatalf("Open(blank path) error = %v, want project path failure", err)
	}
	if err := materialization.Close(); err != nil {
		t.Fatalf("close materialization: %v", err)
	}

	invalidPath := filepath.Join(directory, "invalid.json")
	if err := os.WriteFile(invalidPath, []byte(`{"format":"old"}`), 0o600); err != nil {
		t.Fatalf("write invalid project: %v", err)
	}
	invalidMaterialization := newMaterialization(t, invalidPath)
	_, err = Open(context.Background(), Options{
		ProjectPath: invalidPath, IDGenerator: sequenceIDs("unused"), Materializer: invalidMaterialization, Provider: readyProvider(),
	})
	if !errors.Is(err, projectfile.ErrInvalidProjectFile) {
		t.Fatalf("Open(invalid) error = %v, want strict codec failure", err)
	}
	if err := invalidMaterialization.Close(); err != nil {
		t.Fatalf("close invalid materialization: %v", err)
	}
}

func TestCoordinatorCommitsWholeNormalizedSignatureAndMapsDynamicDiagnostics(t *testing.T) {
	t.Parallel()

	coordinator, provider, path := newSignatureCoordinator(t)
	defer coordinator.Close()

	committed := commitDynamicCallable(t, coordinator)
	requireNormalizedProviderParameters(t, committed)
	requireSignatureCandidateContext(t, provider)
	authored := authorParametersAndRequireMappedDiagnostic(t, coordinator, committed)
	requireDurableAuthoredState(t, path, authored.State)
	requireZeroSignatureReplacementAndRecommit(t, coordinator, provider, authored)
}

func TestCoordinatorClassifiesMalformedProviderSignatureAsProviderFailure(t *testing.T) {
	t.Parallel()

	coordinator, provider, _ := newSignatureCoordinator(t)
	defer coordinator.Close()

	initial := coordinator.Snapshot()
	created, err := coordinator.CreateCallable(context.Background(), aggregate.CreateCallableCommand{
		ProjectID: initial.State.Project.ID, ExpectedRevision: initial.State.Project.Revision, Name: "Dynamic callable",
	})
	if err != nil {
		t.Fatalf("CreateCallable() error = %v", err)
	}
	provider.signature = []aggregate.ProviderParameter{
		{Name: "rest", PassingStyle: aggregate.PassingStyleVariadicPositional},
		{Name: "value", PassingStyle: aggregate.PassingStylePositionalOrKeyword},
	}
	before := coordinator.Snapshot()
	_, err = coordinator.CommitCallable(context.Background(), aggregate.CommitCallableCommand{
		ProjectID: created.State.Project.ID, CallableID: "callable-dynamic", ExpectedRevision: created.State.Project.Revision, AuthoredExpression: "fixture.dynamic",
	})
	if !errors.Is(err, ErrProviderFailed) {
		t.Fatalf("CommitCallable() error = %v, want provider failure", err)
	}
	if !errors.Is(err, aggregate.ErrProviderSignatureInvalid) || !errors.Is(err, aggregate.ErrValidation) {
		t.Fatalf("CommitCallable() error = %v, want malformed provider signature cause", err)
	}
	if !reflect.DeepEqual(coordinator.Snapshot(), before) {
		t.Fatal("CommitCallable() published a malformed provider signature")
	}
}

func newSignatureCoordinator(t *testing.T) (*Coordinator, *fakeProvider, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "project.json")
	provider := readyProvider()
	provider.signature = allStyleSignature()
	provider.diagnostics = scaleDiagnostic
	coordinator, err := Open(context.Background(), Options{
		ProjectPath:  path,
		Create:       true,
		IDGenerator:  sequenceIDs("project-dynamic", "callable-dynamic", "parameter-left", "parameter-scale", "parameter-rest", "parameter-flag", "parameter-options"),
		Materializer: newMaterialization(t, path),
		Provider:     provider,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	return coordinator, provider, path
}

func scaleDiagnostic(request GeneratedDocumentRequest) []ProviderDiagnostic {
	start := strings.Index(request.Code, "scale_value")
	if start < 0 {
		return nil
	}
	return []ProviderDiagnostic{{
		Start: start, End: start + len("scale_value"), Severity: ProviderDiagnosticError, Message: "mapped provider diagnostic", Code: "reportGeneralTypeIssues",
	}}
}

func commitDynamicCallable(t *testing.T, coordinator *Coordinator) Snapshot {
	t.Helper()
	before := coordinator.Snapshot()
	created, err := coordinator.CreateCallable(context.Background(), aggregate.CreateCallableCommand{
		ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Dynamic callable",
	})
	if err != nil {
		t.Fatalf("CreateCallable() error = %v", err)
	}
	committed, err := coordinator.CommitCallable(context.Background(), aggregate.CommitCallableCommand{
		ProjectID: created.State.Project.ID, CallableID: "callable-dynamic", ExpectedRevision: created.State.Project.Revision, AuthoredExpression: "fixture.dynamic",
	})
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	return committed
}

func requireNormalizedProviderParameters(t *testing.T, snapshot Snapshot) {
	t.Helper()
	if got := len(snapshot.State.Callables[0].Parameters); got != 5 {
		t.Fatalf("provider parameter count = %d, want 5", got)
	}
	for index, parameter := range snapshot.State.Callables[0].Parameters {
		if parameter.NameEditable || parameter.ProviderOrdinal == nil || *parameter.ProviderOrdinal != index {
			t.Fatalf("provider parameter %d = %#v, want immutable normalized metadata", index, parameter)
		}
	}
}

func requireSignatureCandidateContext(t *testing.T, provider *fakeProvider) {
	t.Helper()
	if len(provider.signatureRequests) != 1 {
		t.Fatalf("signature requests = %#v, want one", provider.signatureRequests)
	}
	request := provider.signatureRequests[0]
	if request.Code[request.CallOffset-1:request.CallOffset] != "(" || !strings.Contains(request.Code, "fixture.dynamic(") {
		t.Fatalf("signature context = %#v", request)
	}
}

func authorParametersAndRequireMappedDiagnostic(t *testing.T, coordinator *Coordinator, committed Snapshot) Snapshot {
	t.Helper()
	proposals := parameterProposals(committed.State, parameterExpression)
	proposals = append(proposals, aggregate.ParameterProposal{ID: "parameter-app", Name: "factor", AuthoredExpression: "2"})
	authored, err := coordinator.SetParameters(context.Background(), aggregate.SetParametersCommand{
		ProjectID: committed.State.Project.ID, CallableID: "callable-dynamic", ExpectedRevision: committed.State.Project.Revision, Parameters: proposals,
	})
	if err != nil {
		t.Fatalf("SetParameters() error = %v", err)
	}
	if len(authored.Diagnostics) != 1 || authored.Diagnostics[0].TargetID == nil || *authored.Diagnostics[0].TargetID != "parameter-scale" {
		t.Fatalf("mapped diagnostics = %#v", authored.Diagnostics)
	}
	return authored
}

func parameterExpression(parameter aggregate.Parameter) string {
	if parameter.ID == "parameter-scale" {
		return "scale_value"
	}
	return "1"
}

func requireDurableAuthoredState(t *testing.T, path string, want aggregate.State) {
	t.Helper()
	loaded, err := projectfile.NewAdapter().Load(path)
	if err != nil || !reflect.DeepEqual(loaded, want) {
		t.Fatalf("durable authored project = %#v, load error = %v", loaded, err)
	}
}

func requireZeroSignatureReplacementAndRecommit(t *testing.T, coordinator *Coordinator, provider *fakeProvider, authored Snapshot) {
	t.Helper()
	provider.signature = []aggregate.ProviderParameter{}
	replaced, err := coordinator.CommitCallable(context.Background(), aggregate.CommitCallableCommand{
		ProjectID: authored.State.Project.ID, CallableID: "callable-dynamic", ExpectedRevision: authored.State.Project.Revision, AuthoredExpression: "fixture.zero",
	})
	if err != nil {
		t.Fatalf("CommitCallable(zero signature) error = %v", err)
	}
	if len(replaced.State.Callables[0].Parameters) != 0 {
		t.Fatalf("zero-signature replacement retained parameters: %#v", replaced.State.Callables[0].Parameters)
	}
	requestsBeforeRecommit := len(provider.signatureRequests)
	recommitted, err := coordinator.CommitCallable(context.Background(), aggregate.CommitCallableCommand{
		ProjectID: replaced.State.Project.ID, CallableID: "callable-dynamic", ExpectedRevision: replaced.State.Project.Revision, AuthoredExpression: "fixture.zero",
	})
	if err != nil {
		t.Fatalf("CommitCallable(recommit) error = %v", err)
	}
	if recommitted.State.Project.Revision != replaced.State.Project.Revision || len(provider.signatureRequests) != requestsBeforeRecommit {
		t.Fatalf("canonical recommit changed state or called provider: %#v, requests=%d", recommitted.State.Project, len(provider.signatureRequests))
	}
}

func TestCoordinatorRetainsPublishedStateAndBytesAcrossCandidateFailures(t *testing.T) {
	t.Parallel()

	operations := []struct {
		name    string
		invoke  func(*Coordinator, aggregate.State) (Snapshot, error)
		invalid func(*Coordinator, aggregate.State) (Snapshot, error)
	}{
		{
			name: "rename project",
			invoke: func(coordinator *Coordinator, state aggregate.State) (Snapshot, error) {
				return coordinator.RenameProject(context.Background(), aggregate.RenameProjectCommand{ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "Changed project"})
			},
			invalid: func(coordinator *Coordinator, state aggregate.State) (Snapshot, error) {
				return coordinator.RenameProject(context.Background(), aggregate.RenameProjectCommand{ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: " "})
			},
		},
		{
			name: "rename callable",
			invoke: func(coordinator *Coordinator, state aggregate.State) (Snapshot, error) {
				return coordinator.RenameCallable(context.Background(), aggregate.RenameCallableCommand{ProjectID: state.Project.ID, CallableID: state.Callables[0].ID, ExpectedRevision: state.Project.Revision, Name: "Changed callable"})
			},
			invalid: func(coordinator *Coordinator, state aggregate.State) (Snapshot, error) {
				return coordinator.RenameCallable(context.Background(), aggregate.RenameCallableCommand{ProjectID: state.Project.ID, CallableID: state.Callables[0].ID, ExpectedRevision: state.Project.Revision, Name: " "})
			},
		},
		{
			name: "set parameters",
			invoke: func(coordinator *Coordinator, state aggregate.State) (Snapshot, error) {
				return coordinator.SetParameters(context.Background(), aggregate.SetParametersCommand{ProjectID: state.Project.ID, CallableID: state.Callables[0].ID, ExpectedRevision: state.Project.Revision, Parameters: parameterProposals(state, func(aggregate.Parameter) string { return "changed_value" })})
			},
			invalid: func(coordinator *Coordinator, state aggregate.State) (Snapshot, error) {
				proposals := parameterProposals(state, func(parameter aggregate.Parameter) string { return parameter.AuthoredExpression })
				proposals[0].Name = "renamed_provider_row"
				return coordinator.SetParameters(context.Background(), aggregate.SetParametersCommand{ProjectID: state.Project.ID, CallableID: state.Callables[0].ID, ExpectedRevision: state.Project.Revision, Parameters: proposals})
			},
		},
		{
			name: "set target",
			invoke: func(coordinator *Coordinator, state aggregate.State) (Snapshot, error) {
				return coordinator.SetTarget(context.Background(), aggregate.SetTargetCommand{ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Prefix: "import fixture", Suffix: state.PythonTarget.Suffix})
			},
			invalid: func(coordinator *Coordinator, state aggregate.State) (Snapshot, error) {
				return coordinator.SetTarget(context.Background(), aggregate.SetTargetCommand{ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Prefix: "\x00", Suffix: state.PythonTarget.Suffix})
			},
		},
	}
	modes := []struct {
		name    string
		wantErr error
	}{
		{name: "validation", wantErr: aggregate.ErrValidation},
		{name: "provider", wantErr: ErrProviderFailed},
		{name: "render", wantErr: ErrRenderFailed},
		{name: "materialization", wantErr: ErrMaterializationFailed},
		{name: "persistence", wantErr: ErrPersistenceFailed},
	}

	for _, operation := range operations {
		for _, mode := range modes {
			t.Run(operation.name+"/"+mode.name, func(t *testing.T) {
				coordinator, provider, document, path := newFailureCoordinator(t, mode.name)
				defer coordinator.Close()
				before := coordinator.Snapshot()
				projectBytes := readFile(t, path)
				materializationBytes := materializedCode(t, document)

				var err error
				if mode.name == "validation" {
					_, err = operation.invalid(coordinator, before.State)
				} else {
					if mode.name == "provider" {
						provider.failSynchronizations = 1
						provider.synchronizeError = errors.New("injected provider failure")
					}
					_, err = operation.invoke(coordinator, before.State)
				}
				if !errors.Is(err, mode.wantErr) {
					t.Fatalf("mutation error = %v, want %v", err, mode.wantErr)
				}
				if after := coordinator.Snapshot(); !reflect.DeepEqual(after, before) {
					t.Fatalf("published snapshot changed after %s failure:\n got: %#v\nwant: %#v", mode.name, after, before)
				}
				if after := readFile(t, path); string(after) != string(projectBytes) {
					t.Fatalf("project bytes changed after %s failure", mode.name)
				}
				if after := materializedCode(t, document); after != materializationBytes {
					t.Fatalf("materialized code changed after %s failure:\n got: %q\nwant: %q", mode.name, after, materializationBytes)
				}
			})
		}
	}
}

func TestCoordinatorRestoresPublishedProviderWithNewTransportVersionAfterPersistenceFailure(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "project.json")
	adapter := projectfile.NewAdapter()
	if err := adapter.Create(path, durableState(t)); err != nil {
		t.Fatalf("create project: %v", err)
	}
	store := &oneTimeCommitFailingStore{
		delegate:    adapter,
		commitError: errors.New("injected persistence failure"),
	}
	provider := readyProvider()
	coordinator, err := Open(context.Background(), Options{
		ProjectPath:  path,
		IDGenerator:  sequenceIDs("unused-after-open"),
		Files:        store,
		Materializer: newMaterialization(t, path),
		Provider:     provider,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer coordinator.Close()

	before := coordinator.Snapshot()
	_, err = coordinator.RenameProject(context.Background(), aggregate.RenameProjectCommand{
		ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Rejected rename",
	})
	if !errors.Is(err, ErrPersistenceFailed) {
		t.Fatalf("RenameProject() error = %v, want persistence failure", err)
	}
	if after := coordinator.Snapshot(); !reflect.DeepEqual(after, before) {
		t.Fatalf("failed candidate changed published snapshot: %#v", after)
	}

	accepted, err := coordinator.RenameProject(context.Background(), aggregate.RenameProjectCommand{
		ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Accepted rename",
	})
	if err != nil {
		t.Fatalf("RenameProject(after rollback) error = %v", err)
	}
	if accepted.State.Project.Revision != before.State.Project.Revision+1 {
		t.Fatalf("accepted revision = %d, want %d", accepted.State.Project.Revision, before.State.Project.Revision+1)
	}
	versions := make([]int, 0, len(provider.synchronizeRequests))
	for _, request := range provider.synchronizeRequests {
		versions = append(versions, request.Revision)
	}
	if want := []int{1, 2, 3, 4}; !reflect.DeepEqual(versions, want) {
		t.Fatalf("provider transport versions = %#v, want %#v", versions, want)
	}
}

func TestCoordinatorRejectsMalformedProviderDiagnostics(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "project.json")
	provider := readyProvider()
	provider.diagnostics = func(request GeneratedDocumentRequest) []ProviderDiagnostic {
		if request.Revision != 2 {
			return []ProviderDiagnostic{}
		}
		return []ProviderDiagnostic{{
			Start:    len(request.Code) + 1,
			End:      len(request.Code) + 1,
			Severity: ProviderDiagnosticError,
			Message:  "outside the candidate",
		}}
	}
	coordinator, err := Open(context.Background(), Options{
		ProjectPath: path, Create: true, IDGenerator: sequenceIDs("project-malformed"), Materializer: newMaterialization(t, path), Provider: provider,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer coordinator.Close()
	before := coordinator.Snapshot()

	_, err = coordinator.RenameProject(context.Background(), aggregate.RenameProjectCommand{
		ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Cannot publish malformed diagnostics",
	})
	if !errors.Is(err, ErrProviderFailed) {
		t.Fatalf("RenameProject() error = %v, want provider failure", err)
	}
	if after := coordinator.Snapshot(); !reflect.DeepEqual(after, before) {
		t.Fatalf("malformed diagnostics changed published snapshot: %#v", after)
	}
}

func TestCoordinatorDoesNotTreatPendingProviderAsReady(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "project.json")
	provider := readyProvider()
	provider.status.State = ProviderLifecyclePending
	coordinator, err := Open(context.Background(), Options{
		ProjectPath: path, Create: true, IDGenerator: sequenceIDs("project-pending"), Materializer: newMaterialization(t, path), Provider: provider,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer coordinator.Close()
	before := coordinator.Snapshot()
	if before.ProviderStatus.Availability != ProviderAvailabilityUnavailable || before.ProviderStatus.State != ProviderLifecycleFailed {
		t.Fatalf("pending provider snapshot = %#v, want explicit unavailable state", before.ProviderStatus)
	}
	_, err = coordinator.RenameProject(context.Background(), aggregate.RenameProjectCommand{
		ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Not ready",
	})
	if !errors.Is(err, ErrProviderUnavailable) {
		t.Fatalf("RenameProject() error = %v, want provider-unavailable failure", err)
	}
}

func TestCoordinatorReportsUnavailableProviderWithoutEmptyMutationResult(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "project.json")
	provider := readyProvider()
	provider.failSynchronizations = 1
	provider.synchronizeError = errors.New("provider cannot start")
	materialization := newMaterialization(t, path)
	coordinator, err := Open(context.Background(), Options{
		ProjectPath: path, Create: true, IDGenerator: sequenceIDs("project"), Materializer: materialization, Provider: provider,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer coordinator.Close()
	before := coordinator.Snapshot()
	if before.ProviderStatus.Availability != ProviderAvailabilityUnavailable || before.ProviderStatus.State != ProviderLifecycleFailed {
		t.Fatalf("unavailable startup status = %#v", before.ProviderStatus)
	}
	_, err = coordinator.RenameProject(context.Background(), aggregate.RenameProjectCommand{
		ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Cannot mutate",
	})
	if !errors.Is(err, ErrProviderUnavailable) {
		t.Fatalf("RenameProject() error = %v, want provider-unavailable failure", err)
	}
	if after := coordinator.Snapshot(); !reflect.DeepEqual(after, before) {
		t.Fatalf("provider-unavailable mutation changed snapshot: %#v", after)
	}
}

type fakeProvider struct {
	signature            []aggregate.ProviderParameter
	diagnostics          func(GeneratedDocumentRequest) []ProviderDiagnostic
	status               ProviderStatus
	synchronizeError     error
	failSynchronizations int
	signatureError       error
	signatureRequests    []SignatureRequest
	synchronizeRequests  []GeneratedDocumentRequest
	lastDocumentVersion  int
	closed               bool
}

func readyProvider() *fakeProvider {
	return &fakeProvider{status: ProviderStatus{
		Provider: "basedpyright", Availability: ProviderAvailabilityAvailable, State: ProviderLifecycleReady,
	}}
}

func (provider *fakeProvider) ResolveCallableSignature(_ context.Context, request SignatureRequest) ([]aggregate.ProviderParameter, error) {
	provider.signatureRequests = append(provider.signatureRequests, request)
	if provider.signatureError != nil {
		return nil, provider.signatureError
	}
	return append([]aggregate.ProviderParameter{}, provider.signature...), nil
}

func (provider *fakeProvider) SynchronizeGeneratedDocument(_ context.Context, request GeneratedDocumentRequest) (GeneratedDocumentResult, error) {
	provider.synchronizeRequests = append(provider.synchronizeRequests, request)
	if request.Revision <= provider.lastDocumentVersion {
		return GeneratedDocumentResult{}, fmt.Errorf("provider received non-advancing document version %d after %d", request.Revision, provider.lastDocumentVersion)
	}
	provider.lastDocumentVersion = request.Revision
	if provider.failSynchronizations > 0 {
		provider.failSynchronizations--
		return GeneratedDocumentResult{}, provider.synchronizeError
	}
	diagnostics := []ProviderDiagnostic{}
	if provider.diagnostics != nil {
		diagnostics = provider.diagnostics(request)
	}
	return GeneratedDocumentResult{Diagnostics: diagnostics, ProviderStatus: provider.status}, nil
}

func (provider *fakeProvider) Close() error {
	provider.closed = true
	return nil
}

type failingStore struct {
	delegate    projectfile.Store
	stageError  error
	commitError error
}

type oneTimeCommitFailingStore struct {
	delegate    projectfile.Store
	commitError error
}

func (store *oneTimeCommitFailingStore) Load(path string) (aggregate.State, error) {
	return store.delegate.Load(path)
}

func (store *oneTimeCommitFailingStore) Create(path string, state aggregate.State) error {
	return store.delegate.Create(path, state)
}

func (store *oneTimeCommitFailingStore) StageReplacement(path string, state aggregate.State) (projectfile.Replacement, error) {
	replacement, err := store.delegate.StageReplacement(path, state)
	if err != nil {
		return nil, err
	}
	return &oneTimeCommitFailureReplacement{Replacement: replacement, store: store}, nil
}

type oneTimeCommitFailureReplacement struct {
	projectfile.Replacement
	store *oneTimeCommitFailingStore
}

func (replacement *oneTimeCommitFailureReplacement) Commit() error {
	if replacement.store.commitError == nil {
		return replacement.Replacement.Commit()
	}
	err := replacement.store.commitError
	replacement.store.commitError = nil
	return err
}

func (store failingStore) Load(path string) (aggregate.State, error) {
	return store.delegate.Load(path)
}

func (store failingStore) Create(path string, state aggregate.State) error {
	return store.delegate.Create(path, state)
}

func (store failingStore) StageReplacement(path string, state aggregate.State) (projectfile.Replacement, error) {
	if store.stageError != nil {
		return nil, store.stageError
	}
	replacement, err := store.delegate.StageReplacement(path, state)
	if err != nil || store.commitError == nil {
		return replacement, err
	}
	return failingReplacement{Replacement: replacement, commitError: store.commitError}, nil
}

type failingReplacement struct {
	projectfile.Replacement
	commitError error
}

func (replacement failingReplacement) Commit() error {
	return replacement.commitError
}

type memoryMaterialization struct {
	path            string
	code            string
	initializeError error
	stageError      error
	closed          bool
}

func (document *memoryMaterialization) Path() string { return document.path }

func (document *memoryMaterialization) Initialize(code string) error {
	if document.closed {
		return materializer.ErrMaterializerClosed
	}
	if document.initializeError != nil {
		return document.initializeError
	}
	document.code = code
	return nil
}

func (document *memoryMaterialization) Stage(code string) (materializer.Replacement, error) {
	if document.stageError != nil {
		return nil, document.stageError
	}
	return &memoryReplacement{document: document, candidate: code}, nil
}

func (document *memoryMaterialization) Close() error {
	document.closed = true
	return nil
}

type memoryReplacement struct {
	document  *memoryMaterialization
	candidate string
	previous  string
	installed bool
	closed    bool
}

func (replacement *memoryReplacement) Install() error {
	if replacement.closed {
		return materializer.ErrReplacementClosed
	}
	replacement.previous = replacement.document.code
	replacement.document.code = replacement.candidate
	replacement.installed = true
	return nil
}

func (replacement *memoryReplacement) Rollback() error {
	if replacement.closed || !replacement.installed {
		return materializer.ErrReplacementClosed
	}
	replacement.document.code = replacement.previous
	replacement.closed = true
	return nil
}

func (replacement *memoryReplacement) Finalize() error {
	if replacement.closed || !replacement.installed {
		return materializer.ErrReplacementClosed
	}
	replacement.closed = true
	return nil
}

func (replacement *memoryReplacement) Discard() error {
	replacement.closed = true
	return nil
}

func newFailureCoordinator(t *testing.T, mode string) (*Coordinator, *fakeProvider, materializer.Handle, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "project.json")
	state := durableState(t)
	adapter := projectfile.NewAdapter()
	if err := adapter.Create(path, state); err != nil {
		t.Fatalf("create test project: %v", err)
	}
	provider := readyProvider()
	var document materializer.Handle
	if mode == "materialization" {
		document = &memoryMaterialization{path: filepath.Join(filepath.Dir(path), ".generated.py"), stageError: errors.New("injected materialization failure")}
	} else {
		document = newMaterialization(t, path)
	}
	var files projectfile.Store = adapter
	if mode == "persistence" {
		files = failingStore{delegate: adapter, commitError: errors.New("injected persistence failure")}
	}
	var renderCandidate RenderFunc
	if mode == "render" {
		renderCalls := 0
		renderCandidate = func(state aggregate.State) (renderer.Result, error) {
			renderCalls++
			if renderCalls > 1 {
				return renderer.Result{}, errors.New("injected render failure")
			}
			return renderer.Render(state)
		}
	}
	coordinator, err := Open(context.Background(), Options{
		ProjectPath: path, IDGenerator: sequenceIDs("unused-next-id"), Files: files, Materializer: document, Provider: provider, Render: renderCandidate,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	return coordinator, provider, document, path
}

func durableState(t *testing.T) aggregate.State {
	t.Helper()
	nextID := sequenceIDs("project-dynamic", "callable-dynamic", "parameter-provider")
	state, err := aggregate.NewBlank(nextID)
	if err != nil {
		t.Fatalf("NewBlank() error = %v", err)
	}
	created, err := state.CreateCallable(aggregate.CreateCallableCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "Dynamic callable",
	}, nextID)
	if err != nil {
		t.Fatalf("CreateCallable() error = %v", err)
	}
	state = created.State
	committed, err := state.CommitCallable(aggregate.CommitCallableCommand{
		ProjectID: state.Project.ID, CallableID: "callable-dynamic", ExpectedRevision: state.Project.Revision, AuthoredExpression: "fixture.dynamic",
	}, []aggregate.ProviderParameter{{Name: "value", PassingStyle: aggregate.PassingStylePositionalOrKeyword, TypeAnnotation: stringPointer("int")}}, nextID)
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	state = committed.State
	parameters, err := state.SetParameters(aggregate.SetParametersCommand{
		ProjectID:        state.Project.ID,
		CallableID:       "callable-dynamic",
		ExpectedRevision: state.Project.Revision,
		Parameters: []aggregate.ParameterProposal{
			{ID: "parameter-provider", Name: "value", AuthoredExpression: "1"},
			{ID: "parameter-app", Name: "factor", AuthoredExpression: "2"},
		},
	})
	if err != nil {
		t.Fatalf("SetParameters() error = %v", err)
	}
	return parameters.State
}

func allStyleSignature() []aggregate.ProviderParameter {
	defaultValue := "1.0"
	return []aggregate.ProviderParameter{
		{Name: "left", PassingStyle: aggregate.PassingStylePositionalOnly, TypeAnnotation: stringPointer("int")},
		{Name: "scale", PassingStyle: aggregate.PassingStylePositionalOrKeyword, TypeAnnotation: stringPointer("float"), Default: &defaultValue},
		{Name: "rest", PassingStyle: aggregate.PassingStyleVariadicPositional, TypeAnnotation: stringPointer("tuple[int, ...]")},
		{Name: "flag", PassingStyle: aggregate.PassingStyleKeywordOnly, TypeAnnotation: stringPointer("bool")},
		{Name: "options", PassingStyle: aggregate.PassingStyleVariadicKeyword, TypeAnnotation: stringPointer("dict[str, object]")},
	}
}

func parameterProposals(state aggregate.State, expression func(aggregate.Parameter) string) []aggregate.ParameterProposal {
	parameters := state.Callables[0].Parameters
	proposals := make([]aggregate.ParameterProposal, 0, len(parameters))
	for _, parameter := range parameters {
		proposals = append(proposals, aggregate.ParameterProposal{
			ID: parameter.ID, Name: parameter.Name, AuthoredExpression: expression(parameter),
		})
	}
	return proposals
}

func stringPointer(value string) *string {
	return &value
}

func sequenceIDs(ids ...string) aggregate.IDGenerator {
	index := 0
	return func() (string, error) {
		if index >= len(ids) {
			return "", fmt.Errorf("unexpected ID allocation %d", index)
		}
		id := ids[index]
		index++
		return id, nil
	}
}

func newMaterialization(t *testing.T, projectPath string) *materializer.Document {
	t.Helper()
	document, err := materializer.New(projectPath)
	if err != nil {
		t.Fatalf("materializer.New() error = %v", err)
	}
	return document
}

func readFile(t *testing.T, path string) []byte {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", path, err)
	}
	return content
}

func materializedCode(t *testing.T, document materializer.Handle) string {
	t.Helper()
	if memory, ok := document.(*memoryMaterialization); ok {
		return memory.code
	}
	return string(readFile(t, document.Path()))
}
