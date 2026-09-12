package coordinator

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/renderer"
	"github.com/setta/python-canvas/backend/internal/projectfile"
)

func TestSectionClipboardRoundTripRewritesOnlyClonedInternalReferences(t *testing.T) {
	coordinator, path := newClipboardCoordinator(t, clipboardCoordinatorState(), sequenceIDs(
		"list:inner:copy",
		"callable:producer:copy",
		"callable:consumer:copy",
		"parameter:consumer:value:copy",
	))
	defer func() {
		if err := coordinator.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	}()

	stream, unsubscribe := coordinator.SubscribeSnapshots()
	defer unsubscribe()
	<-stream
	before := coordinator.Snapshot()
	payload, err := coordinator.CopySectionClipboard(context.Background(), aggregate.CopySectionClipboardCommand{
		ProjectID:        before.State.Project.ID,
		ObservedRevision: before.State.Project.Revision,
		RootSectionIDs:   []string{"list:inner"},
	})
	if err != nil {
		t.Fatalf("CopySectionClipboard() error = %v", err)
	}
	if got := clipboardCallable(payload, "callable:consumer").Parameters[0].AuthoredExpression; got != "state.Inner__0" {
		t.Fatalf("normalized clipboard expression = %q, want state.Inner__0", got)
	}

	updated, roots, err := coordinator.PasteSectionClipboard(context.Background(), aggregate.PasteSectionClipboardCommand{
		ProjectID:        before.State.Project.ID,
		ExpectedRevision: before.State.Project.Revision,
		Payload:          payload,
	})
	if err != nil {
		t.Fatalf("PasteSectionClipboard() error = %v", err)
	}
	if updated.State.Project.Revision != before.State.Project.Revision+1 {
		t.Fatalf("revision = %d, want %d", updated.State.Project.Revision, before.State.Project.Revision+1)
	}
	if !reflect.DeepEqual(roots, []string{"list:inner:copy"}) {
		t.Fatalf("pasted roots = %#v", roots)
	}
	if got := clipboardStateCallable(updated.State, "callable:consumer").Parameters[0].AuthoredExpression; got != "state.Outer__0__0" {
		t.Fatalf("original expression = %q, want state.Outer__0__0", got)
	}
	if got := clipboardStateCallable(updated.State, "callable:consumer:copy").Parameters[0].AuthoredExpression; got != "state.Inner_2__0" {
		t.Fatalf("cloned expression = %q, want state.Inner_2__0", got)
	}
	published := <-stream
	if published.State.Project.Revision != updated.State.Project.Revision || published.DiagnosticsRevision != updated.State.Project.Revision {
		t.Fatalf("published clipboard snapshot = %#v", published)
	}
	select {
	case unexpected := <-stream:
		t.Fatalf("clipboard paste published more than one immediate snapshot %#v", unexpected)
	default:
	}
	durable, err := projectfile.NewAdapter().Load(path)
	if err != nil {
		t.Fatalf("load durable clipboard paste: %v", err)
	}
	if !reflect.DeepEqual(durable, updated.State) {
		t.Fatalf("durable clipboard state = %#v, want %#v", durable, updated.State)
	}
}

func TestSectionClipboardPasteLeavesPublishedAndDurableStateUntouchedOnFailure(t *testing.T) {
	for _, test := range []struct {
		name        string
		open        func(t *testing.T, state aggregate.State) (*Coordinator, string)
		wantFailure error
	}{
		{
			name: "render",
			open: func(t *testing.T, state aggregate.State) (*Coordinator, string) {
				path := filepath.Join(t.TempDir(), "project.json")
				adapter := projectfile.NewAdapter()
				if err := adapter.Create(path, state); err != nil {
					t.Fatalf("create project: %v", err)
				}
				renders := 0
				value, err := Open(context.Background(), Options{
					ProjectPath:  path,
					IDGenerator:  sequenceIDs("list:inner:copy", "callable:producer:copy", "callable:consumer:copy", "parameter:consumer:value:copy"),
					Files:        adapter,
					Materializer: newMaterialization(t, path),
					Render: func(candidate aggregate.State) (renderer.Result, error) {
						renders++
						if renders > 1 {
							return renderer.Result{}, errors.New("injected clipboard render failure")
						}
						return renderer.Render(candidate)
					},
				})
				if err != nil {
					t.Fatalf("Open() error = %v", err)
				}
				return value, path
			},
			wantFailure: ErrRenderFailed,
		},
		{
			name: "persistence",
			open: func(t *testing.T, state aggregate.State) (*Coordinator, string) {
				path := filepath.Join(t.TempDir(), "project.json")
				adapter := projectfile.NewAdapter()
				if err := adapter.Create(path, state); err != nil {
					t.Fatalf("create project: %v", err)
				}
				value, err := Open(context.Background(), Options{
					ProjectPath:  path,
					IDGenerator:  sequenceIDs("list:inner:copy", "callable:producer:copy", "callable:consumer:copy", "parameter:consumer:value:copy"),
					Files:        failingStore{delegate: adapter, commitError: errors.New("injected clipboard persistence failure")},
					Materializer: newMaterialization(t, path),
				})
				if err != nil {
					t.Fatalf("Open() error = %v", err)
				}
				return value, path
			},
			wantFailure: ErrPersistenceFailed,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			coordinator, path := test.open(t, clipboardCoordinatorState())
			defer coordinator.Close()
			before := coordinator.Snapshot()
			payload, err := coordinator.CopySectionClipboard(context.Background(), aggregate.CopySectionClipboardCommand{
				ProjectID:        before.State.Project.ID,
				ObservedRevision: before.State.Project.Revision,
				RootSectionIDs:   []string{"list:inner"},
			})
			if err != nil {
				t.Fatalf("CopySectionClipboard() error = %v", err)
			}
			_, _, err = coordinator.PasteSectionClipboard(context.Background(), aggregate.PasteSectionClipboardCommand{
				ProjectID:        before.State.Project.ID,
				ExpectedRevision: before.State.Project.Revision,
				Payload:          payload,
			})
			if !errors.Is(err, test.wantFailure) {
				t.Fatalf("PasteSectionClipboard() error = %v, want %v", err, test.wantFailure)
			}
			if after := coordinator.Snapshot(); !reflect.DeepEqual(after, before) {
				t.Fatalf("failed clipboard paste published state %#v, want %#v", after, before)
			}
			durable, loadErr := projectfile.NewAdapter().Load(path)
			if loadErr != nil {
				t.Fatalf("load durable clipboard state: %v", loadErr)
			}
			if !reflect.DeepEqual(durable, before.State) {
				t.Fatalf("failed clipboard paste persisted %#v, want %#v", durable, before.State)
			}
		})
	}
}

func TestSectionClipboardRejectsStaleRevisionWithoutPublication(t *testing.T) {
	coordinator, _ := newClipboardCoordinator(t, clipboardCoordinatorState(), sequenceIDs("unused"))
	defer coordinator.Close()
	before := coordinator.Snapshot()
	payload, err := coordinator.CopySectionClipboard(context.Background(), aggregate.CopySectionClipboardCommand{
		ProjectID:        before.State.Project.ID,
		ObservedRevision: before.State.Project.Revision,
		RootSectionIDs:   []string{"list:inner"},
	})
	if err != nil {
		t.Fatalf("CopySectionClipboard() error = %v", err)
	}
	_, _, err = coordinator.PasteSectionClipboard(context.Background(), aggregate.PasteSectionClipboardCommand{
		ProjectID:        before.State.Project.ID,
		ExpectedRevision: before.State.Project.Revision - 1,
		Payload:          payload,
	})
	if !errors.Is(err, aggregate.ErrRevisionConflict) {
		t.Fatalf("PasteSectionClipboard() error = %v, want revision conflict", err)
	}
	if after := coordinator.Snapshot(); !reflect.DeepEqual(after, before) {
		t.Fatalf("stale clipboard paste changed snapshot %#v", after)
	}
}

func newClipboardCoordinator(t *testing.T, state aggregate.State, ids aggregate.IDGenerator) (*Coordinator, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "project.json")
	if err := projectfile.NewAdapter().Create(path, state); err != nil {
		t.Fatalf("create clipboard project: %v", err)
	}
	value, err := Open(context.Background(), Options{
		ProjectPath:  path,
		IDGenerator:  ids,
		Materializer: newMaterialization(t, path),
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	return value, path
}

func clipboardCoordinatorState() aggregate.State {
	return aggregate.State{
		Project:      aggregate.Project{ID: "project:clipboard", Name: "Clipboard project", Revision: 5},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{ID: "callable:producer", Name: "Producer", AuthoredExpression: "fixture.producer", Parameters: []aggregate.Parameter{}},
			{
				ID:                 "callable:consumer",
				Name:               "Consumer",
				AuthoredExpression: "fixture.consumer",
				Parameters: []aggregate.Parameter{{
					ID:                 "parameter:consumer:value",
					Name:               "value",
					NameEditable:       true,
					PassingStyle:       aggregate.PassingStylePositionalOrKeyword,
					AuthoredExpression: "state.Outer__0__0",
				}},
			},
		},
		ParameterDictionaries: []aggregate.ParameterDictionary{},
		ParameterUIOverrides:  map[string]aggregate.ParameterUI{},
		Lists: []aggregate.List{
			{ID: "list:outer", Name: "Outer", ChildSectionIDs: []string{"list:inner"}},
			{ID: "list:inner", Name: "Inner", ChildSectionIDs: []string{"callable:producer", "callable:consumer"}},
		},
		TopLevelSectionIDs: []string{"list:outer"},
	}
}

func clipboardCallable(payload aggregate.SectionClipboardPayload, id string) aggregate.Callable {
	for _, callable := range payload.Callables {
		if callable.ID == id {
			return callable
		}
	}
	return aggregate.Callable{}
}

func clipboardStateCallable(state aggregate.State, id string) aggregate.Callable {
	for _, callable := range state.Callables {
		if callable.ID == id {
			return callable
		}
	}
	return aggregate.Callable{}
}
